using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

// Shared compute-on-read status derivation used by HrAttendanceController and HrReportsController
// so the Attendance module and the Attendance/Shift Closing Reports never disagree about what a
// row "really" is. Nothing here is persisted — StaffAttendance.Status stays whatever Mark/Correct
// last wrote; these only affect what's returned in API responses.
public static class AttendanceStatusHelper
{
    // FRD ATT-03 — a past-dated row with a check-in but no check-out is Checkout Missing
    // regardless of its stored status. FRD HOL-01 — an active holiday date overrides the
    // displayed status to Holiday unless the employee is already on_leave that day.
    public static void ApplyDerivedStatus(IEnumerable<StaffAttendance> rows, HashSet<(Guid? BranchId, DateOnly Date)> holidays)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        foreach (var row in rows)
        {
            if (row.Date.HasValue && row.Date.Value < today && row.CheckIn.HasValue && !row.CheckOut.HasValue
                && row.Status is "present" or "late")
            {
                row.Status = "checkout_missing";
                continue;
            }
            if (row.Date.HasValue && row.Status != "on_leave"
                && (holidays.Contains((row.BranchId, row.Date.Value)) || holidays.Contains((null, row.Date.Value))))
            {
                row.Status = "holiday";
            }
        }
    }

    // FRD 15 — Open, Closed, Late Closed, Checkout Missing, Manually Closed, Cancelled.
    // "Cancelled" applies to a day the employee wasn't expected to work (absent/on_leave/holiday
    // already routed to Not Applicable in the caller — Cancelled instead marks a shift the
    // employee started then never returned to close AND that was later superseded, i.e. a
    // corrected row whose current status moved to absent/cancelled after check-in).
    public static string ClosingStatus(StaffAttendance a, DateOnly today)
    {
        if (a.Status is "absent" or "on_leave" or "holiday") return "Not Applicable";
        if (a.Status == "cancelled") return "Cancelled";
        if (a.CheckOut is not null)
        {
            if (a.RecordedBy is not null) return "Manually Closed";
            if (a.LateMinutes > 0 || (a.Shift is not null && IsLateClose(a))) return "Late Closed";
            return "Closed";
        }
        if (a.Date == today) return "Open";
        return "Checkout Missing";
    }

    // A close is "late" when checkout happened after the shift's end + grace-out window.
    private static bool IsLateClose(StaffAttendance a)
    {
        if (a.Shift is null || a.CheckOut is null || !TimeSpan.TryParse(a.Shift.EndTime, out var end)) return false;
        var allowed = end + TimeSpan.FromMinutes(a.Shift.GraceOutMinutes);
        return a.CheckOut.Value.TimeOfDay > allowed;
    }

    public static DateTime? ClosingTime(StaffAttendance a) =>
        a.RecordedBy is not null ? a.UpdatedAt : a.CheckOut;
}
