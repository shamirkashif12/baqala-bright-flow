using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ComplianceController(BaqalaDbContext db, IZatcaService zatcaService, INotificationService notifications) : ControllerBase
{
    // Mirrors the GetCallerContext pattern used across the other controllers.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // ─── ZATCA Invoices ───────────────────────────────────────────────────────
    // Invoices are compliance-module data (VAT registration, submission status) — unlike
    // GetSettings below, this isn't a checkout-time dependency for every role, so it's safe to
    // gate on the "Compliance" module the dedicated /zatca page already requires.
    [RequirePermission("Compliance", PermAction.View)]
    [HttpGet("zatca/invoices")]
    public async Task<IActionResult> GetInvoices([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.ZatcaInvoices.AsQueryable();
        if (branchId.HasValue) query = query.Where(z => z.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(z => z.ZatcaStatus == status);
        return Ok(await query.OrderByDescending(z => z.IssueDate).Take(200).ToListAsync());
    }

    [RequirePermission("Compliance", PermAction.View)]
    [HttpGet("zatca/invoices/{id:guid}")]
    public async Task<IActionResult> GetInvoiceById(Guid id)
    {
        var invoice = await db.ZatcaInvoices.FindAsync(id);
        if (invoice is null) return NotFound();

        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && invoice.BranchId != callerBranchId)
            return NotFound();

        return Ok(invoice);
    }

    [RequirePermission("Compliance", PermAction.Create)]
    [HttpPost("zatca/invoices")]
    public async Task<IActionResult> CreateInvoice([FromBody] ZatcaInvoice invoice)
    {
        invoice.Id = Guid.NewGuid();
        invoice.ZatcaStatus = "pending";
        invoice.CreatedAt = invoice.UpdatedAt = DateTime.UtcNow;
        db.ZatcaInvoices.Add(invoice);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetInvoiceById), new { id = invoice.Id }, invoice);
    }

    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPatch("zatca/invoices/{id:guid}/status")]
    public async Task<IActionResult> UpdateInvoiceStatus(Guid id, [FromBody] ZatcaStatusRequest req)
    {
        var invoice = await db.ZatcaInvoices.FindAsync(id);
        if (invoice is null) return NotFound();
        invoice.ZatcaStatus = req.Status;
        invoice.ZatcaResponse = req.Response;
        invoice.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(invoice);
    }

    // ─── ZATCA Settings ───────────────────────────────────────────────────────
    // Note: ZatcaSettings now also holds onboarding secrets (private key, CSID tokens/secrets —
    // encrypted at rest, but still never safe to echo back over the API), so these endpoints
    // project to ZatcaSettingsDto instead of returning the entity directly.
    // Deliberately NOT gated on the "Compliance" module — POS checkout (_app.pos.tsx) and the Tax
    // & Fees page call this for ANY role to print a compliant receipt, not just Compliance-module
    // users. Branch-scoping below still closes the actual leak (a branch's VAT registration number
    // was readable for any branchId by any authenticated caller); every real caller already only
    // ever requests their own branch.
    [HttpGet("zatca/settings/{branchId:guid}")]
    public async Task<IActionResult> GetSettings(Guid branchId)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && branchId != callerBranchId)
            return NotFound();

        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branchId);
        if (settings is null) return NotFound();
        var identity = await db.ZatcaIdentities.FindAsync(ZatcaIdentity.SingletonId);
        return Ok(ZatcaSettingsDto.From(settings, identity!));
    }

    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPut("zatca/settings/{branchId:guid}")]
    public async Task<IActionResult> UpsertSettings(Guid branchId, [FromBody] ZatcaSettingsUpdateRequest updated)
    {
        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branchId);
        if (settings is null)
        {
            settings = new ZatcaSettings
            {
                Id = Guid.NewGuid(),
                BranchId = branchId,
                CreatedAt = DateTime.UtcNow,
            };
            db.ZatcaSettings.Add(settings);
        }

        // Each field merges onto the existing value instead of overwriting unconditionally — a
        // caller that only knows about a subset of these fields (e.g. the simpler "Tax & ZATCA"
        // panel on /settings, which never touches the four address fields) must not silently
        // null out the rest of a branch's ZATCA configuration. A field is only cleared when the
        // caller explicitly sends "" (not null/absent) for it.
        settings.VatRegistrationNumber = updated.VatRegistrationNumber ?? settings.VatRegistrationNumber;
        settings.SellerName = updated.SellerName ?? settings.SellerName;
        settings.StreetName = updated.StreetName ?? settings.StreetName;
        settings.BuildingNumber = updated.BuildingNumber ?? settings.BuildingNumber;
        settings.CitySubdivisionName = updated.CitySubdivisionName ?? settings.CitySubdivisionName;
        settings.PostalZone = updated.PostalZone ?? settings.PostalZone;
        settings.UpdatedAt = DateTime.UtcNow;

        // Phase2Enabled/Environment are shared mart-wide — one certificate, one flag, no per-branch sync needed.
        var identity = await db.ZatcaIdentities.FindAsync(ZatcaIdentity.SingletonId)
            ?? throw new InvalidOperationException("ZATCA identity row missing — migration seed did not run.");
        identity.Phase2Enabled = updated.Phase2Enabled;
        identity.Environment = updated.Environment;
        identity.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ZatcaSettingsDto.From(settings, identity));
    }

    // ─── ZATCA Onboarding ─────────────────────────────────────────────────────
    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPost("zatca/onboarding/{branchId:guid}/csr")]
    public async Task<IActionResult> GenerateCsr(Guid branchId)
    {
        try
        {
            var result = await zatcaService.GenerateCsrAsync(branchId);
            return Ok(new { csr = result.Csr, egsSerial = result.EgsSerial });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPost("zatca/onboarding/{branchId:guid}/compliance-csid")]
    public async Task<IActionResult> GetComplianceCsid(Guid branchId, [FromBody] ZatcaOtpRequest req)
    {
        try
        {
            var result = await zatcaService.GetComplianceCsidAsync(req.Otp);
            return result.Success
                ? Ok(new { success = true, requestId = result.RequestId })
                : BadRequest(new { success = false, error = result.Error });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPost("zatca/onboarding/{branchId:guid}/production-csid")]
    public async Task<IActionResult> GetProductionCsid(Guid branchId)
    {
        try
        {
            var result = await zatcaService.RunOnboardingToProductionAsync();
            return Ok(new
            {
                success = result.Success,
                requestId = result.RequestId,
                error = result.Error,
                complianceTests = result.ComplianceTests.Select(t => new { t.DocumentType, t.Passed, t.ApiStatus }),
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ─── ZATCA Invoice Submission ─────────────────────────────────────────────
    // Previously had no permission check at all, unlike CreateInvoice/UpdateInvoiceStatus above —
    // any authenticated user could trigger a real government e-invoice submission.
    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPost("zatca/invoices/{id:guid}/submit")]
    public async Task<IActionResult> SubmitInvoice(Guid id)
    {
        try
        {
            var invoice = await zatcaService.SubmitInvoiceAsync(id);
            if (invoice.ZatcaStatus == "rejected")
            {
                await notifications.NotifyRoleAsync(["Admin"], invoice.BranchId,
                    "ZATCA", "ZATCA Submission Failed", "ZATCA Submission Failed",
                    $"ZATCA submission failed for invoice {invoice.InvoiceNumber ?? invoice.Id.ToString()}",
                    severity: "error", entityType: "ZatcaInvoice", entityId: invoice.Id);
            }
            return Ok(invoice);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ─── Company Profile ──────────────────────────────────────────────────────
    // One company-wide legal identity (name/CR/VAT) shown on every printed receipt and exported
    // report. Deliberately NOT gated on the "Compliance" module for the GET — POS checkout and
    // every report export need to read this for any authenticated role, same reasoning as
    // GetSettings above.
    [HttpGet("company-profile")]
    public async Task<IActionResult> GetCompanyProfile()
    {
        var profile = await db.CompanyProfiles.FindAsync(CompanyProfile.SingletonId)
            ?? throw new InvalidOperationException("Company profile row missing — migration seed did not run.");
        return Ok(profile);
    }

    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPut("company-profile")]
    public async Task<IActionResult> UpdateCompanyProfile([FromBody] CompanyProfileUpdateRequest req)
    {
        var profile = await db.CompanyProfiles.FindAsync(CompanyProfile.SingletonId)
            ?? throw new InvalidOperationException("Company profile row missing — migration seed did not run.");

        profile.LegalName = req.LegalName;
        profile.CrNumber = req.CrNumber;
        profile.VatNumber = req.VatNumber;
        profile.UpdatedBy = Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : null;
        profile.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(profile);
    }

    // ─── Rules Engine ─────────────────────────────────────────────────────────
    [HttpGet("rules")]
    public async Task<IActionResult> GetRules([FromQuery] string? ruleType, [FromQuery] Guid? branchId, [FromQuery] bool includeInactive = false)
    {
        var query = db.RulesEngine.AsQueryable();
        if (!includeInactive) query = query.Where(r => r.IsActive);
        if (!string.IsNullOrEmpty(ruleType)) query = query.Where(r => r.RuleType == ruleType);
        if (branchId.HasValue) query = query.Where(r => r.BranchId == null || r.BranchId == branchId);
        return Ok(await query.OrderByDescending(r => r.Priority).ToListAsync());
    }

    [RequirePermission("Rules Engine", PermAction.Create)]
    [HttpPost("rules")]
    public async Task<IActionResult> CreateRule([FromBody] RulesEngine rule)
    {
        rule.Id = Guid.NewGuid();
        rule.CreatedAt = rule.UpdatedAt = DateTime.UtcNow;
        db.RulesEngine.Add(rule);
        await db.SaveChangesAsync();
        return Created($"/api/compliance/rules/{rule.Id}", rule);
    }

    [RequirePermission("Rules Engine", PermAction.Edit)]
    [HttpPut("rules/{id:guid}")]
    public async Task<IActionResult> UpdateRule(Guid id, [FromBody] RulesEngine updated)
    {
        var rule = await db.RulesEngine.FindAsync(id);
        if (rule is null) return NotFound();
        rule.RuleName = updated.RuleName;
        rule.RuleType = updated.RuleType;
        rule.AppliesTo = updated.AppliesTo;
        rule.BranchId = updated.BranchId;
        rule.RuleConfig = updated.RuleConfig;
        rule.Priority = updated.Priority;
        rule.IsActive = updated.IsActive;
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(rule);
    }

    [RequirePermission("Rules Engine", PermAction.Edit)]
    [HttpPatch("rules/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleRule(Guid id)
    {
        var rule = await db.RulesEngine.FindAsync(id);
        if (rule is null) return NotFound();
        rule.IsActive = !rule.IsActive;
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(rule);
    }

    [RequirePermission("Rules Engine", PermAction.Delete)]
    [HttpDelete("rules/{id:guid}")]
    public async Task<IActionResult> DeleteRule(Guid id)
    {
        var rule = await db.RulesEngine.FindAsync(id);
        if (rule is null) return NotFound();
        db.RulesEngine.Remove(rule);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record ZatcaStatusRequest(string Status, string? Response);
public record ZatcaOtpRequest(string Otp);
public record CompanyProfileUpdateRequest(string? LegalName, string? CrNumber, string? VatNumber);

// Request body for PUT zatca/settings/{branchId} — branch display fields plus the mart-wide
// shared Phase2Enabled/Environment flags (which the controller writes onto ZatcaIdentity).
public record ZatcaSettingsUpdateRequest(
    string? VatRegistrationNumber,
    string? SellerName,
    string? StreetName,
    string? BuildingNumber,
    string? CitySubdivisionName,
    string? PostalZone,
    bool Phase2Enabled,
    string Environment);

// Safe projection merging per-branch ZatcaSettings with the shared ZatcaIdentity — excludes
// PrivateKey/Csr/CcsidSecret/PcsidSecret/binary security tokens, which must never be echoed back
// over the API even encrypted.
public record ZatcaSettingsDto(
    Guid Id,
    Guid BranchId,
    string? VatRegistrationNumber,
    string? SellerName,
    string? StreetName,
    string? BuildingNumber,
    string? CitySubdivisionName,
    string? PostalZone,
    bool Phase2Enabled,
    string Environment,
    string? EgsSerial,
    string OnboardingStatus,
    bool HasCsr,
    bool HasComplianceCsid,
    bool HasProductionCsid,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static ZatcaSettingsDto From(ZatcaSettings s, ZatcaIdentity i) => new(
        s.Id, s.BranchId, s.VatRegistrationNumber, s.SellerName,
        s.StreetName, s.BuildingNumber, s.CitySubdivisionName, s.PostalZone,
        i.Phase2Enabled, i.Environment, i.EgsSerial, i.OnboardingStatus,
        HasCsr: !string.IsNullOrEmpty(i.Csr),
        HasComplianceCsid: !string.IsNullOrEmpty(i.CcsidBinarySecurityToken),
        HasProductionCsid: !string.IsNullOrEmpty(i.PcsidBinarySecurityToken),
        s.CreatedAt, s.UpdatedAt);
}
