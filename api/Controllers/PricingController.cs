using System.Security.Claims;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Price-rule administration + the resolution endpoint the POS reads on load.
//
// Gated on the existing "Inventory" permission module rather than a new "Pricing" module on
// purpose: a new module would be absent from RolePermissions on every already-deployed database,
// and RequirePermission denies on absence — every role, including admins, would be locked out
// until someone hand-seeded the rows. "Inventory" is also already the gate on ProductsController's
// create/update, which is where BasePrice is set today, so this grants nothing new to anyone.
[ApiController]
[Route("api/pricing")]
public class PricingController(
    BaqalaDbContext db,
    IPriceResolutionService pricing,
    IAuditService audit,
    ILogger<PricingController> logger) : ControllerBase
{
    private static readonly string[] ValidPriceTypes = ["standard", "online", "aggregator", "wholesale"];
    private static readonly string[] ValidTiers = ["standard", "silver", "gold", "platinum"];
    private static readonly string[] ValidUnitTypes = ["unit", "pack"];

    private (string? Role, Guid? BranchId) GetCallerContext() =>
        (User.FindFirst("role")?.Value,
         Guid.TryParse(User.FindFirst("branchId")?.Value, out var b) ? b : null);

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id)
            ? id : null;

    // ─── Resolution ──────────────────────────────────────────────────────────
    // The POS/kiosk calls this once on load and again when the cart's customer changes, then keys
    // the returned map by productId at add-to-cart time. Returns a row for every active product,
    // including ones with no rules (unitPrice == basePrice, source "base"), so the client can use a
    // single lookup with no special-casing.
    [HttpGet("resolve")]
    public async Task<IActionResult> Resolve(
        [FromQuery] Guid? branchId,
        [FromQuery] string? customerTier,
        [FromQuery] string priceType = "standard",
        [FromQuery] DateTime? at = null)
    {
        if (!ValidPriceTypes.Contains(priceType))
            return BadRequest(new { message = $"priceType must be one of: {string.Join(", ", ValidPriceTypes)}" });

        // Non-admins resolve for their own branch regardless of what they ask for — a cashier must
        // not be able to price a basket against another branch's cheaper list.
        var (role, callerBranch) = GetCallerContext();
        var effectiveBranch = role != "tenant_admin" ? callerBranch ?? branchId : branchId;

        var map = await pricing.ResolveCatalogAsync(effectiveBranch, customerTier, priceType, at);
        return Ok(map.Values.OrderBy(v => v.ProductId).ToList());
    }

    // Single-product resolution — used by the pricing admin UI's preview and by anything that needs
    // one answer without pulling the catalog.
    [HttpGet("resolve/{productId:guid}")]
    public async Task<IActionResult> ResolveOne(
        Guid productId,
        [FromQuery] Guid? branchId,
        [FromQuery] string? customerTier,
        [FromQuery] string priceType = "standard",
        [FromQuery] DateTime? at = null)
    {
        if (!await db.Products.AnyAsync(p => p.Id == productId)) return NotFound();
        var (role, callerBranch) = GetCallerContext();
        var effectiveBranch = role != "tenant_admin" ? callerBranch ?? branchId : branchId;
        return Ok(await pricing.ResolveAsync(productId, effectiveBranch, customerTier, priceType, at));
    }

    // ─── Price-rule CRUD ─────────────────────────────────────────────────────

    [HttpGet("lists")]
    [RequirePermission("Inventory", PermAction.View)]
    public async Task<IActionResult> GetLists(
        [FromQuery] Guid? productId,
        [FromQuery] Guid[]? branchId,
        [FromQuery] string? priceType,
        [FromQuery] string? unitType,
        [FromQuery] bool? isActive)
    {
        var query = db.ProductPriceLists.Include(r => r.Product).Include(r => r.Branch).AsQueryable();

        if (productId.HasValue) query = query.Where(r => r.ProductId == productId);
        if (priceType is not null) query = query.Where(r => r.PriceType == priceType);
        if (unitType is not null) query = query.Where(r => r.UnitType == unitType);
        if (isActive.HasValue) query = query.Where(r => r.IsActive == isActive.Value);

        var all = await query
            .OrderBy(r => r.ProductId).ThenBy(r => r.UnitType)
            .ThenByDescending(r => r.EffectiveFrom)
            .ToListAsync();

        // Branch scoping: a branch user sees their own branch's rules plus the tenant-wide ones
        // that apply to them, never another branch's. branchId is an array (multi-select filter)
        // — never `.Contains()` a Guid[] directly against a DbSet-backed IQueryable on this repo's
        // MySQL provider (ef-mysql-inlist-gotcha memory), so it's applied in-memory here instead.
        var (role, callerBranch) = GetCallerContext();
        IEnumerable<ProductPriceList> scoped = all;
        if (role != "tenant_admin" && callerBranch.HasValue)
            scoped = scoped.Where(r => r.BranchId == null || r.BranchId == callerBranch);
        else if (branchId is { Length: > 0 })
            scoped = scoped.Where(r => r.BranchId.HasValue && branchId.Contains(r.BranchId.Value));

        return Ok(scoped.ToList());
    }

    [HttpGet("lists/{id:guid}")]
    [RequirePermission("Inventory", PermAction.View)]
    public async Task<IActionResult> GetList(Guid id)
    {
        var r = await db.ProductPriceLists.Include(x => x.Product).Include(x => x.Branch)
            .FirstOrDefaultAsync(x => x.Id == id);
        return r is null ? NotFound() : Ok(r);
    }

    [HttpPost("lists")]
    [RequirePermission("Inventory", PermAction.Create)]
    public async Task<IActionResult> CreateList([FromBody] PriceListRequest req)
    {
        var error = await ValidateAsync(req);
        if (error is not null) return BadRequest(new { message = error });

        var (role, callerBranch) = GetCallerContext();
        if (role != "tenant_admin" && callerBranch.HasValue && req.BranchId != callerBranch)
            return StatusCode(403, new { message = "You can only manage price rules for your own branch." });

        var rule = FromRequest(new ProductPriceList { Id = Guid.NewGuid(), CreatedBy = CallerId() }, req);
        db.ProductPriceLists.Add(rule);
        await db.SaveChangesAsync();

        await AuditAsync("create_price_rule", rule, before: null);
        return CreatedAtAction(nameof(GetList), new { id = rule.Id }, rule);
    }

    [HttpPut("lists/{id:guid}")]
    [RequirePermission("Inventory", PermAction.Edit)]
    public async Task<IActionResult> UpdateList(Guid id, [FromBody] PriceListRequest req)
    {
        var rule = await db.ProductPriceLists.FindAsync(id);
        if (rule is null) return NotFound();

        var error = await ValidateAsync(req, selfId: id);
        if (error is not null) return BadRequest(new { message = error });

        var (role, callerBranch) = GetCallerContext();
        if (role != "tenant_admin" && callerBranch.HasValue && rule.BranchId != callerBranch)
            return StatusCode(403, new { message = "You can only manage price rules for your own branch." });

        var before = Snapshot(rule);
        FromRequest(rule, req);
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Price moves are audited at "warning" severity, matching ProductsController's treatment of
        // a BasePrice change — a price edit is the kind of thing a reviewer goes looking for.
        await AuditAsync("update_price_rule", rule, before, severity: "warning");
        return Ok(rule);
    }

    [HttpPatch("lists/{id:guid}/toggle")]
    [RequirePermission("Inventory", PermAction.Edit)]
    public async Task<IActionResult> ToggleList(Guid id)
    {
        var rule = await db.ProductPriceLists.FindAsync(id);
        if (rule is null) return NotFound();

        var (role, callerBranch) = GetCallerContext();
        if (role != "tenant_admin" && callerBranch.HasValue && rule.BranchId != callerBranch)
            return StatusCode(403, new { message = "You can only manage price rules for your own branch." });

        var before = Snapshot(rule);
        rule.IsActive = !rule.IsActive;
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await AuditAsync("toggle_price_rule", rule, before, severity: "warning");
        return Ok(rule);
    }

    [HttpDelete("lists/{id:guid}")]
    [RequirePermission("Inventory", PermAction.Delete)]
    public async Task<IActionResult> DeleteList(Guid id)
    {
        var rule = await db.ProductPriceLists.FindAsync(id);
        if (rule is null) return NotFound();

        var (role, callerBranch) = GetCallerContext();
        if (role != "tenant_admin" && callerBranch.HasValue && rule.BranchId != callerBranch)
            return StatusCode(403, new { message = "You can only manage price rules for your own branch." });

        var before = Snapshot(rule);
        db.ProductPriceLists.Remove(rule);
        await db.SaveChangesAsync();

        await AuditAsync("delete_price_rule", rule, before, severity: "warning");
        return NoContent();
    }

    // Bulk create — what the Add Product dialog posts when the operator picks several branches and
    // gives each its own price. One round trip, all-or-nothing, so a partial failure can't leave a
    // product priced in three branches out of five.
    [HttpPost("lists/bulk")]
    [RequirePermission("Inventory", PermAction.Create)]
    public async Task<IActionResult> CreateBulk([FromBody] BulkPriceListRequest req)
    {
        if (req.Rules is null || req.Rules.Count == 0)
            return BadRequest(new { message = "At least one price rule is required." });

        var (role, callerBranch) = GetCallerContext();

        // Shared across the loop so two rules in the same request can't both claim a pack barcode
        // that neither has committed to the database yet.
        var reservedBarcodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var rules = new List<ProductPriceList>();
        foreach (var r in req.Rules)
        {
            var error = await ValidateAsync(r, selfId: null, reservedBarcodes);
            if (error is not null) return BadRequest(new { message = error });
            if (role != "tenant_admin" && callerBranch.HasValue && r.BranchId != callerBranch)
                return StatusCode(403, new { message = "You can only manage price rules for your own branch." });

            rules.Add(FromRequest(new ProductPriceList { Id = Guid.NewGuid(), CreatedBy = CallerId() }, r));
        }

        db.ProductPriceLists.AddRange(rules);
        await db.SaveChangesAsync();

        foreach (var rule in rules) await AuditAsync("create_price_rule", rule, before: null);
        return Ok(rules);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    // Audit is never allowed to fail the write it describes — same contract, and same
    // try/catch-and-log shape, as ProductsController.AuditAsync.
    private async Task AuditAsync(string action, ProductPriceList rule, object? before, string severity = "info")
    {
        try
        {
            await audit.LogAsync(
                action: action,
                entityType: "ProductPriceList",
                entityId: rule.Id,
                userId: CallerId(),
                branchId: rule.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(Snapshot(rule)),
                severity: severity,
                beforeValue: before is null ? null : System.Text.Json.JsonSerializer.Serialize(before),
                notes: $"{rule.UnitType} price rule for product {rule.ProductId}");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Audit log failed for price rule {RuleId} ({Action})", rule.Id, action);
        }
    }

    // `selfId` is the row being updated, so its own pack barcode doesn't count as a collision with
    // itself. Passed from the route on update rather than read from req.Id: server-side identity
    // must never depend on the client echoing its own id back, or a body that omits it makes a
    // no-op save fail against the row it is saving. `reservedBarcodes` carries the pack barcodes
    // earlier rules in the same bulk request already claimed — those aren't in the database yet,
    // so a DB-only check would let one request insert two packs sharing a barcode.
    private async Task<string?> ValidateAsync(
        PriceListRequest req, Guid? selfId = null, ISet<string>? reservedBarcodes = null)
    {
        if (!await db.Products.AnyAsync(p => p.Id == req.ProductId))
            return "Product not found.";

        if (req.BranchId.HasValue && !await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return "Branch not found.";

        var priceType = req.PriceType ?? "standard";
        if (!ValidPriceTypes.Contains(priceType))
            return $"priceType must be one of: {string.Join(", ", ValidPriceTypes)}";

        var unitType = req.UnitType ?? "unit";
        if (!ValidUnitTypes.Contains(unitType))
            return $"unitType must be one of: {string.Join(", ", ValidUnitTypes)}";

        if (req.MinCustomerTier is not null && !ValidTiers.Contains(req.MinCustomerTier))
            return $"minCustomerTier must be one of: {string.Join(", ", ValidTiers)}";

        if (req.Price < 0) return "Price cannot be negative.";

        // A pack with no size is unsellable — the POS derives its unit price as price/packSize, so
        // this would be a divide-by-zero rather than a merely odd row.
        if (unitType == "pack" && (req.PackSize is null || req.PackSize <= 0))
            return "packSize must be greater than zero for a pack price rule.";

        if (unitType == "unit" && req.PackBarcode is not null)
            return "packBarcode is only valid on a pack price rule.";

        if (req.EffectiveTo.HasValue && req.EffectiveFrom.HasValue && req.EffectiveTo <= req.EffectiveFrom)
            return "effectiveTo must be after effectiveFrom.";

        // A pack barcode has to be unambiguous, and it shares a namespace with product barcodes —
        // the POS scanner resolves a scan against both. Colliding with a product's own barcode
        // would make the scan's meaning depend on lookup order.
        if (req.PackBarcode is not null && unitType == "pack")
        {
            if (reservedBarcodes is not null && !reservedBarcodes.Add(req.PackBarcode))
                return $"Barcode {req.PackBarcode} is used by more than one pack in this request.";
            if (await db.Products.AnyAsync(p => p.Barcode == req.PackBarcode))
                return $"Barcode {req.PackBarcode} is already used by a product.";
            if (await db.ProductPriceLists.AnyAsync(r =>
                    r.PackBarcode == req.PackBarcode && (selfId == null || r.Id != selfId)))
                return $"Barcode {req.PackBarcode} is already used by another pack.";
        }

        return null;
    }

    private static ProductPriceList FromRequest(ProductPriceList rule, PriceListRequest req)
    {
        rule.ProductId = req.ProductId;
        rule.BranchId = req.BranchId;
        rule.PriceType = req.PriceType ?? "standard";
        rule.Price = req.Price;
        rule.EffectiveFrom = req.EffectiveFrom ?? DateTime.UtcNow;
        rule.EffectiveTo = req.EffectiveTo;
        rule.MinCustomerTier = req.MinCustomerTier;
        rule.UnitType = req.UnitType ?? "unit";
        rule.PackSize = rule.UnitType == "pack" ? req.PackSize : null;
        rule.PackBarcode = rule.UnitType == "pack" ? req.PackBarcode : null;
        rule.Label = req.Label;
        rule.Priority = req.Priority ?? 0;
        rule.IsActive = req.IsActive ?? true;
        rule.UpdatedAt = DateTime.UtcNow;
        return rule;
    }

    // Audit payload. Keys are camelCase and flat — src/lib/audit-changes.ts renders nothing at all
    // for a shape it doesn't recognise, silently, which is the exact failure its lowerKeys helper
    // was written to repair.
    private static object Snapshot(ProductPriceList r) => new
    {
        productId = r.ProductId,
        branchId = r.BranchId,
        priceType = r.PriceType,
        price = r.Price,
        effectiveFrom = r.EffectiveFrom,
        effectiveTo = r.EffectiveTo,
        minCustomerTier = r.MinCustomerTier,
        unitType = r.UnitType,
        packSize = r.PackSize,
        packBarcode = r.PackBarcode,
        label = r.Label,
        priority = r.Priority,
        isActive = r.IsActive,
    };
}

public record PriceListRequest(
    Guid Id,
    Guid ProductId,
    Guid? BranchId,
    string? PriceType,
    decimal Price,
    DateTime? EffectiveFrom,
    DateTime? EffectiveTo,
    string? MinCustomerTier,
    string? UnitType,
    decimal? PackSize,
    string? PackBarcode,
    string? Label,
    int? Priority,
    bool? IsActive
);

public record BulkPriceListRequest(List<PriceListRequest> Rules);
