using System.Text;
using Org.BouncyCastle.Asn1;
using Org.BouncyCastle.Asn1.Pkcs;
using Org.BouncyCastle.Asn1.Sec;
using Org.BouncyCastle.Asn1.X509;
using Org.BouncyCastle.Asn1.X9;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.EC;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.OpenSsl;
using Org.BouncyCastle.Pkcs;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.X509;

namespace BaqalaPOS.Api.Services;

// EGS serial number: "1-{solution}|2-{model}|3-{uuid}"
public record ZatcaCsrConfig(
    string Environment,               // NonProduction | Simulation | Production
    string OrganizationIdentifier,    // 15-digit VAT/CRN-derived identifier -> CSR "UID"
    string OrganizationUnitName,      // branch name
    string OrganizationName,          // legal company name
    string CountryName,               // ISO alpha-2, e.g. "SA"
    string InvoiceType,               // capability bitmask, e.g. "1100" (standard + simplified)
    string LocationAddress,
    string IndustryBusinessCategory,
    string SolutionName,
    string Model
);

public record ZatcaCsrResult(string PrivateKeyRaw, string CsrBase64, string EgsSerial);

public interface IZatcaCsrService
{
    ZatcaCsrResult GenerateCsr(ZatcaCsrConfig config);
}

// Ports CsrGenerator.php: an EC key on secp256k1 + a CSR whose SAN carries a ZATCA-specific
// directoryName (SN/UID/title/registeredAddress/businessCategory) and a private
// certificateTemplateName extension. .NET's CertificateRequest/SubjectAlternativeNameBuilder
// can't express a directoryName SAN, hence BouncyCastle.
//
// Note: the PHP reference's openssl.cnf sets `req_extensions` twice inside [req] (first to
// v3_req, then to req_ext) — the second assignment wins in OpenSSL config parsing, so
// basicConstraints/keyUsage from [v3_req] are NEVER actually included in the CSR. Verified
// empirically by running the exact same .cnf through the real `openssl req` CLI: only the
// certificateTemplateName extension and the directoryName SAN appear in "Requested Extensions".
// This class intentionally reproduces that (undocumented but proven-working) behavior.
public class ZatcaCsrService : IZatcaCsrService
{
    private const string CertificateTemplateOid = "1.3.6.1.4.1.311.20.2";
    private const string UidOid = "0.9.2342.19200300.100.1.1"; // RFC 1274 userid
    private const string RegisteredAddressOid = "2.5.4.26";

    // OpenSSL's "SN" short name maps to OID 2.5.4.4 (surname), NOT serialNumber (2.5.4.5).
    // ZATCA's openssl.cnf uses "SN" for the EGS serial field, so the CSR must carry 2.5.4.4 here —
    // BouncyCastle has no built-in alias for this OpenSSL quirk (X509Name.SerialNumber is 2.5.4.5).
    private const string SnOid = "2.5.4.4";

    private class ForceUtf8StringConverter : X509NameEntryConverter
    {
        public override Asn1Object GetConvertedValue(DerObjectIdentifier oid, string value) => new DerUtf8String(value);
    }

