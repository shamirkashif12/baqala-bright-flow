using System.Formats.Asn1;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography.Xml;
using System.Text;
using System.Xml;
using System.Xml.Xsl;
using Org.BouncyCastle.Asn1;
using Org.BouncyCastle.Asn1.Sec;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Security;

namespace BaqalaPOS.Api.Services;

// Payload shape ZATCA's compliance-checks/reporting/clearance endpoints expect as the request body.
public record ZatcaSignedInvoice(string InvoiceHash, string Uuid, string Invoice, string? QrCode);

// Ports EInvoiceSigner.php + QRCodeGenerator.php.
//
// IMPORTANT quirk (verified against the PHP source, not a guess): ZATCA's "binarySecurityToken"
// field is DOUBLE base64-encoded. Callers base64-decode it once before it reaches this class, so
// the `certificateContent` parameter here is itself still a base64 STRING (the certificate's PEM
// body text) — not raw DER bytes. The XAdES certificate digest is computed over the BYTES OF THAT
// BASE64 STRING (not the decoded DER), matching ZATCA's documented (if unusual) requirement. This
// class preserves that exactly rather than "fixing" it to look more like standard XAdES.
public class ZatcaInvoiceSigner
{
    public ZatcaSignedInvoice Sign(XmlDocument invoiceDoc, string? certificateContentBase64, string? privateKeyRawBase64)
    {
        const string NsCbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
        var ns = new XmlNamespaceManager(invoiceDoc.NameTable);
        ns.AddNamespace("cbc", NsCbc);

        var uuidNode = invoiceDoc.SelectSingleNode("//cbc:UUID", ns)
            ?? throw new InvalidOperationException("UUID not found in the XML document.");
        var uuid = uuidNode.InnerText;

        var invoiceTypeCodeNode = invoiceDoc.SelectSingleNode("//cbc:InvoiceTypeCode", ns) as XmlElement;
        var isSimplifiedInvoice = (invoiceTypeCodeNode?.GetAttribute("name") ?? "").StartsWith("02", StringComparison.Ordinal);

        var canonicalXml = ApplyXsltAndCanonicalize(invoiceDoc);
        var hash = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(canonicalXml));
        var base64Hash = Convert.ToBase64String(hash);

        const string xmlDeclaration = "<?xml version=\"1.0\" encoding=\"utf-8\"?>";

        if (!isSimplifiedInvoice)
        {
            var base64Invoice = Convert.ToBase64String(Encoding.UTF8.GetBytes(xmlDeclaration + "\n" + canonicalXml));
            return new ZatcaSignedInvoice(base64Hash, uuid, base64Invoice, null);
        }

        if (string.IsNullOrEmpty(certificateContentBase64) || string.IsNullOrEmpty(privateKeyRawBase64))
            throw new InvalidOperationException("Certificate and private key are required to sign a simplified invoice.");

