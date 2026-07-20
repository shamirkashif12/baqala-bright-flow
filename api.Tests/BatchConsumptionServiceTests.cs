using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace BaqalaPOS.Api.Tests;

// FRD §13 — FIFO / FEFO picking, and the batch costing that rides on it.
public class BatchConsumptionServiceTests
{
    private static readonly Guid Branch = Guid.NewGuid();
    private static readonly Guid Warehouse = Guid.NewGuid();
    private static readonly Guid ProductId = Guid.NewGuid();

    private static BaqalaDbContext NewDb() =>
        new(new DbContextOptionsBuilder<BaqalaDbContext>()
            .UseInMemoryDatabase($"batches-{Guid.NewGuid()}")
            .Options);

    private static InventoryBatch Batch(
        string number, decimal qty, DateTime? expiry, DateTime received,
        decimal? cost = null, Guid? branchId = null, Guid? warehouseId = null, string status = "active") => new()
        {
            Id = Guid.NewGuid(),
            BatchNumber = number,
            ProductId = ProductId,
            BranchId = warehouseId.HasValue ? null : (branchId ?? Branch),
            WarehouseId = warehouseId,
            Quantity = qty,
            RemainingQuantity = qty,
            PurchaseCost = cost,
            ExpiryDate = expiry,
            ReceivedDate = received,
            Status = status,
        };

    private static void SetStrategy(BaqalaDbContext db, string strategy) =>
        db.TenantSettings.Add(new TenantSetting
        {
            Id = Guid.NewGuid(),
            BranchId = Branch,
            SettingKey = BatchConsumptionService.StrategySettingKey,
            SettingValue = strategy,
        });

    // ─── Strategy resolution ─────────────────────────────────────────────────

    [Fact]
    public async Task DefaultsToFefo_WhenNoSettingExists()
    {
        // The behaviour this service has always had. An unconfigured tenant must see no change.
        using var db = NewDb();
        Assert.Equal(BatchConsumptionService.Fefo, await new BatchConsumptionService(db).GetStrategyAsync(Branch));
    }

    [Fact]
    public async Task ReadsFifoFromTenantSettings()
    {
        using var db = NewDb();
        SetStrategy(db, "fifo");
        await db.SaveChangesAsync();

        Assert.Equal(BatchConsumptionService.Fifo, await new BatchConsumptionService(db).GetStrategyAsync(Branch));
    }

    [Fact]
    public async Task FallsBackToFefo_OnAnUnrecognisedSetting()
    {
        // A typo in a settings row must never be able to fail a sale.
        using var db = NewDb();
        SetStrategy(db, "lifo-oops");
        await db.SaveChangesAsync();

        Assert.Equal(BatchConsumptionService.Fefo, await new BatchConsumptionService(db).GetStrategyAsync(Branch));
    }

    [Fact]
    public async Task WarehousePicking_UsesTheDefaultStrategy()
    {
        // tenant_settings.branch_id is required, so a warehouse has nowhere to hang a setting.
        using var db = NewDb();
        Assert.Equal(BatchConsumptionService.Fefo, await new BatchConsumptionService(db).GetStrategyAsync(null));
    }

    // ─── FEFO ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Fefo_TakesEarliestExpiryFirst_RegardlessOfReceiptOrder()
    {
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            // Received first, but expires later.
            Batch("OLD-RECEIPT", 10, expiry: DateTime.UtcNow.AddDays(30), received: DateTime.UtcNow.AddDays(-10)),
            // Received later, but expires sooner — FEFO must take this one.
            Batch("SOON-EXPIRY", 10, expiry: DateTime.UtcNow.AddDays(2), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 5);

        Assert.Equal("SOON-EXPIRY", Assert.Single(consumed).BatchNumber);
    }

    [Fact]
    public async Task Fefo_SortsBatchesWithNoExpiryLast()
    {
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            Batch("NO-EXPIRY", 10, expiry: null, received: DateTime.UtcNow.AddDays(-20)),
            Batch("HAS-EXPIRY", 10, expiry: DateTime.UtcNow.AddDays(5), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 5);

        Assert.Equal("HAS-EXPIRY", Assert.Single(consumed).BatchNumber);
    }

