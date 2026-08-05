using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace BaqalaPOS.Api.Tests;

// Delivery-fee resolution for online orders.
//
// The most important test here is FallsBackToNoFee_WhenNothingIsConfigured: adding this feature
// must not start charging anyone on an existing database, and that test is what says so.
public class DeliveryFeeServiceTests
{
    private static readonly Guid BranchA = Guid.NewGuid();
    private static readonly Guid BranchB = Guid.NewGuid();

    // Riyadh city centre, and points at known distances from it.
    private const decimal CenterLat = 24.7136m;
    private const decimal CenterLng = 46.6753m;
    // ~2.2 km north of the centre — 0.02° of latitude is about 2.22 km anywhere on Earth.
    private const decimal NearLat = 24.7336m;
    // ~11.1 km north.
    private const decimal FarLat = 24.8136m;

    private static BaqalaDbContext NewDb() =>
        new(new DbContextOptionsBuilder<BaqalaDbContext>()
            .UseInMemoryDatabase($"delivery-{Guid.NewGuid()}")
            // The in-memory provider can't honour the relational FK/index metadata in
            // OnModelCreating; the warning is expected and irrelevant to resolution logic.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static DeliveryFeeRule Radius(
        decimal fee, decimal? minKm = null, decimal? maxKm = null, Guid? branchId = null,
        int priority = 0, bool serviceable = true, decimal? freeAbove = null, string name = "Zone") => new()
        {
            Id = Guid.NewGuid(),
            BranchId = branchId ?? BranchA,
            Name = name,
            RuleType = DeliveryFeeRule.RuleTypes.Radius,
            CenterLatitude = CenterLat,
            CenterLongitude = CenterLng,
            MinDistanceKm = minKm,
            MaxDistanceKm = maxKm,
            FeeAmount = fee,
            FreeAboveOrderAmount = freeAbove,
            IsServiceable = serviceable,
            Priority = priority,
            IsActive = true,
        };