        return SignSimplifiedInvoice(canonicalXml, base64Hash, certificateContentBase64, privateKeyRawBase64, uuid, xmlDeclaration);
    }

    private static ZatcaSignedInvoice SignSimplifiedInvoice(
        string canonicalXml, string base64Hash, string certificateContentBase64, string privateKeyRawBase64, string uuid, string xmlDeclaration)
    {
        var signatureTimestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        var certDer = Convert.FromBase64String(certificateContentBase64);

        // Hash of the BASE64 TEXT bytes (ZATCA-specific — see class remarks), not the decoded DER.
        var certTextHashHex = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(certificateContentBase64)));
        var publicKeyHashing = Convert.ToBase64String(Encoding.UTF8.GetBytes(certTextHashHex));

        var (issuerName, serialNumberDecimal) = ParseIssuerNameAndSerial(certDer);
        var signedPropertiesHash = GetSignedPropertiesHash(signatureTimestamp, publicKeyHashing, issuerName, serialNumberDecimal);
        var signatureValue = GetDigitalSignature(base64Hash, privateKeyRawBase64);

        var ublExtension = LoadEmbeddedText("ZatcaDataUbl.xml")
            .Replace("INVOICE_HASH", base64Hash)
            .Replace("SIGNED_PROPERTIES", signedPropertiesHash)
            .Replace("SIGNATURE_VALUE", signatureValue)
            .Replace("CERTIFICATE_CONTENT", certificateContentBase64)
            .Replace("SIGNATURE_TIMESTAMP", signatureTimestamp)
            .Replace("PUBLICKEY_HASHING", publicKeyHashing)
            .Replace("ISSUER_NAME", issuerName)
            .Replace("SERIAL_NUMBER", serialNumberDecimal);

        var insertPosition = canonicalXml.IndexOf('>') + 1;
        var updatedXml = canonicalXml.Insert(insertPosition, ublExtension);

        var qrCode = GenerateQrCode(canonicalXml, base64Hash, signatureValue, certDer, certificateContentBase64);

        var signatureBlock = LoadEmbeddedText("ZatcaDataSignature.xml").Replace("BASE64_QRCODE", qrCode);
        var supplierPartyIndex = updatedXml.IndexOf("<cac:AccountingSupplierParty>", StringComparison.Ordinal);
        if (supplierPartyIndex < 0)
            throw new InvalidOperationException("The <cac:AccountingSupplierParty> tag was not found in the XML.");
        updatedXml = updatedXml.Insert(supplierPartyIndex, signatureBlock);

        var base64Invoice = Convert.ToBase64String(Encoding.UTF8.GetBytes(xmlDeclaration + "\n" + updatedXml));
        return new ZatcaSignedInvoice(base64Hash, uuid, base64Invoice, qrCode);
    }

    // ─── XSLT strip + C14N (mirrors xslfile.xsl + DOMDocument::C14N()) ────────────────────────

    private static string ApplyXsltAndCanonicalize(XmlDocument doc)
    {
        var xslt = new XslCompiledTransform();
        using (var xsltStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("BaqalaPOS.Api.Zatca.Templates.xslfile.xsl")!)
        using (var xsltReader = XmlReader.Create(xsltStream))
        {
            xslt.Load(xsltReader);
        }

        var settings = xslt.OutputSettings!.Clone();
        settings.CloseOutput = false;
        using var buffer = new MemoryStream();
        using (var xmlWriter = XmlWriter.Create(buffer, settings))
        {
            xslt.Transform(doc, xmlWriter);
        }
        buffer.Position = 0;

        var transformedDoc = new XmlDocument { PreserveWhitespace = true };
        transformedDoc.Load(buffer);

        var c14n = new XmlDsigC14NTransform(includeComments: false);
        c14n.LoadInput(transformedDoc);
        var outputStream = (Stream)c14n.GetOutput(typeof(Stream));
        using var reader = new StreamReader(outputStream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    // ─── XAdES SignedProperties hash (exact whitespace matters — it's hashed as text) ─────────

    private static string GetSignedPropertiesHash(string signingTime, string digestValue, string issuerName, string serialNumber)
    {
        var xml =
            "<xades:SignedProperties xmlns:xades=\"http://uri.etsi.org/01903/v1.3.2#\" Id=\"xadesSignedProperties\">\n" +
            "                                    <xades:SignedSignatureProperties>\n" +
            $"                                        <xades:SigningTime>{signingTime}</xades:SigningTime>\n" +
            "                                        <xades:SigningCertificate>\n" +
            "                                            <xades:Cert>\n" +
            "                                                <xades:CertDigest>\n" +
            "                                                    <ds:DigestMethod xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\" Algorithm=\"http://www.w3.org/2001/04/xmlenc#sha256\"/>\n" +
            $"                                                    <ds:DigestValue xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\">{digestValue}</ds:DigestValue>\n" +
            "                                                </xades:CertDigest>\n" +
            "                                                <xades:IssuerSerial>\n" +
            $"                                                    <ds:X509IssuerName xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\">{issuerName}</ds:X509IssuerName>\n" +
            $"                                                    <ds:X509SerialNumber xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\">{serialNumber}</ds:X509SerialNumber>\n" +
            "                                                </xades:IssuerSerial>\n" +
            "                                            </xades:Cert>\n" +
            "                                        </xades:SigningCertificate>\n" +
            "                                    </xades:SignedSignatureProperties>\n" +
            "                                </xades:SignedProperties>";

        xml = xml.Replace("\r\n", "\n").Trim();
        var hashHex = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(xml)));
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(hashHex));
    }

    // ─── ECDSA signature over the (already-hashed) invoice hash bytes ─────────────────────────
    // Matches PHP's openssl_sign($hashBytes, ..., OPENSSL_ALGO_SHA256): the signer itself applies
    // SHA-256 to the input, so the effective signed value is SHA256(invoiceHash-bytes) — this is
    // ZATCA's documented "sign the invoice hash with ECDSA-SHA256" behavior, not a bug.
    private static string GetDigitalSignature(string base64Hash, string privateKeyRawBase64)
    {
        var hashBytes = Convert.FromBase64String(base64Hash);
        var privateKey = LoadEcPrivateKey(privateKeyRawBase64);

        var signer = SignerUtilities.GetSigner("SHA256withECDSA");
        signer.Init(true, privateKey);
        signer.BlockUpdate(hashBytes, 0, hashBytes.Length);
        var signature = signer.GenerateSignature();
        return Convert.ToBase64String(signature);
    }

    private static ECPrivateKeyParameters LoadEcPrivateKey(string privateKeyRawBase64)
    {
        var der = Convert.FromBase64String(privateKeyRawBase64);
        var keyStructure = ECPrivateKeyStructure.GetInstance(der);
        var curve = SecNamedCurves.GetByName("secp256k1");
        var curveOid = SecNamedCurves.GetOid("secp256k1");
        var domainParams = new ECNamedDomainParameters(curveOid, curve.Curve, curve.G, curve.N, curve.H, curve.GetSeed());
        return new ECPrivateKeyParameters(keyStructure.GetKey(), domainParams);
    }

    // ─── QR code (TLV, base64) ─────────────────────────────────────────────────────────────

    private static string GenerateQrCode(string canonicalXml, string invoiceHash, string signatureValue, byte[] certDer, string certificateContentBase64)
    {
        var doc = new XmlDocument { PreserveWhitespace = true };
        doc.LoadXml(canonicalXml);
        var ns = new XmlNamespaceManager(doc.NameTable);
        ns.AddNamespace("cbc", "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2");
        ns.AddNamespace("cac", "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2");

        var invoiceTypeCodeNode = doc.SelectSingleNode("//cbc:InvoiceTypeCode", ns) as XmlElement;
        var invoiceTypeCodeName = invoiceTypeCodeNode?.GetAttribute("name") ?? "";

        var supplierName = doc.SelectSingleNode("//cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName", ns)?.InnerText ?? "";
        var companyId = doc.SelectSingleNode("//cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID", ns)?.InnerText ?? "";
        var issueDate = doc.SelectSingleNode("//cbc:IssueDate", ns)?.InnerText ?? "";
        var issueTime = doc.SelectSingleNode("//cbc:IssueTime", ns)?.InnerText ?? "";
        var payableAmount = doc.SelectSingleNode("//cac:LegalMonetaryTotal/cbc:PayableAmount", ns)?.InnerText ?? "";
        var taxAmount = doc.SelectSingleNode("//cac:TaxTotal/cbc:TaxAmount", ns)?.InnerText ?? "";

        var publicKeyRaw = ExtractSubjectPublicKeyInfo(certDer);

        // Tags 6/7 carry the base64 TEXT of the hash/signature (matches the PHP reference exactly
        // — it never decodes $InvoiceHash/$SignatureValue before writing them into the TLV), while
        // tags 8/9 are genuine raw binary (DER SPKI / DER ECDSA signature bytes).
        var tlvFields = new List<(int Tag, byte[] Value)>
        {
            (1, Encoding.UTF8.GetBytes(supplierName)),
            (2, Encoding.UTF8.GetBytes(companyId)),
            (3, Encoding.UTF8.GetBytes($"{issueDate}T{issueTime}")),
            (4, Encoding.UTF8.GetBytes(payableAmount)),
            (5, Encoding.UTF8.GetBytes(taxAmount)),
            (6, Encoding.UTF8.GetBytes(invoiceHash)),
            (7, Encoding.UTF8.GetBytes(signatureValue)),
            (8, publicKeyRaw),
        };

        // Tag 9 (certificate signature) only for simplified invoices — always true here since
        // this method is only called from the simplified-invoice signing path.
        tlvFields.Add((9, ExtractCertificateSignatureBytes(certDer)));

        using var buffer = new MemoryStream();
        foreach (var (tag, value) in tlvFields)
        {
            WriteTlv(buffer, tag, value);
        }
        return Convert.ToBase64String(buffer.ToArray());
    }

    private static void WriteTlv(Stream output, int tag, byte[] value)
    {
        output.WriteByte((byte)tag);
        WriteBerLength(output, value.Length);
        output.Write(value, 0, value.Length);
    }

    private static void WriteBerLength(Stream output, int length)
    {
        if (length <= 0x7F)
        {
            output.WriteByte((byte)length);
            return;
        }

        var bytes = new List<byte>();
        var remaining = length;
        while (remaining > 0)
        {
            bytes.Insert(0, (byte)(remaining & 0xFF));
            remaining >>= 8;
        }
        output.WriteByte((byte)(0x80 | bytes.Count));
        output.Write(bytes.ToArray(), 0, bytes.Count);
    }

    // ─── Raw ASN.1 extraction from the certificate DER (avoids re-encoding drift) ─────────────

    private static byte[] ExtractSubjectPublicKeyInfo(byte[] certDer)
    {
        var reader = new AsnReader(certDer, AsnEncodingRules.DER);
        var certSeq = reader.ReadSequence();
        var tbsSeq = certSeq.ReadSequence();

        if (tbsSeq.PeekTag().TagClass == TagClass.ContextSpecific && tbsSeq.PeekTag().TagValue == 0)
        {
            tbsSeq.ReadSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true));
        }
        tbsSeq.ReadIntegerBytes(); // serialNumber
        tbsSeq.ReadEncodedValue(); // signature AlgorithmIdentifier
        tbsSeq.ReadEncodedValue(); // issuer
        tbsSeq.ReadEncodedValue(); // validity
        tbsSeq.ReadEncodedValue(); // subject
        return tbsSeq.ReadEncodedValue().ToArray(); // subjectPublicKeyInfo
    }

    private static byte[] ExtractCertificateSignatureBytes(byte[] certDer)
    {
        var reader = new AsnReader(certDer, AsnEncodingRules.DER);
        var certSeq = reader.ReadSequence();
        certSeq.ReadEncodedValue(); // tbsCertificate
        certSeq.ReadEncodedValue(); // signatureAlgorithm
        return certSeq.ReadBitString(out _);
    }

    private static (string IssuerName, string SerialNumber) ParseIssuerNameAndSerial(byte[] certDer)
    {
        var reader = new AsnReader(certDer, AsnEncodingRules.DER);
        var certSeq = reader.ReadSequence();
        var tbsSeq = certSeq.ReadSequence();

        if (tbsSeq.PeekTag().TagClass == TagClass.ContextSpecific && tbsSeq.PeekTag().TagValue == 0)
        {
            tbsSeq.ReadSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true));
        }
        var serialBytes = tbsSeq.ReadIntegerBytes();
        tbsSeq.ReadEncodedValue(); // signature AlgorithmIdentifier
        var issuerBytes = tbsSeq.ReadEncodedValue();

        var serialHex = Convert.ToHexString(serialBytes.Span);
        var serialDecimal = System.Numerics.BigInteger.Parse("0" + serialHex, NumberStyles.HexNumber).ToString(CultureInfo.InvariantCulture);

        var issuerReader = new AsnReader(issuerBytes, AsnEncodingRules.DER);
        var rdnSeq = issuerReader.ReadSequence();
        string? cn = null;
        var dcValues = new List<string>();
        while (rdnSeq.HasData)
        {
            var rdnSet = rdnSeq.ReadSetOf();
            while (rdnSet.HasData)
            {
                var atav = rdnSet.ReadSequence();
                var oid = atav.ReadObjectIdentifier();
                var valueTag = atav.PeekTag();
                var value = ReadDirectoryString(atav, valueTag);
                if (oid == "2.5.4.3") cn = value;
                else if (oid == "0.9.2342.19200300.100.1.25") dcValues.Add(value); // domainComponent (not 100.1.1, which is uid)
            }
        }

        dcValues.Reverse();
        var parts = new List<string>();
        if (cn is not null) parts.Add($"CN={cn}");
        parts.AddRange(dcValues.Select(dc => $"DC={dc}"));
        return (string.Join(", ", parts), serialDecimal);
    }

    private static string ReadDirectoryString(AsnReader reader, Asn1Tag tag)
    {
        var universalTag = (UniversalTagNumber)tag.TagValue;
        return universalTag switch
        {
            UniversalTagNumber.UTF8String => reader.ReadCharacterString(UniversalTagNumber.UTF8String),
            UniversalTagNumber.PrintableString => reader.ReadCharacterString(UniversalTagNumber.PrintableString),
            UniversalTagNumber.IA5String => reader.ReadCharacterString(UniversalTagNumber.IA5String),
            UniversalTagNumber.T61String => reader.ReadCharacterString(UniversalTagNumber.T61String),
            UniversalTagNumber.BMPString => reader.ReadCharacterString(UniversalTagNumber.BMPString),
            _ => reader.ReadCharacterString(UniversalTagNumber.UTF8String),
        };
    }

    private static string LoadEmbeddedText(string fileName)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"BaqalaPOS.Api.Zatca.Templates.{fileName}")
            ?? throw new InvalidOperationException($"Embedded resource {fileName} not found.");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
