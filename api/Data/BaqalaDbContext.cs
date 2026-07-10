using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Data;

public class BaqalaDbContext(DbContextOptions<BaqalaDbContext> options) : DbContext(options)
{
    // Core
    public DbSet<Branch> Branches { get; set; }
    public DbSet<Role> Roles { get; set; }
    public DbSet<RolePermission> RolePermissions { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<UserPermission> UserPermissions { get; set; }

    // Customers & Loyalty
    public DbSet<Customer> Customers { get; set; }
    public DbSet<LoyaltyTransaction> LoyaltyTransactions { get; set; }

    // Products
    public DbSet<Category> Categories { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<ProductPriceList> ProductPriceLists { get; set; }

    // Inventory
    public DbSet<InventoryStock> InventoryStocks { get; set; }
    public DbSet<InventoryBatch> InventoryBatches { get; set; }
    public DbSet<InventoryAdjustment> InventoryAdjustments { get; set; }
    public DbSet<StockCount> StockCounts { get; set; }
    public DbSet<StockCountItem> StockCountItems { get; set; }

    // Orders
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<OrderPayment> OrderPayments { get; set; }
    public DbSet<CustomerReturn> CustomerReturns { get; set; }
    public DbSet<CustomerReturnItem> CustomerReturnItems { get; set; }

    // POS Operations
    public DbSet<Terminal> Terminals { get; set; }
    public DbSet<Device> Devices { get; set; }
    public DbSet<CashierShift> CashierShifts { get; set; }
    public DbSet<ShiftCashMovement> ShiftCashMovements { get; set; }
    public DbSet<PosSettings> PosSettings { get; set; }

    // Suppliers & Warehouses
    public DbSet<Supplier> Suppliers { get; set; }
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
    public DbSet<StockDiscrepancy> StockDiscrepancies { get; set; }
    public DbSet<SupplierCreditNote> SupplierCreditNotes { get; set; }

    // Finance
    public DbSet<ExpenseType> ExpenseTypes { get; set; }
    public DbSet<Expense> Expenses { get; set; }
    public DbSet<Coupon> Coupons { get; set; }
    public DbSet<TaxFeeRule> TaxFeeRules { get; set; }

    // Promotions
    public DbSet<Discount> Discounts { get; set; }
    public DbSet<Offer> Offers { get; set; }

    // Compliance (ZATCA)
    public DbSet<ZatcaInvoice> ZatcaInvoices { get; set; }
    public DbSet<ZatcaSettings> ZatcaSettings { get; set; }
    public DbSet<ZatcaIdentity> ZatcaIdentities { get; set; }

    // Rules & Config
    public DbSet<RulesEngine> RulesEngine { get; set; }
    public DbSet<StaffAttendance> StaffAttendances { get; set; }

    // Audit
    public DbSet<AuditLog> AuditLogs { get; set; }

    // Notifications
    public DbSet<Notification> Notifications { get; set; }

    // Generic key-value settings per branch
    public DbSet<TenantSetting> TenantSettings { get; set; }

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
        modelBuilder.Entity<Product>().HasIndex(p => p.Barcode).IsUnique();
        modelBuilder.Entity<Supplier>().HasIndex(s => s.SupplierCode).IsUnique();
        modelBuilder.Entity<Terminal>().HasIndex(t => t.TerminalCode).IsUnique();
        modelBuilder.Entity<Coupon>().HasIndex(c => c.Code).IsUnique();
        modelBuilder.Entity<WarehouseRequest>().HasIndex(w => w.RequestNumber).IsUnique();
        modelBuilder.Entity<Order>().HasIndex(o => o.OrderNumber).IsUnique();

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

        modelBuilder.Entity<PosSettings>()
            .HasIndex(p => p.BranchId).IsUnique();

        modelBuilder.Entity<TenantSetting>()
            .HasIndex(t => new { t.BranchId, t.SettingKey }).IsUnique();

        // ─── Self-referential: Category ───────────────────────────────────────
        modelBuilder.Entity<Category>()
            .HasOne(c => c.Parent)
            .WithMany(c => c.Children)
            .HasForeignKey(c => c.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

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

        // ─── InventoryAdjustment: adjusted_by ────────────────────────────────
        modelBuilder.Entity<InventoryAdjustment>()
            .HasOne(a => a.AdjustedByUser)
            .WithMany()
            .HasForeignKey(a => a.AdjustedBy)
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

        modelBuilder.Entity<TaxFeeRule>()
            .HasOne(t => t.CreatedByUser)
            .WithMany()
            .HasForeignKey(t => t.CreatedBy)
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
