using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Data;

public static class DataSeeder
{
    public static async Task SeedAsync(BaqalaDbContext db)
    {
        // Full initial seed — runs only on a fresh database
        if (!await db.Branches.AnyAsync())
        {

        // ─── Roles (fetch what EF migration already seeded) ──────────────────
        var roleTenantAdmin  = await db.Roles.FirstAsync(r => r.Name == "Tenant Administrator");
        var roleBranchMgr    = await db.Roles.FirstAsync(r => r.Name == "Branch Manager");
        var roleCashier      = await db.Roles.FirstAsync(r => r.Name == "Cashier");
        var roleStorekeeper  = await db.Roles.FirstAsync(r => r.Name == "Storekeeper");

        // ─── Branches ────────────────────────────────────────────────────────
        var brOlaya   = Branch("BR-001", "Olaya — Riyadh HQ",    "أولى — الرياض", "King Fahd Rd, Olaya, Riyadh",    "Riyadh",  "+966501001010", "active");
        var brKhobar  = Branch("BR-002", "Al Khobar Corniche",   "الخبر كورنيش",  "Corniche Rd, Al Khobar 31952",   "Al Khobar","+966552002020", "active");
        var brJeddah  = Branch("BR-003", "Jeddah Tahlia",        "جدة التحلية",   "Tahlia St, Jeddah 23434",         "Jeddah",  "+966563003030", "active");
        var brMadinah = Branch("BR-004", "Madinah Quba",         "المدينة قباء",  "Quba Rd, Al Madinah",             "Madinah", "+966504004040", "active");
        db.Branches.AddRange(brOlaya, brKhobar, brJeddah, brMadinah);

        // ─── Users ───────────────────────────────────────────────────────────
        var uAbdullah = User("owner@mimoney.sa",  "abdullah.alfaisal", "Abdullah Al Faisal", "عبدالله الفيصل", roleTenantAdmin.Id, brOlaya.Id,   "active");
        var uSara     = User("sara@mimoney.sa",   "sara.alqahtani",    "Sara Al Qahtani",    "سارة القحطاني",  roleBranchMgr.Id,   brJeddah.Id,  "active");
        var uKhalid   = User("khalid@mimoney.sa", "khalid.alotaibi",   "Khalid Al Otaibi",   "خالد العتيبي",   roleCashier.Id,     brOlaya.Id,   "active");
        var uNora     = User("nora@mimoney.sa",   "nora.alharbi",      "Nora Al Harbi",      "نورة الحربي",    roleCashier.Id,     brKhobar.Id,  "active");
        var uYousef   = User("yousef@mimoney.sa", "yousef.alahmadi",   "Yousef Al Ahmadi",   "يوسف الأحمدي",   roleStorekeeper.Id, null,         "active");
        var uLayla    = User("layla@mimoney.sa",  "layla.alsaud",      "Layla Al Saud",      "ليلى آل سعود",   roleBranchMgr.Id,   brMadinah.Id, "inactive");
        db.Users.AddRange(uAbdullah, uSara, uKhalid, uNora, uYousef, uLayla);

        // ─── Categories ──────────────────────────────────────────────────────
        var catDairy     = Cat("Dairy",     "ألبان");
        var catBeverages = Cat("Beverages", "مشروبات");
        var catMeat      = Cat("Meat",      "لحوم");
        var catPantry    = Cat("Pantry",    "بقالة");
        var catHousehold = Cat("Household", "منزلية");
        var catBakery    = Cat("Bakery",    "مخبوزات");
        var catSnacks    = Cat("Snacks",    "وجبات خفيفة");
        db.Categories.AddRange(catDairy, catBeverages, catMeat, catPantry, catHousehold, catBakery, catSnacks);

        // ─── Suppliers ───────────────────────────────────────────────────────
        // Deliberately uneven profile completeness — demonstrates that new required fields
        // (CR/VAT/address/category) only gate NEW registrations; these legacy-style seed rows
        // stay valid (and editable) even where they're missing some or all of the new fields.
        var supAlmarai  = Supplier("SUP-001", "Almarai Company",       "Mohammed Al Otaibi", "+966501234567", "warehouse",
            legalName: "Almarai Company for Food Industries", crNumber: "1010012345", vatNumber: "300000012345678003",
            address: "King Fahd Road, Riyadh 12345", email: "supply@almarai.com", category: "Food & Beverage",
            paymentTerms: "Net 30", creditLimit: 50000m,
            bankName: "Al Rajhi Bank", bankAccountHolder: "Almarai Company", bankAccountNumber: "1234567890123", bankIban: "SA0380000000608010167519",
            notes: "Primary dairy supplier — priority replenishment.");
        var supNadec    = Supplier("SUP-002", "Nadec Foods",           "Khalid Al Shehri",   "+966552345678", "warehouse",
            legalName: "National Agricultural Development Company", crNumber: "1010023456", vatNumber: "300000023456678003",
            address: "Al Malaz District, Riyadh", email: "orders@nadec.com", category: "Food & Beverage",
            paymentTerms: "Net 30", creditLimit: 40000m);
        var supAlRabie  = Supplier("SUP-003", "Al Rabie Saudi Foods",  "Sara Al Qahtani",    "+966563456789", "warehouse",
            legalName: "Al Rabie Saudi Foods Company", crNumber: "1010034567", vatNumber: "300000034567678003",
            address: "Jeddah Industrial City", category: "Food & Beverage", paymentTerms: "Net 15", creditLimit: 25000m);
        var supSadia    = Supplier("SUP-004", "Sadia Saudi Arabia",    "Faisal Al Harbi",    "+966534567890", "mart_to_mart",
            category: "Food & Beverage");
        var supAlOthman = Supplier("SUP-005", "Al Othman Agriculture", "Yousef Al Dossari",  "+966505678901", "both");
        db.Suppliers.AddRange(supAlmarai, supNadec, supAlRabie, supSadia, supAlOthman);

        // ─── Products ────────────────────────────────────────────────────────
        var products = new[]
        {
            Prod("ALM-LB-1L",  "6281007012340", "Almarai Laban 1L",      "المراعي لبن ١ لتر",    catDairy.Id,     6.50m,  4.20m, 15, 20),
            Prod("NDC-MK-2L",  "6281007012341", "Nadec Milk 2L",          "نادك حليب ٢ لتر",      catDairy.Id,    12.00m,  8.10m, 15, 30),
            Prod("ARB-MG-1L",  "6281007012342", "Al Rabie Mango 1L",      "الربيع مانجو ١ لتر",   catBeverages.Id, 7.75m,  5.00m, 15, 20),
            Prod("LPT-TB-100", "6281007012343", "Lipton Tea 100 Bags",    "ليبتون شاي ١٠٠ كيس",  catBeverages.Id,18.50m, 12.30m, 15, 15),
            Prod("PEP-CN-330", "6281007012344", "Pepsi 330ml Can",        "بيبسي علبة ٣٣٠ مل",   catBeverages.Id, 2.50m,  1.40m, 15, 50),
            Prod("SDA-CK-1KG", "6281007012345", "Sadia Chicken 1kg",      "سادية دجاج ١ كجم",     catMeat.Id,     28.00m, 19.50m, 15, 10),
            Prod("AOS-SG-1KG", "6281007012346", "Sugar 1kg Al Osra",      "العصرة سكر ١ كجم",     catPantry.Id,    5.00m,  3.20m,  0, 25),
            Prod("TID-DT-3KG", "6281007012347", "Tide Detergent 3kg",     "تايد منظف ٣ كجم",      catHousehold.Id,42.00m, 28.00m,  0, 10),
            Prod("LSN-CR-1",   "6281007012348", "L'usine Croissant",      "لوزين كرواسون",         catBakery.Id,    4.00m,  2.50m,  0, 30),
            Prod("ALM-YG-170", "6281007012349", "Almarai Yogurt 170g",    "المراعي زبادي ١٧٠ج",   catDairy.Id,     3.00m,  1.80m, 15, 20),
            Prod("KKT-CH-50",  "6281007012350", "KitKat Chunky",          "كيت كات شانكي",         catSnacks.Id,    4.50m,  3.00m,  0, 30),
            Prod("LYS-CL-75",  "6281007012351", "Lay's Classic 75g",      "ليز كلاسيك ٧٥ج",       catSnacks.Id,    3.50m,  2.10m,  0, 20),
        };
        db.Products.AddRange(products);

        // ─── Terminals ───────────────────────────────────────────────────────
        var tOlaya1  = Terminal("POS-01",   "POS Terminal 1",  brOlaya.Id,   uKhalid.Id, "active");
        var tOlaya2  = Terminal("POS-02",   "POS Terminal 2",  brOlaya.Id,   uNora.Id,   "active");
        var tKhobar  = Terminal("POS-03",   "POS Terminal 1",  brKhobar.Id,  null,       "syncing");
        var tJeddah  = Terminal("POS-04",   "POS Terminal 1",  brJeddah.Id,  null,       "offline");
        var tMadinah = Terminal("POS-05",   "POS Terminal 1",  brMadinah.Id, uYousef.Id, "active");
        var tKiosk   = Terminal("KIOSK-01", "Self-service Kiosk", brOlaya.Id, null,      "active");
        db.Terminals.AddRange(tOlaya1, tOlaya2, tKhobar, tJeddah, tMadinah, tKiosk);

        // Save everything so FKs resolve before orders/inventory
        await db.SaveChangesAsync();

        // ─── Inventory stock & batches ────────────────────────────────────────
        var productList = await db.Products.ToListAsync();
        var batchDate = DateTime.UtcNow.AddDays(-30);

        var stockData = new[]
        {
            (sku:"ALM-LB-1L",  branchId:brOlaya.Id,   qty:240m,  supplierId:supAlmarai.Id,  expiry:"2026-09-12"),
            (sku:"NDC-MK-2L",  branchId:brOlaya.Id,   qty:18m,   supplierId:supNadec.Id,    expiry:"2026-06-18"),
            (sku:"ARB-MG-1L",  branchId:brKhobar.Id,  qty:0m,    supplierId:supAlRabie.Id,  expiry:"2026-07-22"),
            (sku:"LPT-TB-100", branchId:brJeddah.Id,  qty:92m,   supplierId:supAlmarai.Id,  expiry:"2027-01-30"),
            (sku:"PEP-CN-330", branchId:brOlaya.Id,   qty:412m,  supplierId:supNadec.Id,    expiry:"2026-12-01"),
            (sku:"SDA-CK-1KG", branchId:brMadinah.Id, qty:14m,   supplierId:supSadia.Id,    expiry:"2026-06-08"),
            (sku:"AOS-SG-1KG", branchId:brKhobar.Id,  qty:8m,    supplierId:supAlOthman.Id, expiry:"2028-01-01"),
            (sku:"TID-DT-3KG", branchId:brOlaya.Id,   qty:56m,   supplierId:supAlmarai.Id,  expiry:"2028-05-15"),
            (sku:"LSN-CR-1",   branchId:brJeddah.Id,  qty:64m,   supplierId:supAlRabie.Id,  expiry:"2026-06-05"),
            (sku:"ALM-YG-170", branchId:brOlaya.Id,   qty:36m,   supplierId:supAlmarai.Id,  expiry:"2026-06-04"),
            (sku:"KKT-CH-50",  branchId:brOlaya.Id,   qty:920m,  supplierId:supNadec.Id,    expiry:"2027-03-12"),
            (sku:"LYS-CL-75",  branchId:brJeddah.Id,  qty:6m,    supplierId:supSadia.Id,    expiry:"2026-05-25"),
        };

        foreach (var s in stockData)
        {
            var prod = productList.First(p => p.Sku == s.sku);
            var expiryDate = DateTime.Parse(s.expiry);
            var today = DateTime.UtcNow;
            var batchStatus = expiryDate < today ? "expired"
                            : expiryDate < today.AddDays(30) ? "near_expiry"
                            : "active";

            var batch = new InventoryBatch
            {
                Id = Guid.NewGuid(), BatchNumber = $"BCH-{prod.Sku}-001",
                ProductId = prod.Id, BranchId = s.branchId, SupplierId = s.supplierId,
                Quantity = s.qty, RemainingQuantity = s.qty,
                PurchaseCost = prod.CostPrice, ExpiryDate = expiryDate,
                ReceivedDate = batchDate, Status = batchStatus,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            };
            db.InventoryBatches.Add(batch);

            db.InventoryStocks.Add(new InventoryStock
            {
                Id = Guid.NewGuid(), ProductId = prod.Id, BranchId = s.branchId,
                Quantity = s.qty, ReorderLevel = prod.ReorderLevel,
                LastUpdated = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            });
        }

        // ─── Cashier Shifts ───────────────────────────────────────────────────
        var shiftFahad = new CashierShift
        {
            Id = Guid.NewGuid(), CashierId = uKhalid.Id, BranchId = brOlaya.Id, TerminalId = tOlaya1.Id,
            OpeningAmount = 500, CashSales = 4820, CardSales = 2840, DigitalSales = 760,
            TotalSales = 8420, Status = "open", OpenedAt = DateTime.UtcNow.Date.AddHours(7).AddMinutes(55)
        };
        var shiftMohammed = new CashierShift
        {
            Id = Guid.NewGuid(), CashierId = uNora.Id, BranchId = brOlaya.Id, TerminalId = tOlaya2.Id,
            OpeningAmount = 500, CashSales = 3210, CardSales = 1980, DigitalSales = 540,
            TotalSales = 5730, Status = "open", OpenedAt = DateTime.UtcNow.Date.AddHours(8).AddMinutes(10)
        };
        var shiftClosed = new CashierShift
        {
            Id = Guid.NewGuid(), CashierId = uKhalid.Id, BranchId = brKhobar.Id, TerminalId = tKhobar.Id,
            OpeningAmount = 500, CashSales = 2810, CardSales = 1420, DigitalSales = 360,
            TotalSales = 4590, ClosingAmount = 4830, Variance = 240, Status = "closed",
            OpenedAt = DateTime.UtcNow.Date.AddHours(7), ClosedAt = DateTime.UtcNow.Date.AddHours(15)
        };
        db.CashierShifts.AddRange(shiftFahad, shiftMohammed, shiftClosed);

        // ─── Orders ───────────────────────────────────────────────────────────
        var almLaban  = productList.First(p => p.Sku == "ALM-LB-1L");
        var pepsi     = productList.First(p => p.Sku == "PEP-CN-330");
        var lipton    = productList.First(p => p.Sku == "LPT-TB-100");
        var kitkat    = productList.First(p => p.Sku == "KKT-CH-50");

        var orders = new[]
        {
            MakeOrder("ORD-10241", brOlaya.Id,   uKhalid.Id, tOlaya1.Id, shiftFahad.Id,   "pending",   "pending",    "cash",
                [(almLaban.Id, 3m, 6.50m), (pepsi.Id, 10m, 2.50m)]),
            MakeOrder("ORD-10240", brOlaya.Id,   uKhalid.Id, tOlaya1.Id, shiftFahad.Id,   "processing","paid",       "card",
                [(lipton.Id, 2m, 18.50m), (kitkat.Id, 5m, 4.50m)]),
            MakeOrder("ORD-10239", brKhobar.Id,  uNora.Id,   tKhobar.Id, shiftClosed.Id,  "ready_to_deliver","paid", "wallet",
                [(pepsi.Id, 6m, 2.50m), (almLaban.Id, 2m, 6.50m)]),
            MakeOrder("ORD-10238", brKhobar.Id,  uNora.Id,   tKhobar.Id, shiftClosed.Id,  "delivered", "paid",       "card",
                [(lipton.Id, 4m, 18.50m), (kitkat.Id, 8m, 4.50m)]),
            MakeOrder("ORD-10237", brJeddah.Id,  uSara.Id,   null,       null,            "cancelled", "refunded",   "cash",
                [(almLaban.Id, 4m, 6.50m)]),
            MakeOrder("ORD-10236", brOlaya.Id,   uAbdullah.Id, tOlaya1.Id, shiftFahad.Id, "delivered", "paid",       "wallet",
                [(kitkat.Id, 10m, 4.50m), (lipton.Id, 3m, 18.50m), (pepsi.Id, 20m, 2.50m)]),
        };
        db.Orders.AddRange(orders);

        // ─── Expense types ────────────────────────────────────────────────────
        db.ExpenseTypes.AddRange(
            new ExpenseType { Id = Guid.NewGuid(), Name = "Utilities",     NameAr = "المرافق",     IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new ExpenseType { Id = Guid.NewGuid(), Name = "Maintenance",   NameAr = "الصيانة",     IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new ExpenseType { Id = Guid.NewGuid(), Name = "Staff Meals",   NameAr = "وجبات الموظفين", IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new ExpenseType { Id = Guid.NewGuid(), Name = "Marketing",     NameAr = "التسويق",     IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new ExpenseType { Id = Guid.NewGuid(), Name = "Stationery",    NameAr = "قرطاسية",     IsActive = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );

        // ─── POS Settings per branch ──────────────────────────────────────────
        foreach (var br in new[] { brOlaya, brKhobar, brJeddah, brMadinah })
        {
            db.PosSettings.Add(new PosSettings
            {
                Id = Guid.NewGuid(), BranchId = br.Id, RequireShiftOpen = true,
                RequireOpeningCashCount = true, AllowNegativeStock = false,
                RequireReasonForVoid = true, RequireManagerApprovalForRefund = true,
                AutoPrintReceipt = true, OfflineModeEnabled = false,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            });
        }

        // ─── Compliance Rules (RulesEngine) ───────────────────────────────────
        db.RulesEngine.AddRange(
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Auto-block expired items", RuleType = "custom_fee", AppliesTo = "all", RuleConfig = "{\"blockSale\": true, \"reason\": \"expired\"}", Priority = 100, IsActive = true, CreatedBy = uAbdullah.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Warn 7 days before expiry", RuleType = "custom_fee", AppliesTo = "all", RuleConfig = "{\"warnDays\": 7}", Priority = 90, IsActive = true, CreatedBy = uAbdullah.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Require manager approval for refund > 100 SAR", RuleType = "approval", AppliesTo = "all", RuleConfig = "{\"threshold\": 100, \"requireManagerPin\": true}", Priority = 80, IsActive = true, CreatedBy = uAbdullah.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Max return period 7 days", RuleType = "return", AppliesTo = "all", RuleConfig = "{\"maxDays\": 7}", Priority = 70, IsActive = true, CreatedBy = uAbdullah.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Loyalty points on paid orders", RuleType = "discount", AppliesTo = "all", RuleConfig = "{\"pointsPerSar\": 1}", Priority = 60, IsActive = true, CreatedBy = uAbdullah.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );

        // ─── Audit Logs (initial seed events) ────────────────────────────────
        db.AuditLogs.AddRange(
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "System initialized and seeded", EntityType = "System", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "Branches created: Olaya, Khobar, Jeddah, Madinah", EntityType = "Branch", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "Staff users created and roles assigned", EntityType = "User", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uKhalid.Id, Action = "Cashier shift opened at Olaya branch", EntityType = "CashierShift", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "Inventory stock seeded: 12 SKUs across 4 branches", EntityType = "Inventory", CreatedAt = DateTime.UtcNow }
        );

            await db.SaveChangesAsync();
        } // end fresh-database seed

        // Per-entity guards — run even on already-seeded DBs to backfill missing data
        if (!await db.Warehouses.AnyAsync())
            await SeedWarehousesAsync(db);

        if (!await db.WarehouseRequests.AnyAsync())
            await SeedWarehouseRequestsAsync(db);

        if (!await db.Expenses.AnyAsync())
            await SeedExpensesAsync(db);

        if (!await db.Coupons.AnyAsync())
            await SeedCouponsAsync(db);

        if (!await db.Devices.AnyAsync())
            await SeedDevicesAsync(db);

        if (!await db.Customers.AnyAsync())
            await SeedCustomersAsync(db);

        if (!await db.CustomerReturns.AnyAsync())
            await SeedCustomerReturnsAsync(db);

        if (!await db.TaxFeeRules.AnyAsync())
            await SeedTaxRulesAsync(db);

        if (!await db.RolePermissions.AnyAsync())
            await SeedRolePermissionsAsync(db);

        if (!await db.RulesEngine.AnyAsync())
            await SeedRulesEngineAsync(db);

        if (!await db.AuditLogs.AnyAsync())
            await SeedAuditLogsAsync(db);

        if (!await db.Discounts.AnyAsync())
            await SeedDiscountsAsync(db);

        if (!await db.Offers.AnyAsync())
            await SeedOffersAsync(db);

        if (!await db.PurchaseOrders.AnyAsync())
            await SeedPurchaseOrdersAsync(db);

        if (!await db.StockTransfers.AnyAsync())
            await SeedStockTransfersAsync(db);

        await SeedTestUsersAsync(db);
    }

    // ─── Backfill: Purchase Orders (GRN) ────────────────────────────────────────
    private static async Task SeedPurchaseOrdersAsync(BaqalaDbContext db)
    {
        var brOlaya  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var wh       = await db.Warehouses.FirstOrDefaultAsync();
        var sup1     = await db.Suppliers.FirstOrDefaultAsync(s => s.SupplierCode == "SUP-001");
        var sup2     = await db.Suppliers.FirstOrDefaultAsync(s => s.SupplierCode == "SUP-002");
        var user     = await db.Users.FirstOrDefaultAsync();
        var products = await db.Products.Take(4).ToListAsync();

        if (brOlaya is null || sup1 is null || user is null || products.Count < 2) return;

        var po1 = new PurchaseOrder
        {
            Id = Guid.NewGuid(), PoNumber = "PO-2026-001",
            SupplierId = sup1.Id, WarehouseId = wh?.Id, BranchId = brOlaya.Id,
            OrderedBy = user.Id, CreatedBy = user.Id, Status = "pending", PaymentStatus = "unpaid",
            PaymentTerms = "net_30", TotalAmount = 4800m, TaxAmount = 720m,
            ExpectedDeliveryDate = DateTime.UtcNow.AddDays(3),
            CreatedAt = DateTime.UtcNow.AddDays(-5), UpdatedAt = DateTime.UtcNow,
        };
        po1.Items = [
            new PurchaseOrderItem { Id = Guid.NewGuid(), PoId = po1.Id, ProductId = products[0].Id, OrderedQuantity = 200, UnitCost = 12m, Subtotal = 2400m },
            new PurchaseOrderItem { Id = Guid.NewGuid(), PoId = po1.Id, ProductId = products[1].Id, OrderedQuantity = 200, UnitCost = 12m, Subtotal = 2400m },
        ];

        var po2 = new PurchaseOrder
        {
            Id = Guid.NewGuid(), PoNumber = "PO-2026-002",
            SupplierId = sup2?.Id ?? sup1.Id, BranchId = brKhobar?.Id ?? brOlaya.Id,
            OrderedBy = user.Id, CreatedBy = user.Id, Status = "partial_received", PaymentStatus = "partial",
            PaymentTerms = "on_delivery", TotalAmount = 2100m, TaxAmount = 315m, PaidAmount = 1050m,
            ExpectedDeliveryDate = DateTime.UtcNow.AddDays(-2),
            ReceivedDate = DateTime.UtcNow.AddDays(-1),
            CreatedAt = DateTime.UtcNow.AddDays(-10), UpdatedAt = DateTime.UtcNow,
        };
        po2.Items = [
            new PurchaseOrderItem { Id = Guid.NewGuid(), PoId = po2.Id, ProductId = products[2 % products.Count].Id, OrderedQuantity = 150, ReceivedQuantity = 75, UnitCost = 7m, Subtotal = 1050m },
            new PurchaseOrderItem { Id = Guid.NewGuid(), PoId = po2.Id, ProductId = products[3 % products.Count].Id, OrderedQuantity = 150, ReceivedQuantity = 0, UnitCost = 7m, Subtotal = 1050m },
        ];

        var po3 = new PurchaseOrder
        {
            Id = Guid.NewGuid(), PoNumber = "PO-2026-003",
            SupplierId = sup1.Id, BranchId = brOlaya.Id,
            OrderedBy = user.Id, CreatedBy = user.Id, Status = "fully_received", PaymentStatus = "paid",
            PaymentTerms = "net_30", TotalAmount = 1380m, TaxAmount = 207m, PaidAmount = 1380m,
            ExpectedDeliveryDate = DateTime.UtcNow.AddDays(-7),
            ReceivedDate = DateTime.UtcNow.AddDays(-6),
            CreatedAt = DateTime.UtcNow.AddDays(-15), UpdatedAt = DateTime.UtcNow,
        };
        po3.Items = [
            new PurchaseOrderItem { Id = Guid.NewGuid(), PoId = po3.Id, ProductId = products[0].Id, OrderedQuantity = 100, ReceivedQuantity = 100, UnitCost = 4.20m, Subtotal = 420m },
            new PurchaseOrderItem { Id = Guid.NewGuid(), PoId = po3.Id, ProductId = products[1].Id, OrderedQuantity = 120, ReceivedQuantity = 120, UnitCost = 8m, Subtotal = 960m },
        ];

        db.PurchaseOrders.AddRange(po1, po2, po3);
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Stock Transfers (Store Delivery + Supplier Return) ────────────
    private static async Task SeedStockTransfersAsync(BaqalaDbContext db)
    {
        var brOlaya  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var wh       = await db.Warehouses.FirstOrDefaultAsync();
        var sup      = await db.Suppliers.FirstOrDefaultAsync(s => s.SupplierCode == "SUP-001");
        var user     = await db.Users.FirstOrDefaultAsync();
        var products = await db.Products.Take(4).ToListAsync();

        if (brOlaya is null || user is null || products.Count < 2) return;

        // Store Delivery: warehouse → Olaya branch
        var del1 = new StockTransfer
        {
            Id = Guid.NewGuid(), TransferNumber = "TRF-DL-001",
            TransferType = "warehouse_to_branch",
            SourceWarehouseId = wh?.Id, DestBranchId = brOlaya.Id,
            CreatedBy = user.Id, Status = "completed",
            ExpectedDate = DateTime.UtcNow.AddDays(-3),
            CompletedDate = DateTime.UtcNow.AddDays(-2),
            CreatedAt = DateTime.UtcNow.AddDays(-4), UpdatedAt = DateTime.UtcNow,
        };
        del1.Items = [
            new StockTransferItem { Id = Guid.NewGuid(), TransferId = del1.Id, ProductId = products[0].Id, RequestedQuantity = 100, ReceivedQuantity = 100 },
            new StockTransferItem { Id = Guid.NewGuid(), TransferId = del1.Id, ProductId = products[1].Id, RequestedQuantity = 50, ReceivedQuantity = 50 },
        ];

        // Store Delivery: warehouse → Khobar branch (pending)
        var del2 = new StockTransfer
        {
            Id = Guid.NewGuid(), TransferNumber = "TRF-DL-002",
            TransferType = "warehouse_to_branch",
            SourceWarehouseId = wh?.Id, DestBranchId = brKhobar?.Id ?? brOlaya.Id,
            CreatedBy = user.Id, Status = "pending",
            ExpectedDate = DateTime.UtcNow.AddDays(2),
            CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow,
        };
        del2.Items = [
            new StockTransferItem { Id = Guid.NewGuid(), TransferId = del2.Id, ProductId = products[2 % products.Count].Id, RequestedQuantity = 80 },
        ];

        // Supplier Return
        var ret1 = new StockTransfer
        {
            Id = Guid.NewGuid(), TransferNumber = "TRF-RT-001",
            TransferType = "warehouse_to_supplier",
            SourceBranchId = brOlaya.Id, DestSupplierId = sup?.Id,
            CreatedBy = user.Id, Status = "completed", ReturnReason = "expired",
            CompletedDate = DateTime.UtcNow.AddDays(-5),
            CreatedAt = DateTime.UtcNow.AddDays(-6), UpdatedAt = DateTime.UtcNow,
        };
        ret1.Items = [
            new StockTransferItem { Id = Guid.NewGuid(), TransferId = ret1.Id, ProductId = products[0].Id, RequestedQuantity = 12, ReturnReason = "expired" },
        ];

        db.StockTransfers.AddRange(del1, del2, ret1);
        await db.SaveChangesAsync();
    }

    // Al Khobar (Eastern Province) must not be linked to the Riyadh warehouse —
    // that's the seed data behind a Khobar product silently showing a Riyadh
    // warehouse. Creates a dedicated Eastern Province warehouse on already-seeded
    // databases and re-links Al Khobar to it.
    public static async Task PatchWarehouseRegionsAsync(BaqalaDbContext db)
    {
        var whRiyadh = await db.Warehouses.FirstOrDefaultAsync(w => w.Code == "WH-RYD-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        if (whRiyadh is null || brKhobar is null) return;

        var mislink = await db.BranchWarehouses
            .FirstOrDefaultAsync(bw => bw.BranchId == brKhobar.Id && bw.WarehouseId == whRiyadh.Id);
        if (mislink is null) return; // already fixed, or never seeded

        var whEastern = await db.Warehouses.FirstOrDefaultAsync(w => w.Code == "WH-DMM-001");
        if (whEastern is null)
        {
            whEastern = new Warehouse
            {
                Id = Guid.NewGuid(), Code = "WH-DMM-001", Name = "Eastern Province Warehouse",
                NameAr = "مستودع المنطقة الشرقية",
                Address = "2nd Industrial City, Dammam", City = "Dammam",
                Capacity = 2500, ContactPerson = "Faisal Al Otaibi",
                ContactNumber = "+966552002020", Status = "active",
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            };
            db.Warehouses.Add(whEastern);
        }

        mislink.WarehouseId = whEastern.Id;
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Warehouses ────────────────────────────────────────────────
    private static async Task SeedWarehousesAsync(BaqalaDbContext db)
    {
        var brOlaya   = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var brJeddah  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-003");
        var brMadinah = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-004");

        if (brOlaya is null) return;

        // Central Riyadh Warehouse
        var whRiyadh = new Warehouse
        {
            Id = Guid.NewGuid(), Code = "WH-RYD-001", Name = "Central Riyadh Warehouse",
            NameAr = "مستودع الرياض المركزي",
            Address = "Industrial Area, 2nd Ring Rd, Riyadh", City = "Riyadh",
            Capacity = 5000, ContactPerson = "Yousef Al Ahmadi",
            ContactNumber = "+966504004040", Status = "active",
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        };

        // Jeddah Distribution Center
        var whJeddah = new Warehouse
        {
            Id = Guid.NewGuid(), Code = "WH-JED-001", Name = "Jeddah Distribution Center",
            NameAr = "مركز توزيع جدة",
            Address = "Jeddah Industrial City, Jeddah", City = "Jeddah",
            Capacity = 3000, ContactPerson = "Sara Al Qahtani",
            ContactNumber = "+966563003030", Status = "active",
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        };

        // Eastern Province Warehouse — serves Al Khobar; a Khobar product must
        // not be defaulted into the Riyadh warehouse's region.
        var whEastern = new Warehouse
        {
            Id = Guid.NewGuid(), Code = "WH-DMM-001", Name = "Eastern Province Warehouse",
            NameAr = "مستودع المنطقة الشرقية",
            Address = "2nd Industrial City, Dammam", City = "Dammam",
            Capacity = 2500, ContactPerson = "Faisal Al Otaibi",
            ContactNumber = "+966552002020", Status = "active",
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        };

        db.Warehouses.AddRange(whRiyadh, whJeddah, whEastern);
        await db.SaveChangesAsync();

        // Link branches to warehouses — each branch to its own region
        var links = new List<BranchWarehouse>();
        if (brOlaya is not null)   links.Add(new BranchWarehouse { Id = Guid.NewGuid(), BranchId = brOlaya.Id,   WarehouseId = whRiyadh.Id, CreatedAt = DateTime.UtcNow });
        if (brKhobar is not null)  links.Add(new BranchWarehouse { Id = Guid.NewGuid(), BranchId = brKhobar.Id,  WarehouseId = whEastern.Id, CreatedAt = DateTime.UtcNow });
        if (brMadinah is not null) links.Add(new BranchWarehouse { Id = Guid.NewGuid(), BranchId = brMadinah.Id, WarehouseId = whRiyadh.Id, CreatedAt = DateTime.UtcNow });
        if (brJeddah is not null)  links.Add(new BranchWarehouse { Id = Guid.NewGuid(), BranchId = brJeddah.Id,  WarehouseId = whJeddah.Id, CreatedAt = DateTime.UtcNow });
        db.BranchWarehouses.AddRange(links);

        // Warehouse stock
        var products = await db.Products.ToListAsync();
        var whStocks = new List<WarehouseStock>();
        foreach (var prod in products.Take(8))
        {
            whStocks.Add(new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = whRiyadh.Id, ProductId = prod.Id, Quantity = 500, ReorderLevel = 50, LastUpdated = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        }
        foreach (var prod in products.Skip(4).Take(6))
        {
            whStocks.Add(new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = whJeddah.Id, ProductId = prod.Id, Quantity = 300, ReorderLevel = 30, LastUpdated = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        }
        foreach (var prod in products.Skip(2).Take(5))
        {
            whStocks.Add(new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = whEastern.Id, ProductId = prod.Id, Quantity = 250, ReorderLevel = 25, LastUpdated = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        }
        db.WarehouseStocks.AddRange(whStocks);
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Warehouse Requests ────────────────────────────────────────
    private static async Task SeedWarehouseRequestsAsync(BaqalaDbContext db)
    {
        var brOlaya   = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var brJeddah  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-003");
        var brMadinah = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-004");
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        var uYousef   = await db.Users.FirstOrDefaultAsync(u => u.Username == "yousef.alahmadi");
        var supAlmarai = await db.Suppliers.FirstOrDefaultAsync(s => s.SupplierCode == "SUP-001");
        var supNadec   = await db.Suppliers.FirstOrDefaultAsync(s => s.SupplierCode == "SUP-002");

        if (brOlaya is null || brKhobar is null || uAbdullah is null || uYousef is null) return;

        var prodAlmLaban  = await db.Products.FirstOrDefaultAsync(p => p.Sku == "ALM-LB-1L");
        var prodNadecMilk = await db.Products.FirstOrDefaultAsync(p => p.Sku == "NDC-MK-2L");
        var prodPepsi     = await db.Products.FirstOrDefaultAsync(p => p.Sku == "PEP-CN-330");
        var prodLipton    = await db.Products.FirstOrDefaultAsync(p => p.Sku == "LPT-TB-100");
        var prodSugar     = await db.Products.FirstOrDefaultAsync(p => p.Sku == "AOS-SG-1KG");

        // WH-001: Olaya → Khobar dairy restock (approved, on the way)
        var req1 = new WarehouseRequest
        {
            Id = Guid.NewGuid(), RequestNumber = "WH-20260610-KHB001",
            SourceBranchId = brOlaya.Id, DestinationBranchId = brKhobar.Id,
            RequestedBy = uYousef.Id, ApprovedBy = uAbdullah.Id,
            ApprovalStatus = "approved", DeliveryStatus = "on_way",
            Notes = "Restocking dairy products for Al Khobar branch",
            CreatedAt = DateTime.UtcNow.AddDays(-4), UpdatedAt = DateTime.UtcNow.AddDays(-3)
        };
        if (prodAlmLaban is not null)
            req1.Items.Add(new WarehouseRequestItem
            {
                Id = Guid.NewGuid(), RequestId = req1.Id, ProductId = prodAlmLaban.Id,
                RequestedQuantity = 60, ApprovedQuantity = 60, AvailableStock = 240,
                CreatedAt = req1.CreatedAt
            });
        if (prodNadecMilk is not null)
            req1.Items.Add(new WarehouseRequestItem
            {
                Id = Guid.NewGuid(), RequestId = req1.Id, ProductId = prodNadecMilk.Id,
                RequestedQuantity = 24, ApprovedQuantity = 24, AvailableStock = 18,
                CreatedAt = req1.CreatedAt
            });
        db.WarehouseRequests.Add(req1);

        // WH-002: Jeddah direct supplier order (pending approval)
        if (brJeddah is not null && supAlmarai is not null)
        {
            var req2 = new WarehouseRequest
            {
                Id = Guid.NewGuid(), RequestNumber = "WH-20260613-JED001",
                SourceBranchId = null, DestinationBranchId = brJeddah.Id, SupplierId = supAlmarai.Id,
                RequestedBy = uAbdullah.Id,
                ApprovalStatus = "request_generated", DeliveryStatus = "pending",
                Notes = "Direct order: dairy and beverages replenishment",
                CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow.AddDays(-2)
            };
            if (prodPepsi is not null)
                req2.Items.Add(new WarehouseRequestItem
                {
                    Id = Guid.NewGuid(), RequestId = req2.Id, ProductId = prodPepsi.Id,
                    RequestedQuantity = 200, CreatedAt = req2.CreatedAt
                });
            if (prodLipton is not null)
                req2.Items.Add(new WarehouseRequestItem
                {
                    Id = Guid.NewGuid(), RequestId = req2.Id, ProductId = prodLipton.Id,
                    RequestedQuantity = 48, CreatedAt = req2.CreatedAt
                });
            db.WarehouseRequests.Add(req2);
        }

        // WH-003: Madinah ← Olaya pantry transfer (delivered)
        if (brMadinah is not null && supNadec is not null)
        {
            var req3 = new WarehouseRequest
            {
                Id = Guid.NewGuid(), RequestNumber = "WH-20260608-MAD001",
                SourceBranchId = brOlaya.Id, DestinationBranchId = brMadinah.Id,
                RequestedBy = uYousef.Id, ApprovedBy = uAbdullah.Id,
                ApprovalStatus = "approved", DeliveryStatus = "delivered",
                Notes = "Pantry and snacks restock — completed",
                CreatedAt = DateTime.UtcNow.AddDays(-7), UpdatedAt = DateTime.UtcNow.AddDays(-5)
            };
            if (prodSugar is not null)
                req3.Items.Add(new WarehouseRequestItem
                {
                    Id = Guid.NewGuid(), RequestId = req3.Id, ProductId = prodSugar.Id,
                    RequestedQuantity = 50, ApprovedQuantity = 50, AvailableStock = 8,
                    CreatedAt = req3.CreatedAt
                });
            db.WarehouseRequests.Add(req3);
        }

        await db.SaveChangesAsync();
    }

    // ─── Backfill: Expenses ──────────────────────────────────────────────────
    private static async Task SeedExpensesAsync(BaqalaDbContext db)
    {
        var brOlaya  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var brJeddah = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-003");
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        var uSara     = await db.Users.FirstOrDefaultAsync(u => u.Username == "sara.alqahtani");

        var typeUtils  = await db.ExpenseTypes.FirstOrDefaultAsync(e => e.Name == "Utilities");
        var typeMaint  = await db.ExpenseTypes.FirstOrDefaultAsync(e => e.Name == "Maintenance");
        var typeMeals  = await db.ExpenseTypes.FirstOrDefaultAsync(e => e.Name == "Staff Meals");
        var typeMkt    = await db.ExpenseTypes.FirstOrDefaultAsync(e => e.Name == "Marketing");

        if (brOlaya is null || uAbdullah is null) return;

        var expenses = new List<Expense>();

        if (typeUtils is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeUtils.Id, BranchId = brOlaya.Id,
                Amount = 1250.00m, PaidAmount = 1250.00m, PaymentMethod = "bank_transfer",
                Description = "Monthly electricity bill — Olaya branch",
                ReferenceNumber = "ELEC-JUN-001", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateTime.UtcNow.AddDays(-10),
                Status = "approved", ApprovedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-10), UpdatedAt = DateTime.UtcNow.AddDays(-8)
            });

        if (typeMaint is not null && brKhobar is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMaint.Id, BranchId = brKhobar.Id,
                Amount = 450.00m, PaidAmount = 450.00m, PaymentMethod = "card",
                Description = "Air conditioning maintenance service",
                ReferenceNumber = "MAINT-AC-002", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateTime.UtcNow.AddDays(-5),
                Status = "pending",
                CreatedAt = DateTime.UtcNow.AddDays(-5), UpdatedAt = DateTime.UtcNow.AddDays(-5)
            });

        if (typeMeals is not null && brJeddah is not null && uSara is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMeals.Id, BranchId = brJeddah.Id,
                Amount = 185.00m, PaidAmount = 185.00m, PaymentMethod = "cash",
                Description = "Staff lunch — peak shift team",
                RecordedBy = uSara.Id,
                ExpenseDate = DateTime.UtcNow.AddDays(-2),
                Status = "approved", ApprovedBy = uSara.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow.AddDays(-1)
            });

        if (typeMkt is not null && brOlaya is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMkt.Id, BranchId = brOlaya.Id,
                Amount = 3200.00m, PaidAmount = 3200.00m, PaymentMethod = "bank_transfer",
                Description = "Social media ads — Ramadan campaign",
                ReferenceNumber = "MKT-RAM-003", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateTime.UtcNow.AddDays(-14),
                Status = "approved", ApprovedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-14), UpdatedAt = DateTime.UtcNow.AddDays(-12)
            });

        // Additional recent expenses with varied methods
        var typeStat = await db.ExpenseTypes.FirstOrDefaultAsync(e => e.Name == "Stationery");
        if (typeStat is not null && brOlaya is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeStat.Id, BranchId = brOlaya.Id,
                Amount = 380.00m, PaidAmount = 180.00m, PaymentMethod = "card",
                Description = "Cleaning supplies — Olaya",
                ReferenceNumber = "CLEAN-MAY-001", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateTime.UtcNow.AddDays(-19),
                Status = "approved", ApprovedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-19), UpdatedAt = DateTime.UtcNow.AddDays(-18)
            });
        if (typeMaint is not null && brOlaya is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMaint.Id, BranchId = brOlaya.Id,
                Amount = 850.00m, PaidAmount = 850.00m, PaymentMethod = "bank_transfer",
                Description = "Printer maintenance contract",
                ReferenceNumber = "PRINT-MAY-002", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateTime.UtcNow.AddDays(-20),
                Status = "approved", ApprovedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-20), UpdatedAt = DateTime.UtcNow.AddDays(-19)
            });

        db.Expenses.AddRange(expenses);
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Coupons ───────────────────────────────────────────────────
    private static async Task SeedCouponsAsync(BaqalaDbContext db)
    {
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        if (uAbdullah is null) return;

        var today = DateTime.UtcNow;

        db.Coupons.AddRange(
            new Coupon
            {
                Id = Guid.NewGuid(), Code = "SUMMER25", Name = "Summer 25% Off", NameAr = "خصم الصيف ٢٥٪",
                Type = "percentage", Value = 25, MinOrderAmount = 50, MaxDiscountAmount = 100,
                UsageLimit = 500, UsedCount = 127, ApplicableTo = "all",
                StartDate = today.AddDays(-30), EndDate = today.AddDays(60),
                Status = "active", CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-30), UpdatedAt = DateTime.UtcNow
            },
            new Coupon
            {
                Id = Guid.NewGuid(), Code = "NEWCUST50", Name = "New Customer SAR 50 Off", NameAr = "خصم العميل الجديد ٥٠",
                Type = "fixed", Value = 50, MinOrderAmount = 200,
                UsageLimit = 100, UsedCount = 23, ApplicableTo = "all",
                StartDate = today.AddDays(-60), EndDate = today.AddDays(30),
                Status = "active", CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-60), UpdatedAt = DateTime.UtcNow
            },
            new Coupon
            {
                Id = Guid.NewGuid(), Code = "PEPSI2FOR1", Name = "Pepsi Buy 2 Get 1 Free", NameAr = "بيبسي ٢ بسعر ١",
                Type = "buy_one_get_one", Value = 0, ApplicableTo = "all",
                UsageLimit = null, UsedCount = 89,
                StartDate = today.AddDays(-90), EndDate = today.AddDays(-10),
                Status = "expired", CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-90), UpdatedAt = DateTime.UtcNow.AddDays(-10)
            }
        );
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Devices ──────────────────────────────────────────────────
    private static async Task SeedDevicesAsync(BaqalaDbContext db)
    {
        var brOlaya  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var brJeddah = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-003");

        if (brOlaya is null) return;

        var tOlaya1 = await db.Terminals.FirstOrDefaultAsync(t => t.TerminalCode == "POS-01");
        var tKhobar = await db.Terminals.FirstOrDefaultAsync(t => t.TerminalCode == "POS-03");
        var tJeddah = await db.Terminals.FirstOrDefaultAsync(t => t.TerminalCode == "POS-04");
        var tKiosk  = await db.Terminals.FirstOrDefaultAsync(t => t.TerminalCode == "KIOSK-01");

        db.Devices.AddRange(
            new Device { Id = Guid.NewGuid(), DeviceName = "Olaya POS Terminal 1", DeviceType = "pos_terminal", SerialNumber = "SN-POS-001", BranchId = brOlaya.Id, TerminalId = tOlaya1?.Id, Status = "active", SyncStatus = "synced", LastActivity = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Device { Id = Guid.NewGuid(), DeviceName = "Olaya Barcode Scanner 1", DeviceType = "barcode_scanner", SerialNumber = "SN-BC-001", BranchId = brOlaya.Id, TerminalId = tOlaya1?.Id, Status = "active", SyncStatus = "synced", LastActivity = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Device { Id = Guid.NewGuid(), DeviceName = "Olaya Receipt Printer", DeviceType = "printer", SerialNumber = "SN-PR-001", BranchId = brOlaya.Id, TerminalId = tOlaya1?.Id, Status = "active", SyncStatus = "synced", LastActivity = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Device { Id = Guid.NewGuid(), DeviceName = "Khobar POS Terminal", DeviceType = "pos_terminal", SerialNumber = "SN-POS-002", BranchId = brKhobar?.Id ?? brOlaya.Id, TerminalId = tKhobar?.Id, Status = "offline", SyncStatus = "pending", LastActivity = DateTime.UtcNow.AddHours(-2), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Device { Id = Guid.NewGuid(), DeviceName = "Jeddah POS Terminal", DeviceType = "pos_terminal", SerialNumber = "SN-POS-003", BranchId = brJeddah?.Id ?? brOlaya.Id, TerminalId = tJeddah?.Id, Status = "maintenance", SyncStatus = "failed", LastActivity = DateTime.UtcNow.AddDays(-1), CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Device { Id = Guid.NewGuid(), DeviceName = "Olaya Self-service Kiosk", DeviceType = "kiosk", SerialNumber = "SN-KIOSK-001", BranchId = brOlaya.Id, TerminalId = tKiosk?.Id, Status = "active", SyncStatus = "synced", LastActivity = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Customers ────────────────────────────────────────────────
    private static async Task SeedCustomersAsync(BaqalaDbContext db)
    {
        var brOlaya  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var brJeddah = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-003");

        db.Customers.AddRange(
            new Customer
            {
                Id = Guid.NewGuid(), CustomerCode = "CUST-001",
                FullName = "Ahmed Al Mansouri", Phone = "+966501234001",
                Email = "ahmed.mansouri@example.sa",
                LoyaltyBalance = 425, TotalSpend = 4250, VisitCount = 18,
                Tier = "gold", PreferredBranchId = brOlaya?.Id, Status = "active",
                CreatedAt = DateTime.UtcNow.AddDays(-120), UpdatedAt = DateTime.UtcNow
            },
            new Customer
            {
                Id = Guid.NewGuid(), CustomerCode = "CUST-002",
                FullName = "Fatima Al Rashidi", Phone = "+966502234002",
                Email = "fatima.rashidi@example.sa",
                LoyaltyBalance = 182, TotalSpend = 1820, VisitCount = 7,
                Tier = "silver", PreferredBranchId = brKhobar?.Id, Status = "active",
                CreatedAt = DateTime.UtcNow.AddDays(-60), UpdatedAt = DateTime.UtcNow
            },
            new Customer
            {
                Id = Guid.NewGuid(), CustomerCode = "CUST-003",
                FullName = "Mohammed Al Ghamdi", Phone = "+966553234003",
                LoyaltyBalance = 34, TotalSpend = 340, VisitCount = 3,
                Tier = "standard", PreferredBranchId = brJeddah?.Id, Status = "active",
                CreatedAt = DateTime.UtcNow.AddDays(-14), UpdatedAt = DateTime.UtcNow
            },
            new Customer
            {
                Id = Guid.NewGuid(), CustomerCode = "CUST-004",
                FullName = "Nora Al Zahrani", Phone = "+966554234004",
                Email = "nora.zahrani@example.sa",
                LoyaltyBalance = 880, TotalSpend = 8800, VisitCount = 42,
                Tier = "platinum", PreferredBranchId = brOlaya?.Id, Status = "active",
                CreatedAt = DateTime.UtcNow.AddDays(-365), UpdatedAt = DateTime.UtcNow
            }
        );
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Customer Returns ─────────────────────────────────────────
    private static async Task SeedCustomerReturnsAsync(BaqalaDbContext db)
    {
        var cust1    = await db.Customers.FirstOrDefaultAsync(c => c.CustomerCode == "CUST-001");
        var cust2    = await db.Customers.FirstOrDefaultAsync(c => c.CustomerCode == "CUST-002");
        var brOlaya  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        var uNora     = await db.Users.FirstOrDefaultAsync(u => u.Username == "nora.alharbi");

        var order1 = await db.Orders.FirstOrDefaultAsync(o => o.OrderNumber == "ORD-10238");
        var order2 = await db.Orders.FirstOrDefaultAsync(o => o.OrderNumber == "ORD-10236");

        var prodPepsi   = await db.Products.FirstOrDefaultAsync(p => p.Sku == "PEP-CN-330");
        var prodKitkat  = await db.Products.FirstOrDefaultAsync(p => p.Sku == "KKT-CH-50");
        var prodLipton  = await db.Products.FirstOrDefaultAsync(p => p.Sku == "LPT-TB-100");

        if (cust1 is null || brOlaya is null || uAbdullah is null) return;

        // Return 1: full return of pepsi from ORD-10238
        if (order1 is not null && cust2 is not null && brKhobar is not null && uNora is not null && prodPepsi is not null)
        {
            var ret1 = new CustomerReturn
            {
                Id = Guid.NewGuid(), ReturnNumber = "RET-20260610-001",
                OrderId = order1.Id, CustomerId = cust2.Id, BranchId = brKhobar.Id,
                ProcessedBy = uNora.Id, ApprovedBy = uAbdullah.Id,
                ReturnType = "partial_return", RefundMethod = "original_payment",
                RefundAmount = 15.00m,
                Reason = "Customer received wrong quantity — 6 cans instead of 3",
                Status = "completed",
                CreatedAt = DateTime.UtcNow.AddDays(-5), UpdatedAt = DateTime.UtcNow.AddDays(-5)
            };
            ret1.Items.Add(new CustomerReturnItem
            {
                Id = Guid.NewGuid(), ReturnId = ret1.Id, ProductId = prodPepsi.Id,
                Quantity = 6, UnitPrice = 2.50m, RefundAmount = 15.00m,
                Condition = "good", Restock = true, CreatedAt = ret1.CreatedAt
            });
            db.CustomerReturns.Add(ret1);
        }

        // Return 2: partial return of KitKat from ORD-10236
        if (order2 is not null && prodKitkat is not null && brOlaya is not null)
        {
            var ret2 = new CustomerReturn
            {
                Id = Guid.NewGuid(), ReturnNumber = "RET-20260612-002",
                OrderId = order2.Id, CustomerId = cust1.Id, BranchId = brOlaya.Id,
                ProcessedBy = uAbdullah.Id, ApprovedBy = uAbdullah.Id,
                ReturnType = "partial_return", RefundMethod = "store_credit",
                RefundAmount = 22.50m,
                Reason = "Packaging damaged on 5 KitKat bars",
                Status = "completed",
                CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow.AddDays(-3)
            };
            ret2.Items.Add(new CustomerReturnItem
            {
                Id = Guid.NewGuid(), ReturnId = ret2.Id, ProductId = prodKitkat.Id,
                Quantity = 5, UnitPrice = 4.50m, RefundAmount = 22.50m,
                Condition = "damaged", Restock = false, CreatedAt = ret2.CreatedAt
            });
            db.CustomerReturns.Add(ret2);
        }

        // Return 3: pending return of Lipton
        if (prodLipton is not null)
        {
            var ret3 = new CustomerReturn
            {
                Id = Guid.NewGuid(), ReturnNumber = "RET-20260615-003",
                OrderId = order2?.Id ?? Guid.NewGuid(), CustomerId = cust1.Id, BranchId = brOlaya.Id,
                ProcessedBy = uAbdullah.Id,
                ReturnType = "full_return", RefundMethod = "cash",
                RefundAmount = 37.00m,
                Reason = "Expired product sold — customer complaint",
                Status = "pending",
                CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow.AddDays(-1)
            };
            ret3.Items.Add(new CustomerReturnItem
            {
                Id = Guid.NewGuid(), ReturnId = ret3.Id, ProductId = prodLipton.Id,
                Quantity = 2, UnitPrice = 18.50m, RefundAmount = 37.00m,
                Condition = "expired", Restock = false, CreatedAt = ret3.CreatedAt
            });
            db.CustomerReturns.Add(ret3);
        }

        await db.SaveChangesAsync();
    }

    // ─── Backfill: Tax & Fee Rules ──────────────────────────────────────────
    private static async Task SeedTaxRulesAsync(BaqalaDbContext db)
    {
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        if (uAbdullah is null) return;

        var today = DateTime.UtcNow;

        db.TaxFeeRules.AddRange(
            new TaxFeeRule
            {
                Id = Guid.NewGuid(), RuleName = "Standard VAT 15%", RuleType = "vat",
                VatPercentage = 15, ApplicableTo = "all_products",
                ZatcaEnabled = true, IsTobacco = false,
                EffectiveDate = DateTime.Parse("2020-07-01"), Status = "active",
                CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-365), UpdatedAt = DateTime.UtcNow
            },
            new TaxFeeRule
            {
                Id = Guid.NewGuid(), RuleName = "Tobacco Excise Tax (100%)", RuleType = "tobacco_excise",
                ExcisePercentage = 100, VatPercentage = 15,
                ApplicableTo = "all_products", IsTobacco = true, ZatcaEnabled = true,
                EffectiveDate = DateTime.Parse("2020-07-01"), Status = "active",
                CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-365), UpdatedAt = DateTime.UtcNow
            },
            new TaxFeeRule
            {
                Id = Guid.NewGuid(), RuleName = "Delivery Service Fee (SAR 5)", RuleType = "custom_fee",
                CustomFeeAmount = 5, ApplicableTo = "all_products",
                IsTobacco = false, ZatcaEnabled = false,
                EffectiveDate = today.AddDays(-90), Status = "active",
                CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-90), UpdatedAt = DateTime.UtcNow
            },
            new TaxFeeRule
            {
                Id = Guid.NewGuid(), RuleName = "Card Payment Surcharge (1%)", RuleType = "custom_fee",
                VatPercentage = 1, CustomFeeAmount = 0, ApplicableTo = "all_products",
                IsTobacco = false, ZatcaEnabled = false,
                EffectiveDate = today.AddDays(-180), Status = "inactive",
                CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-180), UpdatedAt = DateTime.UtcNow
            }
        );
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Audit Logs ────────────────────────────────────────────────
    private static async Task SeedAuditLogsAsync(BaqalaDbContext db)
    {
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        var uKhalid   = await db.Users.FirstOrDefaultAsync(u => u.Username == "khalid.alotaibi");
        if (uAbdullah is null) return;

        db.AuditLogs.AddRange(
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "System initialized and seeded", EntityType = "System", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "Branches created: Olaya, Khobar, Jeddah, Madinah", EntityType = "Branch", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "Staff users created and roles assigned", EntityType = "User", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uKhalid?.Id ?? uAbdullah.Id, Action = "Cashier shift opened at Olaya branch", EntityType = "CashierShift", CreatedAt = DateTime.UtcNow },
            new AuditLog { Id = Guid.NewGuid(), UserId = uAbdullah.Id, Action = "Inventory stock seeded: 12 SKUs across 4 branches", EntityType = "Inventory", CreatedAt = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Test Users (one per role, Pakistan123@) ───────────────────
    private static async Task SeedTestUsersAsync(BaqalaDbContext db)
    {
        var brOlaya   = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-001");
        var brKhobar  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-002");
        var brJeddah  = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-003");
        var brMadinah = await db.Branches.FirstOrDefaultAsync(b => b.BranchCode == "BR-004");

        var testUsers = new (string Email, string Username, string FullName, string FullNameAr, string RoleName, Guid? BranchId)[]
        {
            ("ahmad.aziz@mytm.co",         "ahmad.aziz",        "Ahmad Aziz",          "أحمد عزيز",       "Tenant Administrator", brOlaya?.Id),
            ("sara.manager@baqala.sa",     "sara.manager",      "Sara Al Manager",     "سارة المديرة",    "Branch Manager",       brOlaya?.Id),
            ("khalid.cashier@baqala.sa",   "khalid.cashier",    "Khalid Al Cashier",   "خالد الكاشير",    "Cashier",              brOlaya?.Id),
            ("nora.cashier2@baqala.sa",    "nora.cashier2",     "Nora Al Cashier",     "نورة الكاشير",    "Cashier",              brOlaya?.Id),
            ("yousef.store@baqala.sa",     "yousef.store",      "Yousef Al Store",     "يوسف أمين",       "Storekeeper",          brOlaya?.Id),
            ("omar.supervisor@baqala.sa",  "omar.supervisor",   "Omar Al Supervisor",  "عمر المشرف",      "Supervisor",           brOlaya?.Id),
            ("bilal.finance@baqala.sa",    "bilal.finance",     "Bilal Al Finance",    "بلال المالية",    "Finance User",         brOlaya?.Id),
            ("layla.marketing@baqala.sa",  "layla.marketing",   "Layla Al Marketing",  "ليلى التسويق",    "Marketing User",       brOlaya?.Id),
            ("tarek.picker@baqala.sa",     "tarek.picker",      "Tarek Al Picker",     "طارق الجامع",     "Picker",               brOlaya?.Id),
            // One Pakistan123@-login Cashier per remaining branch — Jeddah and Madinah previously had
            // no Cashier-role user at all (only a Branch Manager/Storekeeper), so neither the real
            // shift-open flow nor the demo-data freshness patch could ever generate cashier/terminal/
            // attendance data there. Khobar's only cashier was a pre-existing demo account with a
            // different password, so it gets one too for a consistent login across all four branches.
            ("sami.cashier@baqala.sa",     "sami.cashier",      "Sami Al Cashier",     "سامي الكاشير",    "Cashier",              brKhobar?.Id),
            ("fahad.cashier@baqala.sa",    "fahad.cashier",     "Fahad Al Cashier",    "فهد الكاشير",     "Cashier",              brJeddah?.Id),
            ("reem.cashier@baqala.sa",     "reem.cashier",      "Reem Al Cashier",     "ريم الكاشير",     "Cashier",              brMadinah?.Id),
        };

        foreach (var (email, username, fullName, fullNameAr, roleName, branchId) in testUsers)
        {
            if (await db.Users.AnyAsync(u => u.Email == email)) continue;
            var role = await db.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
            if (role is null) continue;
            db.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                Username = username,
                FullName = fullName,
                FullNameAr = fullNameAr,
                PasswordHash = Hash("Pakistan123@"),
                PinHash = Hash("1234"),
                RoleId = role.Id,
                BranchId = branchId,
                Status = "active",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }
        await db.SaveChangesAsync();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static Branch Branch(string code, string name, string nameAr, string address, string city, string phone, string status) => new()
    {
        Id = Guid.NewGuid(), BranchCode = code, Name = name, NameAr = nameAr,
        Address = address, City = city, ContactNumber = phone, Status = status,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static User User(string email, string username, string fullName, string fullNameAr, Guid roleId, Guid? branchId, string status) => new()
    {
        Id = Guid.NewGuid(), Email = email, Username = username,
        FullName = fullName, FullNameAr = fullNameAr,
        PasswordHash = Hash("Admin@1234"), PinHash = Hash("1234"),
        RoleId = roleId, BranchId = branchId, Status = status,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static Category Cat(string name, string nameAr) => new()
    {
        Id = Guid.NewGuid(), Name = name, NameAr = nameAr, IsActive = true,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static Supplier Supplier(
        string code, string name, string contact, string phone, string supplyType,
        string? legalName = null, string? crNumber = null, string? vatNumber = null, string? address = null,
        string? email = null, string? category = null, string? paymentTerms = null, decimal? creditLimit = null,
        string? bankName = null, string? bankAccountHolder = null, string? bankAccountNumber = null, string? bankIban = null,
        string? notes = null) => new()
    {
        Id = Guid.NewGuid(), SupplierCode = code, Name = name,
        ContactPerson = contact, ContactNumber = phone, SupplyType = supplyType,
        LegalName = legalName, CrNumber = crNumber, VatNumber = vatNumber, Address = address, Email = email,
        Category = category, PaymentTerms = paymentTerms, CreditLimit = creditLimit,
        BankName = bankName, BankAccountHolder = bankAccountHolder, BankAccountNumber = bankAccountNumber, BankIban = bankIban,
        Notes = notes,
        Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static Product Prod(string sku, string barcode, string name, string nameAr, Guid catId, decimal price, decimal cost, decimal tax, int reorder) => new()
    {
        Id = Guid.NewGuid(), Sku = sku, Barcode = barcode, Name = name, NameAr = nameAr,
        CategoryId = catId, BasePrice = price, CostPrice = cost,
        TaxPercentage = tax, ReorderLevel = reorder, Status = "active",
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static Terminal Terminal(string code, string name, Guid branchId, Guid? cashierId, string status) => new()
    {
        Id = Guid.NewGuid(), TerminalCode = code, Name = name,
        BranchId = branchId, AssignedCashierId = cashierId, Status = status,
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
    };

    private static Order MakeOrder(
        string number, Guid branchId, Guid cashierId, Guid? terminalId, Guid? shiftId,
        string orderStatus, string paymentStatus, string paymentMethod,
        (Guid productId, decimal qty, decimal price)[] items)
    {
        var order = new Order
        {
            Id = Guid.NewGuid(), OrderNumber = number, Source = "pos",
            BranchId = branchId, CashierId = cashierId,
            TerminalId = terminalId, ShiftId = shiftId,
            OrderStatus = orderStatus, PaymentStatus = paymentStatus,
            CreatedAt = DateTime.UtcNow.AddMinutes(-Random.Shared.Next(5, 180)),
            UpdatedAt = DateTime.UtcNow
        };

        decimal subtotal = 0;
        foreach (var (productId, qty, price) in items)
        {
            var total = qty * price;
            subtotal += total;
            order.Items.Add(new OrderItem
            {
                Id = Guid.NewGuid(), OrderId = order.Id,
                ProductId = productId, Quantity = qty,
                UnitPrice = price, TotalPrice = total
            });
        }

        var tax = Math.Round(subtotal * 0.15m, 2);
        order.Subtotal = subtotal;
        order.TaxAmount = tax;
        order.TotalAmount = subtotal + tax;

        if (paymentStatus is "paid" or "refunded")
        {
            order.Payments.Add(new OrderPayment
            {
                Id = Guid.NewGuid(), OrderId = order.Id,
                PaymentMethod = paymentMethod,
                Amount = order.TotalAmount, Status = "completed",
                CreatedAt = order.CreatedAt
            });
        }

        return order;
    }

    private static string Hash(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));

    // ─── Upsert: ensure every role has rows for all known modules ────────────
    public static async Task EnsurePermissionsAsync(BaqalaDbContext db)
    {
        // Map from renamed role names back to the build-permissions seed names
        static string SeedName(string name) => name switch
        {
            "Admin"           => "Tenant Administrator",
            "Manager"         => "Branch Manager",
            "Inventory Staff" => "Storekeeper",
            "Accountant"      => "Finance User",
            "Auditor"         => "Marketing User",
            "Warehouse Staff" => "Picker",
            _                 => name,
        };

        var roles = await db.Roles.Include(r => r.Permissions).ToListAsync();
        var toAdd = new List<RolePermission>();

        foreach (var role in roles)
        {
            var expected = BuildPermissions(role.Id, SeedName(role.Name)).ToList();
            var existing = role.Permissions.Select(p => p.Module).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var perm in expected)
                if (!existing.Contains(perm.Module))
                    toAdd.Add(perm);
        }

        if (toAdd.Count > 0)
        {
            db.RolePermissions.AddRange(toAdd);
            await db.SaveChangesAsync();
        }
    }

    // ─── Patch: correct specific permission flags that changed after initial seed ─
    // Runs on every startup — idempotent, only writes when a value is wrong.
    public static async Task PatchPermissionsAsync(BaqalaDbContext db)
    {
        // Storekeeper and Picker must NOT be able to create warehouses.
        // Earlier seeder versions had canCreate=true for both roles.
        var roleIds = await db.Roles
            .Where(r => r.Name == "Storekeeper" || r.Name == "Picker")
            .Select(r => r.Id)
            .ToListAsync();

        if (roleIds.Count == 0) return;

        // Loop per role id — see PatchMarketingPermissionsAsync for why
        // roleIds.Contains(p.RoleId) is unsafe on this MySQL EF provider.
        var changed = false;
        foreach (var roleId in roleIds)
        {
            var patches = await db.RolePermissions
                .Where(p => p.RoleId == roleId && p.Module == "Warehouses" && p.CanCreate)
                .ToListAsync();

            foreach (var p in patches)
            {
                p.CanCreate = false;
                p.CanApprove = false;
                changed = true;
            }
        }

        if (changed)
            await db.SaveChangesAsync();
    }

    // Marketing ("Auditor" post-rename) must not retain Rules Engine, Accounting &
    // Finance, or Returns visibility from earlier seeder versions — those modules
    // let a marketing user read/alter approval, discount and tax rules.
    public static async Task PatchMarketingPermissionsAsync(BaqalaDbContext db)
    {
        var roleIds = await db.Roles
            .Where(r => r.Name == "Auditor" || r.Name == "Marketing User")
            .Select(r => r.Id)
            .ToListAsync();

        if (roleIds.Count == 0) return;

        // Loop per role id rather than roleIds.Contains(p.RoleId) — the MySQL EF
        // provider in use here fails to assign a type mapping to a List<Guid>
        // parameter in a Contains() translation.
        var changed = false;
        foreach (var roleId in roleIds)
        {
            var patches = await db.RolePermissions
                .Where(p => p.RoleId == roleId &&
                            (p.Module == "Rules Engine" || p.Module == "Accounting & Finance" || p.Module == "Returns"))
                .ToListAsync();

            foreach (var p in patches)
            {
                if (p.CanView || p.CanCreate || p.CanEdit || p.CanDelete || p.CanApprove || p.CanExport)
                {
                    p.CanView = p.CanCreate = p.CanEdit = p.CanDelete = p.CanApprove = p.CanExport = false;
                    changed = true;
                }
            }
        }

        if (changed)
            await db.SaveChangesAsync();
    }

    // ─── Backfill: Role Permissions ──────────────────────────────────────────
    private static async Task SeedRolePermissionsAsync(BaqalaDbContext db)
    {
        var roles = await db.Roles.ToListAsync();
        if (!roles.Any()) return;

        var allPerms = new List<RolePermission>();
        foreach (var role in roles)
            allPerms.AddRange(BuildPermissions(role.Id, role.Name));

        if (!allPerms.Any()) return;
        db.RolePermissions.AddRange(allPerms);
        await db.SaveChangesAsync();
    }

    private static IEnumerable<RolePermission> BuildPermissions(Guid roleId, string roleName)
    {
        static RolePermission P(Guid id, string mod,
            bool v, bool c, bool e, bool d, bool a, bool x)
            => new() { Id = Guid.NewGuid(), RoleId = id, Module = mod,
                       CanView = v, CanCreate = c, CanEdit = e,
                       CanDelete = d, CanApprove = a, CanExport = x };

        var r = roleId;
        // Matrix columns: View, Create, Edit, Delete, Approve, Export
        return roleName switch
        {
            "Tenant Administrator" => new[]
            {
                P(r, "Dashboard",           true,  true,  true,  true,  true,  true),
                P(r, "POS",                 true,  true,  true,  true,  true,  true),
                P(r, "Cashier Workspace",   true,  true,  true,  true,  true,  true),
                P(r, "Cashier Shifts",      true,  true,  true,  true,  true,  true),
                P(r, "Orders",              true,  true,  true,  true,  true,  true),
                P(r, "Coupons",             true,  true,  true,  true,  true,  true),
                P(r, "Loyalty Program",     true,  true,  true,  true,  true,  true),
                P(r, "Customers",           true,  true,  true,  true,  true,  true),
                P(r, "Returns",             true,  true,  true,  true,  true,  true),
                P(r, "Inventory",           true,  true,  true,  true,  true,  true),
                P(r, "Stocks",              true,  true,  true,  true,  true,  true),
                P(r, "Batches",             true,  true,  true,  true,  true,  true),
                P(r, "Warehouses",          true,  true,  true,  true,  true,  true),
                P(r, "Stock Transfers",     true,  true,  true,  true,  true,  true),
                P(r, "Suppliers",           true,  true,  true,  true,  true,  true),
                P(r, "Purchase Orders",     true,  true,  true,  true,  true,  true),
                P(r, "Supplier Returns",    true,  true,  true,  true,  true,  true),
                P(r, "Accounting & Finance",true,  true,  true,  true,  true,  true),
                P(r, "Tax & Fees",          true,  true,  true,  true,  true,  true),
                P(r, "Sales",               true,  true,  true,  true,  true,  true),
                P(r, "Control Tower",       true,  true,  true,  true,  true,  true),
                P(r, "Reports",             true,  true,  true,  true,  true,  true),
                P(r, "Branches",            true,  true,  true,  true,  true,  true),
                P(r, "Terminals",           true,  true,  true,  true,  true,  true),
                P(r, "Devices",             true,  true,  true,  true,  true,  true),
                P(r, "Users",               true,  true,  true,  true,  true,  true),
                P(r, "Roles",               true,  true,  true,  true,  true,  true),
                P(r, "Compliance",          true,  true,  true,  true,  true,  true),
                P(r, "Audit Logs",          true,  true,  true,  true,  true,  true),
                P(r, "Rules Engine",        true,  true,  true,  true,  true,  true),
                P(r, "Settings",            true,  true,  true,  true,  true,  true),
                P(r, "Employees",           true,  true,  true,  true,  true,  true),
                P(r, "HR Master Data",      true,  true,  true,  true,  true,  true),
                P(r, "HR Attendance",       true,  true,  true,  true,  true,  true),
                P(r, "HR Shifts",           true,  true,  true,  true,  true,  true),
                P(r, "Leave Management",    true,  true,  true,  true,  true,  true),
                P(r, "Payroll",             true,  true,  true,  true,  true,  true),
            },
            "Branch Manager" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, true),
                P(r, "POS",                 true,  true,  true,  false, true,  false),
                P(r, "Cashier Workspace",   true,  true,  true,  false, true,  false),
                P(r, "Cashier Shifts",      true,  false, false, false, true,  true),
                P(r, "Orders",              true,  true,  true,  false, true,  true),
                P(r, "Coupons",             true,  true,  true,  true,  true,  false),
                P(r, "Loyalty Program",     true,  false, true,  false, false, true),
                P(r, "Customers",           true,  true,  true,  false, false, true),
                P(r, "Returns",             true,  true,  true,  false, true,  true),
                P(r, "Inventory",           true,  true,  true,  false, true,  true),
                P(r, "Stocks",              true,  false, false, false, false, true),
                P(r, "Batches",             true,  true,  true,  false, false, true),
                P(r, "Warehouses",          true,  true,  true,  false, true,  false),
                P(r, "Stock Transfers",     true,  true,  true,  false, true,  false),
                P(r, "Suppliers",           true,  false, false, false, false, true),
                P(r, "Purchase Orders",     true,  true,  true,  false, true,  true),
                P(r, "Supplier Returns",    true,  true,  false, false, true,  false),
                P(r, "Accounting & Finance",true,  true,  true,  false, true,  true),
                P(r, "Tax & Fees",          true,  false, false, false, false, false),
                P(r, "Sales",               true,  false, false, false, false, true),
                P(r, "Control Tower",       true,  false, false, false, false, false),
                P(r, "Reports",             true,  false, false, false, false, true),
                P(r, "Branches",            true,  false, true,  false, false, false),
                P(r, "Terminals",           true,  false, true,  false, false, false),
                P(r, "Devices",             true,  false, true,  false, false, false),
                P(r, "Users",               true,  true,  true,  false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          true,  false, false, false, false, false),
                P(r, "Audit Logs",          true,  false, false, false, false, true),
                P(r, "Rules Engine",        true,  false, false, false, false, false),
                P(r, "Settings",            true,  false, true,  false, false, false),
                P(r, "Employees",           true,  true,  true,  false, false, true),
                P(r, "HR Master Data",      true,  true,  true,  false, false, true),
                P(r, "HR Attendance",       true,  true,  true,  false, true,  true),
                P(r, "HR Shifts",           true,  true,  true,  false, true,  false),
                P(r, "Leave Management",    true,  true,  false, false, true,  true),
                P(r, "Payroll",             false, false, false, false, false, false),
            },
            "Cashier" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, false),
                P(r, "POS",                 true,  true,  true,  false, false, false),
                P(r, "Cashier Workspace",   true,  true,  true,  false, false, false),
                P(r, "Cashier Shifts",      true,  true,  false, false, false, false),
                P(r, "Orders",              true,  true,  false, false, false, false),
                P(r, "Coupons",             true,  false, false, false, false, false),
                P(r, "Loyalty Program",     true,  false, false, false, false, false),
                P(r, "Customers",           true,  true,  false, false, false, false),
                P(r, "Returns",             true,  true,  false, false, true,  false),
                P(r, "Inventory",           true,  false, false, false, false, false),
                P(r, "Stocks",              true,  false, false, false, false, false),
                P(r, "Batches",             false, false, false, false, false, false),
                P(r, "Warehouses",          false, false, false, false, false, false),
                P(r, "Stock Transfers",     false, false, false, false, false, false),
                P(r, "Suppliers",           false, false, false, false, false, false),
                P(r, "Purchase Orders",     false, false, false, false, false, false),
                P(r, "Supplier Returns",    false, false, false, false, false, false),
                P(r, "Accounting & Finance",false, false, false, false, false, false),
                P(r, "Tax & Fees",          true,  false, false, false, false, false),
                P(r, "Sales",               false, false, false, false, false, false),
                P(r, "Control Tower",       false, false, false, false, false, false),
                P(r, "Reports",             true,  false, false, false, false, false),
                P(r, "Branches",            false, false, false, false, false, false),
                P(r, "Terminals",           true,  false, false, false, false, false),
                P(r, "Devices",             false, false, false, false, false, false),
                P(r, "Users",               false, false, false, false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          false, false, false, false, false, false),
                P(r, "Audit Logs",          false, false, false, false, false, false),
                P(r, "Rules Engine",        false, false, false, false, false, false),
                P(r, "Settings",            false, false, false, false, false, false),
                P(r, "Employees",           false, false, false, false, false, false),
                P(r, "HR Master Data",      true,  false, false, false, false, false),
                P(r, "HR Attendance",       true,  false, false, false, false, false),
                P(r, "HR Shifts",           true,  false, false, false, false, false),
                P(r, "Leave Management",    true,  true,  false, false, false, false),
                P(r, "Payroll",             false, false, false, false, false, false),
            },
            "Storekeeper" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, false),
                P(r, "POS",                 false, false, false, false, false, false),
                P(r, "Cashier Workspace",   false, false, false, false, false, false),
                P(r, "Cashier Shifts",      false, false, false, false, false, false),
                P(r, "Orders",              true,  false, false, false, false, false),
                P(r, "Coupons",             false, false, false, false, false, false),
                P(r, "Loyalty Program",     false, false, false, false, false, false),
                P(r, "Customers",           false, false, false, false, false, false),
                P(r, "Returns",             false, false, false, false, false, false),
                P(r, "Inventory",           true,  true,  true,  false, true,  true),
                P(r, "Stocks",              true,  true,  true,  false, true,  true),
                P(r, "Batches",             true,  true,  true,  false, false, true),
                P(r, "Warehouses",          true,  false, true,  false, false, false),
                P(r, "Stock Transfers",     true,  true,  true,  false, true,  false),
                P(r, "Suppliers",           true,  false, false, false, false, false),
                P(r, "Purchase Orders",     false, false, false, false, false, false),
                P(r, "Supplier Returns",    false, false, false, false, false, false),
                P(r, "Accounting & Finance",false, false, false, false, false, false),
                P(r, "Tax & Fees",          false, false, false, false, false, false),
                P(r, "Sales",               false, false, false, false, false, false),
                P(r, "Control Tower",       false, false, false, false, false, false),
                P(r, "Reports",             true,  false, false, false, false, true),
                P(r, "Branches",            false, false, false, false, false, false),
                P(r, "Terminals",           false, false, false, false, false, false),
                P(r, "Devices",             true,  false, true,  false, false, false),
                P(r, "Users",               false, false, false, false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          false, false, false, false, false, false),
                P(r, "Audit Logs",          false, false, false, false, false, false),
                P(r, "Rules Engine",        false, false, false, false, false, false),
                P(r, "Settings",            false, false, false, false, false, false),
                P(r, "Employees",           false, false, false, false, false, false),
                P(r, "HR Master Data",      true,  false, false, false, false, false),
                P(r, "HR Attendance",       true,  false, false, false, false, false),
                P(r, "HR Shifts",           true,  false, false, false, false, false),
                P(r, "Leave Management",    true,  true,  false, false, false, false),
                P(r, "Payroll",             false, false, false, false, false, false),
            },
            "Supervisor" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, true),
                P(r, "POS",                 true,  true,  true,  false, true,  false),
                P(r, "Cashier Workspace",   true,  true,  true,  false, true,  false),
                P(r, "Cashier Shifts",      true,  true,  true,  false, true,  true),
                P(r, "Orders",              true,  true,  true,  false, true,  true),
                P(r, "Coupons",             true,  false, false, false, true,  false),
                P(r, "Loyalty Program",     true,  false, false, false, false, false),
                P(r, "Customers",           true,  true,  true,  false, false, false),
                P(r, "Returns",             true,  true,  true,  false, true,  true),
                P(r, "Inventory",           true,  true,  true,  false, true,  true),
                P(r, "Stocks",              true,  false, false, false, false, true),
                P(r, "Batches",             true,  false, false, false, false, true),
                P(r, "Warehouses",          true,  true,  true,  false, true,  false),
                P(r, "Stock Transfers",     true,  false, false, false, true,  false),
                P(r, "Suppliers",           true,  false, false, false, false, false),
                P(r, "Purchase Orders",     false, false, false, false, false, false),
                P(r, "Supplier Returns",    false, false, false, false, false, false),
                P(r, "Accounting & Finance",true,  false, false, false, true,  true),
                P(r, "Tax & Fees",          true,  false, false, false, false, false),
                P(r, "Sales",               true,  false, false, false, false, true),
                P(r, "Control Tower",       true,  false, false, false, false, false),
                P(r, "Reports",             true,  false, false, false, false, true),
                P(r, "Branches",            true,  false, false, false, false, false),
                P(r, "Terminals",           true,  false, false, false, false, false),
                P(r, "Devices",             true,  false, true,  false, false, false),
                P(r, "Users",               true,  false, false, false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          true,  false, false, false, false, false),
                P(r, "Audit Logs",          true,  false, false, false, false, false),
                P(r, "Rules Engine",        false, false, false, false, false, false),
                P(r, "Settings",            true,  false, false, false, false, false),
                P(r, "Employees",           true,  false, false, false, false, true),
                P(r, "HR Master Data",      true,  false, false, false, false, false),
                P(r, "HR Attendance",       true,  false, true,  false, true,  true),
                P(r, "HR Shifts",           true,  false, false, false, true,  false),
                P(r, "Leave Management",    true,  true,  false, false, true,  true),
                P(r, "Payroll",             false, false, false, false, false, false),
            },
            "Finance User" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, true),
                P(r, "POS",                 false, false, false, false, false, false),
                P(r, "Cashier Workspace",   false, false, false, false, false, false),
                P(r, "Cashier Shifts",      true,  false, false, false, false, true),
                P(r, "Orders",              true,  false, false, false, false, true),
                P(r, "Coupons",             true,  false, false, false, false, true),
                P(r, "Loyalty Program",     true,  false, false, false, false, true),
                P(r, "Customers",           true,  false, false, false, false, true),
                P(r, "Returns",             true,  false, false, false, true,  true),
                P(r, "Inventory",           true,  false, false, false, false, true),
                P(r, "Stocks",              true,  false, false, false, false, false),
                P(r, "Batches",             false, false, false, false, false, false),
                P(r, "Warehouses",          true,  false, false, false, false, false),
                P(r, "Stock Transfers",     true,  false, false, false, false, true),
                P(r, "Suppliers",           true,  false, false, false, false, true),
                P(r, "Purchase Orders",     true,  true,  true,  false, true,  true),
                P(r, "Supplier Returns",    true,  true,  false, false, true,  false),
                P(r, "Accounting & Finance",true,  true,  true,  true,  true,  true),
                P(r, "Tax & Fees",          true,  true,  true,  true,  true,  true),
                P(r, "Sales",               true,  false, false, false, false, true),
                P(r, "Control Tower",       true,  false, false, false, false, false),
                P(r, "Reports",             true,  false, false, false, false, true),
                P(r, "Branches",            true,  false, false, false, false, false),
                P(r, "Terminals",           false, false, false, false, false, false),
                P(r, "Devices",             false, false, false, false, false, false),
                P(r, "Users",               true,  false, false, false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          true,  false, false, false, false, true),
                P(r, "Audit Logs",          true,  false, false, false, false, true),
                P(r, "Rules Engine",        true,  false, false, false, false, false),
                P(r, "Settings",            false, false, false, false, false, false),
                P(r, "Employees",           false, false, false, false, false, false),
                P(r, "HR Master Data",      false, false, false, false, false, false),
                P(r, "HR Attendance",       true,  false, false, false, false, false),
                P(r, "HR Shifts",           false, false, false, false, false, false),
                P(r, "Leave Management",    true,  false, false, false, false, false),
                P(r, "Payroll",             true,  true,  true,  true,  true,  true),
            },
            "Marketing User" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, true),
                P(r, "POS",                 false, false, false, false, false, false),
                P(r, "Cashier Workspace",   false, false, false, false, false, false),
                P(r, "Cashier Shifts",      false, false, false, false, false, false),
                P(r, "Orders",              true,  false, false, false, false, true),
                P(r, "Coupons",             true,  true,  true,  false, false, true),
                // Loyalty Program: Marketing owns rewards/campaigns/referrals (BRD §4), so it's
                // the designated administrator of loyalty configuration — same access as Coupons.
                P(r, "Loyalty Program",     true,  true,  true,  false, false, true),
                P(r, "Customers",           true,  true,  true,  false, false, true),
                // Marketing is scoped to rewards/campaigns/referrals only (BRD §4)
                // — no Returns, Finance or Rules Engine visibility.
                P(r, "Returns",             false, false, false, false, false, false),
                P(r, "Inventory",           true,  false, false, false, false, true),
                P(r, "Stocks",              true,  false, false, false, false, true),
                P(r, "Batches",             false, false, false, false, false, false),
                P(r, "Warehouses",          false, false, false, false, false, false),
                P(r, "Stock Transfers",     false, false, false, false, false, false),
                P(r, "Suppliers",           false, false, false, false, false, false),
                P(r, "Purchase Orders",     false, false, false, false, false, false),
                P(r, "Supplier Returns",    false, false, false, false, false, false),
                P(r, "Accounting & Finance",false, false, false, false, false, false),
                P(r, "Tax & Fees",          false, false, false, false, false, false),
                P(r, "Sales",               true,  false, false, false, false, true),
                P(r, "Control Tower",       false, false, false, false, false, false),
                P(r, "Reports",             true,  false, false, false, false, true),
                P(r, "Branches",            true,  false, false, false, false, false),
                P(r, "Terminals",           false, false, false, false, false, false),
                P(r, "Devices",             false, false, false, false, false, false),
                P(r, "Users",               false, false, false, false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          false, false, false, false, false, false),
                P(r, "Audit Logs",          false, false, false, false, false, false),
                P(r, "Rules Engine",        false, false, false, false, false, false),
                P(r, "Settings",            false, false, false, false, false, false),
                P(r, "Employees",           false, false, false, false, false, false),
                P(r, "HR Master Data",      false, false, false, false, false, false),
                P(r, "HR Attendance",       false, false, false, false, false, false),
                P(r, "HR Shifts",           false, false, false, false, false, false),
                P(r, "Leave Management",    false, false, false, false, false, false),
                P(r, "Payroll",             false, false, false, false, false, false),
            },
            "Picker" => new[]
            {
                P(r, "Dashboard",           true,  false, false, false, false, false),
                P(r, "POS",                 false, false, false, false, false, false),
                P(r, "Cashier Workspace",   false, false, false, false, false, false),
                P(r, "Cashier Shifts",      false, false, false, false, false, false),
                P(r, "Orders",              true,  false, false, false, false, false),
                P(r, "Coupons",             false, false, false, false, false, false),
                P(r, "Loyalty Program",     false, false, false, false, false, false),
                P(r, "Customers",           false, false, false, false, false, false),
                P(r, "Returns",             false, false, false, false, false, false),
                P(r, "Inventory",           true,  false, false, false, false, false),
                P(r, "Stocks",              true,  false, false, false, false, false),
                P(r, "Batches",             true,  false, false, false, false, false),
                P(r, "Warehouses",          true,  false, false, false, false, false),
                P(r, "Stock Transfers",     true,  true,  true,  false, false, false),
                P(r, "Suppliers",           false, false, false, false, false, false),
                P(r, "Purchase Orders",     false, false, false, false, false, false),
                P(r, "Supplier Returns",    false, false, false, false, false, false),
                P(r, "Accounting & Finance",false, false, false, false, false, false),
                P(r, "Tax & Fees",          false, false, false, false, false, false),
                P(r, "Sales",               false, false, false, false, false, false),
                P(r, "Control Tower",       false, false, false, false, false, false),
                P(r, "Reports",             false, false, false, false, false, false),
                P(r, "Branches",            false, false, false, false, false, false),
                P(r, "Terminals",           false, false, false, false, false, false),
                P(r, "Devices",             false, false, false, false, false, false),
                P(r, "Users",               false, false, false, false, false, false),
                P(r, "Roles",               false, false, false, false, false, false),
                P(r, "Compliance",          false, false, false, false, false, false),
                P(r, "Audit Logs",          false, false, false, false, false, false),
                P(r, "Rules Engine",        false, false, false, false, false, false),
                P(r, "Settings",            false, false, false, false, false, false),
                P(r, "Employees",           false, false, false, false, false, false),
                P(r, "HR Master Data",      false, false, false, false, false, false),
                P(r, "HR Attendance",       true,  false, false, false, false, false),
                P(r, "HR Shifts",           true,  false, false, false, false, false),
                P(r, "Leave Management",    true,  true,  false, false, false, false),
                P(r, "Payroll",             false, false, false, false, false, false),
            },
            // Kiosk device credential (never a human login) — only permission it holds is
            // creating orders. Everything else, including reading Orders/POS, stays false;
            // read-only lookups it needs (products/coupons/stock) have no [RequirePermission]
            // gate at all, so this role's only job is to satisfy the RequirePermission check
            // on OrdersController.Create.
            "Self-Checkout Kiosk" => new[]
            {
                P(r, "POS", false, true, false, false, false, false),
                // Lets a customer optionally attach their loyalty account at checkout
                // (phone lookup, or create-new if not found) — same as the staff POS.
                P(r, "Customers", false, true, false, false, false, false),
            },
            _ => Array.Empty<RolePermission>()
        };
    }

    // ─── Backfill: Rules Engine ──────────────────────────────────────────────
    private static async Task SeedRulesEngineAsync(BaqalaDbContext db)
    {
        var uAdmin = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        if (uAdmin is null) return;

        db.RulesEngine.AddRange(
            // FR-RET: Return Rules
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Max return period — 7 days", RuleType = "return", AppliesTo = "all", RuleConfig = "{\"condition\":\"Days since purchase ≤ 7\",\"action\":\"Allow return with valid receipt\"}", Priority = 100, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Perishables — 24h return window", RuleType = "return", AppliesTo = "category", RuleConfig = "{\"condition\":\"Category = Perishable AND hours since purchase ≤ 24\",\"action\":\"Allow return with inspection\"}", Priority = 95, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Block sale of expired items", RuleType = "return", AppliesTo = "all", RuleConfig = "{\"condition\":\"Batch expiry date < today\",\"action\":\"Block sale and alert cashier\"}", Priority = 90, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },

            // FR-APR: Approval Rules
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Manager approval — refund > SAR 100", RuleType = "approval", AppliesTo = "all", RuleConfig = "{\"condition\":\"Refund amount > 100\",\"action\":\"Require manager PIN approval\"}", Priority = 85, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Supervisor approval — void or discount > SAR 50", RuleType = "approval", AppliesTo = "all", RuleConfig = "{\"condition\":\"Void or discount amount > 50\",\"action\":\"Require supervisor override PIN\"}", Priority = 80, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Cash variance > SAR 200 — manager review", RuleType = "approval", AppliesTo = "all", RuleConfig = "{\"condition\":\"End-of-shift cash variance > 200\",\"action\":\"Flag shift for manager review before close\"}", Priority = 75, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },

            // FR-DSC: Discount & Loyalty Rules
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "VIP customer — 10% automatic discount", RuleType = "discount", AppliesTo = "customer_tier", RuleConfig = "{\"condition\":\"Customer tier = VIP or Platinum\",\"action\":\"Apply 10% discount automatically\"}", Priority = 70, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Loyalty points — 1 point per SAR spent", RuleType = "discount", AppliesTo = "all", RuleConfig = "{\"condition\":\"Order payment status = paid\",\"action\":\"Award 1 loyalty point per SAR spent\"}", Priority = 60, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "No discount on tobacco items", RuleType = "discount", AppliesTo = "category", RuleConfig = "{\"condition\":\"Category = Tobacco\",\"action\":\"Block all discount applications on tobacco SKUs\"}", Priority = 55, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },

            // FR-COUP: Coupon Acceptance Rules
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Coupon — single use per customer", RuleType = "coupon", AppliesTo = "all", RuleConfig = "{\"condition\":\"Customer has not used this coupon before\",\"action\":\"Accept coupon and mark as used for this customer\"}", Priority = 50, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Coupon — validate active date range", RuleType = "coupon", AppliesTo = "all", RuleConfig = "{\"condition\":\"Current date between coupon startDate and endDate\",\"action\":\"Accept coupon if within validity window\"}", Priority = 45, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },

            // FR-FEE: Custom Fee Rules
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Delivery service fee — SAR 10", RuleType = "custom_fee", AppliesTo = "all", RuleConfig = "{\"condition\":\"Order channel = Delivery\",\"action\":\"Add SAR 10 delivery service fee to order total\"}", Priority = 40, IsActive = true, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new RulesEngine { Id = Guid.NewGuid(), RuleName = "Eid week — 5% holiday surcharge", RuleType = "custom_fee", AppliesTo = "all", RuleConfig = "{\"condition\":\"Date falls within Eid holiday week\",\"action\":\"Add 5% surcharge to all orders\"}", Priority = 35, IsActive = false, CreatedBy = uAdmin.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Discounts ─────────────────────────────────────────────────
    private static async Task SeedDiscountsAsync(BaqalaDbContext db)
    {
        db.Discounts.AddRange(
            new Discount { Id = Guid.NewGuid(), Name = "Senior Citizen 5%",     AppliesTo = "all",    DiscountType = "percentage", Value = 5,  IsActive = true,  RequiresCustomer = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Discount { Id = Guid.NewGuid(), Name = "Loyalty Tier Gold 10%", AppliesTo = "all",    DiscountType = "percentage", Value = 10, IsActive = true,  RequiresCustomer = true, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new Discount { Id = Guid.NewGuid(), Name = "Eid Week-end 15%",      AppliesTo = "all",    DiscountType = "percentage", Value = 15, IsActive = false, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();
    }

    // ─── Patch: gate loyalty/senior discounts behind an actual customer, so they
    // stop auto-applying to anonymous walk-ins on already-seeded databases ──────
    public static async Task PatchDiscountEligibilityAsync(BaqalaDbContext db)
    {
        var patches = await db.Discounts
            .Where(d => (d.Name.Contains("Senior Citizen") || d.Name.Contains("Loyalty Tier")) && !d.RequiresCustomer)
            .ToListAsync();

        foreach (var d in patches)
        {
            d.RequiresCustomer = true;
        }

        if (patches.Count > 0)
            await db.SaveChangesAsync();
    }

    // Removes unprofessional/placeholder branches (e.g. a tester quickly typed
    // "Branch" or "Branch TEST" while exploring the Add Branch flow) — not
    // something the seeder ever creates, just startup cleanup for whatever junk
    // ended up in a given database. Cleans up the small amount of test data
    // (stock/batches/audit logs) those branches accumulated so the hard delete
    // actually succeeds, instead of leaving them soft-disabled and still visible.
    public static async Task PatchRemoveTestBranchesAsync(BaqalaDbContext db)
    {
        // Explicit equality ORs, not junkNames.Contains(b.Name) — this MySQL EF
        // provider fails to assign a type mapping to an array/list parameter
        // used inside a Contains() translation.
        var junkBranches = await db.Branches
            .Where(b => b.Name == "Branch" || b.Name == "Branch TEST")
            .ToListAsync();

        foreach (var branch in junkBranches)
        {
            var id = branch.Id;

            // Loop-per-id instead of list.Contains(...) in the EF query — this
            // MySQL provider fails to type-map a List<Guid> used inside Contains().
            var orderIds = await db.Orders.Where(o => o.BranchId == id).Select(o => o.Id).ToListAsync();
            foreach (var orderId in orderIds)
            {
                db.OrderItems.RemoveRange(db.OrderItems.Where(i => i.OrderId == orderId));
                db.OrderPayments.RemoveRange(db.OrderPayments.Where(p => p.OrderId == orderId));
            }
            if (orderIds.Count > 0) await db.SaveChangesAsync();
            db.Orders.RemoveRange(db.Orders.Where(o => o.BranchId == id));

            var shiftIds = await db.CashierShifts.Where(s => s.BranchId == id).Select(s => s.Id).ToListAsync();
            foreach (var shiftId in shiftIds)
                db.ShiftCashMovements.RemoveRange(db.ShiftCashMovements.Where(m => m.ShiftId == shiftId));
            if (shiftIds.Count > 0) await db.SaveChangesAsync();
            db.CashierShifts.RemoveRange(db.CashierShifts.Where(s => s.BranchId == id));

            var transferIds = await db.StockTransfers
                .Where(t => t.SourceBranchId == id || t.DestBranchId == id)
                .Select(t => t.Id).ToListAsync();
            foreach (var transferId in transferIds)
                db.StockTransferItems.RemoveRange(db.StockTransferItems.Where(i => i.TransferId == transferId));
            if (transferIds.Count > 0) await db.SaveChangesAsync();
            db.StockTransfers.RemoveRange(db.StockTransfers.Where(t => t.SourceBranchId == id || t.DestBranchId == id));

            db.Users.RemoveRange(db.Users.Where(u => u.BranchId == id));
            db.Terminals.RemoveRange(db.Terminals.Where(t => t.BranchId == id));
            db.Devices.RemoveRange(db.Devices.Where(d => d.BranchId == id));
            db.InventoryStocks.RemoveRange(db.InventoryStocks.Where(s => s.BranchId == id));
            db.InventoryBatches.RemoveRange(db.InventoryBatches.Where(b2 => b2.BranchId == id));
            db.InventoryAdjustments.RemoveRange(db.InventoryAdjustments.Where(a => a.BranchId == id));
            db.BranchWarehouses.RemoveRange(db.BranchWarehouses.Where(bw => bw.BranchId == id));
            db.Expenses.RemoveRange(db.Expenses.Where(e => e.BranchId == id));
            db.Discounts.RemoveRange(db.Discounts.Where(d => d.BranchId == id));
            db.TaxFeeRules.RemoveRange(db.TaxFeeRules.Where(t => t.BranchId == id));
            db.RulesEngine.RemoveRange(db.RulesEngine.Where(r => r.BranchId == id));
            db.ZatcaSettings.RemoveRange(db.ZatcaSettings.Where(z => z.BranchId == id));
            db.ZatcaInvoices.RemoveRange(db.ZatcaInvoices.Where(z => z.BranchId == id));
            db.CustomerReturns.RemoveRange(db.CustomerReturns.Where(r => r.BranchId == id));
            db.PurchaseOrders.RemoveRange(db.PurchaseOrders.Where(p => p.BranchId == id));
            db.LoyaltyTransactions.RemoveRange(db.LoyaltyTransactions.Where(l => l.BranchId == id));
            db.PosSettings.RemoveRange(db.PosSettings.Where(p => p.BranchId == id));
            db.ProductPriceLists.RemoveRange(db.ProductPriceLists.Where(p => p.BranchId == id));
            db.StaffAttendances.RemoveRange(db.StaffAttendances.Where(a => a.BranchId == id));
            db.TenantSettings.RemoveRange(db.TenantSettings.Where(t => t.BranchId == id));
            db.AuditLogs.RemoveRange(db.AuditLogs.Where(a => a.BranchId == id));
            await db.SaveChangesAsync();

            // Not test junk — just clear the dangling preference on real customers.
            var customersWithPref = await db.Customers.Where(c => c.PreferredBranchId == id).ToListAsync();
            foreach (var c in customersWithPref) c.PreferredBranchId = null;
            if (customersWithPref.Count > 0) await db.SaveChangesAsync();

            try
            {
                db.Branches.Remove(branch);
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Something else still references it that we didn't account for —
                // leave it disabled rather than crash startup.
                db.Entry(branch).State = EntityState.Unchanged;
            }
        }
    }

    // Only Cashier-role accounts are allowed to hold a shift. Earlier seed/test
    // data left cashier_shifts rows open under a Supervisor and an Inventory
    // Staff account — clear those out so the dashboard's "Active Cashiers"
    // count and the Cashier Shift screen only ever reflect real cashiers.
    public static async Task PatchRemoveNonCashierShiftsAsync(BaqalaDbContext db)
    {
        var shiftIds = await db.CashierShifts
            .Where(s => s.Cashier!.Role!.Name != "Cashier")
            .Select(s => s.Id)
            .ToListAsync();
        if (shiftIds.Count == 0) return;

        foreach (var shiftId in shiftIds)
            db.ShiftCashMovements.RemoveRange(db.ShiftCashMovements.Where(m => m.ShiftId == shiftId));
        await db.SaveChangesAsync();

        foreach (var shiftId in shiftIds)
            db.CashierShifts.RemoveRange(db.CashierShifts.Where(s => s.Id == shiftId));
        await db.SaveChangesAsync();
    }

    // Earlier dummy/test data seeded orders with no line items at all — not a
    // real defect (the persistence/read path is correct for orders that do
    // have items), just junk rows that shouldn't show up in Orders/Dashboard counts.
    // A cashier should only ever hold one open shift at a time — ShiftsController.OpenShift
    // rejects opening a second one — but stale data from before that guard existed (or created
    // directly, bypassing the API) can leave a cashier with more than one "open" row. That made
    // OrdersController.Create's active-shift lookup pick an arbitrary one of them, so a sale could
    // silently attach to the wrong terminal/branch entirely. Close every open shift except each
    // cashier's most recently opened one.
    public static async Task PatchCloseDuplicateOpenShiftsAsync(BaqalaDbContext db)
    {
        var openShifts = await db.CashierShifts.Where(s => s.Status == "open").ToListAsync();
        var duplicates = openShifts
            .GroupBy(s => s.CashierId)
            .Where(g => g.Count() > 1)
            .SelectMany(g => g.OrderByDescending(s => s.OpenedAt).Skip(1))
            .ToList();
        if (duplicates.Count == 0) return;

        var now = DateTime.UtcNow;
        foreach (var shift in duplicates)
        {
            shift.Status = "closed";
            shift.ClosedAt = now;
            shift.ClosingAmount = shift.OpeningAmount + shift.CashSales;
            shift.Variance = 0;
        }
        await db.SaveChangesAsync();
    }

    // The one-time seed above (shiftFahad/shiftMohammed) opened shifts for the legacy demo
    // identities khalid@mimoney.sa / nora@mimoney.sa on POS-01/POS-02 at Olaya and never closed
    // them — unlike every other seeded shift, nothing in normal app usage ever logs in as those
    // accounts again to close them. Left "open" forever, they permanently occupy those two
    // terminals (ShiftsController.OpenShift refuses a second open shift per terminal), so the
    // real charter accounts (khalid.cashier@baqala.sa / nora.cashier2@baqala.sa) run out of free
    // terminals to check into even though nobody is actually using POS-01/POS-02. Scoped to these
    // two known-stale seed accounts specifically, not "any shift open a while" — a real store can
    // legitimately leave a shift open for a long time and this must never auto-close those.
    public static async Task PatchCloseLegacyDemoShiftsAsync(BaqalaDbContext db)
    {
        // One query per email (matching PatchRemoveBootstrapAuditNoiseAsync) — the MySQL EF Core
        // provider here can't assign a type mapping to a parameterized List<string> IN-list.
        var legacyEmails = new[] { "khalid@mimoney.sa", "nora@mimoney.sa" };
        var now = DateTime.UtcNow;
        var changed = false;
        foreach (var email in legacyEmails)
        {
            var staleShifts = await db.CashierShifts
                .Where(s => s.Status == "open" && s.Cashier!.Email == email)
                .ToListAsync();
            foreach (var shift in staleShifts)
            {
                shift.Status = "closed";
                shift.ClosedAt = now;
                shift.ClosingAmount = shift.OpeningAmount + shift.CashSales;
                shift.Variance = 0;
                changed = true;
            }
        }
        if (changed) await db.SaveChangesAsync();
    }

    // Backfills a check-in record for every existing shift that predates ShiftsController.OpenShift
    // creating one automatically — otherwise the Attendance/Shift report's "Check-in" column shows
    // "—" for any shift opened before that change (it can only match a shift to an attendance record
    // that already exists for the same cashier on the same calendar day).
    public static async Task PatchBackfillShiftCheckInsAsync(BaqalaDbContext db)
    {
        var shifts = await db.CashierShifts.Select(s => new { s.CashierId, s.BranchId, s.OpenedAt }).ToListAsync();
        var attendanceDays = (await db.StaffAttendances.Where(a => a.CheckIn != null)
                .Select(a => new { a.UserId, Day = a.CheckIn!.Value.Date }).ToListAsync())
            .Select(a => (a.UserId, a.Day)).ToHashSet();

        var missing = shifts
            .Where(s => !attendanceDays.Contains((s.CashierId, s.OpenedAt.Date)))
            .GroupBy(s => (s.CashierId, Day: s.OpenedAt.Date))
            .Select(g => g.OrderBy(s => s.OpenedAt).First())
            .ToList();
        if (missing.Count == 0) return;

        foreach (var s in missing)
            db.StaffAttendances.Add(new StaffAttendance
            {
                Id = Guid.NewGuid(), UserId = s.CashierId, BranchId = s.BranchId,
                CheckIn = s.OpenedAt, Status = "present",
            });
        await db.SaveChangesAsync();
    }

    public static async Task PatchRemoveEmptyOrdersAsync(BaqalaDbContext db)
    {
        var emptyOrderIds = await db.Orders
            .Where(o => !o.Items.Any())
            .Select(o => o.Id)
            .ToListAsync();
        if (emptyOrderIds.Count == 0) return;

        foreach (var orderId in emptyOrderIds)
            db.OrderPayments.RemoveRange(db.OrderPayments.Where(p => p.OrderId == orderId));
        await db.SaveChangesAsync();

        foreach (var orderId in emptyOrderIds)
            db.Orders.RemoveRange(db.Orders.Where(o => o.Id == orderId));
        await db.SaveChangesAsync();
    }

    // Artifacts left behind by the BUG-C1 (negative-quantity/expired batch) and general
    // QA pass — a product created purely to exercise validation and a deliberately-bad
    // batch used as evidence. Safe to purge now that the findings are documented.
    public static async Task PatchRemoveQaTestDataAsync(BaqalaDbContext db)
    {
        var badBatchIds = await db.InventoryBatches
            .Where(b => b.BatchNumber == "QA-BATCH-NEG")
            .Select(b => b.Id)
            .ToListAsync();
        if (badBatchIds.Count > 0)
        {
            // Loop-per-id instead of badBatchIds.Contains(...) in the EF query —
            // this MySQL provider fails to type-map a List<Guid> used inside Contains().
            foreach (var id in badBatchIds)
                db.InventoryBatches.RemoveRange(db.InventoryBatches.Where(b => b.Id == id));
            await db.SaveChangesAsync();
        }

        var qaProduct = await db.Products.FirstOrDefaultAsync(p => p.Sku == "QA-TEST-001");
        if (qaProduct is not null)
        {
            var productId = qaProduct.Id;
            db.InventoryBatches.RemoveRange(db.InventoryBatches.Where(b => b.ProductId == productId));
            db.InventoryStocks.RemoveRange(db.InventoryStocks.Where(s => s.ProductId == productId));
            await db.SaveChangesAsync();
            db.Products.RemoveRange(db.Products.Where(p => p.Id == productId));
            await db.SaveChangesAsync();
        }
    }

    // These 5 rows were only ever bootstrap narration ("System initialized and seeded", etc.),
    // not real business events — they clutter the Audit Trail report (always severity "info",
    // dated at whenever the DB was first created) and confuse anyone testing it for real.
    private static readonly string[] BootstrapAuditActions =
    [
        "System initialized and seeded",
        "Branches created: Olaya, Khobar, Jeddah, Madinah",
        "Staff users created and roles assigned",
        "Cashier shift opened at Olaya branch",
        "Inventory stock seeded: 12 SKUs across 4 branches",
    ];

    // The migration that added AuditLog.Severity (20260705135415_AddShiftApprovalAndAuditSeverity)
    // backfilled every pre-existing row with an empty string, not "info" — those rows render as a
    // blank/uncolored severity badge and sort ambiguously in the severity-first default view.
    public static async Task PatchBackfillEmptyAuditSeverityAsync(BaqalaDbContext db)
    {
        var blankRows = await db.AuditLogs.Where(a => a.Severity == "").ToListAsync();
        if (blankRows.Count == 0) return;
        foreach (var row in blankRows) row.Severity = "info";
        await db.SaveChangesAsync();
    }

    public static async Task PatchRemoveBootstrapAuditNoiseAsync(BaqalaDbContext db)
    {
        // One DELETE per action string (matching the loop pattern the other Patch* methods use)
        // rather than a single Contains(noiseIds) — the MySQL EF Core provider here can't assign
        // a type mapping to a parameterized List<Guid>/List<string> IN-list.
        var changed = false;
        foreach (var action in BootstrapAuditActions)
        {
            var rows = await db.AuditLogs.Where(a => a.Action == action).ToListAsync();
            if (rows.Count == 0) continue;
            db.AuditLogs.RemoveRange(rows);
            changed = true;
        }
        if (changed) await db.SaveChangesAsync();
    }

    // Several reports default to "today" (Cashier Sales, Attendance/Shift) or "this month"
    // (Waste/Spoilage, VAT/ZATCA, Returns/Refunds) per the FRD's default-period rules, but the
    // one-time seed above only ever wrote a handful of orders/shifts dated at whatever moment
    // the database was first created — a few days later those default views go back to showing
    // nothing. This runs on every boot and tops up exactly what's missing for "today"/"this
    // month", per active branch (not just Olaya), so the demo data doesn't go stale and every
    // branch — not only the one the original one-time seed happened to touch — has something
    // to show under the default filters.
    public static async Task PatchEnsureFreshDemoDataAsync(BaqalaDbContext db)
    {
        var branches = await db.Branches.Where(b => b.Status == "active").ToListAsync();
        foreach (var branch in branches)
            await EnsureFreshDemoDataForBranchAsync(db, branch);
    }

    private static async Task EnsureFreshDemoDataForBranchAsync(BaqalaDbContext db, Branch branch)
    {
        var today = DateTime.UtcNow.Date;

        var cashier = await db.Users.Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.BranchId == branch.Id && u.Role!.Name == "Cashier" && u.Status == "active");
        var terminal = await db.Terminals.FirstOrDefaultAsync(t => t.BranchId == branch.Id);
        var products = await db.Products.Where(p => p.Status == "active").Take(3).ToListAsync();
        if (cashier is null || products.Count == 0) return;

        // ── Today's cashier shift + a couple of orders ──────────────────────────
        var hasShiftToday = await db.CashierShifts.AnyAsync(s => s.CashierId == cashier.Id && s.OpenedAt >= today);
        if (!hasShiftToday)
        {
            var shift = new CashierShift
            {
                Id = Guid.NewGuid(), CashierId = cashier.Id, BranchId = branch.Id, TerminalId = terminal?.Id,
                OpeningAmount = 500, CashSales = 0, CardSales = 0, DigitalSales = 0, TotalSales = 0,
                Status = "open", OpenedAt = today.AddHours(8),
            };
            db.CashierShifts.Add(shift);
            await db.SaveChangesAsync();

            decimal cashTotal = 0, cardTotal = 0;
            for (var i = 0; i < 3; i++)
            {
                var product = products[i % products.Count];
                var qty = 2m + i;
                var subtotal = qty * product.BasePrice;
                var tax = Math.Round(subtotal * product.TaxPercentage / 100m, 2);
                var method = i == 0 ? "cash" : "card";
                var order = new Order
                {
                    Id = Guid.NewGuid(), OrderNumber = $"ORD-TODAY-{branch.BranchCode}-{today:yyyyMMdd}-{i + 1}", Source = "pos",
                    BranchId = branch.Id, CashierId = cashier.Id, TerminalId = terminal?.Id, ShiftId = shift.Id,
                    OrderStatus = "delivered", PaymentStatus = "paid",
                    Subtotal = subtotal, TaxAmount = tax,
                    CustomFeeAmount = i == 2 ? 5m : 0m,
                    TotalAmount = subtotal + tax + (i == 2 ? 5m : 0m),
                    CreatedAt = today.AddHours(9).AddMinutes(i * 20), UpdatedAt = DateTime.UtcNow,
                };
                order.Items.Add(new OrderItem
                {
                    Id = Guid.NewGuid(), OrderId = order.Id, ProductId = product.Id,
                    Quantity = qty, UnitPrice = product.BasePrice, TotalPrice = subtotal, TaxAmount = tax,
                });
                order.Payments.Add(new OrderPayment
                {
                    Id = Guid.NewGuid(), OrderId = order.Id, PaymentMethod = method,
                    Amount = order.TotalAmount, Status = "completed", CreatedAt = order.CreatedAt,
                });
                db.Orders.Add(order);
                if (method == "cash") cashTotal += order.TotalAmount; else cardTotal += order.TotalAmount;
            }
            shift.CashSales = cashTotal;
            shift.CardSales = cardTotal;
            shift.TotalSales = cashTotal + cardTotal;
            await db.SaveChangesAsync();
        }

        // ── Today's staff attendance check-in ───────────────────────────────────
        var hasAttendanceToday = await db.StaffAttendances.AnyAsync(a => a.UserId == cashier.Id && a.CheckIn >= today);
        if (!hasAttendanceToday)
        {
            db.StaffAttendances.Add(new StaffAttendance
            {
                Id = Guid.NewGuid(), UserId = cashier.Id, BranchId = branch.Id,
                CheckIn = today.AddHours(8), Status = "present",
            });
            await db.SaveChangesAsync();
        }

        // ── This month's waste/spoilage event ───────────────────────────────────
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        // Must match the Waste/Spoilage report's own filter (AdjustmentType waste/damage) —
        // checking for "any adjustment this month" was a false positive whenever an unrelated
        // adjustment type (recount, expiry write-off, transfer correction, etc.) already existed
        // for the branch this month, which permanently skipped seeding an actual waste/damage row.
        var hasWasteThisMonth = await db.InventoryAdjustments.AnyAsync(a =>
            a.BranchId == branch.Id && a.CreatedAt >= monthStart && (a.AdjustmentType == "waste" || a.AdjustmentType == "damage"));
        if (!hasWasteThisMonth)
        {
            var wasteProduct = products[0];
            var batch = await db.InventoryBatches.FirstOrDefaultAsync(b => b.ProductId == wasteProduct.Id && b.BranchId == branch.Id);
            db.InventoryAdjustments.Add(new InventoryAdjustment
            {
                Id = Guid.NewGuid(), ProductId = wasteProduct.Id, BranchId = branch.Id, BatchId = batch?.Id,
                AdjustmentType = "damage", Quantity = 2, Reason = "Damaged packaging",
                Notes = "Found damaged during shelf restock", AdjustedBy = cashier.Id,
                CreatedAt = today.AddHours(10),
            });
            await db.SaveChangesAsync();
        }

        // ── This month's ZATCA invoice sample (Phase 2 onboarding isn't configured in this
        // demo environment, so the real checkout flow never creates one — without at least a
        // few rows here, the VAT/ZATCA report has nothing to show regardless of date filter) ──
        var hasInvoiceThisMonth = await db.ZatcaInvoices.AnyAsync(z => z.BranchId == branch.Id && z.CreatedAt >= monthStart);
        if (!hasInvoiceThisMonth)
        {
            var recentOrders = await db.Orders
                .Where(o => o.BranchId == branch.Id && o.PaymentStatus == "paid" && o.CreatedAt >= monthStart)
                .OrderByDescending(o => o.CreatedAt)
                .Take(3)
                .ToListAsync();
            var statuses = new[] { "accepted", "pending", "rejected" };
            for (var i = 0; i < recentOrders.Count; i++)
            {
                var o = recentOrders[i];
                db.ZatcaInvoices.Add(new ZatcaInvoice
                {
                    Id = Guid.NewGuid(), OrderId = o.Id, BranchId = branch.Id,
                    InvoiceNumber = $"INV-{o.OrderNumber}", InvoiceType = "simplified",
                    IssueDate = o.CreatedAt, TotalAmount = o.TotalAmount, TaxAmount = o.TaxAmount,
                    DiscountAmount = o.DiscountAmount, ZatcaStatus = statuses[i % statuses.Length],
                    ZatcaResponse = statuses[i % statuses.Length] == "rejected" ? "Invalid QR payload" : null,
                    CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
                });
            }
            if (recentOrders.Count > 0) await db.SaveChangesAsync();
        }

        // ── This month's customer return sample (Returns/Refunds defaults to the current
        // month — without at least one row here, that default view is empty until someone
        // actually processes a return this month) ──────────────────────────────────────────
        var hasReturnThisMonth = await db.CustomerReturns.AnyAsync(r => r.BranchId == branch.Id && r.CreatedAt >= monthStart);
        if (!hasReturnThisMonth)
        {
            var returnableOrder = await db.Orders.Include(o => o.Items)
                .Where(o => o.BranchId == branch.Id && o.PaymentStatus == "paid" && o.CreatedAt >= monthStart && o.Items.Any())
                .OrderByDescending(o => o.CreatedAt)
                .FirstOrDefaultAsync();
            var returnItem = returnableOrder?.Items.FirstOrDefault();
            if (returnableOrder is not null && returnItem is not null)
            {
                var ret = new CustomerReturn
                {
                    Id = Guid.NewGuid(), ReturnNumber = $"RET-TODAY-{branch.BranchCode}-{today:yyyyMMdd}",
                    OrderId = returnableOrder.Id, BranchId = branch.Id, ProcessedBy = cashier.Id,
                    ReturnType = "partial_return", RefundMethod = "cash", RefundAmount = returnItem.TotalPrice,
                    Reason = "Customer changed mind", Status = "completed", ApprovedBy = cashier.Id,
                    CreatedAt = today.AddHours(11),
                };
                ret.Items.Add(new CustomerReturnItem
                {
                    Id = Guid.NewGuid(), ReturnId = ret.Id, ProductId = returnItem.ProductId, OrderItemId = returnItem.Id,
                    Quantity = 1, UnitPrice = returnItem.UnitPrice, RefundAmount = returnItem.TotalPrice, Condition = "good",
                });
                db.CustomerReturns.Add(ret);
                await db.SaveChangesAsync();
            }
        }
    }

    // Repeated `export_report` audit entries from testing the same report many times over
    // (same report clicked minutes apart, over and over) are real events but add no signal —
    // they just bury genuine activity under a wall of near-identical rows. Keep only the most
    // recent handful and drop the rest; runs on every boot so the noise never re-accumulates
    // past a reasonable ceiling.
    private const int MaxKeptExportAuditLogs = 15;

    public static async Task PatchTrimExportAuditNoiseAsync(BaqalaDbContext db)
    {
        var exportLogIds = await db.AuditLogs
            .Where(a => a.Action == "export_report")
            .OrderByDescending(a => a.CreatedAt)
            .Skip(MaxKeptExportAuditLogs)
            .Select(a => a.Id)
            .ToListAsync();
        if (exportLogIds.Count == 0) return;

        foreach (var id in exportLogIds)
            db.AuditLogs.RemoveRange(db.AuditLogs.Where(a => a.Id == id));
        await db.SaveChangesAsync();
    }

    // Historical paid orders created before checkout reliably computed VAT have TaxAmount == 0
    // on the order and every line item even though Subtotal is nonzero — the Tax Report (which
    // sums OrderItem.TaxAmount) and the VAT/ZATCA report show these as a flat SAR 0 forever,
    // since nothing recomputes tax after the fact. Backfill each affected item from its own
    // product's real TaxPercentage (not a flat rate) so zero-rated products stay zero-rated
    // and the Tax Report's rate-based grouping stays meaningful.
    public static async Task PatchBackfillMissingOrderTaxAsync(BaqalaDbContext db)
    {
        // Checked per line item, not per order — a mixed-cart order can already have a nonzero
        // Order.TaxAmount (from whichever items DID get taxed at checkout) while a specific item
        // still sits at 0, and filtering at the order header would skip fixing that item forever.
        var paidOrders = await db.Orders.Include(o => o.Items).ThenInclude(i => i.Product)
            .Where(o => o.PaymentStatus == "paid")
            .ToListAsync();

        var touchedAny = false;
        foreach (var order in paidOrders)
        {
            var changed = false;
            foreach (var item in order.Items.Where(i => i.TaxAmount == 0))
            {
                var rate = item.Product?.TaxPercentage ?? 0m;
                var itemTaxable = item.TotalPrice - item.DiscountAmount;
                if (rate > 0 && itemTaxable > 0)
                {
                    item.TaxAmount = Math.Round(itemTaxable * rate / 100m, 2);
                    changed = true;
                }
            }
            if (!changed) continue;
            if (order.Subtotal <= 0)
                order.Subtotal = order.Items.Sum(i => i.TotalPrice);
            order.TaxAmount = order.Items.Sum(i => i.TaxAmount);
            order.TotalAmount = order.Subtotal - order.DiscountAmount + order.TaxAmount + order.CustomFeeAmount;
            touchedAny = true;
        }
        if (touchedAny) await db.SaveChangesAsync();
    }

    // Before OrdersController.Create() started writing CashSales/CardSales/DigitalSales/TotalSales
    // onto the cashier's active shift (commit 665a09b, 2026-07-10), every shift opened through the
    // real app had those fields permanently frozen at 0 — even though the underlying orders/payments
    // were correct — which fabricated a reconciliation variance at close-out. Recomputes every
    // shift's rollups (and variance/requires_approval for already-closed ones) straight from
    // order_payments rather than trusting stored state, so this is safe to re-run on every startup.
    public static async Task PatchBackfillShiftRollupsAsync(BaqalaDbContext db)
    {
        var shifts = await db.CashierShifts.ToListAsync();
        if (shifts.Count == 0) return;

        var payments = await db.OrderPayments
            .Where(p => p.Status == "completed" && p.Order!.ShiftId != null && p.Order.OrderStatus != "cancelled")
            .Select(p => new { ShiftId = p.Order!.ShiftId!.Value, p.PaymentMethod, p.Amount })
            .ToListAsync();
        var paymentsByShift = payments.GroupBy(p => p.ShiftId).ToDictionary(g => g.Key, g => g.ToList());

        var settingsByBranch = await db.PosSettings.ToDictionaryAsync(s => s.BranchId);

        var changed = false;
        foreach (var shift in shifts)
        {
            decimal cash = 0, card = 0, digital = 0;
            if (paymentsByShift.TryGetValue(shift.Id, out var shiftPayments))
            {
                foreach (var p in shiftPayments)
                {
                    switch (p.PaymentMethod)
                    {
                        case "cash": cash += p.Amount; break;
                        case "card": card += p.Amount; break;
                        default: digital += p.Amount; break;
                    }
                }
            }
            var total = cash + card + digital;

            if (shift.CashSales != cash || shift.CardSales != card || shift.DigitalSales != digital || shift.TotalSales != total)
            {
                shift.CashSales = cash;
                shift.CardSales = card;
                shift.DigitalSales = digital;
                shift.TotalSales = total;
                changed = true;
            }

            if (shift.Status == "closed" && shift.ClosingAmount.HasValue)
            {
                var newVariance = shift.ClosingAmount.Value - (shift.OpeningAmount + cash);
                // Mirrors ShiftsController.GetCashVarianceThresholdAsync exactly: no PosSettings
                // row for the branch means the 20 SAR default always applies; a row that exists
                // but has the approval gate switched off means no threshold is ever enforced.
                decimal? threshold = !settingsByBranch.TryGetValue(shift.BranchId, out var settings)
                    ? 20m
                    : settings.RequireManagerApprovalAboveCashThreshold ? settings.CashVarianceThresholdSar : null;
                var newRequiresApproval = threshold.HasValue && Math.Abs(newVariance) > threshold.Value;

                if (shift.Variance != newVariance || shift.RequiresApproval != newRequiresApproval)
                {
                    shift.Variance = newVariance;
                    shift.RequiresApproval = newRequiresApproval;
                    changed = true;
                }
            }
        }

        if (changed) await db.SaveChangesAsync();
    }

    // ─── Backfill: HRM Employees from existing POS/admin User accounts ──────
    // The HRM Employees module is a separate profile table from User (so staff who never log
    // into the POS, e.g. a baker, don't need a login) — but every existing User account IS a
    // real staff member (cashier, manager, etc.) who should already show up as an employee.
    // Runs every startup; idempotent via the UserId .Any() check below, so re-runs are a no-op
    // once every current user has a linked Employee row.
    public static async Task PatchBackfillEmployeesFromUsersAsync(BaqalaDbContext db)
    {
        var kioskRoleIds = await db.Roles
            .Where(r => r.Name == "Self-Checkout Kiosk")
            .Select(r => r.Id)
            .ToListAsync();

        var linkedUserIds = await db.Employees
            .Where(e => e.UserId != null)
            .Select(e => e.UserId!.Value)
            .ToListAsync();
        var linkedSet = linkedUserIds.ToHashSet();

        var users = await db.Users
            .Where(u => u.BranchId != null)
            .ToListAsync();
        var candidates = users.Where(u => !linkedSet.Contains(u.Id) && !kioskRoleIds.Contains(u.RoleId)).ToList();
        if (candidates.Count == 0) return;

        var lastCode = await db.Employees
            .Where(e => e.EmployeeCode.StartsWith("EMP-"))
            .OrderByDescending(e => e.EmployeeCode)
            .Select(e => e.EmployeeCode)
            .FirstOrDefaultAsync();
        int next = 1;
        if (lastCode is not null && int.TryParse(lastCode[4..], out int n)) next = n + 1;

        foreach (var user in candidates)
        {
            db.Employees.Add(new Employee
            {
                Id = Guid.NewGuid(),
                EmployeeCode = $"EMP-{next:D5}",
                FullName = user.FullName,
                Email = user.Email,
                // Placeholder — Users don't collect phone/national ID today. Kept unique per
                // employee (required index) and visibly a placeholder for the admin to replace
                // when they complete this employee's HR profile.
                Phone = user.Phone ?? "Not Provided",
                NationalId = $"PENDING-{user.Id:N}"[..20],
                BranchId = user.BranchId!.Value,
                RoleId = user.RoleId,
                UserId = user.Id,
                HireDate = DateOnly.FromDateTime(user.CreatedAt),
                EmploymentStatus = user.Status,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
            next++;
        }

        await db.SaveChangesAsync();
    }

    // ─── Backfill: HRM org structure (departments/designations) + assign existing employees ──
    // Employees backfilled from Users (above) had no department/designation — this gives the
    // Departments/Designations/Employees pages real, populated demo data instead of the single
    // manually-created "Grocery"/"Cashier" pair, matching each employee's existing ACL role.
    private static readonly (string Department, string Designation)[] HrmDesignationCatalog =
    [
        ("Administration",   "Store Manager"),
        ("Administration",   "Branch Manager"),
        ("Retail Operations", "Shift Supervisor"),
        ("Grocery",           "Cashier"),
        ("Grocery",           "Grocery Associate"),
        ("Finance & Accounts","Accountant"),
        ("Marketing",         "Marketing Executive"),
        ("Warehouse",         "Warehouse Assistant"),
        ("Warehouse",         "Inventory Officer"),
        ("Customer Service",  "Customer Service Representative"),
        ("Human Resources",   "HR Executive"),
        ("IT Support",        "IT Support Specialist"),
    ];

    // Maps each seeded Role.Name to the designation an employee holding that role should default
    // into. Roles not listed (e.g. Self-Checkout Kiosk) are left without a department/designation.
    private static readonly Dictionary<string, (string Department, string Designation)> RoleToDesignation = new()
    {
        ["Admin"]            = ("Administration",    "Store Manager"),
        ["Manager"]          = ("Administration",    "Branch Manager"),
        ["Supervisor"]       = ("Retail Operations",  "Shift Supervisor"),
        ["Cashier"]          = ("Grocery",            "Cashier"),
        ["Accountant"]       = ("Finance & Accounts", "Accountant"),
        ["Auditor"]          = ("Marketing",          "Marketing Executive"),
        ["Warehouse Staff"]  = ("Warehouse",           "Warehouse Assistant"),
        ["Inventory Staff"]  = ("Warehouse",           "Inventory Officer"),
    };

    public static async Task PatchSeedHrmOrgDataAsync(BaqalaDbContext db)
    {
        var departmentNames = HrmDesignationCatalog.Select(d => d.Department).Distinct().ToList();
        var existingDepartments = await db.Departments.ToListAsync();
        var departmentsByName = existingDepartments.ToDictionary(d => d.Name, StringComparer.OrdinalIgnoreCase);

        foreach (var name in departmentNames)
        {
            if (departmentsByName.ContainsKey(name)) continue;
            var dept = new Department { Id = Guid.NewGuid(), Name = name, BranchId = null, Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            db.Departments.Add(dept);
            departmentsByName[name] = dept;
        }
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();

        var existingDesignations = await db.Designations.ToListAsync();
        var designationsByKey = existingDesignations.ToDictionary(
            d => ((departmentsByName.Values.FirstOrDefault(dep => dep.Id == d.DepartmentId)?.Name ?? "").ToLowerInvariant(), d.Name.ToLowerInvariant()));

        foreach (var (deptName, desigName) in HrmDesignationCatalog)
        {
            var key = (deptName.ToLowerInvariant(), desigName.ToLowerInvariant());
            if (designationsByKey.ContainsKey(key)) continue;
            var dept = departmentsByName[deptName];
            var designation = new Designation { Id = Guid.NewGuid(), Name = desigName, DepartmentId = dept.Id, Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            db.Designations.Add(designation);
            designationsByKey[key] = designation;
        }
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();

        // Re-read so every designation has a real DepartmentId/Id (some may have just been added).
        var allDepartments = await db.Departments.ToDictionaryAsync(d => d.Name, StringComparer.OrdinalIgnoreCase);
        var allDesignations = await db.Designations.Include(d => d.Department).ToListAsync();

        var employees = await db.Employees
            .Where(e => e.DepartmentId == null && e.DesignationId == null && e.RoleId != null)
            .ToListAsync();
        if (employees.Count == 0) return;

        var roleNamesById = await db.Roles.ToDictionaryAsync(r => r.Id, r => r.Name);
        // NOTE: any further backfill logic that must always run (regardless of whether every
        // employee already has a department/designation) belongs in its own patch method, not
        // appended below this point — the early return above skips everything after it once
        // department/designation assignment has already completed on a prior startup.
        var changed = false;

        foreach (var employee in employees)
        {
            if (!roleNamesById.TryGetValue(employee.RoleId!.Value, out var roleName)) continue;
            if (!RoleToDesignation.TryGetValue(roleName, out var mapping)) continue;

            var designation = allDesignations.FirstOrDefault(d =>
                d.Name.Equals(mapping.Designation, StringComparison.OrdinalIgnoreCase) &&
                d.Department!.Name.Equals(mapping.Department, StringComparison.OrdinalIgnoreCase));
            if (designation is null) continue;

            employee.DepartmentId = designation.DepartmentId;
            employee.DesignationId = designation.Id;
            employee.UpdatedAt = DateTime.UtcNow;
            changed = true;
        }

        if (changed) await db.SaveChangesAsync();
    }

    // ─── Backfill: default contract details for employees backfilled from Users ────────────
    // Deliberately a separate method (not folded into PatchSeedHrmOrgDataAsync above) — that
    // method early-returns once every employee already has a department/designation, which
    // would silently skip this on every startup after the first.
    public static async Task PatchSeedHrmEmployeeContractDefaultsAsync(BaqalaDbContext db)
    {
        var employeesNeedingContract = await db.Employees.Where(e => e.ContractType == null && e.EmploymentStatus == "active").ToListAsync();
        if (employeesNeedingContract.Count == 0) return;

        foreach (var employee in employeesNeedingContract)
        {
            employee.ContractType = "Permanent";
            employee.ContractStartDate = employee.HireDate;
            employee.ContractOpenEnded = true;
            employee.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    // ─── Backfill: KSA holidays beyond the single manually-created demo entry ──────────────
    public static async Task PatchSeedHrmHolidaysAsync(BaqalaDbContext db)
    {
        var existingNames = await db.Holidays.Select(h => h.Name).ToListAsync();
        var existingSet = existingNames.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var candidates = new[]
        {
            ("Founding Day",        "Company Holiday", new DateOnly(2026, 2, 22)),
            ("Eid al-Fitr",          "Company Holiday", new DateOnly(2026, 3, 20)),
            ("Saudi National Day",  "Company Holiday", new DateOnly(2026, 9, 23)),
            ("Prophet's Birthday",  "Optional Holiday", new DateOnly(2026, 9, 4)),
        };

        var toAdd = candidates.Where(c => !existingSet.Contains(c.Item1)).ToList();
        if (toAdd.Count == 0) return;

        foreach (var (name, type, date) in toAdd)
        {
            db.Holidays.Add(new Holiday
            {
                Id = Guid.NewGuid(), Name = name, HolidayType = type, Date = date, BranchId = null,
                Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            });
        }
        await db.SaveChangesAsync();
    }

    // ─── Backfill: additional shift templates + assign every active employee without one ────
    public static async Task PatchSeedHrmShiftsAsync(BaqalaDbContext db)
    {
        var existingShifts = await db.WorkShifts.ToListAsync();
        var shiftsByName = existingShifts.ToDictionary(s => s.Name, StringComparer.OrdinalIgnoreCase);

        var catalog = new[]
        {
            ("Morning Shift", "Sun,Mon,Tue,Wed,Thu", "08:00", "16:00", "12:00", "12:30", 10, 5),
            ("Evening Shift",  "Sun,Mon,Tue,Wed,Thu", "14:00", "22:00", "18:00", "18:30", 10, 5),
            ("Night Shift",    "Sun,Mon,Tue,Wed,Thu,Fri,Sat", "22:00", "06:00", (string?)null, (string?)null, 15, 10),
        };

        foreach (var (name, days, start, end, brkStart, brkEnd, graceIn, graceOut) in catalog)
        {
            if (shiftsByName.ContainsKey(name)) continue;
            var shift = new WorkShift
            {
                Id = Guid.NewGuid(), Name = name, BranchId = null, DepartmentId = null,
                WorkingDays = days, StartTime = start, EndTime = end, BreakStart = brkStart, BreakEnd = brkEnd,
                GraceInMinutes = graceIn, GraceOutMinutes = graceOut, Status = "active",
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };
            db.WorkShifts.Add(shift);
            shiftsByName[name] = shift;
        }
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();

        // Assign a sensible default shift to every active employee who doesn't have one yet.
        // Office-style roles (Admin/Manager/Accountant/Marketing) default to Morning; frontline
        // roles alternate Morning/Evening by a stable hash so the demo data isn't monotonous.
        var activeAssignments = await db.EmployeeShiftAssignments.Where(a => a.Status == "active").ToListAsync();
        var assignedEmployeeIds = activeAssignments.Select(a => a.EmployeeId).ToHashSet();

        var employees = await db.Employees.Where(e => e.EmploymentStatus == "active").ToListAsync();
        var unassigned = employees.Where(e => !assignedEmployeeIds.Contains(e.Id)).ToList();
        if (unassigned.Count == 0) return;

        var morning = shiftsByName["Morning Shift"];
        var evening = shiftsByName["Evening Shift"];
        var effectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-30);
        var newAssignments = new List<EmployeeShiftAssignment>();

        foreach (var employee in unassigned)
        {
            var shift = (employee.EmployeeCode.GetHashCode() & 1) == 0 ? morning : evening;
            newAssignments.Add(new EmployeeShiftAssignment
            {
                Id = Guid.NewGuid(), EmployeeId = employee.Id, ShiftId = shift.Id,
                EffectiveFrom = effectiveFrom, EffectiveTo = null, Status = "active",
                AssignedBy = null, AssignedAt = DateTime.UtcNow,
            });
        }
        db.EmployeeShiftAssignments.AddRange(newAssignments);
        await db.SaveChangesAsync();
    }

    // ─── Backfill: attendance history for the last 10 days for every shift-assigned employee ─
    public static async Task PatchSeedHrmAttendanceAsync(BaqalaDbContext db)
    {
        var employees = await db.Employees.Where(e => e.EmploymentStatus == "active").ToListAsync();
        if (employees.Count == 0) return;

        var activeAssignments = await db.EmployeeShiftAssignments
            .Where(a => a.Status == "active")
            .ToListAsync();
        var shiftByEmployee = activeAssignments.GroupBy(a => a.EmployeeId).ToDictionary(g => g.Key, g => g.First().ShiftId);

        var shifts = await db.WorkShifts.ToDictionaryAsync(s => s.Id);

        var existingDates = await db.StaffAttendances
            .Where(a => a.EmployeeId != null)
            .Select(a => new { a.EmployeeId, a.Date })
            .ToListAsync();
        var existingSet = existingDates.Select(x => (x.EmployeeId, x.Date)).ToHashSet();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var rows = new List<StaffAttendance>();

        foreach (var employee in employees)
        {
            if (!shiftByEmployee.TryGetValue(employee.Id, out var shiftId)) continue;
            if (!shifts.TryGetValue(shiftId, out var shift)) continue;
            if (!TimeSpan.TryParse(shift.StartTime, out var startTime)) continue;

            // Deterministic per-employee pseudo-randomness so re-runs stay idempotent in spirit
            // (same seed → same pattern) without needing DateTime.Now-based randomness.
            // Mask rather than Math.Abs — GetHashCode() can return int.MinValue, which Math.Abs throws on.
            var seed = employee.Id.GetHashCode() & 0x7FFFFFFF;

            for (int dayOffset = 1; dayOffset <= 10; dayOffset++)
            {
                var date = today.AddDays(-dayOffset);
                if (existingSet.Contains((employee.Id, date))) continue;
                // Skip weekly off day if this shift doesn't run that day.
                var dayCode = date.DayOfWeek switch
                {
                    DayOfWeek.Sunday => "Sun", DayOfWeek.Monday => "Mon", DayOfWeek.Tuesday => "Tue",
                    DayOfWeek.Wednesday => "Wed", DayOfWeek.Thursday => "Thu", DayOfWeek.Friday => "Fri",
                    _ => "Sat",
                };
                if (!shift.WorkingDays.Contains(dayCode)) continue;

                var pattern = (seed + dayOffset) % 10;
                string status;
                DateTime? checkIn = null, checkOut = null;
                int lateMinutes = 0;

                if (pattern == 0)
                {
                    status = "absent";
                }
                else if (pattern == 1)
                {
                    status = "on_leave";
                }
                else
                {
                    var lateBy = pattern == 2 ? 20 : 0; // occasional late arrival
                    checkIn = date.ToDateTime(TimeOnly.FromTimeSpan(startTime)).AddMinutes(lateBy);
                    checkOut = date.ToDateTime(TimeOnly.FromTimeSpan(startTime)).AddHours(8);
                    lateMinutes = Math.Max(0, lateBy - shift.GraceInMinutes);
                    status = lateMinutes > 0 ? "late" : "present";
                }

                rows.Add(new StaffAttendance
                {
                    Id = Guid.NewGuid(),
                    UserId = employee.UserId,
                    BranchId = employee.BranchId,
                    EmployeeId = employee.Id,
                    Date = date,
                    ShiftId = shiftId,
                    CheckIn = checkIn,
                    CheckOut = checkOut,
                    Status = status,
                    LateMinutes = lateMinutes,
                    EarlyLeaveMinutes = 0,
                    RecordedBy = null,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }

        if (rows.Count == 0) return;
        db.StaffAttendances.AddRange(rows);
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Leave master data + default policy assignment + demo requests ───────────
    public static async Task PatchSeedHrmLeaveDataAsync(BaqalaDbContext db)
    {
        var existingTypeNames = (await db.LeaveTypes.Select(t => t.Name).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var typeCandidates = new[] { "Annual Leave", "Sick Leave", "Casual Leave", "Emergency Leave", "Unpaid Leave", "Maternity Leave", "Other" };
        foreach (var name in typeCandidates)
        {
            if (existingTypeNames.Contains(name)) continue;
            db.LeaveTypes.Add(new LeaveType { Id = Guid.NewGuid(), Name = name, Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
        }
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();

        var standardPolicy = await db.LeavePolicies.FirstOrDefaultAsync(p => p.Name == "Standard Leave Policy");
        if (standardPolicy is null)
        {
            standardPolicy = new LeavePolicy
            {
                Id = Guid.NewGuid(), Name = "Standard Leave Policy",
                AnnualDays = 21, SickDays = 10, CasualDays = 7, Status = "active",
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };
            db.LeavePolicies.Add(standardPolicy);
            await db.SaveChangesAsync();
        }

        var employeesNeedingPolicy = await db.Employees.Where(e => e.LeavePolicyId == null && e.EmploymentStatus == "active").ToListAsync();
        foreach (var employee in employeesNeedingPolicy)
        {
            employee.LeavePolicyId = standardPolicy.Id;
            employee.UpdatedAt = DateTime.UtcNow;
        }
        if (employeesNeedingPolicy.Count > 0) await db.SaveChangesAsync();

        if (await db.LeaveRequests.AnyAsync()) return; // demo requests already seeded

        var annual = await db.LeaveTypes.FirstAsync(t => t.Name == "Annual Leave");
        var sick = await db.LeaveTypes.FirstAsync(t => t.Name == "Sick Leave");
        var casual = await db.LeaveTypes.FirstAsync(t => t.Name == "Casual Leave");

        var byName = await db.Employees.ToDictionaryAsync(e => e.FullName, StringComparer.OrdinalIgnoreCase);
        var admin = await db.Users.FirstOrDefaultAsync(u => u.Username == "ahmad.aziz" || u.Email == "ahmad.aziz@mytm.co");

        var demo = new List<LeaveRequest>();
        void AddDemo(string employeeName, LeaveType type, DateOnly from, DateOnly to, string reason, string status, string? rejectionReason = null)
        {
            if (!byName.TryGetValue(employeeName, out var employee)) return;
            var totalDays = to.DayNumber - from.DayNumber + 1;
            demo.Add(new LeaveRequest
            {
                Id = Guid.NewGuid(), EmployeeId = employee.Id, LeaveTypeId = type.Id,
                FromDate = from, ToDate = to, TotalDays = totalDays, Reason = reason,
                Status = status,
                ApproverId = status is "approved" or "rejected" ? admin?.Id : null,
                ApprovedAt = status is "approved" or "rejected" ? DateTime.UtcNow : null,
                RejectionReason = rejectionReason,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            });
        }

        AddDemo("Omar Al Supervisor", annual, new DateOnly(2026, 7, 25), new DateOnly(2026, 7, 28), "Family vacation", "pending");
        AddDemo("Nora Al Cashier",    sick,   new DateOnly(2026, 7, 16), new DateOnly(2026, 7, 16), "Fever and headache", "approved");
        AddDemo("Reem Al Cashier",    casual, new DateOnly(2026, 7, 18), new DateOnly(2026, 7, 18), "Personal work", "rejected", "Insufficient staffing that day");
        AddDemo("Sara Al Manager",    annual, new DateOnly(2026, 8, 1),  new DateOnly(2026, 8, 5),  "Travel", "pending");

        if (demo.Count == 0) return;
        db.LeaveRequests.AddRange(demo);
        await db.SaveChangesAsync();

        // Mirror LeaveController.Approve's on_leave attendance write for the one demo request
        // that's already approved, so Attendance shows the same consistent picture.
        foreach (var leave in demo.Where(l => l.Status == "approved"))
        {
            var employee = await db.Employees.FindAsync(leave.EmployeeId);
            if (employee is null) continue;
            for (var date = leave.FromDate; date <= leave.ToDate; date = date.AddDays(1))
            {
                var exists = await db.StaffAttendances.AnyAsync(a => a.EmployeeId == leave.EmployeeId && a.Date == date);
                if (exists) continue;
                db.StaffAttendances.Add(new StaffAttendance
                {
                    Id = Guid.NewGuid(), UserId = employee.UserId, BranchId = employee.BranchId,
                    EmployeeId = employee.Id, Date = date, Status = "on_leave",
                    CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
                });
            }
        }
        await db.SaveChangesAsync();
    }

    // ─── Backfill: salary components per employee + one processed payroll run per branch ────
    private static readonly Dictionary<string, decimal> RoleBasicSalary = new()
    {
        ["Admin"] = 12000, ["Manager"] = 9000, ["Supervisor"] = 6500, ["Accountant"] = 7000,
        ["Auditor"] = 5500, ["Cashier"] = 4000, ["Warehouse Staff"] = 3800, ["Inventory Staff"] = 4200,
    };

    public static async Task PatchSeedHrmPayrollDataAsync(BaqalaDbContext db)
    {
        var employeesNeedingComponents = await db.Employees
            .Where(e => e.EmploymentStatus == "active" && e.RoleId != null)
            .ToListAsync();
        var haveComponents = (await db.SalaryComponents.Select(c => c.EmployeeId).Distinct().ToListAsync()).ToHashSet();
        var candidates = employeesNeedingComponents.Where(e => !haveComponents.Contains(e.Id)).ToList();

        if (candidates.Count > 0)
        {
            var roleNamesById = await db.Roles.ToDictionaryAsync(r => r.Id, r => r.Name);
            var components = new List<SalaryComponent>();
            var effectiveFrom = new DateOnly(2026, 6, 1);

            foreach (var employee in candidates)
            {
                if (!roleNamesById.TryGetValue(employee.RoleId!.Value, out var roleName)) continue;
                var basic = RoleBasicSalary.GetValueOrDefault(roleName, 4000);

                components.Add(new SalaryComponent { Id = Guid.NewGuid(), EmployeeId = employee.Id, ComponentName = "Basic Salary", ComponentType = "Earning", Amount = basic, Frequency = "Monthly", EffectiveFrom = effectiveFrom, Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
                components.Add(new SalaryComponent { Id = Guid.NewGuid(), EmployeeId = employee.Id, ComponentName = "Housing Allowance", ComponentType = "Earning", Amount = Math.Round(basic * 0.25m, 0), Frequency = "Monthly", EffectiveFrom = effectiveFrom, Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
                components.Add(new SalaryComponent { Id = Guid.NewGuid(), EmployeeId = employee.Id, ComponentName = "Transport Allowance", ComponentType = "Earning", Amount = 500, Frequency = "Monthly", EffectiveFrom = effectiveFrom, Status = "active", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
            }
            db.SalaryComponents.AddRange(components);
            await db.SaveChangesAsync();
        }

        if (await db.PayrollRuns.AnyAsync()) return; // demo runs already seeded

        var branches = await db.Branches.ToListAsync();
        var runs = new List<PayrollRun>();
        foreach (var branch in branches)
        {
            var hasEmployees = await db.Employees.AnyAsync(e => e.BranchId == branch.Id && e.EmploymentStatus == "active");
            if (!hasEmployees) continue;
            runs.Add(new PayrollRun
            {
                Id = Guid.NewGuid(), BranchId = branch.Id, Year = 2026, Month = 7,
                PayDate = new DateOnly(2026, 7, 31), Status = "Draft",
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            });
        }
        if (runs.Count == 0) return;
        db.PayrollRuns.AddRange(runs);
        await db.SaveChangesAsync();

        // Process each seeded run the same way PayrollController.Process does, so the demo data
        // shows a real Processed run with employee-level net pay, not just an empty Draft shell.
        foreach (var run in runs)
        {
            var employees = await db.Employees.Where(e => e.BranchId == run.BranchId && e.EmploymentStatus == "active").ToListAsync();
            var components = await db.SalaryComponents.Where(c => c.Status == "active").ToListAsync();
            var componentsByEmployee = components.GroupBy(c => c.EmployeeId).ToDictionary(g => g.Key, g => g.ToList());

            decimal total = 0;
            var rows = new List<PayrollRunEmployee>();
            foreach (var employee in employees)
            {
                var employeeComponents = componentsByEmployee.GetValueOrDefault(employee.Id, []);
                var basic = employeeComponents.FirstOrDefault(c => c.ComponentName == "Basic Salary")?.Amount ?? 0;
                var earnings = employeeComponents.Where(c => c.ComponentType == "Earning").Sum(c => c.Amount);
                var deductions = employeeComponents.Where(c => c.ComponentType == "Deduction").Sum(c => c.Amount);
                var net = earnings - deductions;
                rows.Add(new PayrollRunEmployee { Id = Guid.NewGuid(), PayrollRunId = run.Id, EmployeeId = employee.Id, BasicSalary = basic, GrossEarnings = earnings, TotalDeductions = deductions, NetPayable = net });
                total += net;
            }
            db.PayrollRunEmployees.AddRange(rows);
            run.Status = "Processed";
            run.EmployeeCount = rows.Count;
            run.TotalAmount = total;
            run.ProcessedAt = DateTime.UtcNow;
            run.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Offers ────────────────────────────────────────────────────
    private static async Task SeedOffersAsync(BaqalaDbContext db)
    {
        var now = DateTime.UtcNow;
        db.Offers.AddRange(
            new Offer { Id = Guid.NewGuid(), Name = "Buy 1 Get 1 Free",          OfferType = "bogo",          ItemsDescription = "Select beverages",    TriggerQuantity = 1, GetQuantity = 1, StartDate = now, EndDate = now.AddMonths(1), IsActive = true,  UsedCount = 2841, UsageLimit = 5000, CreatedAt = now, UpdatedAt = now },
            new Offer { Id = Guid.NewGuid(), Name = "Dairy Combo Deal",           OfferType = "combo",         ItemsDescription = "Milk + Laban + Bread", OfferPrice = 15.99m,                StartDate = now, EndDate = now.AddMonths(1), IsActive = true,  UsedCount = 980,  UsageLimit = 2000, CreatedAt = now, UpdatedAt = now },
            new Offer { Id = Guid.NewGuid(), Name = "Buy Tea Get Sugar 50% Off",  OfferType = "buy_a_get_b",   ItemsDescription = "Tea → Sugar 50% off",  TriggerQuantity = 1, GetQuantity = 1, DiscountPercentage = 50, StartDate = now, EndDate = now.AddMonths(1), IsActive = true,  UsedCount = 1000, UsageLimit = 1000, CreatedAt = now, UpdatedAt = now },
            new Offer { Id = Guid.NewGuid(), Name = "Lucky Draw — Spend 200 SAR", OfferType = "lucky_draw",    ItemsDescription = "Min basket ر.س 200",  MinBasketAmount = 200, Winners = 10,    StartDate = now, EndDate = now.AddMonths(1), IsActive = true,  UsedCount = 0,    UsageLimit = null, CreatedAt = now, UpdatedAt = now },
            new Offer { Id = Guid.NewGuid(), Name = "KitKat Chunky 25% Off",      OfferType = "product_offer", ItemsDescription = "KitKat Chunky",        DiscountPercentage = 25,               StartDate = now, EndDate = now.AddMonths(1), IsActive = false, UsedCount = 0,    UsageLimit = null, CreatedAt = now, UpdatedAt = now }
        );
        await db.SaveChangesAsync();
    }
}
