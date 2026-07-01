using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/supply-chain")]
public class SupplyChainFinanceController(BaqalaDbContext db) : ControllerBase
{
    // ─── Discrepancies ────────────────────────────────────────────────────────

    [HttpGet("discrepancies")]
    public async Task<IActionResult> GetDiscrepancies(
        [FromQuery] Guid? supplierId,
        [FromQuery] Guid? poId,
        [FromQuery] Guid? transferId,
        [FromQuery] string? status)
    {
        var query = db.StockDiscrepancies
            .Include(d => d.Supplier)
            .Include(d => d.Product)
            .AsQueryable();
        if (supplierId.HasValue) query = query.Where(d => d.SupplierId == supplierId);
        if (poId.HasValue) query = query.Where(d => d.PoId == poId);
        if (transferId.HasValue) query = query.Where(d => d.TransferId == transferId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(d => d.Status == status);
        return Ok(await query.OrderByDescending(d => d.CreatedAt).ToListAsync());
    }

    [HttpPatch("discrepancies/{id:guid}/status")]
    public async Task<IActionResult> UpdateDiscrepancyStatus(Guid id, [FromBody] DiscrepancyStatusRequest req)
    {
        var disc = await db.StockDiscrepancies.FindAsync(id);
        if (disc is null) return NotFound();
        disc.Status = req.Status;
        disc.Notes = req.Notes ?? disc.Notes;
        disc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(disc);
    }

    // Raise a debit note (credit note from supplier shortage perspective) from a discrepancy
    [HttpPost("discrepancies/{id:guid}/raise-debit-note")]
    public async Task<IActionResult> RaiseDebitNote(Guid id)
    {
        var disc = await db.StockDiscrepancies.FindAsync(id);
        if (disc is null) return NotFound();
        if (disc.DiscrepancyType != "shortage") return BadRequest("Debit notes are only for shortage discrepancies.");
        if (disc.Status == "debit_note_raised") return Conflict("Debit note already raised for this discrepancy.");

        var cn = new SupplierCreditNote
        {
            Id = Guid.NewGuid(),
            CreditNoteNumber = $"DN-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            SupplierId = disc.SupplierId,
            PoId = disc.PoId,
            TransferId = disc.TransferId,
            DiscrepancyId = disc.Id,
            Amount = disc.DiscrepancyValue,
            CreditType = "shortage_claim",
            Status = "confirmed",
            Notes = $"Debit note raised for {Math.Abs(disc.DiscrepancyQuantity)} unit shortage on {(disc.PoId.HasValue ? "PO" : "transfer")}",
            IssuedDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.SupplierCreditNotes.Add(cn);
        disc.Status = "debit_note_raised";
        disc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(cn);
    }

    // Create a manual discrepancy + raise debit note in one shot (for PO items that were never sent in a receive payload)
    [HttpPost("raise-shortage-debit-note")]
    public async Task<IActionResult> RaiseShortageDebitNote([FromBody] ManualShortageRequest req)
    {
        var po = await db.PurchaseOrders.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == req.PoId);
        if (po is null) return NotFound("PO not found.");

        var disc = new StockDiscrepancy
        {
            Id = Guid.NewGuid(),
            PoId = po.Id,
            SupplierId = po.SupplierId,
            ProductId = req.ProductId,
            ExpectedQuantity = req.ExpectedQuantity,
            ReceivedQuantity = req.ReceivedQuantity,
            DiscrepancyQuantity = req.ReceivedQuantity - req.ExpectedQuantity,
            UnitCost = req.UnitCost,
            DiscrepancyValue = (req.ExpectedQuantity - req.ReceivedQuantity) * req.UnitCost,
            DiscrepancyType = "shortage",
            Status = "debit_note_raised",
            Notes = $"Manually raised from PO {po.PoNumber}",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.StockDiscrepancies.Add(disc);

        var cn = new SupplierCreditNote
        {
            Id = Guid.NewGuid(),
            CreditNoteNumber = $"DN-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            SupplierId = po.SupplierId,
            PoId = po.Id,
            DiscrepancyId = disc.Id,
            Amount = disc.DiscrepancyValue,
            CreditType = "shortage_claim",
            Status = "confirmed",
            Notes = $"Shortage debit note for PO {po.PoNumber}",
            IssuedDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.SupplierCreditNotes.Add(cn);
        await db.SaveChangesAsync();
        return Ok(new { discrepancy = disc, creditNote = cn });
    }

    // ─── Credit Notes ─────────────────────────────────────────────────────────

    [HttpGet("credit-notes")]
    public async Task<IActionResult> GetCreditNotes(
        [FromQuery] Guid? supplierId,
        [FromQuery] string? status,
        [FromQuery] string? creditType,
        [FromQuery] Guid? poId)
    {
        var query = db.SupplierCreditNotes
            .Include(c => c.Supplier)
            .AsQueryable();
        if (supplierId.HasValue) query = query.Where(c => c.SupplierId == supplierId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(c => c.Status == status);
        if (!string.IsNullOrEmpty(creditType)) query = query.Where(c => c.CreditType == creditType);
        if (poId.HasValue) query = query.Where(c => c.PoId == poId);
        return Ok(await query.OrderByDescending(c => c.CreatedAt).ToListAsync());
    }

    [HttpPatch("credit-notes/{id:guid}/apply")]
    public async Task<IActionResult> ApplyCreditNote(Guid id, [FromQuery] Guid? applyToPoId)
    {
        var cn = await db.SupplierCreditNotes.FindAsync(id);
        if (cn is null) return NotFound();
        if (cn.Status == "applied") return Conflict("Already applied.");
        cn.Status = "applied";
        cn.UpdatedAt = DateTime.UtcNow;

        // If applying to a PO, reduce its outstanding balance
        if (applyToPoId.HasValue)
        {
            var po = await db.PurchaseOrders.FindAsync(applyToPoId.Value);
            if (po != null)
            {
                po.PaidAmount = Math.Min(po.TotalAmount, po.PaidAmount + cn.Amount);
                po.PaymentStatus = po.PaidAmount >= po.TotalAmount ? "paid" : (po.PaidAmount > 0 ? "partial" : "unpaid");
                po.UpdatedAt = DateTime.UtcNow;
            }
        }

        await db.SaveChangesAsync();
        return Ok(cn);
    }
}

public record DiscrepancyStatusRequest(string Status, string? Notes = null);
public record ManualShortageRequest(Guid PoId, Guid ProductId, decimal ExpectedQuantity, decimal ReceivedQuantity, decimal UnitCost);