    public ZatcaCsrResult GenerateCsr(ZatcaCsrConfig config)
    {
        // Verified end-to-end against ZATCA's live developer-portal sandbox (not just structural
        // inspection): PHP's original approach — CN = EGS Serial, certificateTemplateName encoded
        // as PrintableString with the environment prefix — actually gets a 200 with a real issued
        // certificate reflecting the submitted CSR. An earlier attempt to "fix" this to match
        // ZATCA's Swagger documentation example (unprefixed UTF8String templateName, separate
        // free-text CN) was chasing a red herring — that example turned out to be a static canned
        // response, not real validation. Don't re-"fix" this without a live round-trip test.
        var templateName = config.Environment switch
        {
            "NonProduction" => "TSTZATCA-Code-Signing",
            "Simulation" => "PREZATCA-Code-Signing",
            "Production" => "ZATCA-Code-Signing",
            _ => throw new ArgumentException($"Invalid environment type: {config.Environment}")
        };

        var egsSerial = $"1-{config.SolutionName}|2-{config.Model}|3-{Guid.NewGuid()}";
        var commonName = egsSerial;

        var keyPair = GenerateKeyPair();

        // Subject RDN order per ZATCA's Developer Portal Manual §5.3.1 sample .cnf (C, OU, O, CN).
        var subject = new X509Name(
            new List<DerObjectIdentifier> { X509Name.C, X509Name.OU, X509Name.O, X509Name.CN },
            new List<string> { config.CountryName, config.OrganizationUnitName, config.OrganizationName, commonName });

        // Force UTF8String for every SAN attribute — verified against ZATCA's own working example,
        // which encodes all five (including serialNumber, which BouncyCastle's default converter
        // otherwise emits as PrintableString even though the EGS serial contains "|" characters).
        var altName = new X509Name(
            new List<DerObjectIdentifier>
            {
                new DerObjectIdentifier(SnOid),
                new DerObjectIdentifier(UidOid),
                X509Name.T,
                new DerObjectIdentifier(RegisteredAddressOid),
                X509Name.BusinessCategory
            },
            new List<string>
            {
                egsSerial,
                config.OrganizationIdentifier,
                config.InvoiceType,
                config.LocationAddress,
                config.IndustryBusinessCategory
            },
            new ForceUtf8StringConverter());

        var extGen = new X509ExtensionsGenerator();
        extGen.AddExtension(new DerObjectIdentifier(CertificateTemplateOid), false, new DerPrintableString(templateName));
        extGen.AddExtension(X509Extensions.SubjectAlternativeName, false, new GeneralNames(new GeneralName(GeneralName.DirectoryName, altName)));
        var extensions = extGen.Generate();

        var attribute = new AttributePkcs(PkcsObjectIdentifiers.Pkcs9AtExtensionRequest, new DerSet(extensions));
        var attributes = new DerSet(attribute);

        var csr = new Pkcs10CertificationRequest(
            "SHA256WITHECDSA",
            subject,
            keyPair.Public,
            attributes,
            keyPair.Private);

        var csrPem = ToPem(csr);
        var csrBase64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(csrPem));

        var privateKeyRaw = StripPemHeaders(ExportEcPrivateKeyPem((ECPrivateKeyParameters)keyPair.Private, (ECPublicKeyParameters)keyPair.Public));

        return new ZatcaCsrResult(privateKeyRaw, csrBase64, egsSerial);
    }

    private static AsymmetricCipherKeyPair GenerateKeyPair()
    {
        var curve = CustomNamedCurves.GetByName("secp256k1");
        var curveOid = SecNamedCurves.GetOid("secp256k1");
        // ECNamedDomainParameters (not plain ECDomainParameters) so the SubjectPublicKeyInfo
        // references the curve by its named OID, matching what openssl/ZATCA expect, instead
        // of embedding the full explicit curve parameters.
        var domainParams = new ECNamedDomainParameters(curveOid, curve.Curve, curve.G, curve.N, curve.H, curve.GetSeed());
        var keyGenParam = new ECKeyGenerationParameters(domainParams, new SecureRandom());
        var generator = new ECKeyPairGenerator("ECDSA");
        generator.Init(keyGenParam);
        return generator.GenerateKeyPair();
    }

    private static string ToPem(object obj)
    {
        using var sw = new StringWriter();
        var pemWriter = new PemWriter(sw);
        pemWriter.WriteObject(obj);
        return sw.ToString();
    }

    private static string ExportEcPrivateKeyPem(ECPrivateKeyParameters privateKey, ECPublicKeyParameters publicKey)
    {
        // SEC1 "EC PRIVATE KEY" structure (what PHP's openssl_pkey_export produces for EC keys),
        // rather than PKCS8 — includes the named curve OID and the public key point.
        var ecPrivateKeyStructure = new ECPrivateKeyStructure(
            privateKey.Parameters.N.BitLength,
            privateKey.D,
            new DerBitString(publicKey.Q.GetEncoded(false)),
            new X962Parameters(SecNamedCurves.GetOid("secp256k1")));

        return ToPem(new Org.BouncyCastle.Utilities.IO.Pem.PemObject("EC PRIVATE KEY", ecPrivateKeyStructure.GetDerEncoded()));
    }

    private static string StripPemHeaders(string pem) =>
        string.Concat(pem.Split('\n').Where(line => !line.StartsWith("-----")));
}
