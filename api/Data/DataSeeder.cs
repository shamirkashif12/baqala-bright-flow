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
        var supAlmarai  = Supplier("SUP-001", "Almarai Company",       "Mohammed Al Otaibi", "+966501234567", "warehouse");
        var supNadec    = Supplier("SUP-002", "Nadec Foods",           "Khalid Al Shehri",   "+966552345678", "warehouse");
        var supAlRabie  = Supplier("SUP-003", "Al Rabie Saudi Foods",  "Sara Al Qahtani",    "+966563456789", "warehouse");
        var supSadia    = Supplier("SUP-004", "Sadia Saudi Arabia",    "Faisal Al Harbi",    "+966534567890", "mart_to_mart");
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
        var batchDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));

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
            var expiryDate = DateOnly.Parse(s.expiry);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
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
                Amount = 1250.00m, Description = "Monthly electricity bill — Olaya branch",
                ReferenceNumber = "ELEC-JUN-001", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-10)),
                Status = "approved", ApprovedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-10), UpdatedAt = DateTime.UtcNow.AddDays(-8)
            });

        if (typeMaint is not null && brKhobar is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMaint.Id, BranchId = brKhobar.Id,
                Amount = 450.00m, Description = "Air conditioning maintenance service",
                ReferenceNumber = "MAINT-AC-002", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-5)),
                Status = "pending",
                CreatedAt = DateTime.UtcNow.AddDays(-5), UpdatedAt = DateTime.UtcNow.AddDays(-5)
            });

        if (typeMeals is not null && brJeddah is not null && uSara is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMeals.Id, BranchId = brJeddah.Id,
                Amount = 185.00m, Description = "Staff lunch — peak shift team",
                RecordedBy = uSara.Id,
                ExpenseDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2)),
                Status = "approved", ApprovedBy = uSara.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow.AddDays(-1)
            });

        if (typeMkt is not null && brOlaya is not null)
            expenses.Add(new Expense
            {
                Id = Guid.NewGuid(), ExpenseTypeId = typeMkt.Id, BranchId = brOlaya.Id,
                Amount = 3200.00m, Description = "Social media ads — Ramadan campaign",
                ReferenceNumber = "MKT-RAM-003", RecordedBy = uAbdullah.Id,
                ExpenseDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-14)),
                Status = "approved", ApprovedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-14), UpdatedAt = DateTime.UtcNow.AddDays(-12)
            });

        db.Expenses.AddRange(expenses);
        await db.SaveChangesAsync();
    }

    // ─── Backfill: Coupons ───────────────────────────────────────────────────
    private static async Task SeedCouponsAsync(BaqalaDbContext db)
    {
        var uAbdullah = await db.Users.FirstOrDefaultAsync(u => u.Username == "abdullah.alfaisal");
        if (uAbdullah is null) return;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

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

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        db.TaxFeeRules.AddRange(
            new TaxFeeRule
            {
                Id = Guid.NewGuid(), RuleName = "Standard VAT 15%", RuleType = "vat",
                VatPercentage = 15, ApplicableTo = "all_products",
                ZatcaEnabled = true, IsTobacco = false,
                EffectiveDate = DateOnly.Parse("2020-07-01"), Status = "active",
                CreatedBy = uAbdullah.Id,
                CreatedAt = DateTime.UtcNow.AddDays(-365), UpdatedAt = DateTime.UtcNow
            },
            new TaxFeeRule
            {
                Id = Guid.NewGuid(), RuleName = "Tobacco Excise Tax (100%)", RuleType = "tobacco_excise",
                ExcisePercentage = 100, VatPercentage = 15,
                ApplicableTo = "all_products", IsTobacco = true, ZatcaEnabled = true,
                EffectiveDate = DateOnly.Parse("2020-07-01"), Status = "active",
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

    private static Supplier Supplier(string code, string name, string contact, string phone, string supplyType) => new()
    {
        Id = Guid.NewGuid(), SupplierCode = code, Name = name,
        ContactPerson = contact, ContactNumber = phone, SupplyType = supplyType,
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
                P(r, "Dashboard",      true,  true,  true,  true,  true,  true),
                P(r, "Orders",         true,  true,  true,  true,  true,  true),
                P(r, "Inventory",      true,  true,  true,  true,  true,  true),
                P(r, "Batches",        true,  true,  true,  true,  true,  true),
                P(r, "Warehouses",     true,  true,  true,  true,  true,  true),
                P(r, "Branches",       true,  true,  true,  true,  true,  true),
                P(r, "Users",          true,  true,  true,  true,  true,  true),
                P(r, "Cashier Shifts", true,  true,  true,  true,  true,  true),
                P(r, "Terminals",      true,  true,  true,  true,  true,  true),
                P(r, "Suppliers",      true,  true,  true,  true,  true,  true),
                P(r, "Customers",      true,  true,  true,  true,  true,  true),
                P(r, "Finance",        true,  true,  true,  true,  true,  true),
                P(r, "Tax & Fees",     true,  true,  true,  true,  true,  true),
                P(r, "Returns",        true,  true,  true,  true,  true,  true),
                P(r, "Reports",        true,  true,  true,  true,  true,  true),
                P(r, "Compliance",     true,  true,  true,  true,  true,  true),
                P(r, "Audit Logs",     true,  true,  true,  true,  true,  true),
                P(r, "Devices",        true,  true,  true,  true,  true,  true),
                P(r, "Rules Engine",   true,  true,  true,  true,  true,  true),
                P(r, "Settings",       true,  true,  true,  true,  true,  true),
                P(r, "Roles",          true,  true,  true,  true,  true,  true),
            },
            "Branch Manager" => new[]
            {
                P(r, "Dashboard",      true,  false, false, false, false, true),
                P(r, "Orders",         true,  true,  true,  false, true,  true),
                P(r, "Inventory",      true,  true,  true,  false, true,  true),
                P(r, "Batches",        true,  true,  true,  false, false, true),
                P(r, "Warehouses",     true,  true,  true,  false, true,  false),
                P(r, "Branches",       true,  false, true,  false, false, false),
                P(r, "Users",          true,  true,  true,  false, false, false),
                P(r, "Cashier Shifts", true,  false, false, false, true,  true),
                P(r, "Terminals",      true,  false, true,  false, false, false),
                P(r, "Suppliers",      true,  false, false, false, false, true),
                P(r, "Customers",      true,  true,  true,  false, false, true),
                P(r, "Finance",        true,  true,  true,  false, true,  true),
                P(r, "Tax & Fees",     true,  false, false, false, false, false),
                P(r, "Returns",        true,  true,  true,  false, true,  true),
                P(r, "Reports",        true,  false, false, false, false, true),
                P(r, "Compliance",     true,  false, false, false, false, false),
                P(r, "Audit Logs",     true,  false, false, false, false, true),
                P(r, "Devices",        true,  false, true,  false, false, false),
                P(r, "Rules Engine",   true,  false, false, false, false, false),
                P(r, "Settings",       true,  false, true,  false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
            },
            "Cashier" => new[]
            {
                P(r, "Dashboard",      true,  false, false, false, false, false),
                P(r, "Orders",         true,  true,  false, false, false, false),
                P(r, "Inventory",      true,  false, false, false, false, false),
                P(r, "Batches",        false, false, false, false, false, false),
                P(r, "Warehouses",     false, false, false, false, false, false),
                P(r, "Branches",       false, false, false, false, false, false),
                P(r, "Users",          false, false, false, false, false, false),
                P(r, "Cashier Shifts", true,  true,  false, false, false, false),
                P(r, "Terminals",      true,  false, false, false, false, false),
                P(r, "Suppliers",      false, false, false, false, false, false),
                P(r, "Customers",      true,  true,  false, false, false, false),
                P(r, "Finance",        false, false, false, false, false, false),
                P(r, "Tax & Fees",     true,  false, false, false, false, false),
                P(r, "Returns",        true,  true,  false, false, true,  false),
                P(r, "Reports",        true,  false, false, false, false, false),
                P(r, "Compliance",     false, false, false, false, false, false),
                P(r, "Audit Logs",     false, false, false, false, false, false),
                P(r, "Devices",        false, false, false, false, false, false),
                P(r, "Rules Engine",   false, false, false, false, false, false),
                P(r, "Settings",       false, false, false, false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
            },
            "Storekeeper" => new[]
            {
                P(r, "Dashboard",      true,  false, false, false, false, false),
                P(r, "Orders",         true,  false, false, false, false, false),
                P(r, "Inventory",      true,  true,  true,  false, true,  true),
                P(r, "Batches",        true,  true,  true,  false, false, true),
                P(r, "Warehouses",     true,  true,  true,  false, true,  false),
                P(r, "Branches",       false, false, false, false, false, false),
                P(r, "Users",          false, false, false, false, false, false),
                P(r, "Cashier Shifts", false, false, false, false, false, false),
                P(r, "Terminals",      false, false, false, false, false, false),
                P(r, "Suppliers",      true,  false, false, false, false, false),
                P(r, "Customers",      false, false, false, false, false, false),
                P(r, "Finance",        false, false, false, false, false, false),
                P(r, "Tax & Fees",     false, false, false, false, false, false),
                P(r, "Returns",        false, false, false, false, false, false),
                P(r, "Reports",        true,  false, false, false, false, true),
                P(r, "Compliance",     false, false, false, false, false, false),
                P(r, "Audit Logs",     false, false, false, false, false, false),
                P(r, "Devices",        true,  false, true,  false, false, false),
                P(r, "Rules Engine",   false, false, false, false, false, false),
                P(r, "Settings",       false, false, false, false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
            },
            "Supervisor" => new[]
            {
                P(r, "Dashboard",      true,  false, false, false, false, true),
                P(r, "Orders",         true,  true,  true,  false, true,  true),
                P(r, "Inventory",      true,  true,  true,  false, true,  true),
                P(r, "Batches",        true,  false, false, false, false, true),
                P(r, "Warehouses",     true,  true,  true,  false, true,  false),
                P(r, "Branches",       true,  false, false, false, false, false),
                P(r, "Users",          true,  false, false, false, false, false),
                P(r, "Cashier Shifts", true,  true,  true,  false, true,  true),
                P(r, "Terminals",      true,  false, false, false, false, false),
                P(r, "Suppliers",      true,  false, false, false, false, false),
                P(r, "Customers",      true,  true,  true,  false, false, false),
                P(r, "Finance",        true,  false, false, false, true,  true),
                P(r, "Tax & Fees",     true,  false, false, false, false, false),
                P(r, "Returns",        true,  true,  true,  false, true,  true),
                P(r, "Reports",        true,  false, false, false, false, true),
                P(r, "Compliance",     true,  false, false, false, false, false),
                P(r, "Audit Logs",     true,  false, false, false, false, false),
                P(r, "Devices",        true,  false, true,  false, false, false),
                P(r, "Rules Engine",   false, false, false, false, false, false),
                P(r, "Settings",       true,  false, false, false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
            },
            "Finance User" => new[]
            {
                P(r, "Dashboard",      true,  false, false, false, false, true),
                P(r, "Orders",         true,  false, false, false, false, true),
                P(r, "Inventory",      true,  false, false, false, false, true),
                P(r, "Batches",        false, false, false, false, false, false),
                P(r, "Warehouses",     true,  false, false, false, false, false),
                P(r, "Branches",       true,  false, false, false, false, false),
                P(r, "Users",          true,  false, false, false, false, false),
                P(r, "Cashier Shifts", true,  false, false, false, false, true),
                P(r, "Terminals",      false, false, false, false, false, false),
                P(r, "Suppliers",      true,  false, false, false, false, true),
                P(r, "Customers",      true,  false, false, false, false, true),
                P(r, "Finance",        true,  true,  true,  true,  true,  true),
                P(r, "Tax & Fees",     true,  true,  true,  true,  true,  true),
                P(r, "Returns",        true,  false, false, false, true,  true),
                P(r, "Reports",        true,  false, false, false, false, true),
                P(r, "Compliance",     true,  false, false, false, false, true),
                P(r, "Audit Logs",     true,  false, false, false, false, true),
                P(r, "Devices",        false, false, false, false, false, false),
                P(r, "Rules Engine",   true,  false, false, false, false, false),
                P(r, "Settings",       false, false, false, false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
            },
            "Marketing User" => new[]
            {
                P(r, "Dashboard",      true,  false, false, false, false, true),
                P(r, "Orders",         true,  false, false, false, false, true),
                P(r, "Inventory",      true,  false, false, false, false, true),
                P(r, "Batches",        false, false, false, false, false, false),
                P(r, "Warehouses",     false, false, false, false, false, false),
                P(r, "Branches",       true,  false, false, false, false, false),
                P(r, "Users",          false, false, false, false, false, false),
                P(r, "Cashier Shifts", false, false, false, false, false, false),
                P(r, "Terminals",      false, false, false, false, false, false),
                P(r, "Suppliers",      false, false, false, false, false, false),
                P(r, "Customers",      true,  true,  true,  false, false, true),
                P(r, "Finance",        true,  false, false, false, false, true),
                P(r, "Tax & Fees",     false, false, false, false, false, false),
                P(r, "Returns",        true,  false, false, false, false, true),
                P(r, "Reports",        true,  false, false, false, false, true),
                P(r, "Compliance",     false, false, false, false, false, false),
                P(r, "Audit Logs",     false, false, false, false, false, false),
                P(r, "Devices",        false, false, false, false, false, false),
                P(r, "Rules Engine",   true,  false, false, false, false, false),
                P(r, "Settings",       false, false, false, false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
            },
            "Picker" => new[]
            {
                P(r, "Dashboard",      false, false, false, false, false, false),
                P(r, "Orders",         true,  false, false, false, false, false),
                P(r, "Inventory",      true,  false, false, false, false, false),
                P(r, "Batches",        false, false, false, false, false, false),
                P(r, "Warehouses",     true,  false, false, false, false, false),
                P(r, "Branches",       false, false, false, false, false, false),
                P(r, "Users",          false, false, false, false, false, false),
                P(r, "Cashier Shifts", false, false, false, false, false, false),
                P(r, "Terminals",      false, false, false, false, false, false),
                P(r, "Suppliers",      false, false, false, false, false, false),
                P(r, "Customers",      false, false, false, false, false, false),
                P(r, "Finance",        false, false, false, false, false, false),
                P(r, "Tax & Fees",     false, false, false, false, false, false),
                P(r, "Returns",        false, false, false, false, false, false),
                P(r, "Reports",        false, false, false, false, false, false),
                P(r, "Compliance",     false, false, false, false, false, false),
                P(r, "Audit Logs",     false, false, false, false, false, false),
                P(r, "Devices",        false, false, false, false, false, false),
                P(r, "Rules Engine",   false, false, false, false, false, false),
                P(r, "Settings",       false, false, false, false, false, false),
                P(r, "Roles",          false, false, false, false, false, false),
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
}
