using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Data;

// IDataProtectionKeyContext: stores the Data Protection key ring (which encrypts the ZATCA
// private key/CSID secrets) in this same database instead of a file on disk. A file-based key
// ring lives inside the deploy directory, which most deploy processes recreate on every release —
// silently destroying it and permanently bricking every already-onboarded branch's ZATCA
// credentials. The database survives redeploys by construction, so this removes that failure
// mode entirely rather than just relocating it to "wherever someone remembered to mount a volume."
public class BaqalaDbContext(DbContextOptions<BaqalaDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; }

    // Core
    public DbSet<Branch> Branches { get; set; }
    public DbSet<Role> Roles { get; set; }
    public DbSet<RolePermission> RolePermissions { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<UserPermission> UserPermissions { get; set; }

    // Customers & Loyalty
    public DbSet<Customer> Customers { get; set; }
    public DbSet<LoyaltyTransaction> LoyaltyTransactions { get; set; }
    public DbSet<LoyaltyProgram> LoyaltyPrograms { get; set; }

    // Products
    public DbSet<Category> Categories { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<ProductPriceList> ProductPriceLists { get; set; }
    public DbSet<ProductImage> ProductImages { get; set; }

    // Inventory
    public DbSet<InventoryStock> InventoryStocks { get; set; }
    public DbSet<InventoryBatch> InventoryBatches { get; set; }
    public DbSet<InventoryAdjustment> InventoryAdjustments { get; set; }
    public DbSet<ProductRecall> ProductRecalls { get; set; }
    public DbSet<StockCount> StockCounts { get; set; }
    public DbSet<StockCountItem> StockCountItems { get; set; }
    public DbSet<StockMovement> StockMovements { get; set; }

    // Orders
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<OrderPayment> OrderPayments { get; set; }
    public DbSet<OrderDiscount> OrderDiscounts { get; set; }
    public DbSet<OrderServiceCharge> OrderServiceCharges { get; set; }
    public DbSet<OrderDeliveryDetail> OrderDeliveryDetails { get; set; }
    public DbSet<DeliveryFeeRule> DeliveryFeeRules { get; set; }
    public DbSet<CustomerReturn> CustomerReturns { get; set; }
    public DbSet<CustomerReturnItem> CustomerReturnItems { get; set; }

    // POS Operations
    public DbSet<Terminal> Terminals { get; set; }
    public DbSet<Device> Devices { get; set; }
    public DbSet<MaintenanceTicket> MaintenanceTickets { get; set; }
    public DbSet<CashierShift> CashierShifts { get; set; }
    public DbSet<ShiftCashMovement> ShiftCashMovements { get; set; }
    public DbSet<PosSettings> PosSettings { get; set; }

    // Suppliers & Warehouses
    public DbSet<Supplier> Suppliers { get; set; }
    public DbSet<SupplierDocument> SupplierDocuments { get; set; }
    public DbSet<WarehouseRequest> WarehouseRequests { get; set; }
    public DbSet<WarehouseRequestItem> WarehouseRequestItems { get; set; }
    public DbSet<Warehouse> Warehouses { get; set; }
    public DbSet<BranchWarehouse> BranchWarehouses { get; set; }
    public DbSet<WarehouseStock> WarehouseStocks { get; set; }
    public DbSet<PurchaseOrder> PurchaseOrders { get; set; }
    public DbSet<PurchaseOrderItem> PurchaseOrderItems { get; set; }
    public DbSet<SupplierPayment> SupplierPayments { get; set; }
    public DbSet<StockTransfer> StockTransfers { get; set; }
    public DbSet<StockTransferItem> StockTransferItems { get; set; }
    public DbSet<ProductVariant> ProductVariants { get; set; }
    public DbSet<ProductSubstitute> ProductSubstitutes { get; set; }
    public DbSet<StockDiscrepancy> StockDiscrepancies { get; set; }
    public DbSet<SupplierCreditNote> SupplierCreditNotes { get; set; }

    // Finance
    public DbSet<ExpenseType> ExpenseTypes { get; set; }
    public DbSet<Expense> Expenses { get; set; }
    public DbSet<Coupon> Coupons { get; set; }
    public DbSet<CustomerCoupon> CustomerCoupons { get; set; }
    public DbSet<TaxFeeRule> TaxFeeRules { get; set; }

    // Promotions
    public DbSet<Discount> Discounts { get; set; }
    public DbSet<Offer> Offers { get; set; }

    // Compliance (ZATCA)
    public DbSet<ZatcaInvoice> ZatcaInvoices { get; set; }
    public DbSet<ZatcaSettings> ZatcaSettings { get; set; }
    public DbSet<ZatcaIdentity> ZatcaIdentities { get; set; }
    public DbSet<CompanyProfile> CompanyProfiles { get; set; }

    // Rules & Config
    public DbSet<RulesEngine> RulesEngine { get; set; }
    public DbSet<StaffAttendance> StaffAttendances { get; set; }

    // HRM / Employee Management
    public DbSet<Employee> Employees { get; set; }
    public DbSet<Department> Departments { get; set; }
    public DbSet<Designation> Designations { get; set; }
    public DbSet<Holiday> Holidays { get; set; }
    public DbSet<WorkShift> WorkShifts { get; set; }
    public DbSet<EmployeeShiftAssignment> EmployeeShiftAssignments { get; set; }
    public DbSet<LeaveType> LeaveTypes { get; set; }
    public DbSet<LeavePolicy> LeavePolicies { get; set; }
    public DbSet<LeaveRequest> LeaveRequests { get; set; }
    public DbSet<EmployeeDocument> EmployeeDocuments { get; set; }
    public DbSet<EmployeeContract> EmployeeContracts { get; set; }
    public DbSet<SalaryComponent> SalaryComponents { get; set; }
    public DbSet<PayrollRun> PayrollRuns { get; set; }
    public DbSet<PayrollRunEmployee> PayrollRunEmployees { get; set; }

    // Audit
    public DbSet<AuditLog> AuditLogs { get; set; }

    // Approval Center — generic maker-checker queue for discounts/cancellations/deletions
    public DbSet<ApprovalRequest> ApprovalRequests { get; set; }

    // Notifications
    public DbSet<Notification> Notifications { get; set; }

    // Generic key-value settings per branch
    public DbSet<TenantSetting> TenantSettings { get; set; }

    // Admin → Payments: per-branch payment provider connection state
    public DbSet<PaymentIntegration> PaymentIntegrations { get; set; }

    // Online-order card payments (MyFatoorah invoices) from creation through order/refund — see OnlinePayment
    public DbSet<OnlinePayment> OnlinePayments { get; set; }

    // POS-checkout card payments on the NamiPay terminal, from initiation through the sale they
    // settle — see PosCardPayment
    public DbSet<PosCardPayment> PosCardPayments { get; set; }

    // Tenant Admin Dashboard integration — plan config pushed in for this deployed instance
    public DbSet<TenantPlan> TenantPlans { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ─── Unique Constraints ───────────────────────────────────────────────
        modelBuilder.Entity<Branch>().HasIndex(b => b.BranchCode).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
        modelBuilder.Entity<Customer>().HasIndex(c => c.CustomerCode).IsUnique();
        modelBuilder.Entity<Customer>().HasIndex(c => c.Phone).IsUnique();
        modelBuilder.Entity<Product>().HasIndex(p => p.Sku).IsUnique();
        // Barcode uniqueness is enforced per-active-product, not globally — a discontinued product's
        // barcode must be freely reusable (ProductsController's duplicate check already assumes this).
        // That's carried by the DB-only barcode_active generated column and its unique index
        // (see migration AddPartialUniqueBarcodeForActiveProducts); invisible to EF, so no property here.
        modelBuilder.Entity<Product>().HasIndex(p => p.Barcode);
        modelBuilder.Entity<Supplier>().HasIndex(s => s.SupplierCode).IsUnique();
        modelBuilder.Entity<Terminal>().HasIndex(t => t.TerminalCode).IsUnique();
        modelBuilder.Entity<Coupon>().HasIndex(c => c.Code).IsUnique();
        modelBuilder.Entity<WarehouseRequest>().HasIndex(w => w.RequestNumber).IsUnique();
        modelBuilder.Entity<Order>().HasIndex(o => o.OrderNumber).IsUnique();
        modelBuilder.Entity<Order>().HasIndex(o => o.ClientRequestId).IsUnique();

        modelBuilder.Entity<InventoryStock>()
            .HasIndex(i => new { i.ProductId, i.BranchId }).IsUnique();

        modelBuilder.Entity<Warehouse>().HasIndex(w => w.Code).IsUnique();
        modelBuilder.Entity<WarehouseStock>()
            .HasIndex(ws => new { ws.WarehouseId, ws.ProductId }).IsUnique();
        modelBuilder.Entity<StockTransfer>().HasIndex(st => st.TransferNumber).IsUnique();
        modelBuilder.Entity<PurchaseOrder>().HasIndex(po => po.PoNumber).IsUnique();

        modelBuilder.Entity<ZatcaSettings>()
            .HasIndex(z => z.BranchId).IsUnique();

        // Singleton row: one shared ZATCA identity + invoice chain for the whole mart.
        modelBuilder.Entity<ZatcaIdentity>()
            .Property(z => z.LastInvoiceHash)
            .HasDefaultValue("NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==");
        modelBuilder.Entity<ZatcaIdentity>()
            .Property(z => z.OnboardingStatus)
            .HasDefaultValue("not_started");
        // Fixed (not DateTime.UtcNow) timestamps — a non-deterministic HasData seed value would
        // make EF detect a "pending model change" on every subsequent `migrations add`.
        modelBuilder.Entity<ZatcaIdentity>().HasData(new ZatcaIdentity
        {
            Id = ZatcaIdentity.SingletonId,
            CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });

        // Singleton row: one company-wide legal identity shown on every print/export.
        modelBuilder.Entity<CompanyProfile>().HasData(new CompanyProfile
        {
            Id = CompanyProfile.SingletonId,
            CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });

        // Singleton row: one tenant-plan config for this deployed instance, unprovisioned
        // (every Max* null → every limit check fails open) until the Tenant Dashboard calls
        // POST /api/tenant/provision. Fixed timestamps for the same reason as the seeds above —
        // DateTime.UtcNow here would make every `migrations add` detect a "pending model change".
        // FeaturesJson seeds as "" rather than "{}" — this app's custom no-transaction migration
        // runner (Program.cs) applies migrations via ExecuteSqlRawAsync(script), which treats the
        // whole script as a composite format string; a literal '{}' with no digit inside throws
        // "Expected an ASCII digit" (FormatException) the moment this InsertData statement runs.
        // TenantPlanService/TenantController treat a blank FeaturesJson the same as "{}".
        modelBuilder.Entity<TenantPlan>().HasData(new TenantPlan
        {
            Id = TenantPlan.SingletonId,
            EcrType = "mart",
            FeaturesJson = "",
            BillingStatus = "active",
            CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });

        modelBuilder.Entity<PosSettings>()
            .HasIndex(p => p.BranchId).IsUnique();

        modelBuilder.Entity<TenantSetting>()
            .HasIndex(t => new { t.BranchId, t.SettingKey }).IsUnique();

        modelBuilder.Entity<PaymentIntegration>()
            .HasIndex(p => new { p.BranchId, p.Provider }).IsUnique();

        modelBuilder.Entity<OnlinePayment>()
            .HasIndex(p => p.GatewayInvoiceId).IsUnique();
        modelBuilder.Entity<OnlinePayment>()
            .HasIndex(p => new { p.Status, p.CreatedAt });

        modelBuilder.Entity<PosCardPayment>()
            .HasIndex(p => p.OrderRef).IsUnique();
        modelBuilder.Entity<PosCardPayment>()
            .HasIndex(p => new { p.Status, p.CreatedAt });
        modelBuilder.Entity<PosCardPayment>()
            .HasIndex(p => p.OrderId);
        modelBuilder.Entity<PosCardPayment>()
            .HasIndex(p => p.GatewayTransactionId);

        modelBuilder.Entity<LoyaltyProgram>()
            .HasIndex(l => l.BranchId).IsUnique();

        modelBuilder.Entity<LoyaltyProgram>()
            .HasOne(l => l.Branch)
            .WithMany()
            .HasForeignKey(l => l.BranchId)
            .OnDelete(DeleteBehavior.SetNull);

        // Seeds the one guaranteed business-wide default program (BranchId == null) every branch
        // falls back to until it gets its own override. Fixed timestamps for the same reason as
        // ZatcaIdentity.HasData above — DateTime.UtcNow here would make every `migrations add`
        // detect a spurious pending model change.
        modelBuilder.Entity<LoyaltyProgram>().HasData(new LoyaltyProgram
        {
            Id = Guid.Parse("00000000-0000-0000-0000-000000000001"),
            BranchId = null,
            ProgramName = "Loyalty Rewards",
            CreatedAt = new DateTime(2026, 7, 21, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 7, 21, 0, 0, 0, DateTimeKind.Utc),
        });

        modelBuilder.Entity<Employee>().HasIndex(e => e.EmployeeCode).IsUnique();
        modelBuilder.Entity<Employee>().HasIndex(e => e.NationalId).IsUnique();
        modelBuilder.Entity<Department>().HasIndex(d => new { d.Name, d.BranchId }).IsUnique();

        // ─── Self-referential: Category ───────────────────────────────────────
        modelBuilder.Entity<Category>()
            .HasOne(c => c.Parent)
            .WithMany(c => c.Children)
            .HasForeignKey(c => c.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Self-referential: Product → LooseUnitProduct (pack breaking) ─────
        modelBuilder.Entity<Product>()
            .HasOne(p => p.LooseUnitProduct)
            .WithMany()
            .HasForeignKey(p => p.LooseUnitProductId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── ProductSubstitute: symmetric brand-substitution pairs ────────────
        // Cascade from the owning product (deleting a product should not leave dangling
        // "substitute with X" rows), restrict from the substitute side so a product still being
        // offered as someone's alternative can't vanish out from under that suggestion.
        modelBuilder.Entity<ProductSubstitute>()
            .HasOne(s => s.Product)
            .WithMany()
            .HasForeignKey(s => s.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductSubstitute>()
            .HasOne(s => s.SubstituteProduct)
            .WithMany()
            .HasForeignKey(s => s.SubstituteProductId)
            .OnDelete(DeleteBehavior.Restrict);

        // One row per ordered pair — the controller writes both directions, and this is what makes
        // re-linking an existing pair a no-op rather than a duplicate suggestion at the till.
        modelBuilder.Entity<ProductSubstitute>()
            .HasIndex(s => new { s.ProductId, s.SubstituteProductId })
            .IsUnique();

        // ─── User → Role/Branch (restrict on delete) ─────────────────────────
        modelBuilder.Entity<User>()
            .HasOne(u => u.Role)
            .WithMany(r => r.Users)
            .HasForeignKey(u => u.RoleId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<User>()
            .HasOne(u => u.Branch)
            .WithMany(b => b.Users)
            .HasForeignKey(u => u.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── CashierShift: two User FKs ──────────────────────────────────────
        modelBuilder.Entity<CashierShift>()
            .HasOne(s => s.Cashier)
            .WithMany(u => u.Shifts)
            .HasForeignKey(s => s.CashierId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ShiftCashMovement>()
            .HasOne(m => m.RecordedByUser)
            .WithMany()
            .HasForeignKey(m => m.RecordedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Order: multiple FKs ─────────────────────────────────────────────
        modelBuilder.Entity<Order>()
            .HasOne(o => o.Cashier)
            .WithMany()
            .HasForeignKey(o => o.CashierId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── OrderDeliveryDetail: 1:1 with Order via shared PK ───────────────
        modelBuilder.Entity<OrderDeliveryDetail>()
            .HasOne(d => d.Order)
            .WithOne(o => o.DeliveryDetail)
            .HasForeignKey<OrderDeliveryDetail>(d => d.OrderId)
            .OnDelete(DeleteBehavior.Cascade);

        // ─── DeliveryFeeRule: branch scope ───────────────────────────────────
        // Restrict, not Cascade: deleting a branch must not silently take the tenant's delivery
        // pricing with it. BranchId is nullable (null = tenant-wide), so the FK is optional.
        modelBuilder.Entity<DeliveryFeeRule>()
            .HasOne(r => r.Branch)
            .WithMany()
            .HasForeignKey(r => r.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        // IDeliveryFeeService always filters (branch, is_active) first, on every quote and every
        // placed order.
        modelBuilder.Entity<DeliveryFeeRule>()
            .HasIndex(r => new { r.BranchId, r.IsActive });

        // ─── StockMovement: created_by ────────────────────────────────────────
        // Without this, CreatedByUser has no Fluent config anywhere and EF never wires it to the
        // created_by column — every movement's "who did this" silently reads back null regardless
        // of what's actually stored, the same gap InventoryAdjustment.AdjustedByUser (just below)
        // already had to be configured explicitly to avoid.
        modelBuilder.Entity<StockMovement>()
            .HasOne(m => m.CreatedByUser)
            .WithMany()
            .HasForeignKey(m => m.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── InventoryAdjustment: adjusted_by / approved_by ──────────────────
        modelBuilder.Entity<InventoryAdjustment>()
            .HasOne(a => a.AdjustedByUser)
            .WithMany()
            .HasForeignKey(a => a.AdjustedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<InventoryAdjustment>()
            .HasOne(a => a.ApprovedByUser)
            .WithMany()
            .HasForeignKey(a => a.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── ApprovalRequest: requested_by / approved_by ─────────────────────
        modelBuilder.Entity<ApprovalRequest>()
            .HasOne(a => a.RequestedByUser)
            .WithMany()
            .HasForeignKey(a => a.RequestedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ApprovalRequest>()
            .HasOne(a => a.ApprovedByUser)
            .WithMany()
            .HasForeignKey(a => a.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── StockCount: four User FKs (started/completed/reviewed/approved) ─
        modelBuilder.Entity<StockCount>()
            .HasOne(c => c.StartedByUser)
            .WithMany()
            .HasForeignKey(c => c.StartedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockCount>()
            .HasOne(c => c.CompletedByUser)
            .WithMany()
            .HasForeignKey(c => c.CompletedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockCount>()
            .HasOne(c => c.ReviewedByUser)
            .WithMany()
            .HasForeignKey(c => c.ReviewedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockCount>()
            .HasOne(c => c.ApprovedByUser)
            .WithMany()
            .HasForeignKey(c => c.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── ProductRecall: two User FKs + optional batch/branch/supplier ────
        modelBuilder.Entity<ProductRecall>()
            .HasOne(r => r.InitiatedByUser)
            .WithMany()
            .HasForeignKey(r => r.InitiatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ProductRecall>()
            .HasOne(r => r.ClosedByUser)
            .WithMany()
            .HasForeignKey(r => r.ClosedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // Recall lookup is per-(product, status) on the POS hot path — see
        // OrdersController's sale guard, which runs this for every line of every order.
        modelBuilder.Entity<ProductRecall>()
            .HasIndex(r => new { r.ProductId, r.Status });

        // ─── ProductPriceList: resolution index ──────────────────────────────
        // IPriceResolutionService always filters (product, price_type, is_active) first.
        modelBuilder.Entity<ProductPriceList>()
            .HasIndex(p => new { p.ProductId, p.PriceType, p.IsActive });

        // ─── ProductImage: gallery cascades with its product; UploadedBy restricted ──
        modelBuilder.Entity<ProductImage>()
            .HasOne(i => i.Product)
            .WithMany()
            .HasForeignKey(i => i.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ProductImage>()
            .HasOne(i => i.UploadedByUser)
            .WithMany()
            .HasForeignKey(i => i.UploadedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── WarehouseRequest: two Branch FKs ────────────────────────────────
        modelBuilder.Entity<WarehouseRequest>()
            .HasOne(w => w.SourceBranch)
            .WithMany()
            .HasForeignKey(w => w.SourceBranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<WarehouseRequest>()
            .HasOne(w => w.DestinationBranch)
            .WithMany()
            .HasForeignKey(w => w.DestinationBranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<WarehouseRequest>()
            .HasOne(w => w.RequestedByUser)
            .WithMany()
            .HasForeignKey(w => w.RequestedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<WarehouseRequest>()
            .HasOne(w => w.ApprovedByUser)
            .WithMany()
            .HasForeignKey(w => w.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Coupon / TaxFeeRule: CreatedBy User FK ──────────────────────────
        modelBuilder.Entity<Coupon>()
            .HasOne(c => c.CreatedByUser)
            .WithMany()
            .HasForeignKey(c => c.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── CustomerCoupon: Coupon/Customer/AssignedBy FKs ──────────────────
        // Cascade on Coupon (assignments are meaningless once the coupon itself is gone) but
        // Restrict on Customer — a customer with real redeemable assignments shouldn't silently
        // vanish along with them if the customer record is ever deleted.
        modelBuilder.Entity<CustomerCoupon>()
            .HasOne(cc => cc.Coupon)
            .WithMany(c => c.CustomerCoupons)
            .HasForeignKey(cc => cc.CouponId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CustomerCoupon>()
            .HasOne(cc => cc.Customer)
            .WithMany()
            .HasForeignKey(cc => cc.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CustomerCoupon>()
            .HasOne(cc => cc.AssignedByUser)
            .WithMany()
            .HasForeignKey(cc => cc.AssignedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CustomerCoupon>()
            .HasIndex(cc => new { cc.CouponId, cc.CustomerId })
            .IsUnique();

        modelBuilder.Entity<TaxFeeRule>()
            .HasOne(t => t.CreatedByUser)
            .WithMany()
            .HasForeignKey(t => t.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // Restrict, not Cascade — a deleted Terminal/User shouldn't take a whole notification
        // history down with it; the row just loses that piece of context (nulled out separately,
        // not via cascade, since these two are informational, not ownership).
        modelBuilder.Entity<Notification>()
            .HasOne(n => n.Terminal)
            .WithMany()
            .HasForeignKey(n => n.TerminalId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Notification>()
            .HasOne(n => n.TriggeredByUser)
            .WithMany()
            .HasForeignKey(n => n.TriggeredByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Expense: two User FKs ────────────────────────────────────────────
        modelBuilder.Entity<Expense>()
            .HasOne(e => e.RecordedByUser)
            .WithMany()
            .HasForeignKey(e => e.RecordedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Expense>()
            .HasOne(e => e.ApprovedByUser)
            .WithMany()
            .HasForeignKey(e => e.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── CustomerReturn: two User FKs ─────────────────────────────────────
        modelBuilder.Entity<CustomerReturn>()
            .HasOne(r => r.ProcessedByUser)
            .WithMany()
            .HasForeignKey(r => r.ProcessedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CustomerReturn>()
            .HasOne(r => r.ApprovedByUser)
            .WithMany()
            .HasForeignKey(r => r.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── StaffAttendance: two User FKs ───────────────────────────────────
        modelBuilder.Entity<StaffAttendance>()
            .HasOne(a => a.User)
            .WithMany()
            .HasForeignKey(a => a.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StaffAttendance>()
            .HasOne(a => a.RecordedByUser)
            .WithMany()
            .HasForeignKey(a => a.RecordedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── PurchaseOrder: multiple User FKs ────────────────────────────────────
        modelBuilder.Entity<PurchaseOrder>()
            .HasOne(po => po.OrderedByUser)
            .WithMany()
            .HasForeignKey(po => po.OrderedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PurchaseOrder>()
            .HasOne(po => po.ApprovedByUser)
            .WithMany()
            .HasForeignKey(po => po.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PurchaseOrder>()
            .HasOne(po => po.CreatedByUser)
            .WithMany()
            .HasForeignKey(po => po.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PurchaseOrder>()
            .HasOne(po => po.ReceivedByUser)
            .WithMany()
            .HasForeignKey(po => po.ReceivedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── SupplierPayment: User FK ─────────────────────────────────────────
        modelBuilder.Entity<SupplierPayment>()
            .HasOne(sp => sp.RecordedByUser)
            .WithMany()
            .HasForeignKey(sp => sp.RecordedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── StockTransfer: multiple User FKs ────────────────────────────────
        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.CreatedByUser)
            .WithMany()
            .HasForeignKey(st => st.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.ApprovedByUser)
            .WithMany()
            .HasForeignKey(st => st.ApprovedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.ReceivedByUser)
            .WithMany()
            .HasForeignKey(st => st.ReceivedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── StockTransfer: multiple Branch FKs ──────────────────────────────
        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.SourceBranch)
            .WithMany()
            .HasForeignKey(st => st.SourceBranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.DestBranch)
            .WithMany()
            .HasForeignKey(st => st.DestBranchId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── StockTransfer: multiple Supplier FKs ────────────────────────────
        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.SourceSupplier)
            .WithMany()
            .HasForeignKey(st => st.SourceSupplierId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.DestSupplier)
            .WithMany()
            .HasForeignKey(st => st.DestSupplierId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Discount: optional Product/Branch FKs ───────────────────────────
        modelBuilder.Entity<Discount>()
            .HasOne(d => d.Product)
            .WithMany()
            .HasForeignKey(d => d.ProductId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Discount>()
            .HasOne(d => d.Branch)
            .WithMany()
            .HasForeignKey(d => d.BranchId)
            .OnDelete(DeleteBehavior.SetNull);

        // ─── Offer: two Product FKs (must be configured explicitly) ──────────
        modelBuilder.Entity<Offer>()
            .HasOne(o => o.TriggerProduct)
            .WithMany()
            .HasForeignKey(o => o.TriggerProductId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Offer>()
            .HasOne(o => o.GetProduct)
            .WithMany()
            .HasForeignKey(o => o.GetProductId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Offer>()
            .HasOne(o => o.Branch)
            .WithMany()
            .HasForeignKey(o => o.BranchId)
            .OnDelete(DeleteBehavior.SetNull);

        // ─── StockTransfer: multiple Warehouse FKs ───────────────────────────
        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.SourceWarehouse)
            .WithMany()
            .HasForeignKey(st => st.SourceWarehouseId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockTransfer>()
            .HasOne(st => st.DestWarehouse)
            .WithMany()
            .HasForeignKey(st => st.DestWarehouseId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Employee: Branch/Department/Designation/Role/User FKs ──────────
        modelBuilder.Entity<Employee>()
            .HasOne(e => e.Branch)
            .WithMany()
            .HasForeignKey(e => e.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Employee>()
            .HasOne(e => e.Department)
            .WithMany()
            .HasForeignKey(e => e.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Employee>()
            .HasOne(e => e.Designation)
            .WithMany()
            .HasForeignKey(e => e.DesignationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Employee>()
            .HasOne(e => e.Role)
            .WithMany()
            .HasForeignKey(e => e.RoleId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Employee>()
            .HasOne(e => e.User)
            .WithMany()
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Department: optional Branch + manager Employee FKs ─────────────
        modelBuilder.Entity<Department>()
            .HasOne(d => d.Branch)
            .WithMany()
            .HasForeignKey(d => d.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Department>()
            .HasOne(d => d.ManagerEmployee)
            .WithMany()
            .HasForeignKey(d => d.ManagerEmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Designation: required Department FK ─────────────────────────────
        modelBuilder.Entity<Designation>()
            .HasOne(d => d.Department)
            .WithMany()
            .HasForeignKey(d => d.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── Holiday: optional Branch FK ──────────────────────────────────────
        modelBuilder.Entity<Holiday>()
            .HasOne(h => h.Branch)
            .WithMany()
            .HasForeignKey(h => h.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── WorkShift: optional Branch/Department FKs ───────────────────────
        modelBuilder.Entity<WorkShift>()
            .HasOne(s => s.Branch)
            .WithMany()
            .HasForeignKey(s => s.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<WorkShift>()
            .HasOne(s => s.Department)
            .WithMany()
            .HasForeignKey(s => s.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── EmployeeShiftAssignment: Employee/WorkShift/AssignedBy FKs ──────
        modelBuilder.Entity<EmployeeShiftAssignment>()
            .HasOne(a => a.Employee)
            .WithMany()
            .HasForeignKey(a => a.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EmployeeShiftAssignment>()
            .HasOne(a => a.Shift)
            .WithMany(s => s.Assignments)
            .HasForeignKey(a => a.ShiftId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EmployeeShiftAssignment>()
            .HasOne(a => a.AssignedByUser)
            .WithMany()
            .HasForeignKey(a => a.AssignedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── StaffAttendance: optional Employee/WorkShift FKs (HRM additions) ─
        modelBuilder.Entity<StaffAttendance>()
            .HasOne(a => a.Employee)
            .WithMany()
            .HasForeignKey(a => a.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StaffAttendance>()
            .HasOne(a => a.Shift)
            .WithMany()
            .HasForeignKey(a => a.ShiftId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StaffAttendance>()
            .HasIndex(a => new { a.EmployeeId, a.Date }).IsUnique();

        // ─── Employee: optional LeavePolicy FK ────────────────────────────────
        modelBuilder.Entity<Employee>()
            .HasOne(e => e.LeavePolicy)
            .WithMany()
            .HasForeignKey(e => e.LeavePolicyId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── LeaveRequest: Employee/LeaveType/Approver FKs ───────────────────
        modelBuilder.Entity<LeaveRequest>()
            .HasOne(l => l.Employee)
            .WithMany()
            .HasForeignKey(l => l.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<LeaveRequest>()
            .HasOne(l => l.LeaveType)
            .WithMany()
            .HasForeignKey(l => l.LeaveTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<LeaveRequest>()
            .HasOne(l => l.Approver)
            .WithMany()
            .HasForeignKey(l => l.ApproverId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── SupplierDocument: Supplier/UploadedBy FKs ───────────────────────
        modelBuilder.Entity<SupplierDocument>()
            .HasOne(d => d.Supplier)
            .WithMany(s => s.Documents)
            .HasForeignKey(d => d.SupplierId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<SupplierDocument>()
            .HasOne(d => d.UploadedByUser)
            .WithMany()
            .HasForeignKey(d => d.UploadedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── EmployeeDocument: Employee/UploadedBy FKs ───────────────────────
        modelBuilder.Entity<EmployeeDocument>()
            .HasOne(d => d.Employee)
            .WithMany()
            .HasForeignKey(d => d.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EmployeeDocument>()
            .HasOne(d => d.UploadedByUser)
            .WithMany()
            .HasForeignKey(d => d.UploadedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── EmployeeContract: Employee/UploadedBy FKs ───────────────────────
        modelBuilder.Entity<EmployeeContract>()
            .HasOne(c => c.Employee)
            .WithMany()
            .HasForeignKey(c => c.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EmployeeContract>()
            .HasOne(c => c.UploadedByUser)
            .WithMany()
            .HasForeignKey(c => c.UploadedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── AuditLog: optional Employee FK (HRM Employee Activity Report) ──
        modelBuilder.Entity<AuditLog>()
            .HasOne(a => a.Employee)
            .WithMany()
            .HasForeignKey(a => a.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── SalaryComponent: Employee FK ─────────────────────────────────────
        modelBuilder.Entity<SalaryComponent>()
            .HasOne(s => s.Employee)
            .WithMany()
            .HasForeignKey(s => s.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── PayrollRun: Branch/ProcessedBy FKs ───────────────────────────────
        modelBuilder.Entity<PayrollRun>()
            .HasOne(p => p.Branch)
            .WithMany()
            .HasForeignKey(p => p.BranchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PayrollRun>()
            .HasOne(p => p.ProcessedByUser)
            .WithMany()
            .HasForeignKey(p => p.ProcessedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── PayrollRunEmployee: PayrollRun/Employee FKs ─────────────────────
        modelBuilder.Entity<PayrollRunEmployee>()
            .HasOne(p => p.PayrollRun)
            .WithMany()
            .HasForeignKey(p => p.PayrollRunId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<PayrollRunEmployee>()
            .HasOne(p => p.Employee)
            .WithMany()
            .HasForeignKey(p => p.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        // ─── DateOnly → DateTime converters (MySql.Data doesn't support DateOnly) ─
        var dateOnlyConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateOnly, DateTime>(
            v => v.ToDateTime(TimeOnly.MinValue),
            v => DateOnly.FromDateTime(v));
        var nullableDateOnlyConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateOnly?, DateTime?>(
            v => v.HasValue ? v.Value.ToDateTime(TimeOnly.MinValue) : (DateTime?)null,
            v => v.HasValue ? DateOnly.FromDateTime(v.Value) : (DateOnly?)null);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType == typeof(DateOnly))
                    property.SetValueConverter(dateOnlyConverter);
                else if (property.ClrType == typeof(DateOnly?))
                    property.SetValueConverter(nullableDateOnlyConverter);
            }
        }

        // ─── Decimal precision ────────────────────────────────────────────────
        foreach (var property in modelBuilder.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties())
            .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
        {
            property.SetColumnType("decimal(18,4)");
        }

        // ─── Seed: System Roles ───────────────────────────────────────────────
        var systemRoles = new[]
        {
            ("tenant_admin",     "Tenant Administrator",   "مدير المستأجر"),
            ("branch_manager",   "Branch Manager",         "مدير الفرع"),
            ("cashier",          "Cashier",                "أمين الصندوق"),
            ("storekeeper",      "Storekeeper",            "أمين المخزن"),
            ("supervisor",       "Supervisor",             "المشرف"),
            ("finance_user",     "Finance User",           "مستخدم المالية"),
            ("marketing_user",   "Marketing User",         "مستخدم التسويق"),
            ("picker",           "Picker",                 "المرتب"),
            ("self_checkout_kiosk", "Self-Checkout Kiosk",  "كشك الدفع الذاتي"),
        };

        foreach (var (name, displayName, displayNameAr) in systemRoles)
        {
            var id = GuidFromSeed(name);
            modelBuilder.Entity<Role>().HasData(new Role
            {
                Id = id,
                Name = displayName,
                NameAr = displayNameAr,
                Description = $"System role: {displayName}",
                IsSystem = true,
                CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });
        }
    }

    private static Guid GuidFromSeed(string seed)
    {
        var bytes = new byte[16];
        var src = System.Text.Encoding.UTF8.GetBytes(seed);
        Array.Copy(src, bytes, Math.Min(src.Length, 16));
        return new Guid(bytes);
    }
}
