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
    public async Task<IActionResult> UpsertPosSettings(Guid branchId, [FromBody] PosSettingsPatchRequest updated)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        if (settings is null)
        {
            settings = new PosSettings { Id = Guid.NewGuid(), BranchId = branchId, CreatedAt = DateTime.UtcNow };
            db.PosSettings.Add(settings);
        }

        // Every field is optional on the request and merges onto the existing value instead of
        // overwriting unconditionally — several different screens (Compliance's 4 toggles, POS
        // Settings' full form, more added over time) each only know about a subset of this
        // ~55-field record, and a caller omitting a field must not silently reset it to the
        // PosSettings class default. This previously bound directly to the PosSettings entity
        // with non-nullable bool/decimal/int fields, so an absent JSON field was indistinguishable
        // from an explicit false/0 — any save from any one screen wiped out every field the other
        // screens manage.
        // Cashier tab
        settings.RequireShiftOpen                 = updated.RequireShiftOpen                 ?? settings.RequireShiftOpen;
        settings.RequireOpeningCashCount          = updated.RequireOpeningCashCount          ?? settings.RequireOpeningCashCount;
        settings.AutoLockIdle                     = updated.AutoLockIdle                     ?? settings.AutoLockIdle;
        settings.AllowCustomerViewPaidShifts      = updated.AllowCustomerViewPaidShifts      ?? settings.AllowCustomerViewPaidShifts;
        // Terminal tab
        settings.AllowTerminalSwitching           = updated.AllowTerminalSwitching           ?? settings.AllowTerminalSwitching;
        settings.PreserveHeldOrders                = updated.PreserveHeldOrders               ?? settings.PreserveHeldOrders;
        settings.OfflineModeEnabled                = updated.OfflineModeEnabled               ?? settings.OfflineModeEnabled;
        // Invoice tab
        settings.AutoPrintReceipt                  = updated.AutoPrintReceipt                 ?? settings.AutoPrintReceipt;
        settings.SendSmsInvoice                    = updated.SendSmsInvoice                   ?? settings.SendSmsInvoice;
        // Self-checkout kiosk tab
        settings.SelfCheckoutMaxOrderValueSar      = updated.SelfCheckoutMaxOrderValueSar      ?? settings.SelfCheckoutMaxOrderValueSar;
        // Permissions tab
        settings.CashierCanDiscount                = updated.CashierCanDiscount               ?? settings.CashierCanDiscount;
        settings.CashierCanCoupon                   = updated.CashierCanCoupon                 ?? settings.CashierCanCoupon;
        settings.CashierCanRefund                   = updated.CashierCanRefund                 ?? settings.CashierCanRefund;
        settings.CashierCanHoldOrder                = updated.CashierCanHoldOrder              ?? settings.CashierCanHoldOrder;
        settings.CashierCanEditOrder                = updated.CashierCanEditOrder              ?? settings.CashierCanEditOrder;
        settings.RequireReasonForVoid               = updated.RequireReasonForVoid             ?? settings.RequireReasonForVoid;
        settings.RequireManagerApprovalForRefund    = updated.RequireManagerApprovalForRefund   ?? settings.RequireManagerApprovalForRefund;
        settings.AllowNegativeStock                 = updated.AllowNegativeStock                ?? settings.AllowNegativeStock;
        // Scan tab
        settings.BeepOnScan                         = updated.BeepOnScan                        ?? settings.BeepOnScan;
        settings.WarnNearExpiry                     = updated.WarnNearExpiry                    ?? settings.WarnNearExpiry;
        settings.AllowNearExpirySale                = updated.AllowNearExpirySale               ?? settings.AllowNearExpirySale;
        settings.BlockExpiredItems                  = updated.BlockExpiredItems                 ?? settings.BlockExpiredItems;
        settings.BlockNonpermissibleItems           = updated.BlockNonpermissibleItems          ?? settings.BlockNonpermissibleItems;
        // Expiry policy tab
        settings.CloseToExpiryAlertDays             = updated.CloseToExpiryAlertDays            ?? settings.CloseToExpiryAlertDays;
        settings.AllowExpiryManagerOverride         = updated.AllowExpiryManagerOverride        ?? settings.AllowExpiryManagerOverride;
        settings.AutoMoveExpiredToBlockedList       = updated.AutoMoveExpiredToBlockedList      ?? settings.AutoMoveExpiredToBlockedList;
        settings.ExpiryNotificationFrequencyHours   = updated.ExpiryNotificationFrequencyHours  ?? settings.ExpiryNotificationFrequencyHours;
        // Permissible items policy tab
        settings.TobaccoAgeRestricted               = updated.TobaccoAgeRestricted             ?? settings.TobaccoAgeRestricted;
        settings.TobaccoRequireManagerApproval       = updated.TobaccoRequireManagerApproval     ?? settings.TobaccoRequireManagerApproval;
        settings.BlockAgeRestrictedAtCashier         = updated.BlockAgeRestrictedAtCashier       ?? settings.BlockAgeRestrictedAtCashier;
        settings.MinCustomerAge                      = updated.MinCustomerAge                    ?? settings.MinCustomerAge;
        // Returns policy tab
        settings.ReturnWindowDays                    = updated.ReturnWindowDays                  ?? settings.ReturnWindowDays;
        settings.ReturnRequireReceiptOnly            = updated.ReturnRequireReceiptOnly          ?? settings.ReturnRequireReceiptOnly;
        settings.AllowReturnsWithoutReceipt          = updated.AllowReturnsWithoutReceipt        ?? settings.AllowReturnsWithoutReceipt;
        settings.ReturnManagerApprovalAboveSar       = updated.ReturnManagerApprovalAboveSar     ?? settings.ReturnManagerApprovalAboveSar;
        settings.RefundableCash                      = updated.RefundableCash                    ?? settings.RefundableCash;
        settings.RefundableCard                      = updated.RefundableCard                    ?? settings.RefundableCard;
        settings.RefundableWallet                    = updated.RefundableWallet                  ?? settings.RefundableWallet;
        settings.IssueStoreCreditForDamagedItems     = updated.IssueStoreCreditForDamagedItems   ?? settings.IssueStoreCreditForDamagedItems;
        settings.AllowExpiredItemReturn              = updated.AllowExpiredItemReturn            ?? settings.AllowExpiredItemReturn;
        // Refund policy tab
        settings.MaxRefundPerCashierSar              = updated.MaxRefundPerCashierSar            ?? settings.MaxRefundPerCashierSar;
        settings.RefundManagerApprovalAboveSar       = updated.RefundManagerApprovalAboveSar     ?? settings.RefundManagerApprovalAboveSar;
        settings.AllowRefundReversalWithin24h        = updated.AllowRefundReversalWithin24h      ?? settings.AllowRefundReversalWithin24h;
        settings.AutoPrintRefundReceipt              = updated.AutoPrintRefundReceipt            ?? settings.AutoPrintRefundReceipt;
        // Discount policy tab
        settings.CashierMaxDiscountPct               = updated.CashierMaxDiscountPct             ?? settings.CashierMaxDiscountPct;
        settings.ManagerMaxDiscountPct               = updated.ManagerMaxDiscountPct             ?? settings.ManagerMaxDiscountPct;
        settings.RequireReasonForDiscount            = updated.RequireReasonForDiscount         ?? settings.RequireReasonForDiscount;
        // Coupon policy tab
        settings.CombineMultipleCoupons              = updated.CombineMultipleCoupons           ?? settings.CombineMultipleCoupons;
        settings.MaxCouponValueSar                   = updated.MaxCouponValueSar                ?? settings.MaxCouponValueSar;
        // Cashier shift policy tab
        settings.MaxShiftDurationHours               = updated.MaxShiftDurationHours            ?? settings.MaxShiftDurationHours;
        settings.RequireBreakAfter4h                 = updated.RequireBreakAfter4h               ?? settings.RequireBreakAfter4h;
        settings.AutoCheckoutOnShiftEnd              = updated.AutoCheckoutOnShiftEnd            ?? settings.AutoCheckoutOnShiftEnd;
        // Opening/closing cash policy tab
        settings.MinOpeningCashSar                   = updated.MinOpeningCashSar                ?? settings.MinOpeningCashSar;
        settings.MaxOpeningCashSar                   = updated.MaxOpeningCashSar                ?? settings.MaxOpeningCashSar;
        settings.CashVarianceThresholdSar            = updated.CashVarianceThresholdSar         ?? settings.CashVarianceThresholdSar;
        settings.RequireManagerApprovalAboveCashThreshold = updated.RequireManagerApprovalAboveCashThreshold ?? settings.RequireManagerApprovalAboveCashThreshold;
        // Inventory adjustment policy tab
        settings.RequireReasonForAdjustments         = updated.RequireReasonForAdjustments       ?? settings.RequireReasonForAdjustments;
        settings.AdjustmentCapPerDayUnits            = updated.AdjustmentCapPerDayUnits          ?? settings.AdjustmentCapPerDayUnits;
        settings.ManagerApprovalForDamagedItems      = updated.ManagerApprovalForDamagedItems    ?? settings.ManagerApprovalForDamagedItems;

        settings.UpdatedAt = DateTime.UtcNow;
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

