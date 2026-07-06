using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/purchase-orders")]
public class PurchaseOrdersController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? supplierId,
        [FromQuery] Guid? warehouseId,
        [FromQuery] string? status,
        [FromQuery] string? paymentStatus,
        [FromQuery] string? batchId)
    {
        var query = db.PurchaseOrders
            .Include(p => p.Supplier)
            .Include(p => p.Warehouse)
            .Include(p => p.Branch)
            .Include(p => p.Items).ThenInclude(i => i.Product)
            .Include(p => p.Payments)
            .AsQueryable();
        if (supplierId.HasValue) query = query.Where(p => p.SupplierId == supplierId);
        if (warehouseId.HasValue) query = query.Where(p => p.WarehouseId == warehouseId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(p => p.Status == status);
        if (!string.IsNullOrEmpty(paymentStatus)) query = query.Where(p => p.PaymentStatus == paymentStatus);
        if (!string.IsNullOrEmpty(batchId)) query = query.Where(p => p.BatchId == batchId);
        return Ok(await query.OrderByDescending(p => p.CreatedAt).ToListAsync());
    }

    [HttpGet("batch/{batchId}")]
    public async Task<IActionResult> GetByBatchId(string batchId)
    {
        var pos = await db.PurchaseOrders
            .Include(p => p.Supplier)
            .Include(p => p.Warehouse)
            .Include(p => p.Branch)
            .Include(p => p.Items).ThenInclude(i => i.Product)
            .Include(p => p.Payments)
            .Where(p => p.BatchId == batchId)
            .OrderBy(p => p.CreatedAt)
            .ToListAsync();
        return Ok(pos);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var po = await db.PurchaseOrders
            .Include(p => p.Supplier)
            .Include(p => p.Warehouse)
            .Include(p => p.Branch)
            .Include(p => p.Items).ThenInclude(i => i.Product)
            .Include(p => p.Payments)
            .FirstOrDefaultAsync(p => p.Id == id);
        return po is null ? NotFound() : Ok(po);
    }

    [HttpGet("by-number/{number}")]
    public async Task<IActionResult> GetByNumber(string number)
    {
        var po = await db.PurchaseOrders
            .Include(p => p.Supplier)
            .Include(p => p.Warehouse)
            .Include(p => p.Branch)
            .Include(p => p.Items).ThenInclude(i => i.Product)
            .Include(p => p.Payments)
            .FirstOrDefaultAsync(p => p.PoNumber == number);
        return po is null ? NotFound() : Ok(po);
    }

    [RequirePermission("Purchase Orders", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePoRequest req)
    {
        var poId = Guid.NewGuid();
        var items = (req.Items ?? []).Select(i => new PurchaseOrderItem
        {
            Id = Guid.NewGuid(),
            PoId = poId,
            ProductId = i.ProductId,
            OrderedQuantity = i.OrderedQuantity,
            UnitCost = i.UnitCost,
            Subtotal = i.OrderedQuantity * i.UnitCost,
            Status = "pending",
            CreatedAt = DateTime.UtcNow,
        }).ToList();

        var po = new PurchaseOrder
        {
            Id = poId,
            PoNumber = $"PO-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            SupplierId = req.SupplierId,
            WarehouseId = req.WarehouseId,
            BranchId = req.BranchId,
            OrderedBy = req.OrderedBy ?? Guid.Empty,
            PaymentTerms = req.PaymentTerms,
            ExpectedDeliveryDate = req.ExpectedDeliveryDate,
            Notes = req.Notes,
            BatchId = req.BatchId,
            Status = "draft",
            PaymentStatus = "unpaid",
            TotalAmount = items.Sum(i => i.Subtotal),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = items,
        };
        db.PurchaseOrders.Add(po);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = po.Id }, po);
    }

    [RequirePermission("Purchase Orders", PermAction.Approve)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdatePoStatusRequest req)
    {
        var po = await db.PurchaseOrders.FindAsync(id);
        if (po is null) return NotFound();
        po.Status = req.Status;
        if (req.ApprovedBy.HasValue) po.ApprovedBy = req.ApprovedBy;
        po.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(po);
    }

    // Receive stock against PO — updates item received quantities + creates InventoryBatch + updates stock
    [RequirePermission("Purchase Orders", PermAction.Edit)]
    [HttpPost("{id:guid}/receive")]
    public async Task<IActionResult> Receive(Guid id, [FromBody] List<ReceiveItemRequest> items)
    {
        var po = await db.PurchaseOrders
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (po is null) return NotFound();
        if (po.Status == "cancelled") return BadRequest("PO is cancelled.");

        // Same stock-write guard as InventoryController.ReceiveBatch — receiving against a PO
        // is a second, previously-unvalidated route to write InventoryBatch rows, so it needs
        // the same quantity/expiry checks rather than trusting the receive payload as-is.
        foreach (var recv in items)
        {
            if (recv.Quantity <= 0)
                return BadRequest(new { message = $"Received quantity for product {recv.ProductId} must be greater than zero." });

            var poItemForCheck = po.Items.FirstOrDefault(i => i.ProductId == recv.ProductId);
            var effectiveExpiry = recv.ExpiryDate ?? poItemForCheck?.ExpiryDate;
            if (effectiveExpiry.HasValue && effectiveExpiry.Value.Date < DateTime.UtcNow.Date
                && string.IsNullOrWhiteSpace(recv.DamagedOrReturnReason))
                return BadRequest(new { message = $"Expiry date for product {recv.ProductId} cannot be in the past — provide a damagedOrReturnReason to log it as damaged/return stock instead of resalable inventory." });
        }

        foreach (var recv in items)
        {
            var item = po.Items.FirstOrDefault(i => i.ProductId == recv.ProductId);
            if (item is null) continue;

            item.ReceivedQuantity += recv.Quantity;
            item.Status = item.ReceivedQuantity >= item.OrderedQuantity ? "received" : "partial";

            // Create inventory batch
            var batch = new InventoryBatch
            {
                Id = Guid.NewGuid(),
                BatchNumber = !string.IsNullOrEmpty(recv.BatchNumber)
                    ? recv.BatchNumber
                    : $"BATCH-{po.PoNumber}-{recv.ProductId.ToString()[..4].ToUpper()}",
                ProductId = recv.ProductId,
                BranchId = po.BranchId ?? Guid.Empty,
                SupplierId = po.SupplierId,
                Quantity = recv.Quantity,
                RemainingQuantity = recv.Quantity,
                PurchaseCost = item.UnitCost,
                ExpiryDate = recv.ExpiryDate ?? item.ExpiryDate,
                ReceivedDate = DateTime.UtcNow,
                Status = "active",
                Notes = !string.IsNullOrWhiteSpace(recv.DamagedOrReturnReason)
                    ? $"Received via PO {po.PoNumber} [Damaged/Return: {recv.DamagedOrReturnReason}]"
                    : $"Received via PO {po.PoNumber}",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };

            // If destination is warehouse, handle WarehouseStock instead
            if (po.WarehouseId.HasValue)
            {
                var wStock = await db.WarehouseStocks
                    .FirstOrDefaultAsync(s => s.WarehouseId == po.WarehouseId && s.ProductId == recv.ProductId);
                if (wStock is null)
                {
                    wStock = new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = po.WarehouseId.Value, ProductId = recv.ProductId };
                    db.WarehouseStocks.Add(wStock);
                }
                wStock.Quantity += recv.Quantity;
                wStock.LastUpdated = wStock.UpdatedAt = DateTime.UtcNow;
                batch.BranchId = (await db.BranchWarehouses.Where(bw => bw.WarehouseId == po.WarehouseId).Select(bw => bw.BranchId).FirstOrDefaultAsync());
            }
            else if (po.BranchId.HasValue)
            {
                // Update branch stock
                var bStock = await db.InventoryStocks
                    .FirstOrDefaultAsync(s => s.BranchId == po.BranchId && s.ProductId == recv.ProductId);
                if (bStock is null)
                {
                    bStock = new InventoryStock { Id = Guid.NewGuid(), BranchId = po.BranchId.Value, ProductId = recv.ProductId };
                    db.InventoryStocks.Add(bStock);
                }
                bStock.Quantity += recv.Quantity;
                bStock.LastUpdated = bStock.UpdatedAt = DateTime.UtcNow;
            }
            db.InventoryBatches.Add(batch);
        }

        // Update PO status
        var allReceived = po.Items.All(i => i.Status == "received");
        var anyReceived = po.Items.Any(i => i.ReceivedQuantity > 0);
        po.Status = allReceived ? "fully_received" : (anyReceived ? "partial_received" : po.Status);
        if (allReceived) po.ReceivedDate = DateTime.UtcNow;
        po.UpdatedAt = DateTime.UtcNow;

        // Update supplier's last supply date
        var supplier = await db.Suppliers.FindAsync(po.SupplierId);
        if (supplier != null) supplier.LastSupplyDate = DateTime.UtcNow;

        // Create discrepancy records for any shortfalls / excess
        foreach (var recv in items)
        {
            var item = po.Items.FirstOrDefault(i => i.ProductId == recv.ProductId);
            if (item is null) continue;
            var diff = recv.Quantity - item.OrderedQuantity;
            if (diff == 0) continue;
            db.StockDiscrepancies.Add(new StockDiscrepancy
            {
                Id = Guid.NewGuid(),
                PoId = po.Id,
                SupplierId = po.SupplierId,
                ProductId = recv.ProductId,
                ExpectedQuantity = item.OrderedQuantity,
                ReceivedQuantity = recv.Quantity,
                DiscrepancyQuantity = diff,
                UnitCost = item.UnitCost,
                DiscrepancyValue = Math.Abs(diff) * item.UnitCost,
                DiscrepancyType = diff < 0 ? "shortage" : "excess",
                Status = "open",
                Notes = $"Auto-detected on PO {po.PoNumber} receive",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        await db.SaveChangesAsync();
        return Ok(po);
    }

    [RequirePermission("Purchase Orders", PermAction.Edit)]
    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> AddPayment(Guid id, [FromBody] AddPaymentRequest req)
    {
        var po = await db.PurchaseOrders.FindAsync(id);
        if (po is null) return NotFound();
        var payment = new SupplierPayment
        {
            Id = Guid.NewGuid(),
            PoId = id,
            SupplierId = po.SupplierId,
            Amount = req.Amount,
            PaymentMethod = req.PaymentMethod ?? "cash",
            PaymentDate = req.PaymentDate ?? DateTime.UtcNow,
            ReferenceNumber = req.ReferenceNumber,
            Notes = req.Notes,
            RecordedBy = req.RecordedBy ?? Guid.Empty,
            Status = "completed",
            CreatedAt = DateTime.UtcNow,
        };
        db.SupplierPayments.Add(payment);
        po.PaidAmount += payment.Amount;
        po.PaymentStatus = po.PaidAmount >= po.TotalAmount ? "paid" : (po.PaidAmount > 0 ? "partial" : "unpaid");
        po.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(payment);
    }
}

public record UpdatePoStatusRequest(string Status, Guid? ApprovedBy);
public record ReceiveItemRequest(Guid ProductId, decimal Quantity, DateTime? ExpiryDate, string? BatchNumber, string? DamagedOrReturnReason = null);
public record CreatePoItemRequest(Guid ProductId, decimal OrderedQuantity, decimal UnitCost);
public record CreatePoRequest(
    Guid SupplierId,
    Guid? WarehouseId,
    Guid? BranchId,
    Guid? OrderedBy,
    string? PaymentTerms,
    DateTime? ExpectedDeliveryDate,
    string? Notes,
    string? BatchId,
    List<CreatePoItemRequest>? Items
);
public record AddPaymentRequest(
    decimal Amount,
    string? PaymentMethod,
    DateTime? PaymentDate,
    string? ReferenceNumber,
    string? Notes,
    Guid? RecordedBy
);
