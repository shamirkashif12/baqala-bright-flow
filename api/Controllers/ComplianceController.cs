using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ComplianceController(BaqalaDbContext db) : ControllerBase
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
    [HttpGet("zatca/settings/{branchId:guid}")]
    public async Task<IActionResult> GetSettings(Guid branchId)
    {
        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branchId);
        return settings is null ? NotFound() : Ok(settings);
    }

    [HttpPut("zatca/settings/{branchId:guid}")]
    public async Task<IActionResult> UpsertSettings(Guid branchId, [FromBody] ZatcaSettings updated)
    {
        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branchId);
        if (settings is null)
        {
            updated.Id = Guid.NewGuid();
            updated.BranchId = branchId;
            updated.CreatedAt = updated.UpdatedAt = DateTime.UtcNow;
            db.ZatcaSettings.Add(updated);
        }
        else
        {
            settings.VatRegistrationNumber = updated.VatRegistrationNumber;
            settings.SellerName = updated.SellerName;
            settings.Phase2Enabled = updated.Phase2Enabled;
            settings.Environment = updated.Environment;
            settings.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return Ok(settings ?? updated);
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

    [HttpPost("rules")]
    public async Task<IActionResult> CreateRule([FromBody] RulesEngine rule)
    {
        rule.Id = Guid.NewGuid();
        rule.CreatedAt = rule.UpdatedAt = DateTime.UtcNow;
        db.RulesEngine.Add(rule);
        await db.SaveChangesAsync();
        return Created($"/api/compliance/rules/{rule.Id}", rule);
    }

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
