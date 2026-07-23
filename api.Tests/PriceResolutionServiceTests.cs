using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace BaqalaPOS.Api.Tests;

// FRD §12 — branch-based, customer-tier, scheduled and pack pricing.
//
// The single most important test here is ResolvesToBasePrice_WhenNoRulesExist: activating this
// table must not change a single price on an existing database, and that test is what says so.
public class PriceResolutionServiceTests
{
    private static readonly Guid BranchA = Guid.NewGuid();
    private static readonly Guid BranchB = Guid.NewGuid();

    // Unique database name per context so tests can't leak state into each other.
    private static BaqalaDbContext NewDb() =>
        new(new DbContextOptionsBuilder<BaqalaDbContext>()
            .UseInMemoryDatabase($"pricing-{Guid.NewGuid()}")
            // The in-memory provider can't honour the relational FK/index metadata in
            // OnModelCreating; the warning is expected and irrelevant to resolution logic.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static Guid SeedProduct(BaqalaDbContext db, decimal basePrice = 10m)
    {
        var id = Guid.NewGuid();
        db.Products.Add(new Product { Id = id, Sku = $"SKU-{id.ToString()[..6]}", Name = "Test Product", BasePrice = basePrice });
        db.SaveChanges();
        return id;
    }

    private static ProductPriceList Rule(Guid productId, decimal price, Guid? branchId = null,
        string? tier = null, DateTime? from = null, DateTime? to = null,
        string unitType = "unit", decimal? packSize = null, int priority = 0, bool active = true,
        string? packBarcode = null) => new()
        {
            Id = Guid.NewGuid(),
            ProductId = productId,
            BranchId = branchId,
            Price = price,
            PriceType = "standard",
            MinCustomerTier = tier,
            EffectiveFrom = from ?? DateTime.UtcNow.AddDays(-1),
            EffectiveTo = to,
            UnitType = unitType,
            PackSize = packSize,
            PackBarcode = packBarcode,
            Priority = priority,
            IsActive = active,
        };

    // ─── Backwards compatibility ─────────────────────────────────────────────

    [Fact]
    public async Task ResolvesToBasePrice_WhenNoRulesExist()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 12.5m);
        var svc = new PriceResolutionService(db);

        var result = await svc.ResolveAsync(productId, BranchA, customerTier: null);

