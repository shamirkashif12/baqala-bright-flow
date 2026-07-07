using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ComplianceController(BaqalaDbContext db, IZatcaService zatcaService) : ControllerBase
{
    // ─── ZATCA Invoices ───────────────────────────────────────────────────────
    [HttpGet("zatca/invoices")]
    public async Task<IActionResult> GetInvoices([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.ZatcaInvoices.AsQueryable();
        if (branchId.HasValue) query = query.Where(z => z.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(z => z.ZatcaStatus == status);
        return Ok(await query.OrderByDescending(z => z.IssueDate).Take(200).ToListAsync());
    }

    [HttpGet("zatca/invoices/{id:guid}")]
    public async Task<IActionResult> GetInvoiceById(Guid id)
    {
        var invoice = await db.ZatcaInvoices.FindAsync(id);
        return invoice is null ? NotFound() : Ok(invoice);
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
    [HttpGet("zatca/settings/{branchId:guid}")]
    public async Task<IActionResult> GetSettings(Guid branchId)
    {
        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branchId);
        return settings is null ? NotFound() : Ok(ZatcaSettingsDto.From(settings));
    }

    [RequirePermission("Compliance", PermAction.Edit)]
    [HttpPut("zatca/settings/{branchId:guid}")]
    public async Task<IActionResult> UpsertSettings(Guid branchId, [FromBody] ZatcaSettings updated)
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

        settings.VatRegistrationNumber = updated.VatRegistrationNumber;
        settings.SellerName = updated.SellerName;
        settings.StreetName = updated.StreetName;
        settings.BuildingNumber = updated.BuildingNumber;
        settings.CitySubdivisionName = updated.CitySubdivisionName;
        settings.PostalZone = updated.PostalZone;
        settings.Phase2Enabled = updated.Phase2Enabled;
        settings.Environment = updated.Environment;
        settings.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ZatcaSettingsDto.From(settings));
    }

    // ─── ZATCA Onboarding ─────────────────────────────────────────────────────
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

    [HttpPost("zatca/onboarding/{branchId:guid}/compliance-csid")]
    public async Task<IActionResult> GetComplianceCsid(Guid branchId, [FromBody] ZatcaOtpRequest req)
    {
        try
        {
            var result = await zatcaService.GetComplianceCsidAsync(branchId, req.Otp);
            return result.Success
                ? Ok(new { success = true, requestId = result.RequestId })
                : BadRequest(new { success = false, error = result.Error });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("zatca/onboarding/{branchId:guid}/production-csid")]
    public async Task<IActionResult> GetProductionCsid(Guid branchId)
    {
        try
        {
            var result = await zatcaService.RunOnboardingToProductionAsync(branchId);
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
    [HttpPost("zatca/invoices/{id:guid}/submit")]
    public async Task<IActionResult> SubmitInvoice(Guid id)
    {
        try
        {
            var invoice = await zatcaService.SubmitInvoiceAsync(id);
            return Ok(invoice);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ─── Rules Engine ─────────────────────────────────────────────────────────
    [HttpGet("rules")]
    public async Task<IActionResult> GetRules([FromQuery] string? ruleType, [FromQuery] Guid? branchId)
    {
        var query = db.RulesEngine.Where(r => r.IsActive).AsQueryable();
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
        rule.RuleConfig = updated.RuleConfig;
        rule.Priority = updated.Priority;
        rule.IsActive = updated.IsActive;
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(rule);
    }
}

public record ZatcaStatusRequest(string Status, string? Response);
public record ZatcaOtpRequest(string Otp);

// Safe projection of ZatcaSettings — excludes PrivateKey/Csr/CcsidSecret/PcsidSecret/binary
// security tokens, which must never be echoed back over the API even encrypted.
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
    public static ZatcaSettingsDto From(ZatcaSettings s) => new(
        s.Id, s.BranchId, s.VatRegistrationNumber, s.SellerName,
        s.StreetName, s.BuildingNumber, s.CitySubdivisionName, s.PostalZone,
        s.Phase2Enabled, s.Environment, s.EgsSerial, s.OnboardingStatus,
        HasCsr: !string.IsNullOrEmpty(s.Csr),
        HasComplianceCsid: !string.IsNullOrEmpty(s.CcsidBinarySecurityToken),
        HasProductionCsid: !string.IsNullOrEmpty(s.PcsidBinarySecurityToken),
        s.CreatedAt, s.UpdatedAt);
}
