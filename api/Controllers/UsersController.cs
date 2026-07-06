using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController(BaqalaDbContext db) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                       ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private string? CallerRole() => User.FindFirst("role")?.Value;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.Users.Include(u => u.Role).Include(u => u.Branch).AsQueryable();
        if (branchId.HasValue) query = query.Where(u => u.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(u => u.Status == status);
        var users = await query.Select(u => new
        {
            u.Id, u.Email, u.Username, u.FullName, u.FullNameAr, u.Phone,
            u.RoleId, RoleName = u.Role.Name,
            u.BranchId, BranchName = u.Branch != null ? u.Branch.Name : null,
            u.Status, u.LastLogin, u.CreatedAt
        }).ToListAsync();
        return Ok(users);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var user = await db.Users.Include(u => u.Role).Include(u => u.Branch)
            .Select(u => new
            {
                u.Id, u.Email, u.Username, u.FullName, u.FullNameAr, u.Phone,
                u.RoleId, RoleName = u.Role.Name,
                u.BranchId, BranchName = u.Branch != null ? u.Branch.Name : null,
                u.Status, u.LastLogin, u.CreatedAt
            })
            .FirstOrDefaultAsync(u => u.Id == id);
        return user is null ? NotFound() : Ok(user);
    }

    [RequirePermission("Users", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req)
    {
        if (await db.Users.AnyAsync(u => u.Email == req.Email))
            return Conflict("Email already in use.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = req.Email,
            Username = req.Username,
            PasswordHash = BCryptHash(req.Password),
            PinHash = req.Pin is not null ? BCryptHash(req.Pin) : null,
            FullName = req.FullName,
            FullNameAr = req.FullNameAr,
            RoleId = req.RoleId,
            BranchId = req.BranchId,
            Status = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, new { user.Id, user.Email, user.FullName });
    }

    [RequirePermission("Users", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        user.FullName = req.FullName ?? user.FullName;
        user.FullNameAr = req.FullNameAr ?? user.FullNameAr;
        user.RoleId = req.RoleId ?? user.RoleId;
        user.BranchId = req.BranchId ?? user.BranchId;
        user.Status = req.Status ?? user.Status;
        if (req.Password is not null) user.PasswordHash = BCryptHash(req.Password);
        if (req.Pin is not null) user.PinHash = BCryptHash(req.Pin);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new { user.Id, user.Email, user.FullName, user.Status });
    }

    // Self-service profile update — unlike Update(), this never touches role, branch, or status.
    [HttpPut("{id:guid}/profile")]
    public async Task<IActionResult> UpdateProfile(Guid id, [FromBody] UpdateProfileRequest req)
    {
        // Self-service — anyone can update their own profile regardless of the Users
        // module permission, but never someone else's (previously unchecked: any
        // authenticated caller could edit any other user's profile via this endpoint).
        if (CallerRole() != "tenant_admin" && CallerId() != id) return Forbid();

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var emailNorm = req.Email.Trim().ToLower();
        if (await db.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == emailNorm))
            return Conflict("Email already in use.");

        user.FullName = req.FullName;
        user.Email = req.Email.Trim();
        user.Phone = req.Phone;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new { user.Id, user.Email, user.FullName, user.Phone });
    }

    [RequirePermission("Users", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        user.Status = "inactive";
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // Simple placeholder — replace with BCrypt NuGet package in production
    private static string BCryptHash(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));
}

public record CreateUserRequest(
    string Email, string Username, string Password, string? Pin,
    string FullName, string? FullNameAr, Guid RoleId, Guid? BranchId);

public record UpdateUserRequest(
    string? FullName, string? FullNameAr, Guid? RoleId,
    Guid? BranchId, string? Status, string? Password, string? Pin);

public record UpdateProfileRequest(string FullName, string Email, string? Phone);
