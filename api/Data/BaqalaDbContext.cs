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

    // Finance
    public DbSet<ExpenseType> ExpenseTypes { get; set; }
    public DbSet<Expense> Expenses { get; set; }
    public DbSet<Coupon> Coupons { get; set; }
    public DbSet<TaxFeeRule> TaxFeeRules { get; set; }

    // Compliance (ZATCA)
    public DbSet<ZatcaInvoice> ZatcaInvoices { get; set; }
    public DbSet<ZatcaSettings> ZatcaSettings { get; set; }

    // Rules & Config
    public DbSet<RulesEngine> RulesEngine { get; set; }
    public DbSet<StaffAttendance> StaffAttendances { get; set; }

    // Audit
    public DbSet<AuditLog> AuditLogs { get; set; }

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

        modelBuilder.Entity<ZatcaSettings>()
            .HasIndex(z => z.BranchId).IsUnique();

        modelBuilder.Entity<PosSettings>()
            .HasIndex(p => p.BranchId).IsUnique();

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
