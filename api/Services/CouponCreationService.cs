using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

public interface ICouponCreationService
{
    /// <summary>Creates a live Coupon from a (possibly client-supplied-id, stale) Coupon payload —
    /// always assigns a fresh Id/UsedCount/timestamps, same as FinanceController.CreateCoupon did
    /// inline before this was extracted so the Approval Center decision path could reuse it.
    /// `createdBy` is always the caller's own id, never `req.CreatedBy` — a client payload can't be
    /// trusted to name its own creator. For a request that went through the Approval Center, that's
    /// the original requester (the manager who asked for it), not the admin who approved it.</summary>
    Task<Coupon> CreateAsync(Coupon req, Guid createdBy);
}

public class CouponCreationService(BaqalaDbContext db) : ICouponCreationService
{
    public async Task<Coupon> CreateAsync(Coupon req, Guid createdBy)
    {
        var coupon = new Coupon
        {
            Id = Guid.NewGuid(),
            Code = req.Code,
            Name = req.Name,
            NameAr = req.NameAr,
            Type = req.Type,
            Value = req.Value,
            MinOrderAmount = req.MinOrderAmount,
            MaxDiscountAmount = req.MaxDiscountAmount,
            UsageLimit = req.UsageLimit,
            UsedCount = 0,
            ApplicableTo = req.ApplicableTo,
            ApplicableId = req.ApplicableId,
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            Status = req.Status,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Coupons.Add(coupon);
        await db.SaveChangesAsync();
        return coupon;
    }
}
