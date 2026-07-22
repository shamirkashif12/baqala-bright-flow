using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("inventory_stock")]
public class InventoryStock
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; } = 0;

    [Column("reserved_quantity")]
    public decimal ReservedQuantity { get; set; } = 0;

    [Column("reorder_level")]
    public int ReorderLevel { get; set; } = 0;

    [Column("last_updated")]
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
}

[Table("inventory_batches")]
public class InventoryBatch
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(100), Column("batch_number")]
    public string? BatchNumber { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // Destination: exactly one of Branch or Warehouse, same nullable-pair convention as
    // PurchaseOrder/StockTransfer — enforced in application code, not a DB constraint (MariaDB's
    // CHECK support is version-gated, so this repo doesn't rely on it for this kind of invariant).
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("warehouse_id")]
    public Guid? WarehouseId { get; set; }

    [Column("supplier_id")]
    public Guid? SupplierId { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Column("remaining_quantity")]
    public decimal RemainingQuantity { get; set; }

    [Column("purchase_cost")]
    public decimal? PurchaseCost { get; set; }

    [Column("expiry_date")]
    public DateTime? ExpiryDate { get; set; }

    [Required, Column("received_date")]
    public DateTime ReceivedDate { get; set; }

    [MaxLength(255), Column("receiving_location")]
    public string? ReceivingLocation { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | near_expiry | expired | consumed

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
    public Warehouse? Warehouse { get; set; }
    public Supplier? Supplier { get; set; }
}

// A recall withdraws stock from sale — either a whole product or one specific batch/lot of it.
//
// Scope is deliberately (ProductId, BatchId?) rather than a free-form list: BatchId == null means
// "every batch of this product", which is the supplier-notice case, while a set BatchId means "only
// lot X", which is the far more common food-safety case and the reason InventoryBatch exists at all.
//
// An open recall is enforced at the point of sale (OrdersController blocks the line, alongside the
// existing expired-batch guard) rather than by zeroing stock, so the physical count stays honest
// while the item becomes unsellable. Quarantining the stock is a separate, explicit act
// (POST /recalls/{id}/quarantine) that writes ordinary "damage" adjustments through the existing
// adjustment pipeline — recalls never invent a second way to move stock.
[Table("product_recalls")]
public class ProductRecall
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // Human reference, e.g. RCL-20260717-a1b2. Generated server-side.
    [Required, MaxLength(50), Column("recall_number")]
    public string RecallNumber { get; set; } = default!;

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // null = all batches of the product.
    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    // null = tenant-wide. Set to confine a recall to one branch's stock.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("supplier_id")]
    public Guid? SupplierId { get; set; }

    [Required, MaxLength(500), Column("reason")]
    public string Reason { get; set; } = default!;

    // supplier_notice | quality_issue | contamination | mislabeling | regulatory | other
    [Required, MaxLength(30), Column("recall_type")]
    public string RecallType { get; set; } = "other";

    // low | medium | high | critical — drives notification severity, not behaviour.
    [Required, MaxLength(20), Column("severity")]
    public string Severity { get; set; } = "high";

    // open (blocking sales) | closed (resolved, no longer blocks)
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "open";

    // Units pulled from sale via the quarantine action. Cumulative across quarantine calls.
    [Column("quantity_quarantined")]
    public decimal QuantityQuarantined { get; set; } = 0;

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("initiated_by")]
    public Guid? InitiatedBy { get; set; }

    [Column("closed_by")]
    public Guid? ClosedBy { get; set; }

    [MaxLength(500), Column("resolution")]
    public string? Resolution { get; set; }

    [Column("closed_at")]
    public DateTime? ClosedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public InventoryBatch? Batch { get; set; }
    public Branch? Branch { get; set; }
    public Supplier? Supplier { get; set; }
    public User? InitiatedByUser { get; set; }
    public User? ClosedByUser { get; set; }
}

