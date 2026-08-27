namespace BaqalaPOS.Api.Models;

// Request shapes of the public (anonymous) online-ordering endpoints — shared between
// OnlineOrdersController and OnlineCheckoutService, which also persists PlaceOnlineOrderRequest
// verbatim as OnlinePayment.CheckoutJson so an order can be created from it later without the
// shopper's browser.

public record OnlineOrderItemRequest(Guid ProductId, decimal Quantity);

// The quote body grew from a bare item list to this so the delivery pin can be priced alongside
// the basket — the fee depends on where the order is going, so a quote that doesn't know the
// destination can't show the real total. Latitude/Longitude stay optional: an order placed
// without a map pin still quotes, it just can't match a geographic rule.
public record QuoteOnlineOrderRequest(
    List<OnlineOrderItemRequest> Items, decimal? Latitude, decimal? Longitude);

public record PlaceOnlineOrderRequest(
    List<OnlineOrderItemRequest> Items, string FullName, string Phone, string? Email,
    string AddressLine, decimal? Latitude, decimal? Longitude, string? Notes,
    // "cash" (default, Cash on Delivery) or "myfatoorah". For the latter PaymentReference is the
    // InvoiceId from InitiateOnlinePayment; the payment is re-verified server-side against
    // MyFatoorah before any order exists (OnlineCheckoutService.PlaceFromPaymentAsync).
    string PaymentMethod = "cash", long? PaymentReference = null);
