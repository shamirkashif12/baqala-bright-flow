using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController(BaqalaDbContext db) : ControllerBase
{
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

    [RequirePermission("Customers", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Customer customer)
    {
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
}
