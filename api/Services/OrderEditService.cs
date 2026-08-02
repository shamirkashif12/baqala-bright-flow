using BaqalaPOS.Api.Controllers;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public record OrderEditOutcome(bool Success, string? ErrorMessage = null);

public interface IOrderEditService
{
    /// <summary>Applies an order modification — line items (qty/price/add/remove), notes, discount
    /// override, payment method and customer attribution — recomputing totals, inventory, tobacco
    /// excise and loyalty server-side. Extracted out of OrdersController so both an immediate
    /// (self-approve) edit and a later Approval Center decision execute the exact same side
    /// effect, mirroring <see cref="IOrderVoidService"/>.</summary>
    Task<OrderEditOutcome> ApplyAsync(Guid orderId, OrderEditRequest req, Guid? actorId);

    /// <summary>Unit price the pricing engine would resolve for each product on this order, so a
    /// caller can tell a genuine price override from an ordinary line edit before applying it.</summary>
    Task<Dictionary<Guid, decimal>> ResolveExpectedPricesAsync(IEnumerable<Guid> productIds, Guid branchId, Guid? customerId);
}

public class OrderEditService(
    BaqalaDbContext db,
    IAuditService audit,
    IPriceResolutionService priceResolution,
    IBatchConsumptionService batchConsumption,
    ILogger<OrderEditService> logger) : IOrderEditService
{
    // ── Shared pricing/loyalty resolvers ──────────────────────────────────────
    // Public statics rather than private copies: OrdersController.Create needs the identical
    // answers, and two drifting implementations of "what is the tobacco excise rate" is exactly
    // the class of bug this move would otherwise introduce.

    public static async Task<LoyaltyProgram?> ResolveLoyaltyProgramAsync(BaqalaDbContext db, Guid branchId) =>
        await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == branchId && p.IsActive)
        ?? await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == null && p.IsActive);

    public static async Task<LoyaltyProgram?> ResolveGlobalTierConfigAsync(BaqalaDbContext db) =>
        await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == null && p.IsActive);

    public static decimal CalcTobaccoFee(decimal unitPrice, decimal minimumExciseAmount, decimal excisePercentage) =>
        Math.Max(minimumExciseAmount, unitPrice * excisePercentage / 100m);

    public static async Task<(decimal MinimumExciseAmount, decimal ExcisePercentage)> ResolveTobaccoExciseConfigAsync(BaqalaDbContext db)
    {
        var rule = await db.TaxFeeRules.Where(r => r.RuleType == "tobacco_excise")
            .OrderByDescending(r => r.Status == "active").FirstOrDefaultAsync();
        return rule is null ? (25m, 100m) : (rule.MinimumExciseAmount, rule.ExcisePercentage);
    }

    public async Task<Dictionary<Guid, decimal>> ResolveExpectedPricesAsync(IEnumerable<Guid> productIds, Guid branchId, Guid? customerId)
    {
        var ids = productIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        string? tier = null;
        if (customerId.HasValue)
            tier = await db.Customers.Where(c => c.Id == customerId.Value).Select(c => c.Tier).FirstOrDefaultAsync();

        try
        {
            var resolved = await priceResolution.ResolveManyAsync(ids, branchId, tier);
            return resolved.ToDictionary(kv => kv.Key, kv => kv.Value.UnitPrice);
        }
        catch (Exception ex)
        {
            // Price-override DETECTION must never be able to block an edit the manager is
            // entitled to make — fall back to base price, one product at a time (the MySQL
            // provider can't take a parameterized Guid[] IN-list).
            logger.LogError(ex, "Price resolution failed while checking for price overrides on branch {BranchId}", branchId);
            var fallback = new Dictionary<Guid, decimal>();
            foreach (var id in ids)
            {
                var price = await db.Products.Where(p => p.Id == id).Select(p => (decimal?)p.BasePrice).FirstOrDefaultAsync();
                if (price.HasValue) fallback[id] = price.Value;
            }
            return fallback;
        }
    }

    public async Task<OrderEditOutcome> ApplyAsync(Guid orderId, OrderEditRequest req, Guid? actorId)
    {
        if (req.Items.Count == 0) return new OrderEditOutcome(false, "An order must have at least one line item.");

        var order = await db.Orders.Include(o => o.Items).Include(o => o.Payments).FirstOrDefaultAsync(o => o.Id == orderId);
        if (order is null) return new OrderEditOutcome(false, "Order not found.");

        // Captured before any mutation below — needed to reverse this order's OLD contribution to
        // loyalty (earned points, TotalSpend) once the new totals are known, see the loyalty
        // re-sync block below.
        var oldCustomerId = order.CustomerId;
        var oldTotalAmount = order.TotalAmount;

        if (req.PaymentMethod is not null && order.Payments.Count > 1)
            return new OrderEditOutcome(false, "This order has split payments — payment method can't be edited here.");

        var beforeSnapshot = System.Text.Json.JsonSerializer.Serialize(new
        {
            order.Subtotal,
            order.DiscountAmount,
            order.TaxAmount,
            order.TotalAmount,
            order.Notes,
            order.CustomerId,
            PaymentMethod = order.Payments.FirstOrDefault()?.PaymentMethod,
            Items = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
        });
        var oldDiscount = order.DiscountAmount;
        // Snapshot of the old line prices, taken before RemoveRange below drops them — used to
        // attribute each price override to what the line actually used to cost.
        var oldPriceByProduct = order.Items.GroupBy(i => i.ProductId)
            .ToDictionary(g => g.Key, g => g.First().UnitPrice);

        // Reconcile inventory by the delta between old and new quantity per product — mirrors the
        // decrement block in Create. Grouped by product first so a product simply changing
        // quantity (the common case) nets to one adjustment instead of a remove-then-re-add.
        var oldQtyByProduct = order.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var newQtyByProduct = req.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));

        // Same guard as OrdersController.Create — raising a line's quantity on an existing order
        // is still a sale, so it must not be able to push on-hand stock negative when the branch
        // hasn't opted into AllowNegativeStock. Branches that have never saved a PosSettings row
        // must still default to blocking, same as OrdersController.Create's BlockExpiredItems
        // pattern — a null posSettings used to skip this check entirely. This is just a fast
        // pre-flight so a hopeless edit fails before any other work runs; the authoritative,
        // race-safe check is the locked recheck in the stock-reduction loop below.
        var posSettings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == order.BranchId);
        var blockNegativeStock = !(posSettings?.AllowNegativeStock ?? false);
        if (blockNegativeStock)
        {
            foreach (var productId in oldQtyByProduct.Keys.Union(newQtyByProduct.Keys))
            {
                var delta = newQtyByProduct.GetValueOrDefault(productId, 0m) - oldQtyByProduct.GetValueOrDefault(productId, 0m);
                if (delta <= 0) continue;

                var onHand = await db.InventoryStocks
                    .Where(s => s.ProductId == productId && s.BranchId == order.BranchId)
                    .Select(s => (decimal?)s.Quantity)
                    .FirstOrDefaultAsync() ?? 0;
                if (onHand - delta < 0)
                {
                    var product = await db.Products.FindAsync(productId);
                    return new OrderEditOutcome(false, $"Cannot increase '{product?.Name ?? "item"}' — only {onHand:0.##} on hand and this branch does not allow negative stock.");
                }
            }
        }

        // Locks each product's stock row (SELECT ... FOR UPDATE) before reading it and re-checks
        // the same guard as above — without this, a concurrent edit or sale racing this one could
        // both read the same pre-decrement on-hand figure and both apply their delta, still
        // landing stock negative even with AllowNegativeStock off. Same technique as
        // ZatcaService.SubmitInvoiceAsync's identity-row lock and OrdersController.Create's sale
        // path.
        await using var stockTx = await db.Database.BeginTransactionAsync();
        foreach (var productId in oldQtyByProduct.Keys.Union(newQtyByProduct.Keys))
        {
            var delta = newQtyByProduct.GetValueOrDefault(productId, 0m) - oldQtyByProduct.GetValueOrDefault(productId, 0m);
            if (delta == 0) continue;

            var stock = await db.InventoryStocks
                .FromSqlRaw("SELECT * FROM inventory_stock WHERE product_id = {0} AND branch_id = {1} FOR UPDATE", productId, order.BranchId)
                .FirstOrDefaultAsync();

            if (blockNegativeStock && delta > 0 && (stock?.Quantity ?? 0) - delta < 0)
            {
                var product = await db.Products.FindAsync(productId);
                return new OrderEditOutcome(false, $"Cannot increase '{product?.Name ?? "item"}' — only {(stock?.Quantity ?? 0):0.##} on hand and this branch does not allow negative stock.");
            }

            if (stock != null)
            {
                stock.Quantity -= delta;
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(),
                    ProductId = productId,
                    BranchId = order.BranchId,
                    Quantity = -delta,
                    LastUpdated = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }

            // Only the aggregate InventoryStock row above was ever kept in sync with an edit's
            // quantity change — same gap the sale/void paths (OrdersController.Create /
            // OrderVoidService) already close for their own deltas. delta > 0 mirrors an
            // additional sale (consume from batches); delta < 0 mirrors a partial void (credit
            // back in the same order it was drawn down). Best-effort: never allowed to fail the edit.
            try
            {
                if (delta > 0) await batchConsumption.ConsumeFefoAsync(productId, order.BranchId, warehouseId: null, delta);
                else await batchConsumption.RestoreFefoAsync(productId, order.BranchId, warehouseId: null, -delta);
            }
            catch (Exception ex) { logger.LogError(ex, "Batch consumption failed while editing order {OrderId} for product {ProductId}", order.Id, productId); }
        }

        // Replace line items wholesale rather than diffing individual rows — OrderItem has no
        // dependents of its own besides Order, so this is safe and much simpler. This also covers
        // "adding items"/"modifying prices": a line with a new ProductId or a UnitPrice different
        // from the original is just another entry in req.Items, nothing special-cased.
        //
        // Looked up one product at a time rather than `productIds.Contains(p.Id)` — the MySQL EF
        // Core provider used here cannot assign a type mapping to a parameterized List<Guid>
        // IN-list (same constraint noted throughout ReportsController), which throws at query time.
        var productIds = req.Items.Select(i => i.ProductId).Distinct().ToList();
        var tobaccoFlags = new Dictionary<Guid, bool>();
        foreach (var pid in productIds)
            tobaccoFlags[pid] = await db.Products.Where(p => p.Id == pid).Select(p => p.IsTobacco).FirstOrDefaultAsync();
        var (minimumExciseAmount, excisePercentage) = await ResolveTobaccoExciseConfigAsync(db);

        db.OrderItems.RemoveRange(order.Items);
        var newItems = req.Items.Select(it =>
        {
            var totalPrice = it.Quantity * it.UnitPrice;
            var isTobacco = tobaccoFlags.GetValueOrDefault(it.ProductId);
            return new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ProductId = it.ProductId,
                Quantity = it.Quantity,
                UnitPrice = it.UnitPrice,
                TotalPrice = totalPrice,
                TobaccoFeeAmount = isTobacco ? it.Quantity * CalcTobaccoFee(it.UnitPrice, minimumExciseAmount, excisePercentage) : 0,
                CreatedAt = DateTime.UtcNow,
            };
        }).ToList();
        db.OrderItems.AddRange(newItems);

        // Recompute totals server-side from the new items — never trust a client-sent total.
        // Discount either carries over proportionally (capped to the new subtotal) or is replaced
        // outright when the caller explicitly sends an override (req.DiscountAmount).
        var newSubtotal = newItems.Sum(i => i.TotalPrice);
        var newTobaccoFee = newItems.Sum(i => i.TobaccoFeeAmount);
        // Can't let an edit shrink the order below what's already been redeemed in loyalty points —
        // those points already left the customer's balance, this endpoint has no concept of giving
        // them back, and forcing the discount up to cover it here would push the total negative.
        if (order.LoyaltyDiscountAmount > newSubtotal)
        {
            return new OrderEditOutcome(false,
                $"This order already has SAR {order.LoyaltyDiscountAmount:F2} redeemed via loyalty points — " +
                $"the new subtotal (SAR {newSubtotal:F2}) can't be reduced below that. Void the order instead if it needs to be this small.");
        }

        var newDiscount = req.DiscountAmount.HasValue
            ? Math.Clamp(req.DiscountAmount.Value, 0, newSubtotal)
            : Math.Min(order.DiscountAmount, newSubtotal);

        // Same reasoning as above — the discount itself can't be edited down below the redeemed
        // amount either, even if the subtotal is still large enough overall.
        if (newDiscount < order.LoyaltyDiscountAmount) newDiscount = order.LoyaltyDiscountAmount;

        // VAT is charged on (subtotal - discount + tobacco fee), not on subtotal alone (see
        // Create()) — so the rate must be derived from that same taxable base, not just Subtotal,
        // or a discounted/tobacco order's effective rate would be under/over-stated when re-applied
        // to the new totals below.
        var oldTaxableBase = order.Subtotal - order.DiscountAmount + order.TobaccoFeeAmount;
        var taxRate = oldTaxableBase > 0 ? order.TaxAmount / oldTaxableBase : 0m;
        var newTaxableBase = Math.Max(0, newSubtotal - newDiscount + newTobaccoFee);

        order.Subtotal = newSubtotal;
        order.DiscountAmount = newDiscount;
        order.TobaccoFeeAmount = newTobaccoFee;
        order.TaxAmount = Math.Round(newTaxableBase * taxRate, 2);
        order.TotalAmount = newSubtotal - newDiscount + order.TobaccoFeeAmount + order.TaxAmount + order.CustomFeeAmount;
        order.Notes = req.Notes;

        // Loyalty re-sync: TotalAmount just changed (and CustomerId may be about to be
        // reassigned below) after points were already earned against the OLD total for the OLD
        // customer in Create() — replay the same reversal-then-earn steps Void/Refund use so
        // balance/TotalSpend/Tier don't silently drift from what this order now actually
        // represents. The existing REDEMPTION is deliberately left alone (already floor-checked
        // above) — those points genuinely left the original customer's balance and stay
        // attributed to them even if the order is reassigned; only the EARN side is re-derived.
        var finalCustomerId = req.UpdateCustomer ? req.CustomerId : oldCustomerId;

        if (oldCustomerId.HasValue)
        {
            var oldCustomer = await db.Customers.FindAsync(oldCustomerId.Value);
            if (oldCustomer != null)
            {
                var oldEarnTxn = await db.LoyaltyTransactions
                    .FirstOrDefaultAsync(t => t.OrderId == order.Id && t.TransactionType == "earn");
                if (oldEarnTxn != null)
                {
                    var clawback = -Math.Min(oldEarnTxn.Points, oldCustomer.LoyaltyBalance);
                    if (clawback != 0)
                    {
                        oldCustomer.LoyaltyBalance += clawback;
                        db.LoyaltyTransactions.Add(new LoyaltyTransaction
                        {
                            Id = Guid.NewGuid(),
                            CustomerId = oldCustomer.Id,
                            OrderId = order.Id,
                            BranchId = order.BranchId,
                            TransactionType = "adjust",
                            Points = clawback,
                            BalanceAfter = oldCustomer.LoyaltyBalance,
                            Description = $"Reversal for edited order {order.OrderNumber}",
                            CreatedAt = DateTime.UtcNow,
                        });
                    }
                }
                oldCustomer.TotalSpend = Math.Max(0, oldCustomer.TotalSpend - oldTotalAmount);

                // If the order is staying with this same customer, the earn step below recomputes
                // Tier from the fully-netted TotalSpend anyway — only recompute it here when the
                // order is being reassigned away, since nothing else will touch this customer again.
                if (finalCustomerId != oldCustomerId)
                {
                    // Tier thresholds are global (see ResolveGlobalTierConfigAsync) — never
                    // resolved per this order's branch.
                    var tierConfig = await ResolveGlobalTierConfigAsync(db);
                    if (tierConfig != null)
                    {
                        oldCustomer.Tier = oldCustomer.TotalSpend >= tierConfig.PlatinumThreshold ? "platinum"
                            : oldCustomer.TotalSpend >= tierConfig.GoldThreshold ? "gold"
                            : oldCustomer.TotalSpend >= tierConfig.SilverThreshold ? "silver"
                            : "standard";
                    }
                }
            }
        }

        if (finalCustomerId.HasValue)
        {
            // FindAsync returns the SAME tracked instance as the block above when
            // finalCustomerId == oldCustomerId, so the reversal's TotalSpend subtraction and this
            // addition net out correctly against the same in-memory customer.
            var earningCustomer = await db.Customers.FindAsync(finalCustomerId.Value);
            if (earningCustomer != null)
            {
                var program = await ResolveLoyaltyProgramAsync(db, order.BranchId);
                earningCustomer.TotalSpend += order.TotalAmount;
                if (program != null)
                {
                    // Tier thresholds/multipliers are global (see ResolveGlobalTierConfigAsync) —
                    // never resolved per this order's branch.
                    var tierConfig = await ResolveGlobalTierConfigAsync(db);
                    if (tierConfig != null)
                    {
                        earningCustomer.Tier = earningCustomer.TotalSpend >= tierConfig.PlatinumThreshold ? "platinum"
                            : earningCustomer.TotalSpend >= tierConfig.GoldThreshold ? "gold"
                            : earningCustomer.TotalSpend >= tierConfig.SilverThreshold ? "silver"
                            : "standard";
                    }

                    var earnMultiplier = tierConfig is null ? 1m : earningCustomer.Tier switch
                    {
                        "platinum" => tierConfig.PlatinumEarnMultiplier,
                        "gold" => tierConfig.GoldEarnMultiplier,
                        "silver" => tierConfig.SilverEarnMultiplier,
                        _ => 1m,
                    };
                    var earned = Math.Floor(order.TotalAmount * program.PointsPerCurrencyUnit * earnMultiplier);
                    if (earned > 0)
                    {
                        earningCustomer.LoyaltyBalance += earned;
                        db.LoyaltyTransactions.Add(new LoyaltyTransaction
                        {
                            Id = Guid.NewGuid(),
                            CustomerId = earningCustomer.Id,
                            OrderId = order.Id,
                            BranchId = order.BranchId,
                            TransactionType = "earn",
                            Points = earned,
                            BalanceAfter = earningCustomer.LoyaltyBalance,
                            Description = $"Earned from edited order {order.OrderNumber}",
                            ExpiryDate = program.PointsExpiryDays.HasValue
                                ? DateTime.UtcNow.AddDays(program.PointsExpiryDays.Value)
                                : null,
                            CreatedAt = DateTime.UtcNow,
                        });
                    }
                }
            }
        }

        if (req.UpdateCustomer) order.CustomerId = req.CustomerId;
        order.UpdatedAt = DateTime.UtcNow;

        if (req.PaymentMethod is not null)
        {
            var payment = order.Payments.FirstOrDefault();
            if (payment is not null) payment.PaymentMethod = req.PaymentMethod;
        }

        await db.SaveChangesAsync();
        await stockTx.CommitAsync();

        var employeeId = actorId.HasValue
            ? await db.Employees.Where(e => e.UserId == actorId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()
            : null;

        var afterSnapshot = System.Text.Json.JsonSerializer.Serialize(new
        {
            order.OrderNumber,
            order.Subtotal,
            order.DiscountAmount,
            order.TaxAmount,
            order.TotalAmount,
            order.Notes,
            order.CustomerId,
            PaymentMethod = order.Payments.FirstOrDefault()?.PaymentMethod,
            Items = newItems.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
        });
        await audit.LogAsync(
            action: "edit_order",
            entityType: "Order",
            entityId: order.Id,
            userId: actorId,
            branchId: order.BranchId,
            details: afterSnapshot,
            // An order modification rewrites money already taken — it belongs on the same tier a
            // manager scans for, alongside voids and refunds.
            severity: "warning",
            beforeValue: beforeSnapshot,
            module: "Orders", employeeId: employeeId, terminalId: order.TerminalId);

        // Employee Audit Center — "Gave discount" as its own filterable activity type, same as
        // Create's. Only fires when the edit actually increases the discount (a fresh grant),
        // not every edit of an already-discounted order.
        if (order.DiscountAmount > oldDiscount)
        {
            await audit.LogAsync(
                action: "Gave Discount",
                entityType: "Order",
                entityId: order.Id,
                userId: actorId,
                branchId: order.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    order.OrderNumber, order.DiscountAmount, order.Subtotal,
                    DiscountPct = order.Subtotal > 0 ? Math.Round(order.DiscountAmount / order.Subtotal * 100m, 2) : 0m,
                    Items = newItems.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
                }),
                severity: "warning",
                beforeValue: System.Text.Json.JsonSerializer.Serialize(new { DiscountAmount = oldDiscount }),
                module: "Orders", employeeId: employeeId, terminalId: order.TerminalId);
        }

        // Price Overrides — a line sold at anything other than the price the pricing engine
        // resolves is its own audited event, not a detail buried inside the edit snapshot. This
        // is the activity the client called out as untraceable; one row per repriced product so
        // the Audit Center can filter and total them.
        try
        {
            var expected = await ResolveExpectedPricesAsync(productIds, order.BranchId, order.CustomerId);
            foreach (var line in newItems)
            {
                if (!expected.TryGetValue(line.ProductId, out var listPrice)) continue;
                if (line.UnitPrice == listPrice) continue;

                var previous = oldPriceByProduct.TryGetValue(line.ProductId, out var p) ? (decimal?)p : null;
                // Only an actual change of this line's price is an override — a line that already
                // carried a non-list price and wasn't touched by this edit isn't a new event.
                if (previous.HasValue && previous.Value == line.UnitPrice) continue;

                await audit.LogAsync(
                    action: "price_override",
                    entityType: "Order",
                    entityId: order.Id,
                    userId: actorId,
                    branchId: order.BranchId,
                    details: System.Text.Json.JsonSerializer.Serialize(new
                    {
                        order.OrderNumber,
                        ListPrice = listPrice,
                        OverriddenPrice = line.UnitPrice,
                        Variance = line.UnitPrice - listPrice,
                        Items = new[] { new { line.ProductId, line.Quantity, line.UnitPrice, line.TotalPrice } },
                    }),
                    severity: "warning",
                    beforeValue: System.Text.Json.JsonSerializer.Serialize(new { UnitPrice = previous ?? listPrice }),
                    module: "Orders", employeeId: employeeId, terminalId: order.TerminalId);
            }
        }
        catch (Exception ex)
        {
            // Best-effort, like the batch-costing block in OrdersController.Create — a failure to
            // record the override must never roll back an edit that already committed.
            logger.LogError(ex, "Price override audit failed for order {OrderId}", order.Id);
        }

        return new OrderEditOutcome(true);
    }
}