    // ─── FIFO ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Fifo_TakesEarliestReceivedFirst_EvenWhenAnotherExpiresSooner()
    {
        // The defining difference from FEFO — same fixture as the FEFO test above, opposite answer.
        using var db = NewDb();
        SetStrategy(db, "fifo");
        db.InventoryBatches.AddRange(
            Batch("OLD-RECEIPT", 10, expiry: DateTime.UtcNow.AddDays(30), received: DateTime.UtcNow.AddDays(-10)),
            Batch("SOON-EXPIRY", 10, expiry: DateTime.UtcNow.AddDays(2), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 5);

        Assert.Equal("OLD-RECEIPT", Assert.Single(consumed).BatchNumber);
    }

    [Fact]
    public async Task ExplicitStrategyArgument_OverridesTheConfiguredOne()
    {
        using var db = NewDb();
        SetStrategy(db, "fefo");
        db.InventoryBatches.AddRange(
            Batch("OLD-RECEIPT", 10, expiry: DateTime.UtcNow.AddDays(30), received: DateTime.UtcNow.AddDays(-10)),
            Batch("SOON-EXPIRY", 10, expiry: DateTime.UtcNow.AddDays(2), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db)
            .ConsumeFefoAsync(ProductId, Branch, null, 5, strategy: BatchConsumptionService.Fifo);

        Assert.Equal("OLD-RECEIPT", Assert.Single(consumed).BatchNumber);
    }

    // ─── Consumption mechanics ───────────────────────────────────────────────

    [Fact]
    public async Task SpansMultipleBatches_WhenOneCannotCoverTheQuantity()
    {
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            Batch("FIRST", 3, expiry: DateTime.UtcNow.AddDays(1), received: DateTime.UtcNow.AddDays(-5)),
            Batch("SECOND", 10, expiry: DateTime.UtcNow.AddDays(9), received: DateTime.UtcNow.AddDays(-4)));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 8);

        Assert.Equal(2, consumed.Count);
        Assert.Equal(3, consumed[0].Quantity);   // drained
        Assert.Equal(5, consumed[1].Quantity);   // remainder
        Assert.Equal(8, consumed.Sum(c => c.Quantity));
    }

    [Fact]
    public async Task MarksABatchConsumed_OnceItIsExhausted()
    {
        // Nothing ever wrote this status before, even though the consume filter and RestoreFefoAsync's
        // revival both already branched on it — so an emptied lot stayed "active" forever.
        using var db = NewDb();
        db.InventoryBatches.Add(Batch("ONLY", 5, expiry: DateTime.UtcNow.AddDays(3), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 5);

        var batch = await db.InventoryBatches.SingleAsync();
        Assert.Equal(0, batch.RemainingQuantity);
        Assert.Equal("consumed", batch.Status);
    }

    [Fact]
    public async Task LeavesAPartiallyDrawnBatchActive()
    {
        using var db = NewDb();
        db.InventoryBatches.Add(Batch("ONLY", 5, expiry: DateTime.UtcNow.AddDays(3), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 2);

        var batch = await db.InventoryBatches.SingleAsync();
        Assert.Equal(3, batch.RemainingQuantity);
        Assert.Equal("active", batch.Status);
    }

    [Fact]
    public async Task NeverConsumesExpiredOrAlreadyConsumedBatches()
    {
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            Batch("EXPIRED", 10, expiry: DateTime.UtcNow.AddDays(-1), received: DateTime.UtcNow.AddDays(-20), status: "expired"),
            Batch("USED-UP", 10, expiry: DateTime.UtcNow.AddDays(1), received: DateTime.UtcNow.AddDays(-15), status: "consumed"),
            Batch("GOOD", 10, expiry: DateTime.UtcNow.AddDays(20), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 4);

        Assert.Equal("GOOD", Assert.Single(consumed).BatchNumber);
    }

    [Fact]
    public async Task ReturnsNothing_ForANonBatchTrackedProduct()
    {
        // Batch tracking is optional per product — no batches is not an error.
        using var db = NewDb();
        Assert.Empty(await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 5));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task IgnoresNonPositiveQuantities(decimal qty)
    {
        using var db = NewDb();
        db.InventoryBatches.Add(Batch("ONLY", 5, expiry: DateTime.UtcNow.AddDays(3), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        Assert.Empty(await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, qty));
        Assert.Equal(5, (await db.InventoryBatches.SingleAsync()).RemainingQuantity);
    }

    [Fact]
    public async Task DoesNotCrossLocations()
    {
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            Batch("BRANCH", 10, expiry: DateTime.UtcNow.AddDays(9), received: DateTime.UtcNow.AddDays(-1)),
            Batch("WAREHOUSE", 10, expiry: DateTime.UtcNow.AddDays(1), received: DateTime.UtcNow.AddDays(-1), warehouseId: Warehouse));
        await db.SaveChangesAsync();

        var fromBranch = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 4);
        Assert.Equal("BRANCH", Assert.Single(fromBranch).BatchNumber);

        var fromWarehouse = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, null, Warehouse, 4);
        Assert.Equal("WAREHOUSE", Assert.Single(fromWarehouse).BatchNumber);
    }

    // ─── FIFO costing ────────────────────────────────────────────────────────

