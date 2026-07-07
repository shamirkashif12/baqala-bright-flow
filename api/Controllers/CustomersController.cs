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
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? tier, [FromQuery] string? search)
    {
        var query = db.Customers.AsQueryable();
        if (!string.IsNullOrEmpty(tier)) query = query.Where(c => c.Tier == tier);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(c => c.FullName.Contains(search) || c.Phone.Contains(search) || c.CustomerCode.Contains(search));
        return Ok(await query.OrderByDescending(c => c.TotalSpend).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var customer = await db.Customers.FindAsync(id);
        return customer is null ? NotFound() : Ok(customer);
    }

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
        customer.Email = updated.Email;
        customer.Status = updated.Status;
        customer.PreferredBranchId = updated.PreferredBranchId;
        customer.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(customer);
    }

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