    private static DeliveryFeeRule Flat(
        decimal fee, Guid? branchId = null, int priority = 0, decimal? freeAbove = null,
        bool active = true, string name = "Flat") => new()
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            Name = name,
            RuleType = DeliveryFeeRule.RuleTypes.Flat,
            FeeAmount = fee,
            FreeAboveOrderAmount = freeAbove,
            Priority = priority,
            IsActive = active,
        };

    private static void SeedSettings(BaqalaDbContext db, decimal defaultFee, decimal freeAbove = 0m)
    {
        db.PosSettings.Add(new PosSettings
        {
            Id = Guid.NewGuid(),
            BranchId = BranchA,
            OnlineOrderingDeliveryFeeSar = defaultFee,
            OnlineOrderingFreeDeliveryAboveSar = freeAbove,
        });
        db.SaveChanges();
    }

    // ─── Backwards compatibility ─────────────────────────────────────────────

    [Fact]
    public async Task FallsBackToNoFee_WhenNothingIsConfigured()
    {
        using var db = NewDb();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 100m);

        Assert.Equal(0m, quote.Amount);
        Assert.Equal("none", quote.Source);
        Assert.True(quote.IsServiceable);
        Assert.Null(quote.RuleId);
    }

    [Fact]
    public async Task UsesBranchDefault_WhenNoRuleMatches()
    {
        using var db = NewDb();
        SeedSettings(db, defaultFee: 15m);

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 100m);

        Assert.Equal(15m, quote.Amount);
        Assert.Equal("settings", quote.Source);
    }

    [Fact]
    public async Task BranchDefaultIsWaived_AboveTheFreeDeliveryThreshold()
    {
        using var db = NewDb();
        SeedSettings(db, defaultFee: 15m, freeAbove: 200m);
        var svc = new DeliveryFeeService(db);

        var under = await svc.ResolveAsync(BranchA, NearLat, CenterLng, 199m);
        var over = await svc.ResolveAsync(BranchA, NearLat, CenterLng, 200m);

        Assert.Equal(15m, under.Amount);
        Assert.Equal(0m, over.Amount);
        Assert.True(over.WaivedByThreshold);
    }

    // ─── Distance rules ──────────────────────────────────────────────────────

    [Fact]
    public async Task RadiusRule_ChargesInsideTheRing_AndReportsTheDistance()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 10m, maxKm: 5m));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(10m, quote.Amount);
        Assert.Equal("rule", quote.Source);
        Assert.NotNull(quote.DistanceKm);
        Assert.InRange(quote.DistanceKm!.Value, 2.0m, 2.5m);
    }

    [Fact]
    public async Task RadiusRule_DoesNotApplyOutsideItsRing()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 10m, maxKm: 5m));
        SeedSettings(db, defaultFee: 25m);
        await db.SaveChangesAsync();

        // ~11 km out — past the 5 km ring, so the branch default is the answer instead.
        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, FarLat, CenterLng, 50m);

        Assert.Equal(25m, quote.Amount);
        Assert.Equal("settings", quote.Source);
    }

    [Fact]
    public async Task TightestRingWins_WhenRingsOverlap()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 30m, maxKm: 50m, name: "Citywide"));
        db.DeliveryFeeRules.Add(Radius(fee: 5m, maxKm: 5m, name: "Inner"));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(5m, quote.Amount);
        Assert.Equal("Inner", quote.RuleName);
    }

    [Fact]
    public async Task GeographicRuleNeverMatches_WhenTheOrderHasNoPin()
    {
        // A rule that needs coordinates must not price an address it never located — otherwise a
        // typed-address-only order would be charged (or blocked) on a guess.
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 10m, maxKm: 5m));
        db.DeliveryFeeRules.Add(Flat(fee: 20m, branchId: BranchA));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, null, null, 50m);

        Assert.Equal(20m, quote.Amount);
        Assert.Null(quote.DistanceKm);
    }

    [Fact]
    public async Task GeographicRuleBeatsAFlatRule_AtEqualScopeAndPriority()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Flat(fee: 20m, branchId: BranchA, name: "Catch-all"));
        db.DeliveryFeeRules.Add(Radius(fee: 8m, maxKm: 5m, name: "Inner"));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(8m, quote.Amount);
        Assert.Equal("Inner", quote.RuleName);
    }

    // ─── Scope and priority ──────────────────────────────────────────────────

    [Fact]
    public async Task BranchRuleBeatsTenantWideRule()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Flat(fee: 30m, branchId: null, name: "Tenant-wide"));
        db.DeliveryFeeRules.Add(Flat(fee: 12m, branchId: BranchA, name: "Branch A"));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(12m, quote.Amount);
        Assert.Equal("Branch A", quote.RuleName);
    }

    [Fact]
    public async Task AnotherBranchesRuleNeverApplies()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 5m, maxKm: 50m, branchId: BranchB));
        SeedSettings(db, defaultFee: 18m);
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(18m, quote.Amount);
        Assert.Equal("settings", quote.Source);
    }

    [Fact]
    public async Task InactiveRulesAreIgnored()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Flat(fee: 40m, branchId: BranchA, active: false));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(0m, quote.Amount);
        Assert.Equal("none", quote.Source);
    }

    [Fact]
    public async Task HigherPriorityWins_OverTheTighterRing()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 5m, maxKm: 5m, name: "Inner"));
        db.DeliveryFeeRules.Add(Radius(fee: 25m, maxKm: 50m, priority: 10, name: "Surge"));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.Equal(25m, quote.Amount);
        Assert.Equal("Surge", quote.RuleName);
    }

    // ─── Serviceability ──────────────────────────────────────────────────────

    [Fact]
    public async Task UnserviceableRule_BlocksTheAddress()
    {
        using var db = NewDb();
        var blocked = Radius(fee: 0m, minKm: 10m, maxKm: null, serviceable: false, name: "Too far");
        blocked.UnserviceableMessage = "We don't deliver past 10 km.";
        db.DeliveryFeeRules.Add(blocked);
        db.DeliveryFeeRules.Add(Radius(fee: 10m, maxKm: 10m, name: "In range"));
        await db.SaveChangesAsync();

        var svc = new DeliveryFeeService(db);
        var near = await svc.ResolveAsync(BranchA, NearLat, CenterLng, 50m);
        var far = await svc.ResolveAsync(BranchA, FarLat, CenterLng, 50m);

        Assert.True(near.IsServiceable);
        Assert.Equal(10m, near.Amount);

        Assert.False(far.IsServiceable);
        Assert.Equal("blocked", far.Source);
        Assert.Equal("We don't deliver past 10 km.", far.UnserviceableMessage);
    }

    [Fact]
    public async Task UnserviceableRule_GetsADefaultMessage_WhenNoneWasConfigured()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 0m, maxKm: 50m, serviceable: false));
        await db.SaveChangesAsync();

        var quote = await new DeliveryFeeService(db).ResolveAsync(BranchA, NearLat, CenterLng, 50m);

        Assert.False(quote.IsServiceable);
        Assert.False(string.IsNullOrWhiteSpace(quote.UnserviceableMessage));
    }

    // ─── Free-delivery thresholds ────────────────────────────────────────────

    [Fact]
    public async Task RuleThresholdWaivesTheFee_AndIsMarkedAsWaived()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(Radius(fee: 10m, maxKm: 50m, freeAbove: 150m));
        await db.SaveChangesAsync();

        var svc = new DeliveryFeeService(db);
        var under = await svc.ResolveAsync(BranchA, NearLat, CenterLng, 149.99m);
        var over = await svc.ResolveAsync(BranchA, NearLat, CenterLng, 150m);

        Assert.Equal(10m, under.Amount);
        Assert.False(under.WaivedByThreshold);

        Assert.Equal(0m, over.Amount);
        Assert.True(over.WaivedByThreshold);
    }

    [Fact]
    public async Task BboxRule_MatchesInsideTheRectangleOnly()
    {
        using var db = NewDb();
        db.DeliveryFeeRules.Add(new DeliveryFeeRule
        {
            Id = Guid.NewGuid(),
            BranchId = BranchA,
            Name = "District",
            RuleType = DeliveryFeeRule.RuleTypes.Bbox,
            MinLatitude = 24.70m, MaxLatitude = 24.75m,
            MinLongitude = 46.60m, MaxLongitude = 46.70m,
            FeeAmount = 7m,
            IsActive = true,
        });
        await db.SaveChangesAsync();

        var svc = new DeliveryFeeService(db);
        var inside = await svc.ResolveAsync(BranchA, 24.72m, 46.65m, 50m);
        var outside = await svc.ResolveAsync(BranchA, 24.90m, 46.65m, 50m);

        Assert.Equal(7m, inside.Amount);
        Assert.Equal("rule", inside.Source);
        Assert.Equal(0m, outside.Amount);
        Assert.Equal("none", outside.Source);
    }
}
