using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FinanceController(BaqalaDbContext db) : ControllerBase
{
    // Mirrors the GetCallerContext pattern used across the other controllers.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // ─── Expenses ─────────────────────────────────────────────────────────────
    // Only used by the dedicated /expenses page — safe to gate on "Accounting & Finance" View
    // (unlike GetTaxRules below, nothing at checkout depends on this).
    [RequirePermission("Accounting & Finance", PermAction.View)]
    [HttpGet("expenses")]
    public async Task<IActionResult> GetExpenses(
        [FromQuery] Guid? branchId,
        [FromQuery] string? status,
        [FromQuery] string? paymentMethod,
        [FromQuery] Guid? expenseTypeId)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.Expenses.Include(e => e.ExpenseType).Include(e => e.Branch).AsQueryable();
        if (branchId.HasValue) query = query.Where(e => e.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(e => e.Status == status);
        if (!string.IsNullOrEmpty(paymentMethod)) query = query.Where(e => e.PaymentMethod == paymentMethod);
        if (expenseTypeId.HasValue) query = query.Where(e => e.ExpenseTypeId == expenseTypeId);
        return Ok(await query.OrderByDescending(e => e.ExpenseDate).ToListAsync());
    }

    [RequirePermission("Accounting & Finance", PermAction.Create)]
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

    [RequirePermission("Accounting & Finance", PermAction.Edit)]
    [HttpPut("expenses/{id:guid}")]
    public async Task<IActionResult> UpdateExpense(Guid id, [FromBody] Expense updated)
    {
        var expense = await db.Expenses.FindAsync(id);
        if (expense is null) return NotFound();
        expense.ExpenseTypeId = updated.ExpenseTypeId;
        expense.BranchId = updated.BranchId;
        expense.Amount = updated.Amount;
        expense.PaidAmount = updated.PaidAmount;
        expense.Description = updated.Description;
        expense.ReferenceNumber = updated.ReferenceNumber;
        expense.ExpenseDate = updated.ExpenseDate;
        expense.PaymentMethod = updated.PaymentMethod;
        expense.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(expense);
    }

    [RequirePermission("Accounting & Finance", PermAction.Delete)]
    [HttpDelete("expenses/{id:guid}")]
    public async Task<IActionResult> DeleteExpense(Guid id)
    {
        var expense = await db.Expenses.FindAsync(id);
        if (expense is null) return NotFound();
        db.Expenses.Remove(expense);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [RequirePermission("Accounting & Finance", PermAction.Approve)]
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
    public async Task<IActionResult> GetExpenseTypes([FromQuery] bool includeInactive = false)
    {
        var query = db.ExpenseTypes.AsQueryable();
        if (!includeInactive) query = query.Where(t => t.IsActive);
        return Ok(await query.OrderBy(t => t.Name).ToListAsync());
    }

    [RequirePermission("Accounting & Finance", PermAction.Create)]
    [HttpPost("expense-types")]
    public async Task<IActionResult> CreateExpenseType([FromBody] ExpenseType expenseType)
    {
        expenseType.Id = Guid.NewGuid();
        expenseType.CreatedAt = expenseType.UpdatedAt = DateTime.UtcNow;
        db.ExpenseTypes.Add(expenseType);
        await db.SaveChangesAsync();
        return Created($"/api/finance/expense-types/{expenseType.Id}", expenseType);
    }

    [RequirePermission("Accounting & Finance", PermAction.Edit)]
    [HttpPut("expense-types/{id:guid}")]
    public async Task<IActionResult> UpdateExpenseType(Guid id, [FromBody] ExpenseType updated)
    {
        var expenseType = await db.ExpenseTypes.FindAsync(id);
        if (expenseType is null) return NotFound();
        expenseType.Name = updated.Name;
        expenseType.NameAr = updated.NameAr;
        expenseType.Description = updated.Description;
        expenseType.IsActive = updated.IsActive;
        expenseType.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(expenseType);
    }

    [RequirePermission("Accounting & Finance", PermAction.Delete)]
    [HttpDelete("expense-types/{id:guid}")]
    public async Task<IActionResult> DeleteExpenseType(Guid id)
    {
        var expenseType = await db.ExpenseTypes.FindAsync(id);
        if (expenseType is null) return NotFound();
        expenseType.IsActive = false;
        expenseType.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(expenseType);
    }

    // ─── Coupons ──────────────────────────────────────────────────────────────
    // Only used by the dedicated /coupons page — ValidateCoupon below stays open for POS's
    // by-code lookup, which is the legitimate any-role checkout path.
    [RequirePermission("Coupons", PermAction.View)]
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
        var now = DateTime.UtcNow;
        // Codes are always stored uppercase (CreateCoupon/UpdateCoupon UI uppercases on save) —
        // normalize the lookup too instead of relying on the database column's collation to be
        // case-insensitive, which is environment-dependent and not guaranteed.
        var codeNorm = code.Trim().ToUpper();
        var coupon = await db.Coupons.FirstOrDefaultAsync(c =>
            c.Code == codeNorm && c.Status == "active" &&
            c.StartDate <= now &&
            c.EndDate >= now &&
            (c.UsageLimit == null || c.UsedCount < c.UsageLimit));
        return coupon is null ? NotFound("Coupon invalid or expired.") : Ok(coupon);
    }

    [RequirePermission("Coupons", PermAction.Create)]
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

    [RequirePermission("Coupons", PermAction.Edit)]
    [HttpPut("coupons/{id:guid}")]
    public async Task<IActionResult> UpdateCoupon(Guid id, [FromBody] Coupon updated)
    {
        var coupon = await db.Coupons.FindAsync(id);
        if (coupon is null) return NotFound();
        coupon.Name = updated.Name;
        coupon.Code = updated.Code;
        coupon.Type = updated.Type;
        coupon.Value = updated.Value;
        coupon.UsageLimit = updated.UsageLimit;
        coupon.StartDate = updated.StartDate;
        coupon.EndDate = updated.EndDate;
        coupon.Status = updated.Status;
        coupon.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(coupon);
    }

    [RequirePermission("Coupons", PermAction.Delete)]
    [HttpDelete("coupons/{id:guid}")]
    public async Task<IActionResult> DeleteCoupon(Guid id)
    {
        var coupon = await db.Coupons.FindAsync(id);
        if (coupon is null) return NotFound();
        db.Coupons.Remove(coupon);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Tax/Fee Rules ────────────────────────────────────────────────────────
    // Deliberately NOT gated on "Tax & Fees" — POS checkout (_app.pos.tsx) calls this for every
    // cashier to compute VAT/custom fees on a sale, and Compliance's Tax & ZATCA panel also reads
    // it; neither role necessarily holds the Tax & Fees module. Rule definitions (VAT %, custom
    // fee amounts) aren't per-branch-sensitive data the way expenses/coupons are, so leaving this
    // open doesn't reintroduce a real leak.
    [HttpGet("tax-rules")]
    public async Task<IActionResult> GetTaxRules([FromQuery] Guid? branchId)
    {
        var query = db.TaxFeeRules.AsQueryable();
        if (branchId.HasValue) query = query.Where(r => r.BranchId == null || r.BranchId == branchId);
        return Ok(await query.OrderBy(r => r.RuleName).ToListAsync());
    }

    [RequirePermission("Tax & Fees", PermAction.Create)]
    [HttpPost("tax-rules")]
    public async Task<IActionResult> CreateTaxRule([FromBody] TaxFeeRule rule)
    {
        rule.Id = Guid.NewGuid();
        rule.CreatedAt = rule.UpdatedAt = DateTime.UtcNow;
        db.TaxFeeRules.Add(rule);
        await db.SaveChangesAsync();
        return Created($"/api/finance/tax-rules/{rule.Id}", rule);
    }

    [RequirePermission("Tax & Fees", PermAction.Edit)]
    [HttpPut("tax-rules/{id:guid}")]
    public async Task<IActionResult> UpdateTaxRule(Guid id, [FromBody] TaxFeeRule updated)
    {
        var rule = await db.TaxFeeRules.FindAsync(id);
        if (rule is null) return NotFound();
        rule.RuleName = updated.RuleName;
        rule.RuleType = updated.RuleType;
        rule.VatPercentage = updated.VatPercentage;
        rule.CustomFeeAmount = updated.CustomFeeAmount;
        rule.ExcisePercentage = updated.ExcisePercentage;
        rule.MinimumExciseAmount = updated.MinimumExciseAmount;
        rule.IsTobacco = updated.IsTobacco;
        rule.ApplicableTo = updated.ApplicableTo;
        rule.Status = updated.Status;
        rule.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(rule);
    }
}

public record ApproveExpenseRequest(bool Approved, Guid ApprovedBy);
