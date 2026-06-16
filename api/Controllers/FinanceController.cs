using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FinanceController(BaqalaDbContext db) : ControllerBase
{
    // ─── Expenses ─────────────────────────────────────────────────────────────
    [HttpGet("expenses")]
    public async Task<IActionResult> GetExpenses([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.Expenses.Include(e => e.ExpenseType).Include(e => e.Branch).AsQueryable();
        if (branchId.HasValue) query = query.Where(e => e.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(e => e.Status == status);
        return Ok(await query.OrderByDescending(e => e.ExpenseDate).ToListAsync());
    }

    [HttpPost("expenses")]
    public async Task<IActionResult> CreateExpense([FromBody] Expense expense)
    {
        expense.Id = Guid.NewGuid();
        expense.Status = "pending";
        expense.CreatedAt = expense.UpdatedAt = DateTime.UtcNow;
        db.Expenses.Add(expense);
        await db.SaveChangesAsync();
        return Created($"/api/finance/expenses/{expense.Id}", expense);
    }

    [HttpPatch("expenses/{id:guid}/approve")]
    public async Task<IActionResult> ApproveExpense(Guid id, [FromBody] ApproveExpenseRequest req)
    {
        var expense = await db.Expenses.FindAsync(id);
        if (expense is null) return NotFound();
        expense.Status = req.Approved ? "approved" : "rejected";
        expense.ApprovedBy = req.ApprovedBy;
        expense.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(expense);
    }

    [HttpGet("expense-types")]
    public async Task<IActionResult> GetExpenseTypes()
    {
        return Ok(await db.ExpenseTypes.Where(t => t.IsActive).OrderBy(t => t.Name).ToListAsync());
    }

    [HttpPost("expense-types")]
    public async Task<IActionResult> CreateExpenseType([FromBody] ExpenseType expenseType)
    {
        expenseType.Id = Guid.NewGuid();
        expenseType.CreatedAt = expenseType.UpdatedAt = DateTime.UtcNow;
        db.ExpenseTypes.Add(expenseType);
        await db.SaveChangesAsync();
        return Created($"/api/finance/expense-types/{expenseType.Id}", expenseType);
    }

    // ─── Coupons ──────────────────────────────────────────────────────────────
    [HttpGet("coupons")]
    public async Task<IActionResult> GetCoupons([FromQuery] string? status)
    {
        var query = db.Coupons.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(c => c.Status == status);
        return Ok(await query.OrderByDescending(c => c.CreatedAt).ToListAsync());
    }

    [HttpGet("coupons/validate/{code}")]
    public async Task<IActionResult> ValidateCoupon(string code)
    {
        var coupon = await db.Coupons.FirstOrDefaultAsync(c =>
            c.Code == code && c.Status == "active" &&
            c.StartDate <= DateOnly.FromDateTime(DateTime.UtcNow) &&
            c.EndDate >= DateOnly.FromDateTime(DateTime.UtcNow) &&
            (c.UsageLimit == null || c.UsedCount < c.UsageLimit));
        return coupon is null ? NotFound("Coupon invalid or expired.") : Ok(coupon);
    }

    [HttpPost("coupons")]
    public async Task<IActionResult> CreateCoupon([FromBody] Coupon coupon)
    {
        coupon.Id = Guid.NewGuid();
        coupon.UsedCount = 0;
        coupon.CreatedAt = coupon.UpdatedAt = DateTime.UtcNow;
        db.Coupons.Add(coupon);
        await db.SaveChangesAsync();
        return Created($"/api/finance/coupons/{coupon.Id}", coupon);
    }

    // ─── Tax/Fee Rules ────────────────────────────────────────────────────────
    [HttpGet("tax-rules")]
    public async Task<IActionResult> GetTaxRules([FromQuery] Guid? branchId)
    {
        var query = db.TaxFeeRules.AsQueryable();
        if (branchId.HasValue) query = query.Where(r => r.BranchId == null || r.BranchId == branchId);
        return Ok(await query.OrderBy(r => r.RuleName).ToListAsync());
    }

    [HttpPost("tax-rules")]
    public async Task<IActionResult> CreateTaxRule([FromBody] TaxFeeRule rule)
    {
        rule.Id = Guid.NewGuid();
        rule.CreatedAt = rule.UpdatedAt = DateTime.UtcNow;
        db.TaxFeeRules.Add(rule);
        await db.SaveChangesAsync();
        return Created($"/api/finance/tax-rules/{rule.Id}", rule);
    }
}

public record ApproveExpenseRequest(bool Approved, Guid ApprovedBy);
