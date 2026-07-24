using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/leave-policies")]
public class LeavePoliciesController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var query = db.LeavePolicies.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(p => p.Status == status);
        return Ok(await query.OrderBy(p => p.Name).ToListAsync());
    }

    [RequirePermission("Leave Management", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] LeavePolicy policy)
    {
        policy.Id = Guid.NewGuid();
        policy.CreatedAt = policy.UpdatedAt = DateTime.UtcNow;
        db.LeavePolicies.Add(policy);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), policy);
    }

    [RequirePermission("Leave Management", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] LeavePolicy updated)
    {
        var policy = await db.LeavePolicies.FindAsync(id);
        if (policy is null) return NotFound();
        policy.Name = updated.Name;
        policy.AnnualDays = updated.AnnualDays;
        policy.SickDays = updated.SickDays;
        policy.CasualDays = updated.CasualDays;
        policy.Status = updated.Status;
        policy.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(policy);
    }

    [RequirePermission("Leave Management", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var policy = await db.LeavePolicies.FindAsync(id);
        if (policy is null) return NotFound();
        policy.Status = "inactive";
        policy.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var callerId = CallerId();
        await audit.LogAsync(action: "Leave policy deactivated", entityType: "LeavePolicy", entityId: policy.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId), beforeValue: policy.Name, module: "HR Master Data");

        return NoContent();
    }
}