[Table("inventory_adjustments")]
public class InventoryAdjustment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // Destination: exactly one of Branch or Warehouse — same nullable-pair convention as
    // InventoryBatch, needed so an auto-expiry write-off for a warehouse-held batch (which has
    // no branch) can still get an audit row here.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("warehouse_id")]
    public Guid? WarehouseId { get; set; }

    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    // addition | subtraction | waste | damage | theft | other | return_to_supplier | transfer_in | transfer_out | expired
    // Wastage write-off types (FRD §2.3): waste (spoilage) | damage | expired | theft | other — all routed for approval.
    [Required, MaxLength(30), Column("adjustment_type")]
    public string AdjustmentType { get; set; } = default!;

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Required, MaxLength(500), Column("reason")]
    public string Reason { get; set; } = default!;

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("adjusted_by")]
    public Guid? AdjustedBy { get; set; }

    // Distinct from AdjustedBy (who raised it). The FRD's Wastage Report requires both the
    // employee who created and the employee who approved a write-off, and there is nowhere else
    // to record the approver — StockTransfer/PurchaseOrder each have their own approved_by, but
    // an adjustment had none.
    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    // null = not subject to review. Deliberately the default, and NOT backfilled onto existing
    // rows: marking historic write-offs "pending" would invent a review queue nobody agreed to,
    // and marking them "approved" would fabricate sign-offs that never happened. Only waste/damage
    // raised through /adjustments after this shipped enter the flow as "pending".
    // pending | approved | rejected
    [MaxLength(20), Column("approval_status")]
    public string? ApprovalStatus { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [MaxLength(500), Column("rejection_reason")]
    public string? RejectionReason { get; set; }

    // Whether this adjustment's stock movement has actually been applied to on-hand. true for
    // every immediate adjustment and every row that predates approval-gating (the default). false
    // only for a wastage write-off still "pending" review under FRD §2.3 — its stock is NOT
    // deducted until an approver signs off. Approval then APPLIES the deduction and flips this to
    // true; rejection of a not-yet-applied row is a no-op, while a legacy pending row (deducted
    // immediately, StockApplied already true) still reverses on rejection.
    [Column("stock_applied")]
    public bool StockApplied { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
    public Warehouse? Warehouse { get; set; }
    public InventoryBatch? Batch { get; set; }
    public User? AdjustedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
}

// Stock Filters — "Stocking review": a physical count session that snapshots system quantity per
// product at start, records what was actually counted (e.g. via barcode scan), and on final
// approval posts InventoryAdjustment rows for any variance — reusing the existing adjustment
// pipeline rather than writing a second one.
[Table("stock_counts")]
public class StockCount
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // Destination: exactly one of Branch or Warehouse — same nullable-pair convention as
    // InventoryAdjustment/InventoryBatch, so a warehouse stock-take can be recorded and reported
    // the same way a branch one is.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("warehouse_id")]
    public Guid? WarehouseId { get; set; }

    // Optional scope — count just one category instead of the whole branch/warehouse.
    [Column("category_id")]
    public Guid? CategoryId { get; set; }

    // What this count session is FOR. The FRD asks for three separate filters — "Stock Review",
    // "Stock Audit" and "Inventory Reconciliation" — which all describe the same start → count →
    // complete session; the only thing that distinguishes them is intent, which nothing recorded.
    // This column is that intent, so the three filters select genuinely different rows instead of
    // being three names for one unfiltered list.
    //   review         — routine shelf check by branch staff
    //   audit          — independent/compliance count, typically by an auditor or head office
    //   reconciliation — correcting a known discrepancy
    // Nullable: sessions predating this column have no recorded intent, and guessing one would
    // misfile real history. They surface under "Unspecified".
    [MaxLength(20), Column("count_type")]
    public string? CountType { get; set; }

    // draft (open, still counting) | pending_review | pending_approval | approved | rejected | cancelled
    // A completed count no longer applies its variance immediately — it must clear a reviewer and
    // then an approver first (maker-checker, same shape as InventoryAdjustment's wastage gate).
    // "approved" is the only status at which StockApplied can be true.
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "draft";

    // Who performed the physical count (submitted it for review). Distinct from StartedBy, which
    // is whoever opened the session — the same person in most shops, but not necessarily.
    [Column("started_by")]
    public Guid? StartedBy { get; set; }

    [Column("completed_by")]
    public Guid? CompletedBy { get; set; }

    [Column("reviewed_by")]
    public Guid? ReviewedBy { get; set; }

    [Column("reviewed_at")]
    public DateTime? ReviewedAt { get; set; }

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    // Set on rejection at either the review or the approval stage.
    [MaxLength(500), Column("rejection_reason")]
    public string? RejectionReason { get; set; }

    // Whether the counted variance has actually been written to on-hand stock. false from
    // "pending_review" through "pending_approval" — nothing moves until Approve. true only once
    // Status reaches "approved". Mirrors InventoryAdjustment.StockApplied.
    [Column("stock_applied")]
    public bool StockApplied { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("started_at")]
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    [Column("completed_at")]
    public DateTime? CompletedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public Warehouse? Warehouse { get; set; }
    public Category? Category { get; set; }
    public User? StartedByUser { get; set; }
    public User? CompletedByUser { get; set; }
    public User? ReviewedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
    public ICollection<StockCountItem> Items { get; set; } = [];
}

