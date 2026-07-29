using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController(BaqalaDbContext db) : ControllerBase
{
    // E.164 international (+countrycode...) or bare Saudi mobile (05XXXXXXXX) — matches what
    // this business actually has on file today: local Saudi numbers entered without a country
    // code, and foreign customers' numbers entered in full E.164 form.
    private static readonly Regex PhoneRegex = new(@"^(\+[1-9]\d{7,14}|05\d{8})$", RegexOptions.Compiled);
    private static readonly Regex EmailRegex = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.Compiled);

    private static string? ValidateContactFormat(string phone, string? email)
    {
        if (string.IsNullOrWhiteSpace(phone) || !PhoneRegex.IsMatch(phone.Trim()))
            return "Enter a valid phone number, e.g. +966501234567 or 0501234567.";
        if (!string.IsNullOrWhiteSpace(email) && !EmailRegex.IsMatch(email.Trim()))
            return "Enter a valid email address, e.g. name@example.com.";
        return null;
    }

    // Bulk enumeration of every customer (name, phone, spend, tier) — gated on "Customers" View,
    // matching the dedicated /customers page. Previously ungated: any authenticated bearer,
    // including a self-checkout kiosk's own JWT, could dump the entire customer database instead
    // of looking up only the one customer for the current sale (see GetByPhone below, which stays
    // deliberately open for exactly that lookup).
    [RequirePermission("Customers", PermAction.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? tier, [FromQuery] string? search, [FromQuery] Guid? branchId)
    {
        var query = db.Customers.AsQueryable();
        if (!string.IsNullOrEmpty(tier)) query = query.Where(c => c.Tier == tier);
        if (branchId.HasValue) query = query.Where(c => c.PreferredBranchId == branchId);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(c => c.FullName.Contains(search) || c.Phone.Contains(search) || c.CustomerCode.Contains(search));
        return Ok(await query.OrderByDescending(c => c.TotalSpend).ToListAsync());
    }

    // Not called by any frontend route today — gated for defense in depth, zero flow impact.
    [RequirePermission("Customers", PermAction.View)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var customer = await db.Customers.FindAsync(id);
        return customer is null ? NotFound() : Ok(customer);
    }

    // Deliberately NOT gated — POS checkout, Orders, and the self-checkout kiosk all call this to
    // look up ONE customer by phone for the current sale, for roles (Cashier, kiosk) that hold no
    // "Customers" module permission at all. GetAll above is the actual bulk-enumeration risk this
    // fixes; a phone-number lookup isn't the same exposure.
    [HttpGet("by-phone/{phone}")]
    public async Task<IActionResult> GetByPhone(string phone)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(c =>
            c.Phone == phone || c.Phone.Contains(phone) || phone.Contains(c.Phone));
        return customer is null ? NotFound() : Ok(customer);
    }

    // POS's actual customer search — GetByPhone above only ever matches phone, silently returns
    // an arbitrary customer via FirstOrDefaultAsync with no ordering when several phone numbers
    // share the typed suffix, and has no way to search by name at all. This returns a small ranked
    // candidate list (exact phone match first, then name/phone substring matches) instead of one
    // unexplained guess, so the cashier picks the right person when there's more than one match.
    // Same "not gated" reasoning as GetByPhone — Cashier/kiosk roles hold no Customers permission.
    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string query, [FromQuery] int limit = 8)
    {
        if (string.IsNullOrWhiteSpace(query)) return Ok(Array.Empty<Customer>());
        var q = query.Trim();
        var matches = await db.Customers
            .Where(c => c.FullName.Contains(q) || c.Phone.Contains(q) || q.Contains(c.Phone))
            .ToListAsync();
        var ranked = matches
            .OrderByDescending(c => c.Phone == q)
            .ThenBy(c => c.FullName)
            .Take(Math.Clamp(limit, 1, 25))
            .ToList();
        return Ok(ranked);
    }

    [RequirePermission("Customers", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Customer customer)
    {
        if (ValidateContactFormat(customer.Phone, customer.Email) is { } formatError)
            return BadRequest(formatError);
        if (await db.Customers.AnyAsync(c => c.Phone == customer.Phone))
            return Conflict("Phone number already registered.");
        customer.Id = Guid.NewGuid();
        // customer_code is NOT NULL + UNIQUE in the database but was never populated here —
        // every create (staff POS's inline "save as new customer" and self-checkout's own
        // equivalent) failed with a DB-level "column cannot be null" 500 until now.
        customer.CustomerCode = $"CUST-{Guid.NewGuid().ToString()[..8].ToUpper()}";
        customer.CreatedAt = customer.UpdatedAt = DateTime.UtcNow;
        db.Customers.Add(customer);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = customer.Id }, customer);
    }

    [RequirePermission("Customers", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Customer updated)
    {
        if (ValidateContactFormat(updated.Phone, updated.Email) is { } formatError)
            return BadRequest(formatError);
        var customer = await db.Customers.FindAsync(id);
        if (customer is null) return NotFound();
        customer.FullName = updated.FullName;
        customer.Phone = updated.Phone;
        customer.Email = updated.Email;
        customer.Tier = updated.Tier;
        customer.Status = updated.Status;
        customer.PreferredBranchId = updated.PreferredBranchId;
        customer.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(customer);
    }

    [RequirePermission("Customers", PermAction.View)]
    [HttpGet("{id:guid}/loyalty")]
    public async Task<IActionResult> GetLoyalty(Guid id)
    {
        var txns = await db.LoyaltyTransactions
            .Where(t => t.CustomerId == id)
            .OrderByDescending(t => t.CreatedAt)
            .Take(50)
            .ToListAsync();
        return Ok(txns);
    }

    // Cleanup tool: surfaces likely-duplicate customers (same name saved more than once — the
    // common case from repeated POS quick-add/self-checkout flows) plus low-quality singles
    // (near-empty name or a phone that was never a real phone number) so an admin can merge or
    // delete them instead of them silently accumulating forever.
    [RequirePermission("Customers", PermAction.Delete)]
    [HttpGet("duplicates")]
    public async Task<IActionResult> GetDuplicates()
    {
        var all = await db.Customers.OrderByDescending(c => c.TotalSpend).ToListAsync();

        var groups = all
            .GroupBy(c => c.FullName.Trim().ToLowerInvariant())
            .Where(g => g.Key.Length > 0 && g.Count() > 1)
            .Select(g => new { name = g.First().FullName.Trim(), customers = g.ToList() })
            .ToList();

        var groupedIds = groups.SelectMany(g => g.customers.Select(c => c.Id)).ToHashSet();
        var flagged = all
            .Where(c => !groupedIds.Contains(c.Id))
            .Where(c => c.FullName.Trim().Length < 3 || !PhoneRegex.IsMatch(c.Phone.Trim()))
            .ToList();

        return Ok(new { groups, flagged });
    }

    // Reassigns every order/return/loyalty/coupon record from the duplicate customers onto the
    // primary, folds their running totals into it, then removes the now-empty duplicate rows —
    // all inside one transaction so a failure partway through never leaves records split between
    // a customer that still exists and one that's half-merged.
    [RequirePermission("Customers", PermAction.Delete)]
    [HttpPost("merge")]
    public async Task<IActionResult> Merge([FromBody] MergeCustomersRequest request)
    {
        var duplicateIds = request.DuplicateIds.Where(id => id != request.PrimaryId).Distinct().ToHashSet();
        if (duplicateIds.Count == 0)
            return BadRequest("Select at least one duplicate customer to merge into the primary.");

        var primary = await db.Customers.FindAsync(request.PrimaryId);
        if (primary is null) return NotFound("Primary customer not found.");

        // A parameterized Guid list .Contains(...) inside a live EF Where() throws on this MySQL
        // provider ("Expression '@...' in the SQL tree does not have a type mapping assigned") —
        // see the ef-mysql-inlist-gotcha. Materialize first, then filter in memory.
        var duplicates = (await db.Customers.ToListAsync()).Where(c => duplicateIds.Contains(c.Id)).ToList();
        if (duplicates.Count != duplicateIds.Count)
            return NotFound("One or more duplicate customers not found.");

        await using var tx = await db.Database.BeginTransactionAsync();

        var orders = (await db.Orders.ToListAsync()).Where(o => o.CustomerId != null && duplicateIds.Contains(o.CustomerId.Value));
        foreach (var o in orders) o.CustomerId = primary.Id;

        var returns = (await db.CustomerReturns.ToListAsync()).Where(r => r.CustomerId != null && duplicateIds.Contains(r.CustomerId.Value));
        foreach (var r in returns) r.CustomerId = primary.Id;

        var loyaltyTxns = (await db.LoyaltyTransactions.ToListAsync()).Where(t => duplicateIds.Contains(t.CustomerId));
        foreach (var t in loyaltyTxns) t.CustomerId = primary.Id;

        // No unique constraint on (coupon_id, customer_id) today, but merging would still create a
        // redundant second grant for a coupon the primary already holds — drop the duplicate's
        // grant in that case instead of moving it.
        var allCoupons = await db.CustomerCoupons.ToListAsync();
        var coupons = allCoupons.Where(cc => duplicateIds.Contains(cc.CustomerId));
        var primaryCouponIds = allCoupons.Where(cc => cc.CustomerId == primary.Id).Select(cc => cc.CouponId).ToHashSet();
        foreach (var cc in coupons)
        {
            if (!primaryCouponIds.Add(cc.CouponId)) db.CustomerCoupons.Remove(cc);
            else cc.CustomerId = primary.Id;
        }

        primary.TotalSpend += duplicates.Sum(d => d.TotalSpend);
        primary.LoyaltyBalance += duplicates.Sum(d => d.LoyaltyBalance);
        primary.VisitCount += duplicates.Sum(d => d.VisitCount);
        primary.UpdatedAt = DateTime.UtcNow;

        db.Customers.RemoveRange(duplicates);
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(primary);
    }

    [RequirePermission("Customers", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var customer = await db.Customers.FindAsync(id);
        if (customer is null) return NotFound();

        var hasActivity = await db.Orders.AnyAsync(o => o.CustomerId == id)
            || await db.CustomerReturns.AnyAsync(r => r.CustomerId == id)
            || await db.LoyaltyTransactions.AnyAsync(t => t.CustomerId == id)
            || await db.CustomerCoupons.AnyAsync(cc => cc.CustomerId == id);
        if (hasActivity)
            return Conflict("This customer has order or loyalty history — merge it into another customer instead of deleting.");

        db.Customers.Remove(customer);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record MergeCustomersRequest(Guid PrimaryId, List<Guid> DuplicateIds);
