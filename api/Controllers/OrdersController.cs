using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] string? status,
        [FromQuery] string? paymentStatus,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var query = db.Orders
            .Include(o => o.Branch)
            .Include(o => o.Cashier)
            .Include(o => o.Payments)
            .Include(o => o.Items)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(o => o.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(o => o.OrderStatus == status);
        if (!string.IsNullOrEmpty(paymentStatus)) query = query.Where(o => o.PaymentStatus == paymentStatus);
        if (from.HasValue) query = query.Where(o => o.CreatedAt >= from);
        if (to.HasValue) query = query.Where(o => o.CreatedAt <= to);
        return Ok(await query.OrderByDescending(o => o.CreatedAt).Take(200).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var order = await db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .FirstOrDefaultAsync(o => o.Id == id);
        return order is null ? NotFound() : Ok(order);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Order order)
    {
        order.Id = Guid.NewGuid();
        order.OrderNumber = $"ORD-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        order.CreatedAt = order.UpdatedAt = DateTime.UtcNow;
        foreach (var item in order.Items) { item.Id = Guid.NewGuid(); item.OrderId = order.Id; }
        foreach (var pay in order.Payments) { pay.Id = Guid.NewGuid(); pay.OrderId = order.Id; }
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var order = await db.Orders.FindAsync(id);
        if (order is null) return NotFound();
        order.OrderStatus = req.Status;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(order);
    }

    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> AddPayment(Guid id, [FromBody] OrderPayment payment)
    {
        if (!await db.Orders.AnyAsync(o => o.Id == id)) return NotFound();
        payment.Id = Guid.NewGuid();
        payment.OrderId = id;
        payment.CreatedAt = DateTime.UtcNow;
        db.OrderPayments.Add(payment);
        await db.SaveChangesAsync();
        return Created($"/api/orders/{id}/payments/{payment.Id}", payment);
    }

    [HttpGet("{id:guid}/returns")]
    public async Task<IActionResult> GetReturns(Guid id)
    {
        return Ok(await db.CustomerReturns.Where(r => r.OrderId == id).ToListAsync());
    }
}

public record UpdateStatusRequest(string Status);
