using System.Security.Claims;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Delivery-fee rule administration, plus a preview endpoint for testing a location against the
// configured rules before an order exists.
//
// Gated on the existing "Online Orders" permission module rather than a new one: a new module
// would be absent from RolePermissions on every already-deployed database and RequirePermission
// denies on absence, so every role — admins included — would be locked out until someone
// hand-seeded the rows. Delivery fees are a property of online ordering, and everyone who can
// approve/edit an online order can already change what that order is worth.
[ApiController]
[Route("api/delivery-fees")]
public class DeliveryFeesController(
    BaqalaDbContext db,
    IDeliveryFeeService deliveryFees,
    IAuditService audit,
    ILogger<DeliveryFeesController> logger) : ControllerBase
{
    private (string? Role, Guid? BranchId) GetCallerContext() =>
        (User.FindFirst("role")?.Value,
         Guid.TryParse(User.FindFirst("branchId")?.Value, out var b) ? b : null);

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id)
            ? id : null;

    [HttpGet]
    [RequirePermission("Online Orders", PermAction.View)]
    public async Task<IActionResult> GetAll([FromQuery] Guid[]? branchId, [FromQuery] bool? isActive)
    {
        var query = db.DeliveryFeeRules.Include(r => r.Branch).AsQueryable();
        if (isActive.HasValue) query = query.Where(r => r.IsActive == isActive.Value);

        var all = await query
            .OrderByDescending(r => r.Priority)
            .ThenBy(r => r.Name)
            .ToListAsync();

        // Branch scoping: a branch user sees their own branch's rules plus the tenant-wide ones
        // that apply to them, never another branch's. branchId is an array (multi-select filter)
        // — never `.Contains()` a Guid[] directly against a DbSet-backed IQueryable on this repo's
        // MySQL provider (ef-mysql-inlist-gotcha), so it is applied in-memory here instead.
        var (role, callerBranch) = GetCallerContext();
        IEnumerable<DeliveryFeeRule> scoped = all;
        if (role != "tenant_admin" && callerBranch.HasValue)
            scoped = scoped.Where(r => r.BranchId == null || r.BranchId == callerBranch);
        else if (branchId is { Length: > 0 })
            scoped = scoped.Where(r => r.BranchId is null || branchId.Contains(r.BranchId.Value));

        return Ok(scoped.ToList());
    }

    [HttpGet("{id:guid}")]
    [RequirePermission("Online Orders", PermAction.View)]
    public async Task<IActionResult> Get(Guid id)
    {
        var rule = await db.DeliveryFeeRules.Include(r => r.Branch).FirstOrDefaultAsync(r => r.Id == id);
        return rule is null ? NotFound() : Ok(rule);
    }

    [HttpPost]
    [RequirePermission("Online Orders", PermAction.Create)]
    public async Task<IActionResult> Create([FromBody] DeliveryFeeRuleRequest req)
    {
        var error = await ValidateAsync(req);
        if (error is not null) return BadRequest(new { message = error });

        var forbidden = ScopeCheck(req.BranchId);
        if (forbidden is not null) return forbidden;

        var rule = FromRequest(new DeliveryFeeRule { Id = Guid.NewGuid(), CreatedBy = CallerId() }, req);
        db.DeliveryFeeRules.Add(rule);
        await db.SaveChangesAsync();

        await AuditAsync("create_delivery_fee_rule", rule, before: null);
        return CreatedAtAction(nameof(Get), new { id = rule.Id }, rule);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("Online Orders", PermAction.Edit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] DeliveryFeeRuleRequest req)
    {
        var rule = await db.DeliveryFeeRules.FindAsync(id);
        if (rule is null) return NotFound();

        var error = await ValidateAsync(req);
        if (error is not null) return BadRequest(new { message = error });

        // Both the rule's current scope and the requested one are checked — otherwise a branch
        // manager could reassign a tenant-wide rule to themselves, or their own rule to another
        // branch.
        var forbidden = ScopeCheck(rule.BranchId) ?? ScopeCheck(req.BranchId);
        if (forbidden is not null) return forbidden;

        var before = Snapshot(rule);
        FromRequest(rule, req);
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // "warning" severity, matching how a price change is audited: a delivery-fee move is
        // exactly the kind of thing a reviewer goes looking for after a customer complaint.
        await AuditAsync("update_delivery_fee_rule", rule, before, severity: "warning");
        return Ok(rule);
    }

    [HttpPatch("{id:guid}/toggle")]
    [RequirePermission("Online Orders", PermAction.Edit)]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var rule = await db.DeliveryFeeRules.FindAsync(id);
        if (rule is null) return NotFound();

        var forbidden = ScopeCheck(rule.BranchId);
        if (forbidden is not null) return forbidden;

        var before = Snapshot(rule);
        rule.IsActive = !rule.IsActive;
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await AuditAsync("toggle_delivery_fee_rule", rule, before, severity: "warning");
        return Ok(rule);
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("Online Orders", PermAction.Delete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var rule = await db.DeliveryFeeRules.FindAsync(id);
        if (rule is null) return NotFound();

        var forbidden = ScopeCheck(rule.BranchId);
        if (forbidden is not null) return forbidden;

        var before = Snapshot(rule);
        db.DeliveryFeeRules.Remove(rule);
        await db.SaveChangesAsync();

        // Orders already placed keep their fee and their snapshot of this rule's name — see
        // OrderDeliveryDetail — so deleting it never rewrites history.
        await AuditAsync("delete_delivery_fee_rule", rule, before, severity: "warning");
        return NoContent();
    }

    /// <summary>
    /// "What would we charge to deliver here?" — runs the real resolver against a candidate
    /// location without creating anything. The whole point of geographic rules is that their
    /// effect is not obvious from reading the list, so configuring them without a way to test a
    /// pin means finding out from a customer.
    /// </summary>
    [HttpPost("preview")]
    [RequirePermission("Online Orders", PermAction.View)]
    public async Task<IActionResult> Preview([FromBody] DeliveryFeePreviewRequest req)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return BadRequest(new { message = "Branch not found." });

        var quote = await deliveryFees.ResolveAsync(
            req.BranchId, req.Latitude, req.Longitude, req.OrderSubtotal ?? 0m);
        return Ok(quote);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private ObjectResult? ScopeCheck(Guid? ruleBranchId)
    {
        var (role, callerBranch) = GetCallerContext();
        if (role == "tenant_admin" || !callerBranch.HasValue) return null;
        return ruleBranchId == callerBranch
            ? null
            : StatusCode(403, new { message = "You can only manage delivery fee rules for your own branch." });
    }

    private async Task<string?> ValidateAsync(DeliveryFeeRuleRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name)) return "A rule name is required.";
        if (req.BranchId.HasValue && !await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return "Branch not found.";

        var ruleType = req.RuleType ?? DeliveryFeeRule.RuleTypes.Flat;
        if (!DeliveryFeeRule.RuleTypes.All.Contains(ruleType))
            return $"ruleType must be one of: {string.Join(", ", DeliveryFeeRule.RuleTypes.All)}";

        if (req.FeeAmount < 0) return "The delivery fee cannot be negative.";
        if (req.FreeAboveOrderAmount is < 0) return "The free-delivery threshold cannot be negative.";

        if (ruleType == DeliveryFeeRule.RuleTypes.Radius)
        {
            // A radius rule with no centre matches nothing at all — it would sit in the list
            // looking configured while silently never applying.
            if (req.CenterLatitude is null || req.CenterLongitude is null)
                return "A distance rule needs a centre point — pick one on the map.";
            if (!IsLatitude(req.CenterLatitude.Value) || !IsLongitude(req.CenterLongitude.Value))
                return "The centre point's coordinates are out of range.";
            if (req.MaxDistanceKm is null && req.IsServiceable != false)
                return "A distance rule needs a maximum distance (or must mark the area as not deliverable).";
            if (req.MinDistanceKm is < 0 || req.MaxDistanceKm is < 0)
                return "Distances cannot be negative.";
            if (req.MaxDistanceKm is { } max && (req.MinDistanceKm ?? 0m) >= max)
                return "The maximum distance must be greater than the minimum.";
        }

        if (ruleType == DeliveryFeeRule.RuleTypes.Bbox)
        {
            if (req.MinLatitude is null || req.MaxLatitude is null ||
                req.MinLongitude is null || req.MaxLongitude is null)
                return "An area rule needs all four boundary coordinates.";
            if (!IsLatitude(req.MinLatitude.Value) || !IsLatitude(req.MaxLatitude.Value) ||
                !IsLongitude(req.MinLongitude.Value) || !IsLongitude(req.MaxLongitude.Value))
                return "The area's coordinates are out of range.";
            if (req.MinLatitude >= req.MaxLatitude) return "The area's north edge must be above its south edge.";
            if (req.MinLongitude >= req.MaxLongitude) return "The area's east edge must be right of its west edge.";
        }

        return null;
    }

    private static bool IsLatitude(decimal v) => v is >= -90m and <= 90m;
    private static bool IsLongitude(decimal v) => v is >= -180m and <= 180m;

    // Fields belonging to the other rule types are nulled rather than kept, so a rule switched
    // from "distance" to "flat" can't carry a stale radius that a later switch back would silently
    // resurrect.
    private static DeliveryFeeRule FromRequest(DeliveryFeeRule rule, DeliveryFeeRuleRequest req)
    {
        rule.BranchId = req.BranchId;
        rule.Name = req.Name.Trim();
        rule.RuleType = req.RuleType ?? DeliveryFeeRule.RuleTypes.Flat;

        var isRadius = rule.RuleType == DeliveryFeeRule.RuleTypes.Radius;
        rule.CenterLatitude = isRadius ? req.CenterLatitude : null;
        rule.CenterLongitude = isRadius ? req.CenterLongitude : null;
        rule.MinDistanceKm = isRadius ? req.MinDistanceKm : null;
        rule.MaxDistanceKm = isRadius ? req.MaxDistanceKm : null;

        var isBbox = rule.RuleType == DeliveryFeeRule.RuleTypes.Bbox;
        rule.MinLatitude = isBbox ? req.MinLatitude : null;
        rule.MaxLatitude = isBbox ? req.MaxLatitude : null;
        rule.MinLongitude = isBbox ? req.MinLongitude : null;
        rule.MaxLongitude = isBbox ? req.MaxLongitude : null;

        rule.FeeAmount = req.FeeAmount;
        rule.FreeAboveOrderAmount = req.FreeAboveOrderAmount is > 0 ? req.FreeAboveOrderAmount : null;
        rule.IsServiceable = req.IsServiceable ?? true;
        rule.UnserviceableMessage = rule.IsServiceable
            ? null
            : string.IsNullOrWhiteSpace(req.UnserviceableMessage) ? null : req.UnserviceableMessage.Trim();
        rule.Priority = req.Priority ?? 0;
        rule.IsActive = req.IsActive ?? true;
        rule.UpdatedAt = DateTime.UtcNow;
        return rule;
    }

    // Audit is never allowed to fail the write it describes — same contract, and same
    // try/catch-and-log shape, as PricingController.AuditAsync.
    private async Task AuditAsync(string action, DeliveryFeeRule rule, object? before, string severity = "info")
    {
        try
        {
            await audit.LogAsync(
                action: action,
                entityType: "DeliveryFeeRule",
                entityId: rule.Id,
                userId: CallerId(),
                branchId: rule.BranchId,
                module: "Online Orders",
                details: System.Text.Json.JsonSerializer.Serialize(Snapshot(rule)),
                severity: severity,
                beforeValue: before is null ? null : System.Text.Json.JsonSerializer.Serialize(before),
                notes: $"{rule.RuleType} delivery fee rule '{rule.Name}'");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Audit log failed for delivery fee rule {RuleId} ({Action})", rule.Id, action);
        }
    }

    // Audit payload. Keys are camelCase and flat — src/lib/audit-changes.ts renders nothing at all
    // for a shape it doesn't recognise, silently.
    private static object Snapshot(DeliveryFeeRule r) => new
    {
        branchId = r.BranchId,
        name = r.Name,
        ruleType = r.RuleType,
        centerLatitude = r.CenterLatitude,
        centerLongitude = r.CenterLongitude,
        minDistanceKm = r.MinDistanceKm,
        maxDistanceKm = r.MaxDistanceKm,
        minLatitude = r.MinLatitude,
        maxLatitude = r.MaxLatitude,
        minLongitude = r.MinLongitude,
        maxLongitude = r.MaxLongitude,
        feeAmount = r.FeeAmount,
        freeAboveOrderAmount = r.FreeAboveOrderAmount,
        isServiceable = r.IsServiceable,
        unserviceableMessage = r.UnserviceableMessage,
        priority = r.Priority,
        isActive = r.IsActive,
    };
}

public record DeliveryFeeRuleRequest(
    Guid? BranchId,
    string Name,
    string? RuleType,
    decimal? CenterLatitude,
    decimal? CenterLongitude,
    decimal? MinDistanceKm,
    decimal? MaxDistanceKm,
    decimal? MinLatitude,
    decimal? MaxLatitude,
    decimal? MinLongitude,
    decimal? MaxLongitude,
    decimal FeeAmount,
    decimal? FreeAboveOrderAmount,
    bool? IsServiceable,
    string? UnserviceableMessage,
    int? Priority,
    bool? IsActive
);

public record DeliveryFeePreviewRequest(
    Guid BranchId, decimal? Latitude, decimal? Longitude, decimal? OrderSubtotal);
