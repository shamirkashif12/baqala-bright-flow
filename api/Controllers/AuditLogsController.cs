using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuditLogsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's events.
    // Rows with no BranchId (tenant-level actions — role/settings changes, etc.) are excluded
    // for scoped roles rather than shown, since they aren't "this branch's" activity either.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Previously ungated — any authenticated user of any role could call this directly and page
    // through the entire tenant audit trail, independent of whether their role's "Audit Logs"
    // permission (checked client-side by ModuleGate) even granted View.
    [RequirePermission("Audit Logs", PermAction.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? userId,
        [FromQuery] string? entityType,
        [FromQuery] Guid? entityId,
        [FromQuery] string? action,
        [FromQuery] string? severity,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = db.AuditLogs.AsQueryable();
        if (userId.HasValue) query = query.Where(a => a.UserId == userId);
        if (!string.IsNullOrEmpty(entityType)) query = query.Where(a => a.EntityType == entityType);
        if (entityId.HasValue) query = query.Where(a => a.EntityId == entityId);
        // Employee Activity groups several concrete actions under one heading (e.g. "Discounts" =
        // edit_order lines that changed a discount), so this accepts a comma-separated list rather
        // than a single value — one round trip per group instead of one per action.
        if (!string.IsNullOrWhiteSpace(action))
        {
            var actions = action.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (actions.Length > 0) query = query.Where(a => actions.Contains(a.Action));
        }
        if (!string.IsNullOrEmpty(severity)) query = query.Where(a => a.Severity == severity);
        if (from.HasValue) query = query.Where(a => a.CreatedAt >= from);
        if (to.HasValue) query = query.Where(a => a.CreatedAt <= to);

        var (role, branchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && branchId.HasValue)
            query = query.Where(a => a.BranchId == branchId);

        // Hard-capped: the Employee Activity page passes a large pageSize to build its counters,
        // and an unbounded value here would let one request pull the whole tenant trail into memory.
        pageSize = Math.Clamp(pageSize, 1, 500);
        page = Math.Max(1, page);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    // FRD 3.1 — direct URL access to a restricted page must be logged. Deliberately not the
    // general Create endpoint below (which requires Audit Logs Create and accepts an arbitrary
    // body): a user denied a page they lack permission for often lacks Audit Logs permission too,
    // so this narrow, [Authorize]-only endpoint self-reports a fixed "Access denied" action tied
    // to the caller's own identity — it cannot forge an arbitrary log row.
    [Authorize]
    [HttpPost("access-denied")]
    public async Task<IActionResult> LogAccessDenied([FromBody] AccessDeniedRequest req)
    {
        var userId = Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var uid) ? uid : (Guid?)null;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        await audit.LogAsync(action: "Access denied", userId: userId, branchId: branchId, severity: "warning",
            details: $"Denied direct access to {req.Path}");
        return NoContent();
    }

    // Previously ungated entirely — no [Authorize], no [RequirePermission] — while binding the
    // AuditLog entity wholesale from the body. Any caller could forge rows with an arbitrary
    // UserId, Action, Severity or IpAddress, attributing actions to any user and defeating the
    // "tamper-proof trail" the Employee Audit Center claims. Nothing in the app calls this: audit
    // rows are written server-side by IAuditService at the point of the action. It is gated and
    // attribution-forced here rather than removed outright, in case an external integration
    // depends on it — but removing it is the better end state if none does.
    [RequirePermission("Audit Logs", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AuditLog log)
    {
        log.Id = Guid.NewGuid();
        log.CreatedAt = DateTime.UtcNow;
        // Identity and provenance come from the request context, never from the body.
        log.UserId = Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var uid) ? uid : null;
        log.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        db.AuditLogs.Add(log);
        await db.SaveChangesAsync();
        return Created($"/api/auditlogs/{log.Id}", log);
    }
}

public record AccessDeniedRequest(string Path);
