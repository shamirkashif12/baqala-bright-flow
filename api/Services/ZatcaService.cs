using System.Text;
using System.Text.Json;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public record ZatcaCsrGenerationResult(string Csr, string EgsSerial);
public record ZatcaComplianceCsidResult(bool Success, string? RequestId, string? Error);
public record ZatcaComplianceTestOutcome(string DocumentType, bool Passed, string? ApiStatus);
public record ZatcaProductionCsidResult(bool Success, string? RequestId, IReadOnlyList<ZatcaComplianceTestOutcome> ComplianceTests, string? Error);

public interface IZatcaService
{
    Task<ZatcaCsrGenerationResult> GenerateCsrAsync(Guid branchId);
    Task<ZatcaComplianceCsidResult> GetComplianceCsidAsync(string otp);
    Task<ZatcaProductionCsidResult> RunOnboardingToProductionAsync();
    Task<ZatcaInvoice> SubmitInvoiceAsync(Guid invoiceId);
}

// Orchestrates CSR generation -> compliance CSID -> compliance tests -> production CSID ->
// invoice submission, matching the flow in generate_csr.php / get_compliance_csid.php /
// get_production_csid.php / generate_invoice.php, but wired to real ZatcaSettings/ZatcaInvoice
// rows instead of a certificateInfo.json file.
public class ZatcaService(
    BaqalaDbContext db,
    IZatcaCsrService csrService,
    IZatcaApiClient apiClient,
    IDataProtectionProvider dataProtectionProvider,
    ILogger<ZatcaService> logger) : IZatcaService
{
    private const string SeedInvoiceHash = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector("BaqalaPOS.Zatca.Secrets.v1");
    private readonly ZatcaInvoiceXmlBuilder _xmlBuilder = new();
    private readonly ZatcaInvoiceSigner _signer = new();

    public async Task<ZatcaCsrGenerationResult> GenerateCsrAsync(Guid branchId)
    {
        var branch = await db.Branches.FindAsync(branchId)
            ?? throw new InvalidOperationException($"Branch {branchId} not found.");
        var settings = await GetOrCreateBranchSettingsAsync(branchId);
        var identity = await GetIdentityAsync();

        var config = new ZatcaCsrConfig(
            Environment: MapCsrEnvironment(identity.Environment),
            // Per ZATCA's Developer Portal Manual (§5.3.1): the CSR's Organization Identifier must
            // be the VAT registration number (15 digits, starting and ending with 3) — not the CR
            // number, which is a different, unrelated identifier used elsewhere on the invoice.
            OrganizationIdentifier: settings.VatRegistrationNumber ?? branch.CommercialRegistration ?? "",
            OrganizationUnitName: branch.Name,
            OrganizationName: settings.SellerName ?? branch.Name,
            CountryName: "SA",
            InvoiceType: "1100", // supports both standard + simplified
            LocationAddress: branch.City ?? "Riyadh",
            IndustryBusinessCategory: "Retail Trade",
            SolutionName: "BaqalaPOS",
            Model: "EGS");

        var result = csrService.GenerateCsr(config);

        identity.Csr = result.CsrBase64;
        identity.PrivateKey = _protector.Protect(result.PrivateKeyRaw);
        identity.EgsSerial = result.EgsSerial;
        identity.OnboardingStatus = "csr_generated";
        identity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return new ZatcaCsrGenerationResult(result.CsrBase64, result.EgsSerial);
    }

    public async Task<ZatcaComplianceCsidResult> GetComplianceCsidAsync(string otp)
    {
        var identity = await GetIdentityAsync();
        if (string.IsNullOrEmpty(identity.Csr))
            throw new InvalidOperationException("No CSR on file. Generate a CSR first.");

        var result = await apiClient.GetComplianceCsidAsync(MapApiEnvironment(identity.Environment), identity.Csr, otp);
        if (!result.Success)
        {
            logger.LogWarning("ZATCA compliance CSID request failed: {Body}", result.RawBody);
            return new ZatcaComplianceCsidResult(false, null, ExtractErrorMessage(result));
        }

        var root = result.Body.RootElement;
        var requestId = root.TryGetProperty("requestID", out var reqIdEl) ? reqIdEl.ToString() : null;
        var binarySecurityToken = root.TryGetProperty("binarySecurityToken", out var tokenEl) ? tokenEl.GetString() : null;
        var secret = root.TryGetProperty("secret", out var secretEl) ? secretEl.GetString() : null;

        if (binarySecurityToken is null || secret is null)
        {
            return new ZatcaComplianceCsidResult(false, requestId, "ZATCA response missing binarySecurityToken/secret.");
        }

        identity.CcsidRequestId = requestId;
        identity.CcsidBinarySecurityToken = binarySecurityToken;
        identity.CcsidSecret = _protector.Protect(secret);
        identity.OnboardingStatus = "compliance_csid_obtained";
        identity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return new ZatcaComplianceCsidResult(true, requestId, null);
    }

    public async Task<ZatcaProductionCsidResult> RunOnboardingToProductionAsync()
    {
        var identity = await GetIdentityAsync();
        if (string.IsNullOrEmpty(identity.CcsidBinarySecurityToken) || string.IsNullOrEmpty(identity.CcsidSecret))
            throw new InvalidOperationException("Compliance CSID not found. Complete the compliance CSID step first.");

        var ccsidSecret = _protector.Unprotect(identity.CcsidSecret);
        var privateKey = _protector.Unprotect(identity.PrivateKey!);
        var environment = MapApiEnvironment(identity.Environment);

        // ZATCA requires 6 fixed document types for compliance testing.
        var documentTypes = new (string Prefix, string TypeCode, string Description, string? InstructionNote)[]
        {
            ("STDSI", "388", "Standard Invoice", null),
            ("STDCN", "381", "Standard Credit Note", "InstructionNotes for Standard CreditNote"),
            ("STDDN", "383", "Standard Debit Note", "InstructionNotes for Standard DebitNote"),
            ("SIMSI", "388", "Simplified Invoice", null),
            ("SIMCN", "381", "Simplified Credit Note", "InstructionNotes for Simplified CreditNote"),
            ("SIMDN", "383", "Simplified Debit Note", "InstructionNotes for Simplified DebitNote"),
        };

        var icv = 0;
        var pih = SeedInvoiceHash;
        var outcomes = new List<ZatcaComplianceTestOutcome>();

        foreach (var (prefix, typeCode, description, instructionNote) in documentTypes)
        {
            icv++;
            var isSimplified = prefix.StartsWith("SIM", StringComparison.Ordinal);
            var subtype = isSimplified ? "0200000" : "0100000";

            var doc = _xmlBuilder.ModifyForComplianceTest($"{prefix}-0001", subtype, typeCode, icv, pih, instructionNote);
            var signed = _signer.Sign(doc, DecodeCertificateContent(identity.CcsidBinarySecurityToken), privateKey);

            var response = await apiClient.ComplianceChecksAsync(environment, identity.CcsidBinarySecurityToken, ccsidSecret, signed);
            var (passed, apiStatus, alreadyCompliant) = EvaluateComplianceResponse(response, isSimplified);

            outcomes.Add(new ZatcaComplianceTestOutcome(description, passed, apiStatus));
            if (passed && !alreadyCompliant)
            {
                pih = signed.InvoiceHash;
            }

            await Task.Delay(200);
        }

        var allPassed = outcomes.All(o => o.Passed);
        if (!allPassed)
        {
            return new ZatcaProductionCsidResult(false, null, outcomes, "One or more compliance checks failed.");
        }

        var prodResult = await apiClient.GetProductionCsidAsync(environment, identity.CcsidBinarySecurityToken, ccsidSecret, identity.CcsidRequestId ?? "");
        if (!prodResult.Success)
        {
            return new ZatcaProductionCsidResult(false, null, outcomes, ExtractErrorMessage(prodResult));
        }

        var root = prodResult.Body.RootElement;
        var requestId = root.TryGetProperty("requestID", out var reqIdEl) ? reqIdEl.ToString() : null;
        var binarySecurityToken = root.TryGetProperty("binarySecurityToken", out var tokenEl) ? tokenEl.GetString() : null;
        var secret = root.TryGetProperty("secret", out var secretEl) ? secretEl.GetString() : null;

        if (binarySecurityToken is null || secret is null)
        {
            return new ZatcaProductionCsidResult(false, requestId, outcomes, "ZATCA response missing binarySecurityToken/secret.");
        }

        identity.PcsidRequestId = requestId;
        identity.PcsidBinarySecurityToken = binarySecurityToken;
        identity.PcsidSecret = _protector.Protect(secret);
        // Production CSID is a new device/credential — start a fresh hash chain.
        identity.LastIcv = 0;
        identity.LastInvoiceHash = SeedInvoiceHash;
        identity.OnboardingStatus = "production_ready";
        identity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return new ZatcaProductionCsidResult(true, requestId, outcomes, null);
    }

    public async Task<ZatcaInvoice> SubmitInvoiceAsync(Guid invoiceId)
    {
        var invoice = await db.ZatcaInvoices
            .Include(z => z.Order).ThenInclude(o => o!.Items).ThenInclude(i => i.Product)
            .Include(z => z.Order).ThenInclude(o => o!.Customer)
            .FirstOrDefaultAsync(z => z.Id == invoiceId)
            ?? throw new InvalidOperationException($"ZATCA invoice {invoiceId} not found.");
        var branch = await db.Branches.FindAsync(invoice.BranchId)
            ?? throw new InvalidOperationException($"Branch {invoice.BranchId} not found.");
        var settings = await GetOrCreateBranchSettingsAsync(invoice.BranchId);

        if (invoice.Order is null || invoice.Order.Items.Count == 0)
            throw new InvalidOperationException("Invoice has no order line items to report.");

        // Every branch signs under the same shared certificate and increments the same ICV/hash
        // chain, so the read-modify-write below (and the external ZATCA call in between) must be
        // serialized across concurrent submissions from any branch — otherwise two branches could
        // compute the same ICV/PIH and fork the tamper-evident chain. EF has no FOR UPDATE API, so
        // this row-locks the singleton identity row via raw SQL for the whole transaction, held
        // across the external HTTP call. If EnableRetryOnFailure() is ever added to Program.cs,
        // this block must move inside db.Database.CreateExecutionStrategy().ExecuteAsync(...).
        await using var tx = await db.Database.BeginTransactionAsync();

        var identity = await db.ZatcaIdentities
            .FromSqlRaw("SELECT * FROM zatca_identity WHERE id = {0} FOR UPDATE", ZatcaIdentity.SingletonId)
            .SingleAsync();

        if (string.IsNullOrEmpty(identity.PcsidBinarySecurityToken) || string.IsNullOrEmpty(identity.PcsidSecret))
            throw new InvalidOperationException("Not onboarded to ZATCA production yet.");

        var pcsidSecret = _protector.Unprotect(identity.PcsidSecret);
        var privateKey = _protector.Unprotect(identity.PrivateKey!);
        var environment = MapApiEnvironment(identity.Environment);

        // Standard vs simplified selection: B2B (buyer VAT known) uses standard/clearance,
        // otherwise simplified/reporting — matches PHP's subtype-driven branch.
        var isSimplified = string.IsNullOrEmpty(invoice.BuyerVatNumber);

        var icv = identity.LastIcv + 1;
        var pih = identity.LastInvoiceHash;

        var invoiceTypeCode = invoice.InvoiceType switch
        {
            "credit" => "381",
            "debit" => "383",
            _ => "388",
        };

        // Derived from the invoice's own (correctly populated) aggregate totals, not per-line
        // OrderItem.TaxAmount/DiscountAmount — those are never actually set by POS checkout
        // (only the order-level aggregates are), so deriving the rate per-line always produced
        // 0%. This system applies one uniform VAT rate to the whole cart, so a single rate
        // derived from the real totals and applied to every line is both correct and simpler.
        //
        // The taxable base MUST include tobacco excise, matching _app.pos.tsx's own formula
        // (taxable = subtotal - discount + tobaccoExcise; vatAmount = taxable * rate) — omitting
        // it here previously back-derived a distorted VAT% (e.g. 18.75% instead of the real 15%)
        // whenever an order had any tobacco excise, since invoice.TaxAmount already includes the
        // VAT charged on that excise but the old taxableAmount denominator didn't. Order.CustomFeeAmount
        // (service charge) is deliberately NOT included: it's charged post-VAT, not part of the
        // VAT base (see the same pos.tsx formula) — and isn't represented elsewhere in this XML at
        // all yet (the template has no document-level "charge" AllowanceCharge, only the one
        // discount/allowance node), which is a separate, still-open gap.
        var subtotalAmount = invoice.Order.Items.Sum(i => i.UnitPrice * i.Quantity);
        var taxableAmount = subtotalAmount - invoice.DiscountAmount + invoice.Order.TobaccoFeeAmount;
        var vatPercent = taxableAmount != 0 ? Math.Round(invoice.TaxAmount / taxableAmount * 100, 2) : 15m;

        // Tobacco excise is charged per-unit and stacks with VAT on the same base, but this XML
        // builder has no separate "excise" tax scheme — only a single VatPercent per line. Folding
        // each tobacco line's excise into its reported unit price is what makes the line's
        // declared LineExtensionAmount (and therefore the invoice's signed PayableAmount) actually
        // include the excise money charged, instead of silently dropping it from the government
        // e-invoice while still charging the customer for it.
        var items = invoice.Order.Items.Select(i =>
        {
            var exciseUnitPrice = i.Quantity > 0 ? i.TobaccoFeeAmount / i.Quantity : 0m;
            return new ZatcaInvoiceLineItem(i.Product?.Name ?? "Item", i.Quantity, i.UnitPrice + exciseUnitPrice, vatPercent);
        }).ToList();

        var data = new ZatcaInvoiceData(
            Id: invoice.InvoiceNumber ?? invoice.Order.OrderNumber,
            Uuid: Guid.NewGuid().ToString(),
            IssueDate: invoice.IssueDate.ToString("yyyy-MM-dd"),
            IssueTime: invoice.IssueDate.ToString("HH:mm:ss"),
            InvoiceTypeCode: invoiceTypeCode,
            Subtype: isSimplified ? "0200000" : "0100000",
            Icv: icv,
            Pih: pih,
            Supplier: new ZatcaParty(
                RegistrationName: settings.SellerName ?? branch.Name,
                VatId: settings.VatRegistrationNumber,
                Address: new ZatcaPartyAddress(settings.StreetName, settings.BuildingNumber, settings.CitySubdivisionName, branch.City, settings.PostalZone),
                PartyIdentificationSchemeId: "CRN",
                PartyIdentificationId: branch.CommercialRegistration),
            Customer: isSimplified ? null : new ZatcaParty(
                RegistrationName: invoice.BuyerName,
                VatId: invoice.BuyerVatNumber,
                Address: new ZatcaPartyAddress(
                    invoice.BuyerStreetName, invoice.BuyerBuildingNumber,
                    invoice.BuyerCitySubdivisionName, invoice.BuyerCityName, invoice.BuyerPostalZone)),
            Items: items,
            DiscountAmount: invoice.DiscountAmount);

        var invoiceDoc = _xmlBuilder.Build(data);
        var signed = _signer.Sign(invoiceDoc, DecodeCertificateContent(identity.PcsidBinarySecurityToken), privateKey);

        var response = isSimplified
            ? await apiClient.InvoiceReportingAsync(environment, identity.PcsidBinarySecurityToken, pcsidSecret, signed)
            : await apiClient.InvoiceClearanceAsync(environment, identity.PcsidBinarySecurityToken, pcsidSecret, signed);

        var statusField = isSimplified ? "reportingStatus" : "clearanceStatus";
        var status = response.Body.RootElement.TryGetProperty(statusField, out var statusEl) ? statusEl.GetString() ?? "" : "";
        var isAccepted = status.Contains(isSimplified ? "REPORTED" : "CLEARED", StringComparison.Ordinal);

        invoice.XmlContent = signed.Invoice;
        invoice.QrCodeValue = signed.QrCode;
        invoice.ZatcaStatus = isAccepted ? "accepted" : "rejected";
        invoice.ZatcaResponse = response.RawBody;
        invoice.UpdatedAt = DateTime.UtcNow;

        if (isAccepted)
        {
            identity.LastIcv = icv;
            identity.LastInvoiceHash = signed.InvoiceHash;
            identity.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            logger.LogWarning("ZATCA invoice {InvoiceId} was rejected: {Body}", invoiceId, response.RawBody);
        }

        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return invoice;
    }

    private async Task<ZatcaSettings> GetOrCreateBranchSettingsAsync(Guid branchId)
    {
        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branchId);
        if (settings is not null) return settings;

        settings = new ZatcaSettings { BranchId = branchId };
        db.ZatcaSettings.Add(settings);
        await db.SaveChangesAsync();
        return settings;
    }

    private async Task<ZatcaIdentity> GetIdentityAsync() =>
        await db.ZatcaIdentities.FindAsync(ZatcaIdentity.SingletonId)
            ?? throw new InvalidOperationException("ZATCA identity row missing — migration seed did not run.");

    // ZATCA's binarySecurityToken is double base64-encoded. The raw value (as returned by the
    // CSID APIs) is correct as-is for Basic Auth, but ZatcaInvoiceSigner expects the certificate
    // content pre-decoded once — down to the certificate's PEM body text, not the raw DER.
    private static string DecodeCertificateContent(string binarySecurityToken) =>
        Encoding.UTF8.GetString(Convert.FromBase64String(binarySecurityToken));

    private static string MapCsrEnvironment(string environment) => environment switch
    {
        "production" => "Production",
        "simulation" => "Simulation",
        _ => "NonProduction",
    };

    private static string MapApiEnvironment(string environment) => environment switch
    {
        "production" => "production",
        "simulation" => "simulation",
        _ => "sandbox",
    };

    private static (bool Passed, string? ApiStatus, bool AlreadyCompliant) EvaluateComplianceResponse(ZatcaApiResult response, bool isSimplified)
    {
        var root = response.Body.RootElement;
        var statusField = isSimplified ? "reportingStatus" : "clearanceStatus";
        var status = root.TryGetProperty(statusField, out var statusEl) ? statusEl.GetString() ?? "UNKNOWN" : "UNKNOWN";

        var alreadyCompliant = false;
        if (root.TryGetProperty("validationResults", out var validationResults) &&
            validationResults.TryGetProperty("errorMessages", out var errorMessages) &&
            errorMessages.ValueKind == JsonValueKind.Array)
        {
            alreadyCompliant = errorMessages.EnumerateArray()
                .Any(e => e.TryGetProperty("message", out var msg) && (msg.GetString() ?? "").Contains("Compliance check already completed", StringComparison.Ordinal));
        }

        var passed = alreadyCompliant || status.Contains("REPORTED", StringComparison.Ordinal) || status.Contains("CLEARED", StringComparison.Ordinal);
        return (passed, status, alreadyCompliant);
    }

    private static string? ExtractErrorMessage(ZatcaApiResult result)
    {
        if (result.Body.RootElement.TryGetProperty("message", out var msg)) return msg.GetString();
        if (result.Body.RootElement.ValueKind is JsonValueKind.Object && result.Body.RootElement.EnumerateObject().Any())
            return result.Body.RootElement.ToString();
        // ZATCA sometimes returns a plain-text (non-JSON) error body, e.g. "Invalid Request" —
        // fall back to it instead of swallowing the diagnostic into an empty "{}".
        return string.IsNullOrWhiteSpace(result.RawBody) ? null : result.RawBody;
    }
}
