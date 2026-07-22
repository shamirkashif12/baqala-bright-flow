using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// One screen for every manager approval in the mart — discounts, order cancellations, item
// deletions (all newly gated by this feature), plus the pre-existing maker-checker flows
// (Returns/Refunds, Stock Counts, Stock Transfers, Inventory write-offs). This controller only
// AGGREGATES those four pre-existing flows for display; their own approve/reject endpoints
// (ReturnsController, StockCountsController, StockTransfersController, InventoryController)
// remain the source of truth and are untouched. The decision endpoint below only actions the
// three NEW request types backed by ApprovalRequest.
[ApiController]
[Route("api/approvals")]
public class ApprovalsController(
    BaqalaDbContext db,
    IAuditService audit,
    IOrderVoidService orderVoidService,
    IProductDeletionService productDeletion,
    IDiscountCreationService discountCreation) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Which permission module gates approving each row's underlying action.
    private static string ModuleFor(string requestType) => requestType switch
    {
        "discount" => "Coupons",
        "order_cancellation" => "Orders",
        "item_deletion" => "Inventory",
        "refund_return" => "Returns",
        "stock_count" => "Stocks",
        "stock_transfer" => "Stock Transfers",
        "wastage_adjustment" => "Stocks",
        _ => "Orders",
    };

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status, [FromQuery] string? type, [FromQuery] Guid? branchId,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        var isAdmin = callerRole == "tenant_admin";
        if (!isAdmin && callerBranchId.HasValue) branchId = callerBranchId;

        // A manager only sees (and can act on) rows for a module they actually hold Approve on.
        string[] allModules = ["Coupons", "Orders", "Inventory", "Returns", "Stocks", "Stock Transfers"];
        var allowedModules = new HashSet<string>();
        foreach (var m in allModules)
            if (await PermissionCheck.HasPermissionAsync(User, db, m, PermAction.Approve))
                allowedModules.Add(m);
        if (allowedModules.Count == 0) return StatusCode(403, new { message = "You do not have approval permission on any module." });

        var rows = new List<ApprovalRowDto>();

        // ── ApprovalRequest: discount / order_cancellation / item_deletion ──
        var arQuery = db.ApprovalRequests
            .Include(a => a.RequestedByUser).Include(a => a.ApprovedByUser).Include(a => a.Branch)
            .AsQueryable();
        // BranchId is null for tenant-wide requests (e.g. a Discount not scoped to one branch, or
        // a product deletion — the catalog has no branch at all) — those must stay visible under
        // any branch filter, not get silently hidden by a manager's own-branch scoping below.
        if (branchId.HasValue) arQuery = arQuery.Where(a => a.BranchId == branchId || a.BranchId == null);
        var approvalRequests = await arQuery.OrderByDescending(a => a.RequestedAt).Take(300).ToListAsync();
        rows.AddRange(approvalRequests
            .Where(a => allowedModules.Contains(ModuleFor(a.RequestType)))
            .Select(a => new ApprovalRowDto(
                a.Id, "approval_request", a.RequestType, EntityLabel(a),
                a.BranchId, a.Branch?.Name,
                a.RequestedBy, a.RequestedByUser?.FullName,
                a.RequestedAt, a.Status,
                a.ApprovedBy, a.ApprovedByUser?.FullName, a.ApprovedAt,
                a.Reason, a.RejectionReason)));

        // ── Customer Returns / Refunds ──
        if (allowedModules.Contains("Returns"))
        {
            var retQuery = db.CustomerReturns
                .Include(r => r.ProcessedByUser).Include(r => r.ApprovedByUser).Include(r => r.Branch)
                .AsQueryable();
            if (branchId.HasValue) retQuery = retQuery.Where(r => r.BranchId == branchId);
            // CustomerReturn.BranchId is required (non-nullable) — no "tenant-wide" case here.
            var returns = await retQuery.OrderByDescending(r => r.CreatedAt).Take(300).ToListAsync();
            rows.AddRange(returns.Select(r => new ApprovalRowDto(
                r.Id, "return", "refund_return", $"Return {r.ReturnNumber ?? r.Id.ToString("N")[..8]}",
                r.BranchId, r.Branch?.Name,
                r.ProcessedBy, r.ProcessedByUser?.FullName,
                r.CreatedAt, r.Status,
                r.ApprovedBy, r.ApprovedByUser?.FullName, r.Status is "approved" or "rejected" or "completed" ? r.UpdatedAt : null,
                r.Reason, null)));
        }

        // ── Stock Counts ──
        if (allowedModules.Contains("Stocks"))
        {
            var scQuery = db.StockCounts
                .Include(c => c.CompletedByUser).Include(c => c.ApprovedByUser).Include(c => c.Branch).Include(c => c.Warehouse)
                .Where(c => c.Status != "draft")
                .AsQueryable();
            // A warehouse-only count has BranchId == null — keep it visible under any branch filter.
            if (branchId.HasValue) scQuery = scQuery.Where(c => c.BranchId == branchId || c.BranchId == null);
            var counts = await scQuery.OrderByDescending(c => c.CreatedAt).Take(300).ToListAsync();
            rows.AddRange(counts.Select(c => new ApprovalRowDto(
                c.Id, "stock_count", "stock_count", $"Stock count — {c.Branch?.Name ?? c.Warehouse?.Name ?? "—"}",
                c.BranchId, c.Branch?.Name ?? c.Warehouse?.Name,
                c.CompletedBy, c.CompletedByUser?.FullName,
                c.CompletedAt ?? c.CreatedAt, c.Status,
                c.ApprovedBy, c.ApprovedByUser?.FullName, c.ApprovedAt,
                c.Notes, c.RejectionReason)));
        }

        // ── Stock Transfers ──
        if (allowedModules.Contains("Stock Transfers"))
        {
            var stQuery = db.StockTransfers
                .Include(t => t.CreatedByUser).Include(t => t.ApprovedByUser).Include(t => t.SourceBranch).Include(t => t.DestBranch)
                .Where(t => t.Status != "draft")
                .AsQueryable();
            // A warehouse-to-warehouse or supplier transfer has both branch fields null — keep it
            // visible under any branch filter, same reasoning as the other tenant-wide cases above.
            if (branchId.HasValue) stQuery = stQuery.Where(t =>
                t.SourceBranchId == branchId || t.DestBranchId == branchId ||
                (t.SourceBranchId == null && t.DestBranchId == null));
            var transfers = await stQuery.OrderByDescending(t => t.CreatedAt).Take(300).ToListAsync();
            rows.AddRange(transfers.Select(t => new ApprovalRowDto(
                t.Id, "stock_transfer", "stock_transfer", $"Transfer {t.TransferNumber ?? t.Id.ToString("N")[..8]}",
                t.SourceBranchId ?? t.DestBranchId, t.SourceBranch?.Name ?? t.DestBranch?.Name,
                t.CreatedBy, t.CreatedByUser?.FullName,
                t.CreatedAt, t.Status,
                t.ApprovedBy, t.ApprovedByUser?.FullName, t.Status is "approved" or "rejected" ? t.UpdatedAt : null,
                t.Notes, null)));
        }

        // ── Inventory write-offs (Wastage) ──
        if (allowedModules.Contains("Stocks"))
        {
            var adjQuery = db.InventoryAdjustments
                .Include(a => a.AdjustedByUser).Include(a => a.ApprovedByUser).Include(a => a.Branch).Include(a => a.Product)
                .Where(a => a.ApprovalStatus != null)
                .AsQueryable();
            // A warehouse-held write-off has BranchId == null — keep it visible under any branch filter.
            if (branchId.HasValue) adjQuery = adjQuery.Where(a => a.BranchId == branchId || a.BranchId == null);
            var adjustments = await adjQuery.OrderByDescending(a => a.CreatedAt).Take(300).ToListAsync();
            rows.AddRange(adjustments.Select(a => new ApprovalRowDto(
                a.Id, "wastage_adjustment", "wastage_adjustment", $"{a.AdjustmentType} — {a.Product?.Name ?? "—"}",
                a.BranchId, a.Branch?.Name,
                a.AdjustedBy, a.AdjustedByUser?.FullName,
                a.CreatedAt, a.ApprovalStatus!,
                a.ApprovedBy, a.ApprovedByUser?.FullName, a.ApprovedAt,
                a.Reason, a.RejectionReason)));
        }

        var filtered = rows.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(status)) filtered = filtered.Where(r => r.Status == status);
        if (!string.IsNullOrWhiteSpace(type)) filtered = filtered.Where(r => r.RequestType == type);
        if (from.HasValue) filtered = filtered.Where(r => r.RequestedAt >= from.Value);
        if (to.HasValue) filtered = filtered.Where(r => r.RequestedAt < to.Value);

        return Ok(filtered.OrderByDescending(r => r.RequestedAt).Take(500).ToList());
    }

    private static string EntityLabel(ApprovalRequest a) => a.RequestType switch
    {
        "discount" => "New discount request",
        "order_cancellation" => "Order cancellation",
        "item_deletion" => $"{a.EntityType} deletion",
        _ => a.RequestType,
    };

    // Only valid for the three NEW request types backed by ApprovalRequest — the four pre-existing
    // flows keep using their own approve/reject endpoints (ReturnsController, StockCountsController,
    // StockTransfersController, InventoryController), which the Approval Center frontend calls
    // directly based on each row's sourceType.
    [HttpPost("{id:guid}/decision")]
    public async Task<IActionResult> Decide(Guid id, [FromBody] ApprovalDecisionRequest req)
    {
        var pending = await db.ApprovalRequests.FirstOrDefaultAsync(a => a.Id == id);
        if (pending is null) return NotFound();
        if (pending.Status != "pending") return BadRequest(new { message = "This request has already been decided." });
        if (!req.Approved && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A rejection reason is required." });

        var module = ModuleFor(pending.RequestType);
        if (!await PermissionCheck.HasPermissionAsync(User, db, module, PermAction.Approve))
            return StatusCode(403, new { message = $"You do not have permission to approve {module}." });

        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole != "tenant_admin" && callerBranchId.HasValue && pending.BranchId.HasValue && pending.BranchId != callerBranchId)
            return StatusCode(403, new { message = "This request belongs to a different branch." });

        var actorId = CallerId();

        if (req.Approved)
        {
            switch (pending.RequestType)
            {
                case "discount":
                    var discountReq = System.Text.Json.JsonSerializer.Deserialize<DiscountRequest>(pending.DetailsJson!)
                        ?? throw new InvalidOperationException("Approval request has no stored discount payload.");
                    var discount = await discountCreation.CreateAsync(discountReq);
                    pending.EntityId = discount.Id;
                    break;

                case "order_cancellation":
                    var order = await db.Orders.Include(o => o.Items).Include(o => o.Payments)
                        .FirstOrDefaultAsync(o => o.Id == pending.EntityId);
                    if (order is null) return NotFound(new { message = "The order this request was for no longer exists." });
                    if (order.OrderStatus != "cancelled")
                        await orderVoidService.VoidAsync(order, pending.Reason);
                    break;

                case "item_deletion":
                    if (pending.EntityType == "Category")
                        await productDeletion.DeleteCategoryAsync(pending.EntityId!.Value, actorId);
                    else
                        await productDeletion.DeleteProductAsync(pending.EntityId!.Value, actorId, pending.BranchId);
                    break;
            }
        }

        pending.Status = req.Approved ? "approved" : "rejected";
        pending.ApprovedBy = actorId;
        pending.ApprovedAt = DateTime.UtcNow;
        if (!req.Approved) pending.RejectionReason = req.Reason;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: $"{(req.Approved ? "approve" : "reject")}_{pending.RequestType}",
            entityType: pending.EntityType,
            entityId: pending.EntityId,
            userId: actorId,
            branchId: pending.BranchId,
            severity: req.Approved ? "info" : "warning",
            notes: req.Reason,
            module: "Approvals");

        return Ok(pending);
    }
}

public record ApprovalDecisionRequest(bool Approved, string? Reason);

// Normalized shape for every row in the Approval Center, regardless of which underlying table it
// came from. sourceType tells the frontend which endpoint to call for approve/reject.
public record ApprovalRowDto(
    Guid Id,
    string SourceType,
    string RequestType,
    string EntityLabel,
    Guid? BranchId,
    string? BranchName,
    Guid? RequestedBy,
    string? RequestedByName,
    DateTime RequestedAt,
    string Status,
    Guid? ApprovedBy,
    string? ApprovedByName,
    DateTime? ActionAt,
    string? Reason,
    string? RejectionReason);