// Every field nullable/optional so PUT pos/{branchId} can merge a partial payload onto the
// existing PosSettings row instead of overwriting the ~50 fields the caller doesn't know about.
// Mirrors PosSettings.cs field-for-field — keep both in sync when adding a setting.
public record PosSettingsPatchRequest(
    bool? RequireShiftOpen,
    bool? RequireOpeningCashCount,
    bool? AutoLockIdle,
    bool? AllowCustomerViewPaidShifts,
    bool? AllowTerminalSwitching,
    bool? PreserveHeldOrders,
    bool? OfflineModeEnabled,
    bool? AutoPrintReceipt,
    bool? SendSmsInvoice,
    decimal? SelfCheckoutMaxOrderValueSar,
    bool? CashierCanDiscount,
    bool? CashierCanCoupon,
    bool? CashierCanRefund,
    bool? CashierCanHoldOrder,
    bool? CashierCanEditOrder,
    bool? RequireReasonForVoid,
    bool? RequireManagerApprovalForRefund,
    bool? AllowNegativeStock,
    bool? BeepOnScan,
    bool? WarnNearExpiry,
    bool? AllowNearExpirySale,
    bool? BlockExpiredItems,
    bool? BlockNonpermissibleItems,
    int? CloseToExpiryAlertDays,
    bool? AllowExpiryManagerOverride,
    bool? AutoMoveExpiredToBlockedList,
    int? ExpiryNotificationFrequencyHours,
    bool? TobaccoAgeRestricted,
    bool? TobaccoRequireManagerApproval,
    bool? BlockAgeRestrictedAtCashier,
    int? MinCustomerAge,
    int? ReturnWindowDays,
    bool? ReturnRequireReceiptOnly,
    bool? AllowReturnsWithoutReceipt,
    decimal? ReturnManagerApprovalAboveSar,
    bool? RefundableCash,
    bool? RefundableCard,
    bool? RefundableWallet,
    bool? IssueStoreCreditForDamagedItems,
    bool? AllowExpiredItemReturn,
    decimal? MaxRefundPerCashierSar,
    decimal? RefundManagerApprovalAboveSar,
    bool? AllowRefundReversalWithin24h,
    bool? AutoPrintRefundReceipt,
    decimal? CashierMaxDiscountPct,
    decimal? ManagerMaxDiscountPct,
    bool? RequireReasonForDiscount,
    bool? CombineMultipleCoupons,
    decimal? MaxCouponValueSar,
    int? MaxShiftDurationHours,
    bool? RequireBreakAfter4h,
    bool? AutoCheckoutOnShiftEnd,
    decimal? MinOpeningCashSar,
    decimal? MaxOpeningCashSar,
    decimal? CashVarianceThresholdSar,
    bool? RequireManagerApprovalAboveCashThreshold,
    bool? RequireReasonForAdjustments,
    int? AdjustmentCapPerDayUnits,
    bool? ManagerApprovalForDamagedItems
);