[Table("stock_count_items")]
public class StockCountItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("stock_count_id")]
    public Guid StockCountId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // Snapshotted when the count session started (or when this line was first added, for a
    // product scanned that wasn't pre-loaded into the session).
    [Column("system_quantity")]
    public decimal SystemQuantity { get; set; }

    [Column("counted_quantity")]
    public decimal? CountedQuantity { get; set; }

    // CountedQuantity - SystemQuantity, set once counted. Null while still pending.
    [Column("variance")]
    public decimal? Variance { get; set; }

    [Column("counted_at")]
    public DateTime? CountedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public StockCount? StockCount { get; set; }
    public Product? Product { get; set; }
}

// Authoritative, append-only record of every event that changes stock anywhere in the system —
// the single source of truth the Stock Movement Timeline reads from. Previously that timeline
// was reconstructed client-side by guessing from five unrelated tables (batches, two differently
// -typed adjustment queries, and transfers filtered by type strings that didn't match what the
// rest of the app actually writes), so whole categories of movement (sales, expiry write-offs,
// most transfer types, the transfer_out/transfer_in split introduced by the two-phase transfer
// flow) were silently missing or mislabeled. Every stock-mutating code path now appends one row
// here in the same unit of work as the mutation itself.
[Table("stock_movements")]
public class StockMovement
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // Exactly one of Branch/Warehouse — the location this movement happened at.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("warehouse_id")]
    public Guid? WarehouseId { get; set; }

    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    // purchase_receive | manual_receive | sale | transfer_out | transfer_in | transfer_restore |
    // addition | reduction | waste | damage | return_to_supplier | expired
    [Required, MaxLength(30), Column("movement_type")]
    public string MovementType { get; set; } = default!;

    // Signed: positive = stock increased at this location, negative = decreased. Lets the
    // timeline and any future "net movement" rollup sum directly without a type lookup.
    [Column("quantity")]
    public decimal Quantity { get; set; }

    // On-hand at this location immediately before/after the mutation this row records. The FRD's
    // Inventory Transaction Audit Trail requires both, and neither is derivable after the fact:
    // summing Quantity forward only works if the ledger has every movement since the location's
    // stock row was created, which is untrue for any row predating the ledger. Nullable because
    // historic rows genuinely have no answer — a null renders as "—", not as a misleading 0.
    [Column("quantity_before")]
    public decimal? QuantityBefore { get; set; }

    [Column("quantity_after")]
    public decimal? QuantityAfter { get; set; }

    // "PurchaseOrder" | "Order" | "StockTransfer" | "InventoryAdjustment" | "InventoryBatch"
    [MaxLength(30), Column("reference_type")]
    public string? ReferenceType { get; set; }

    [Column("reference_id")]
    public Guid? ReferenceId { get; set; }

    // Denormalized human-readable number (PO-.../ORD-.../TRF-...) so the timeline doesn't need a
    // join per reference type just to show what triggered the movement.
    [MaxLength(50), Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_by")]
    public Guid? CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
    public Warehouse? Warehouse { get; set; }
    public InventoryBatch? Batch { get; set; }
    public User? CreatedByUser { get; set; }
}