    [Fact]
    public async Task ReportsTheActualCostOfEachLotDrawn()
    {
        // The point of the whole exercise: a sale spanning two lots bought at different prices costs
        // what those lots actually cost, not qty × today's CostPrice.
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            Batch("CHEAP", 3, expiry: DateTime.UtcNow.AddDays(1), received: DateTime.UtcNow.AddDays(-5), cost: 4m),
            Batch("DEAR", 10, expiry: DateTime.UtcNow.AddDays(9), received: DateTime.UtcNow.AddDays(-4), cost: 6m));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 8);

        Assert.Equal(4m, consumed[0].UnitCost);
        Assert.Equal(12m, consumed[0].LineCost);   // 3 × 4
        Assert.Equal(6m, consumed[1].UnitCost);
        Assert.Equal(30m, consumed[1].LineCost);   // 5 × 6
        Assert.Equal(42m, consumed.Sum(c => c.LineCost ?? 0));
    }

    [Fact]
    public async Task LineCostIsNull_WhenTheLotHasNoRecordedCost()
    {
        // Null must not collapse to zero: a zero would understate COGS and inflate margin, which is
        // worse than the caller knowing the cost is unknown. OrdersController only writes
        // CostAmount when every consumed lot knew its cost.
        using var db = NewDb();
        db.InventoryBatches.Add(Batch("UNKNOWN-COST", 5, expiry: DateTime.UtcNow.AddDays(3), received: DateTime.UtcNow.AddDays(-1), cost: null));
        await db.SaveChangesAsync();

        var consumed = await new BatchConsumptionService(db).ConsumeFefoAsync(ProductId, Branch, null, 2);

        var line = Assert.Single(consumed);
        Assert.Null(line.UnitCost);
        Assert.Null(line.LineCost);
    }

    // ─── Restore ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Restore_CreditsBackInTheSameOrderConsumptionUsed()
    {
        using var db = NewDb();
        db.InventoryBatches.AddRange(
            Batch("FIRST", 3, expiry: DateTime.UtcNow.AddDays(1), received: DateTime.UtcNow.AddDays(-5)),
            Batch("SECOND", 10, expiry: DateTime.UtcNow.AddDays(9), received: DateTime.UtcNow.AddDays(-4)));
        await db.SaveChangesAsync();

        var svc = new BatchConsumptionService(db);
        await svc.ConsumeFefoAsync(ProductId, Branch, null, 8);
        await svc.RestoreFefoAsync(ProductId, Branch, null, 8);

        // Back to exactly where it started — a void must be a true inverse of the sale.
        foreach (var b in await db.InventoryBatches.ToListAsync())
            Assert.Equal(b.Quantity, b.RemainingQuantity);
    }

    [Fact]
    public async Task Restore_RevivesAConsumedBatch()
    {
        using var db = NewDb();
        db.InventoryBatches.Add(Batch("ONLY", 5, expiry: DateTime.UtcNow.AddDays(3), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var svc = new BatchConsumptionService(db);
        await svc.ConsumeFefoAsync(ProductId, Branch, null, 5);
        Assert.Equal("consumed", (await db.InventoryBatches.SingleAsync()).Status);

        await svc.RestoreFefoAsync(ProductId, Branch, null, 5);

        var batch = await db.InventoryBatches.SingleAsync();
        Assert.Equal(5, batch.RemainingQuantity);
        Assert.Equal("active", batch.Status);
    }

    [Fact]
    public async Task Restore_NeverExceedsTheOriginallyReceivedQuantity()
    {
        // RemainingQuantity can rise, Quantity never does — the convention InventoryController.Adjust
        // and StockTransfersController.RestoreSourceAsync already follow.
        using var db = NewDb();
        db.InventoryBatches.Add(Batch("ONLY", 5, expiry: DateTime.UtcNow.AddDays(3), received: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var svc = new BatchConsumptionService(db);
        await svc.ConsumeFefoAsync(ProductId, Branch, null, 2);
        await svc.RestoreFefoAsync(ProductId, Branch, null, 99);

        var batch = await db.InventoryBatches.SingleAsync();
        Assert.Equal(5, batch.RemainingQuantity);
        Assert.Equal(5, batch.Quantity);
    }

    [Fact]
    public async Task Restore_DoesNotReviveAnExpiredBatch()
    {
        using var db = NewDb();
        var expired = Batch("EXPIRED", 10, expiry: DateTime.UtcNow.AddDays(-1), received: DateTime.UtcNow.AddDays(-20), status: "expired");
        expired.RemainingQuantity = 0;
        db.InventoryBatches.Add(expired);
        await db.SaveChangesAsync();

        await new BatchConsumptionService(db).RestoreFefoAsync(ProductId, Branch, null, 5);

        var batch = await db.InventoryBatches.SingleAsync();
        Assert.Equal(0, batch.RemainingQuantity);
        Assert.Equal("expired", batch.Status);
    }
}
