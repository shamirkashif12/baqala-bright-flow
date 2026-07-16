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

    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's staff —
    // same fix as BranchesController/TerminalsController/DevicesController. branchId was only
    // an optional query param; a call with none (e.g. Control Tower's Staff tab, or the
    // cashier-check-in cashier picker) returned every branch's users, including name/email,
    // regardless of caller role.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Real-world mart org chart, lower number = more authority. Mirrors ROLE_RANK in
    // src/lib/role-hierarchy.ts and the role slugs AuthController.ToAppRole assigns.
    private static readonly Dictionary<string, int> RoleRank = new()
    {
        ["tenant_admin"] = 1, ["branch_manager"] = 2, ["supervisor"] = 3, ["warehouse_manager"] = 3,
        ["cashier"] = 4, ["storekeeper"] = 4, ["finance_user"] = 4, ["marketing_user"] = 4, ["picker"] = 4,
        ["auditor"] = 4, ["warehouse_staff"] = 4,
    };

    // Mirrors AuthController.ToAppRole / src/lib/role-hierarchy.ts roleNameToSlug, so a
    // Role.Name from the DB can be ranked the same way the frontend ranks it.
    private static string RoleSlug(string? roleName) => roleName switch
    {
        "Tenant Administrator" or "Admin" => "tenant_admin",
        "Branch Manager" or "Manager" => "branch_manager",
        "Cashier" => "cashier",
        "Storekeeper" or "Inventory Staff" => "storekeeper",
        "Supervisor" => "supervisor",
        "Finance User" or "Accountant" => "finance_user",
        "Marketing User" => "marketing_user",
        "Picker" => "picker",
        "Auditor" => "auditor",
        "Warehouse Staff" => "warehouse_staff",
        "Warehouse Manager" => "warehouse_manager",
        _ => (roleName ?? "").ToLower().Replace(' ', '_'),
    };

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.Users.Include(u => u.Role).Include(u => u.Branch).AsQueryable();

        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        if (branchId.HasValue) query = query.Where(u => u.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(u => u.Status == status);
        var users = await query.Select(u => new
        {
            u.Id, u.Email, u.Username, u.FullName, u.FullNameAr, u.Phone,
            // Left-join Role like Branch below — a dangling RoleId (deleted/renamed role)
            // would otherwise turn u.Role.Name into a required-navigation INNER JOIN and
            // silently drop that user from the whole list instead of just showing no role.
            u.RoleId, RoleName = u.Role != null ? u.Role.Name : null,
            u.BranchId, BranchName = u.Branch != null ? u.Branch.Name : null,
            u.Status, u.LastLogin, u.CreatedAt,
            HasCustomPermissions = db.UserPermissions.Any(p => p.UserId == u.Id)
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
                u.RoleId, RoleName = u.Role != null ? u.Role.Name : null,
                u.BranchId, BranchName = u.Branch != null ? u.Branch.Name : null,
                u.Status, u.LastLogin, u.CreatedAt,
                HasCustomPermissions = db.UserPermissions.Any(p => p.UserId == u.Id)
            })
            .FirstOrDefaultAsync(u => u.Id == id);
        return user is null ? NotFound() : Ok(user);
    }

    // Any signed-in user may read their OWN overrides (needed to build their permission
    // map on login); viewing someone else's requires Users-edit, same as changing them.
    [HttpGet("{id:guid}/permissions")]
    public async Task<IActionResult> GetPermissions(Guid id)
    {
        if (CallerId() != id && CallerRole() != "tenant_admin" && !await CallerCanEditUsersAsync())
            return Forbid();

        var perms = await db.UserPermissions.AsNoTracking()
            .Where(p => p.UserId == id)
            .Select(p => new { p.Module, p.CanView, p.CanCreate, p.CanEdit, p.CanDelete, p.CanApprove, p.CanExport })
            .ToListAsync();
        return Ok(perms);
    }

    private async Task<bool> CallerCanEditUsersAsync()
    {
        if (!Guid.TryParse(User.FindFirst("roleId")?.Value, out var roleId)) return false;
        var perm = await db.RolePermissions.AsNoTracking()
            .FirstOrDefaultAsync(p => p.RoleId == roleId && p.Module == "Users");
        return perm?.CanEdit == true;
    }

    [RequirePermission("Users", PermAction.Edit)]
    [HttpPut("{id:guid}/permissions")]
    public async Task<IActionResult> UpdatePermissions(Guid id, [FromBody] List<UserPermission> permissions)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id)) return NotFound();

        var existing = db.UserPermissions.Where(p => p.UserId == id);
        db.UserPermissions.RemoveRange(existing);
        foreach (var p in permissions) { p.Id = Guid.NewGuid(); p.UserId = id; }
        db.UserPermissions.AddRange(permissions);
        await db.SaveChangesAsync();

        return Ok(permissions);
    }

    [RequirePermission("Users", PermAction.Edit)]
    [HttpDelete("{id:guid}/permissions")]
    public async Task<IActionResult> ResetPermissions(Guid id)
    {
        var existing = db.UserPermissions.Where(p => p.UserId == id);
        db.UserPermissions.RemoveRange(existing);
        await db.SaveChangesAsync();
        return NoContent();
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
        var user = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound();

        // Changing role or status is privilege-affecting (can self-promote to tenant_admin, or
        // deactivate/reactivate a peer). Mirrors canManageUser (src/lib/role-hierarchy.ts): never
        // yourself, and only a strictly higher-ranked caller may do it to anyone else. This was
        // previously enforced only in the UI (hiding the button) — a direct PUT could bypass it
        // entirely, including a caller promoting their own account to Tenant Administrator.
        var changingRoleOrStatus = (req.RoleId.HasValue && req.RoleId.Value != user.RoleId)
            || (req.Status is not null && req.Status != user.Status);
        if (changingRoleOrStatus)
        {
            if (CallerId() == id)
                return BadRequest(new { message = "You cannot change your own role or status." });

            var callerRank = RoleRank.GetValueOrDefault(CallerRole() ?? "", int.MaxValue);
            var targetRank = RoleRank.GetValueOrDefault(RoleSlug(user.Role?.Name), int.MaxValue);
            if (callerRank >= targetRank)
                return Forbid();
        }

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
