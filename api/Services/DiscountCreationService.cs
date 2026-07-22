using BaqalaPOS.Api.Controllers;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

public interface IDiscountCreationService
{
    /// <summary>Creates a live Discount/promo rule. Extracted out of DiscountsController so both an
    /// immediate (self-approve) creation and a later Approval Center decision produce the same row.</summary>
    Task<Discount> CreateAsync(DiscountRequest req);
}

public class DiscountCreationService(BaqalaDbContext db) : IDiscountCreationService
{
    public async Task<Discount> CreateAsync(DiscountRequest req)
    {
        var discount = new Discount
        {
            Id = Guid.NewGuid(),
            Name = req.Name,
            NameAr = req.NameAr,
            AppliesTo = req.AppliesTo ?? "all",
            ProductId = req.ProductId,
            CategoryId = req.CategoryId,
            BranchId = req.BranchId,
            DiscountType = req.DiscountType ?? "percentage",
            Value = req.Value,
            IsActive = req.IsActive ?? true,
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            RequiresCustomer = req.RequiresCustomer ?? false,
            ExcludedProductIdsJson = req.ExcludedProductIds is { Count: > 0 } ? System.Text.Json.JsonSerializer.Serialize(req.ExcludedProductIds) : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Discounts.Add(discount);
        await db.SaveChangesAsync();
        return discount;
    }
}