        Assert.Equal(12.5m, result.UnitPrice);
        Assert.Equal(12.5m, result.BasePrice);
        Assert.Equal("base", result.Source);
        Assert.Null(result.PriceListId);
        Assert.Empty(result.Packs);
    }

    [Fact]
    public async Task IgnoresInactiveRules()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 5m, active: false));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(10m, result.UnitPrice);
        Assert.Equal("base", result.Source);
    }

    [Fact]
    public async Task IgnoresRulesForAnotherPriceType()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        var rule = Rule(productId, 5m);
        rule.PriceType = "wholesale";
        db.ProductPriceLists.Add(rule);
        await db.SaveChangesAsync();

        var standard = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);
        Assert.Equal(10m, standard.UnitPrice);

        var wholesale = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null, priceType: "wholesale");
        Assert.Equal(5m, wholesale.UnitPrice);
    }

    // ─── Branch-based pricing ────────────────────────────────────────────────

    [Fact]
    public async Task BranchRule_AppliesOnlyToThatBranch()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 7m, branchId: BranchA));
        await db.SaveChangesAsync();

        var inA = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);
        var inB = await new PriceResolutionService(db).ResolveAsync(productId, BranchB, null);

        Assert.Equal(7m, inA.UnitPrice);
        Assert.Equal("branch", inA.Source);
        // BranchB has no rule of its own and the only rule is scoped elsewhere — falls back.
        Assert.Equal(10m, inB.UnitPrice);
        Assert.Equal("base", inB.Source);
    }

    [Fact]
    public async Task BranchRule_BeatsTenantWideRule()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 9m));                       // tenant-wide
        db.ProductPriceLists.Add(Rule(productId, 7m, branchId: BranchA));    // branch-specific
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(7m, result.UnitPrice);
        Assert.Equal("branch", result.Source);
    }

    [Fact]
    public async Task TenantWideRule_AppliesToEveryBranch()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 8m));
        await db.SaveChangesAsync();

        Assert.Equal(8m, (await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null)).UnitPrice);
        Assert.Equal(8m, (await new PriceResolutionService(db).ResolveAsync(productId, BranchB, null)).UnitPrice);
    }

    // ─── Customer-group (tier) pricing ───────────────────────────────────────

    [Fact]
    public async Task TierRule_DoesNotApplyToAnonymousWalkIn()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        // An anonymous shopper has no tier at all, so they never match a gated rule — even one
        // gated at "standard", the lowest tier.
        db.ProductPriceLists.Add(Rule(productId, 6m, tier: "standard"));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, customerTier: null);

        Assert.Equal(10m, result.UnitPrice);
        Assert.Equal("base", result.Source);
    }

    [Theory]
    [InlineData("silver", 6.0)]     // exact match
    [InlineData("gold", 10.0)]      // a different tier — excluded, falls back to base
    [InlineData("platinum", 10.0)]  // a different tier — excluded, falls back to base
    [InlineData("standard", 10.0)]  // a different tier — excluded, falls back to base
    public async Task TierRule_AppliesOnlyToTheExactGatedTier(string tier, double expected)
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 6m, tier: "silver"));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, tier);

        Assert.Equal((decimal)expected, result.UnitPrice);
    }

    [Fact]
    public async Task SelectingSeveralTiers_IsOneIndependentRowPerTier()
    {
        // "Select any tiers" for one special price (e.g. silver + platinum, skipping gold) is
        // expressed as one row per selected tier — a gold customer must not match either row.
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 9m));                  // everyone
        db.ProductPriceLists.Add(Rule(productId, 7m, tier: "silver"));
        db.ProductPriceLists.Add(Rule(productId, 7m, tier: "platinum"));
        await db.SaveChangesAsync();

        var silver = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, "silver");
        var platinum = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, "platinum");
        var gold = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, "gold");

        Assert.Equal(7m, silver.UnitPrice);
        Assert.Equal("tier", silver.Source);
        Assert.Equal(7m, platinum.UnitPrice);
        Assert.Equal("tier", platinum.Source);
        Assert.Equal(9m, gold.UnitPrice);  // not selected — falls back to the tenant-wide price
        Assert.Equal("list", gold.Source);
    }

    [Fact]
    public async Task TierScope_BeatsBranchScope_ForAQualifyingCustomer()
    {
        // A customer's tier price is a loyalty benefit that wins over an ordinary branch price:
        // a gold shopper at a branch that has its own shelf price still gets the gold price. This
        // is the behaviour the merchant expects ("the platinum price should apply, not the branch
        // price"). A walk-in still gets the branch price — see the next test.
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 6m, tier: "gold"));       // tenant-wide, gold
        db.ProductPriceLists.Add(Rule(productId, 8m, branchId: BranchA));  // branch A, everyone
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, "gold");

        Assert.Equal(6m, result.UnitPrice);
        Assert.Equal("tier", result.Source);
    }

    [Fact]
    public async Task BranchPrice_StillAppliesToAWalkInEvenWhenATierPriceExists()
    {
        // The flip above must not leak the tier price to anonymous walk-ins — they never match a
        // tier rule, so the branch price is what they pay.
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 6m, tier: "gold"));       // tenant-wide, gold
        db.ProductPriceLists.Add(Rule(productId, 8m, branchId: BranchA));  // branch A, everyone
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, customerTier: null);

        Assert.Equal(8m, result.UnitPrice);
        Assert.Equal("branch", result.Source);
    }

    [Fact]
    public async Task BranchAndTierTogether_ReportsBranchTierSource()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 5m, branchId: BranchA, tier: "gold"));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, "gold");

        Assert.Equal(5m, result.UnitPrice);
        Assert.Equal("branch_tier", result.Source);
    }

    // ─── Scheduled pricing ───────────────────────────────────────────────────

    [Fact]
    public async Task FuturePrice_DoesNotApplyYet()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 4m, from: DateTime.UtcNow.AddDays(3)));
        await db.SaveChangesAsync();

        var now = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);
        Assert.Equal(10m, now.UnitPrice);

        // ...but does once its window opens.
        var later = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null, at: DateTime.UtcNow.AddDays(4));
        Assert.Equal(4m, later.UnitPrice);
    }

    [Fact]
    public async Task ExpiredPrice_StopsApplying()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 4m,
            from: DateTime.UtcNow.AddDays(-10), to: DateTime.UtcNow.AddDays(-1)));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(10m, result.UnitPrice);
        Assert.Equal("base", result.Source);
    }

    [Fact]
    public async Task AbuttingWindows_HandOverCleanly()
    {
        // "This price until Friday, then that one" — the whole point of scheduled pricing, and the
        // case where an off-by-one on the boundary would double-apply or leave a gap.
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        var boundary = DateTime.UtcNow.AddDays(2);

        db.ProductPriceLists.Add(Rule(productId, 6m, from: DateTime.UtcNow.AddDays(-1), to: boundary));
        db.ProductPriceLists.Add(Rule(productId, 9m, from: boundary));
        await db.SaveChangesAsync();

        var svc = new PriceResolutionService(db);
        Assert.Equal(6m, (await svc.ResolveAsync(productId, BranchA, null, at: boundary.AddHours(-1))).UnitPrice);
        // EffectiveTo is exclusive and EffectiveFrom inclusive, so exactly one rule owns the boundary.
        Assert.Equal(9m, (await svc.ResolveAsync(productId, BranchA, null, at: boundary)).UnitPrice);
        Assert.Equal(9m, (await svc.ResolveAsync(productId, BranchA, null, at: boundary.AddHours(1))).UnitPrice);
    }

    [Fact]
    public async Task ScheduledSource_IsReportedForATimeBoxedRule()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 6m, to: DateTime.UtcNow.AddDays(5)));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);
        Assert.Equal("scheduled", result.Source);
    }

    // ─── Tiebreaks ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Priority_BreaksTiesBetweenEquallySpecificRules()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        var from = DateTime.UtcNow.AddDays(-1);
        db.ProductPriceLists.Add(Rule(productId, 8m, branchId: BranchA, from: from, priority: 1));
        db.ProductPriceLists.Add(Rule(productId, 6m, branchId: BranchA, from: from, priority: 5));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(6m, result.UnitPrice);
    }

    [Fact]
    public async Task LatestStartingSchedule_WinsAtEqualPriority()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 8m, from: DateTime.UtcNow.AddDays(-10)));
        db.ProductPriceLists.Add(Rule(productId, 6m, from: DateTime.UtcNow.AddDays(-2)));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(6m, result.UnitPrice);
    }

    // ─── Pack & unit pricing ─────────────────────────────────────────────────

    [Fact]
    public async Task PackRule_IsOfferedAsAnOption_AndNeverAsTheUnitPrice()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 100m, unitType: "pack", packSize: 12m, packBarcode: "PACK-12"));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        // The unit price is untouched by the existence of a pack — buying one still costs 10.
        Assert.Equal(10m, result.UnitPrice);
        Assert.Equal("base", result.Source);

        var pack = Assert.Single(result.Packs);
        Assert.Equal(12m, pack.PackSize);
        Assert.Equal(100m, pack.PackPrice);
        Assert.Equal(100m / 12m, pack.UnitPrice, precision: 4);
        Assert.Equal("PACK-12", pack.PackBarcode);
    }

    [Fact]
    public async Task PackUnitPrice_KeepsFourDecimals()
    {
        // 3-for-10 is 3.3333/unit. Rounding to 2dp here would lose a halala per pack against the
        // price the operator actually set; the line total is rounded once, downstream.
        using var db = NewDb();
        var productId = SeedProduct(db, 4m);
        db.ProductPriceLists.Add(Rule(productId, 10m, unitType: "pack", packSize: 3m));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(3.3333m, Assert.Single(result.Packs).UnitPrice);
    }

    [Fact]
    public async Task Packs_AreScopedByBranchAndTierLikeAnyOtherRule()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 100m, branchId: BranchA, unitType: "pack", packSize: 12m));
        await db.SaveChangesAsync();

        var svc = new PriceResolutionService(db);
        Assert.Single((await svc.ResolveAsync(productId, BranchA, null)).Packs);
        Assert.Empty((await svc.ResolveAsync(productId, BranchB, null)).Packs);
    }

    [Fact]
    public async Task Packs_AreOrderedBySize_AndSkipInvalidSizes()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 200m, unitType: "pack", packSize: 24m));
        db.ProductPriceLists.Add(Rule(productId, 100m, unitType: "pack", packSize: 12m));
        // A pack with no size is unsellable (the POS divides by it) and must never be offered.
        db.ProductPriceLists.Add(Rule(productId, 50m, unitType: "pack", packSize: null));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(2, result.Packs.Count);
        Assert.Equal(12m, result.Packs[0].PackSize);
        Assert.Equal(24m, result.Packs[1].PackSize);
    }

    [Fact]
    public async Task PackAndUnitRules_CoexistOnTheSameProduct()
    {
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 8m, branchId: BranchA));                          // unit
        db.ProductPriceLists.Add(Rule(productId, 84m, branchId: BranchA, unitType: "pack", packSize: 12m)); // pack
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, null);

        Assert.Equal(8m, result.UnitPrice);
        Assert.Equal(7m, Assert.Single(result.Packs).UnitPrice);
    }

    // ─── Bulk resolution ─────────────────────────────────────────────────────

    [Fact]
    public async Task ResolveMany_ReturnsARowForEveryRequestedProduct()
    {
        using var db = NewDb();
        var priced = SeedProduct(db, 10m);
        var unpriced = SeedProduct(db, 20m);
        db.ProductPriceLists.Add(Rule(priced, 7m, branchId: BranchA));
        await db.SaveChangesAsync();

        var map = await new PriceResolutionService(db).ResolveManyAsync([priced, unpriced], BranchA, null);

        // Including products with no rules is what lets the POS key by productId with no special-casing.
        Assert.Equal(2, map.Count);
        Assert.Equal(7m, map[priced].UnitPrice);
        Assert.Equal(20m, map[unpriced].UnitPrice);
    }

    [Fact]
    public async Task ResolveMany_OmitsUnknownProducts_RatherThanPricingThemAtZero()
    {
        // A stale/deleted product id must not come back as unitPrice 0 — a caller that trusts the
        // map (the POS does) would ring it up free. Omission forces the caller's ?? basePrice path.
        using var db = NewDb();
        var real = SeedProduct(db, 10m);
        var ghost = Guid.NewGuid();

        var map = await new PriceResolutionService(db).ResolveManyAsync([real, ghost], BranchA, null);

        Assert.True(map.ContainsKey(real));
        Assert.False(map.ContainsKey(ghost));
    }

    [Fact]
    public async Task ResolveCatalog_CoversActiveProductsOnly()
    {
        using var db = NewDb();
        var active = SeedProduct(db, 10m);
        var discontinued = SeedProduct(db, 20m);
        (await db.Products.FindAsync(discontinued))!.Status = "discontinued";
        await db.SaveChangesAsync();

        var map = await new PriceResolutionService(db).ResolveCatalogAsync(BranchA, null);

        Assert.True(map.ContainsKey(active));
        Assert.False(map.ContainsKey(discontinued));
    }

    [Fact]
    public async Task TierMatch_IsCaseInsensitive()
    {
        // Tier strings arrive from JWTs and query params — casing must not decide a price.
        using var db = NewDb();
        var productId = SeedProduct(db, 10m);
        db.ProductPriceLists.Add(Rule(productId, 6m, tier: "gold"));
        await db.SaveChangesAsync();

        var result = await new PriceResolutionService(db).ResolveAsync(productId, BranchA, "GOLD");

        Assert.Equal(6m, result.UnitPrice);
    }
}
