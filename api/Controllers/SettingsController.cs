using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet("pos/{branchId:guid}")]
    public async Task<IActionResult> GetPosSettings(Guid branchId)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        return settings is null ? NotFound() : Ok(settings);
    }

    [RequirePermission("Settings", PermAction.Edit)]
    [HttpPut("pos/{branchId:guid}")]
    public async Task<IActionResult> UpsertPosSettings(Guid branchId, [FromBody] PosSettings updated)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        if (settings is null)
        {
            updated.Id = Guid.NewGuid();
            updated.BranchId = branchId;
            updated.CreatedAt = updated.UpdatedAt = DateTime.UtcNow;
            db.PosSettings.Add(updated);
            settings = updated;
        }
        else
        {
            // Cashier tab
            settings.RequireShiftOpen                 = updated.RequireShiftOpen;
            settings.RequireOpeningCashCount          = updated.RequireOpeningCashCount;
            settings.AutoLockIdle                     = updated.AutoLockIdle;
            settings.AllowCustomerViewPaidShifts      = updated.AllowCustomerViewPaidShifts;
            // Terminal tab
            settings.AllowTerminalSwitching           = updated.AllowTerminalSwitching;
            settings.PreserveHeldOrders               = updated.PreserveHeldOrders;
            settings.OfflineModeEnabled               = updated.OfflineModeEnabled;
            // Invoice tab
            settings.AutoPrintReceipt                 = updated.AutoPrintReceipt;
            settings.SendSmsInvoice                   = updated.SendSmsInvoice;
            // Permissions tab
            settings.CashierCanDiscount               = updated.CashierCanDiscount;
            settings.CashierCanCoupon                 = updated.CashierCanCoupon;
            settings.CashierCanRefund                 = updated.CashierCanRefund;
            settings.CashierCanHoldOrder              = updated.CashierCanHoldOrder;
            settings.CashierCanEditOrder              = updated.CashierCanEditOrder;
            settings.RequireReasonForVoid             = updated.RequireReasonForVoid;
            settings.RequireManagerApprovalForRefund  = updated.RequireManagerApprovalForRefund;
            settings.AllowNegativeStock               = updated.AllowNegativeStock;
            // Scan tab
            settings.BeepOnScan                       = updated.BeepOnScan;
            settings.WarnNearExpiry                   = updated.WarnNearExpiry;
            settings.AllowNearExpirySale              = updated.AllowNearExpirySale;
            settings.BlockExpiredItems                = updated.BlockExpiredItems;
            settings.BlockNonpermissibleItems         = updated.BlockNonpermissibleItems;
            // Expiry policy tab
            settings.CloseToExpiryAlertDays           = updated.CloseToExpiryAlertDays;
            settings.AllowExpiryManagerOverride       = updated.AllowExpiryManagerOverride;
            settings.AutoMoveExpiredToBlockedList     = updated.AutoMoveExpiredToBlockedList;
            settings.ExpiryNotificationFrequencyHours = updated.ExpiryNotificationFrequencyHours;
            // Permissible items policy tab
            settings.TobaccoAgeRestricted             = updated.TobaccoAgeRestricted;
            settings.TobaccoRequireManagerApproval    = updated.TobaccoRequireManagerApproval;
            settings.BlockAgeRestrictedAtCashier      = updated.BlockAgeRestrictedAtCashier;
            settings.MinCustomerAge                   = updated.MinCustomerAge;
            // Returns policy tab
            settings.ReturnWindowDays                 = updated.ReturnWindowDays;
            settings.ReturnRequireReceiptOnly         = updated.ReturnRequireReceiptOnly;
            settings.AllowReturnsWithoutReceipt       = updated.AllowReturnsWithoutReceipt;
            settings.ReturnManagerApprovalAboveSar    = updated.ReturnManagerApprovalAboveSar;
            settings.RefundableCash                   = updated.RefundableCash;
            settings.RefundableCard                   = updated.RefundableCard;
            settings.RefundableWallet                 = updated.RefundableWallet;
            settings.IssueStoreCreditForDamagedItems  = updated.IssueStoreCreditForDamagedItems;
            settings.AllowExpiredItemReturn           = updated.AllowExpiredItemReturn;
            // Refund policy tab
            settings.MaxRefundPerCashierSar           = updated.MaxRefundPerCashierSar;
            settings.RefundManagerApprovalAboveSar    = updated.RefundManagerApprovalAboveSar;
            settings.AllowRefundReversalWithin24h     = updated.AllowRefundReversalWithin24h;
            settings.AutoPrintRefundReceipt           = updated.AutoPrintRefundReceipt;
            // Discount policy tab
            settings.CashierMaxDiscountPct            = updated.CashierMaxDiscountPct;
            settings.ManagerMaxDiscountPct            = updated.ManagerMaxDiscountPct;
            settings.RequireReasonForDiscount         = updated.RequireReasonForDiscount;
            // Coupon policy tab
            settings.CombineMultipleCoupons           = updated.CombineMultipleCoupons;
            settings.MaxCouponValueSar                = updated.MaxCouponValueSar;
            // Cashier shift policy tab
            settings.MaxShiftDurationHours            = updated.MaxShiftDurationHours;
            settings.RequireBreakAfter4h              = updated.RequireBreakAfter4h;
            settings.AutoCheckoutOnShiftEnd           = updated.AutoCheckoutOnShiftEnd;
            // Opening/closing cash policy tab
            settings.MinOpeningCashSar                = updated.MinOpeningCashSar;
            settings.MaxOpeningCashSar                = updated.MaxOpeningCashSar;
            settings.CashVarianceThresholdSar         = updated.CashVarianceThresholdSar;
            settings.RequireManagerApprovalAboveCashThreshold = updated.RequireManagerApprovalAboveCashThreshold;
            // Inventory adjustment policy tab
            settings.RequireReasonForAdjustments      = updated.RequireReasonForAdjustments;
            settings.AdjustmentCapPerDayUnits         = updated.AdjustmentCapPerDayUnits;
            settings.ManagerApprovalForDamagedItems   = updated.ManagerApprovalForDamagedItems;

            settings.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "POS settings updated",
            entityType: "PosSettings",
            entityId: settings.Id,
            branchId: branchId,
            details: $"RequireShiftOpen:{settings.RequireShiftOpen} AutoPrint:{settings.AutoPrintReceipt} Offline:{settings.OfflineModeEnabled} BlockExpired:{settings.BlockExpiredItems}",
            severity: "warning");

        return Ok(settings);
    }

    // ── Tenant key-value settings ────────────────────────────────────────────

    [HttpGet("tenant/{branchId:guid}")]
    public async Task<IActionResult> GetTenantSettings(Guid branchId)
    {
        var rows = await db.TenantSettings
            .Where(s => s.BranchId == branchId)
            .ToListAsync();
        var dict = rows.ToDictionary(r => r.SettingKey, r => r.SettingValue);
        return Ok(dict);
    }

    [RequirePermission("Settings", PermAction.Edit)]
    [HttpPut("tenant/{branchId:guid}")]
    public async Task<IActionResult> UpsertTenantSettings(Guid branchId, [FromBody] Dictionary<string, string?> settings)
    {
        var existingRows = await db.TenantSettings
            .Where(s => s.BranchId == branchId)
            .ToListAsync();
        var existing = existingRows.ToDictionary(s => s.SettingKey);

        foreach (var (key, value) in settings)
        {
            if (existing.TryGetValue(key, out var row))
            {
                row.SettingValue = value;
                row.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.TenantSettings.Add(new TenantSetting
                {
                    Id = Guid.NewGuid(),
                    BranchId = branchId,
                    SettingKey = key,
                    SettingValue = value,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Tenant settings updated",
            entityType: "TenantSettings",
            branchId: branchId,
            details: $"{settings.Count} key(s) updated",
            severity: "warning");

        return Ok(new { message = "Settings updated successfully.", updatedCount = settings.Count });
    }

    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendance([FromQuery] Guid? branchId, [FromQuery] DateOnly? date)
    {
        var query = db.StaffAttendances.Include(a => a.User).AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (date.HasValue)
            query = query.Where(a => a.CheckIn != null &&
                DateOnly.FromDateTime(a.CheckIn.Value) == date);
        return Ok(await query.ToListAsync());
    }

    [HttpPost("attendance")]
    public async Task<IActionResult> RecordAttendance([FromBody] StaffAttendance attendance)
    {
        attendance.Id = Guid.NewGuid();
        attendance.CreatedAt = attendance.UpdatedAt = DateTime.UtcNow;
        db.StaffAttendances.Add(attendance);
        await db.SaveChangesAsync();
        return Created($"/api/settings/attendance/{attendance.Id}", attendance);
    }

    [HttpPatch("attendance/{id:guid}/checkout")]
    public async Task<IActionResult> CheckOut(Guid id)
    {
        var attendance = await db.StaffAttendances.FindAsync(id);
        if (attendance is null) return NotFound();
        attendance.CheckOut = DateTime.UtcNow;
        attendance.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(attendance);
    }
}
