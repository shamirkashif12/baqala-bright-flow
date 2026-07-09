using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BranchesController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch record —
    // this previously had no branch filter at all, returning every branch (including disabled
    // ones) to any authenticated user regardless of role.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var query = db.Branches.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(b => b.Status == status);

        var (role, branchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && branchId.HasValue)
            query = query.Where(b => b.Id == branchId);

        return Ok(await query.OrderBy(b => b.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var branch = await db.Branches.FindAsync(id);
        return branch is null ? NotFound() : Ok(branch);
    }

    [RequirePermission("Branches", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Branch branch)
    {
        branch.Id = Guid.NewGuid();
        branch.CreatedAt = branch.UpdatedAt = DateTime.UtcNow;

        var lastCode = await db.Branches
            .Where(b => b.BranchCode != null && b.BranchCode.StartsWith("BR-"))
            .OrderByDescending(b => b.BranchCode)
            .Select(b => b.BranchCode)
            .FirstOrDefaultAsync();
        int next = 1;
        if (lastCode is not null && int.TryParse(lastCode[3..], out int n)) next = n + 1;
        branch.BranchCode = $"BR-{next:D3}";

        db.Branches.Add(branch);
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Branch created",
            entityType: "Branch",
            entityId: branch.Id,
            branchId: branch.Id,
            details: $"{branch.Name} ({branch.BranchCode}) · {branch.City}");

        return CreatedAtAction(nameof(GetById), new { id = branch.Id }, branch);
    }

    [RequirePermission("Branches", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Branch updated)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch is null) return NotFound();
        branch.Name = updated.Name;
        branch.NameAr = updated.NameAr;
        branch.Address = updated.Address;
        branch.City = updated.City;
        branch.ContactNumber = updated.ContactNumber;
        branch.CommercialRegistration = updated.CommercialRegistration;
        branch.Email = updated.Email;
        branch.Status = updated.Status;
        branch.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Branch updated",
            entityType: "Branch",
            entityId: branch.Id,
            branchId: branch.Id,
            details: $"{branch.Name} · status: {branch.Status}");

        return Ok(branch);
    }

    [RequirePermission("Branches", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch is null) return NotFound();
        branch.Status = "disabled";
        branch.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Branch disabled",
            entityType: "Branch",
            entityId: branch.Id,
            branchId: branch.Id,
            details: $"{branch.Name} disabled");

        return NoContent();
    }
}
