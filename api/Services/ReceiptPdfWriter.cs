using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QRCoder;
using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

/// <summary>PDF for the "Download" button next to Print on the Orders/Sales/ZATCA invoice views.
/// Deliberately mirrors the compact on-screen "Tax Invoice" receipt card (OrderInvoiceDialog /
/// _app.pos.tsx's post-checkout dialog) field-for-field, rather than EmailService's formal A4
/// invoice layout — so what a user downloads looks like what they already saw and printed.</summary>
public static class ReceiptPdfWriter
{
    public static byte[] Write(Order order, string? vatNumber, string? sellerName, string? crNumber, string? qrCodeOverride = null)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        var name = sellerName ?? order.Branch?.Name ?? "Store";
        // Matches the on-screen receipt's new Date(...).toLocaleString("en-SA") rendering
        // (M/d/yyyy, h:mm:ss tt), not the dd/MM/yyyy order used by EmailService's separate,
        // formal invoice template.
        var dateStr = order.CreatedAt.ToLocalTime().ToString("M/d/yyyy, h:mm:ss tt");
        var qrBytes = BuildZatcaQr(order, vatNumber, name, qrCodeOverride);

        // Net of all non-loyalty discounts, then loyalty broken out below — same "Subtotal" formula
        // the on-screen receipt uses (order-invoice-dialog.tsx / _app.pos.tsx).
        var netSubtotal = order.Subtotal - (order.DiscountAmount - order.LoyaltyDiscountAmount);
        var taxableBase = order.Subtotal - order.DiscountAmount;
        var vatPct = taxableBase > 0 ? Math.Round(order.TaxAmount / taxableBase * 100) : 15;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.ContinuousSize(320);
                page.MarginHorizontal(18);
                page.MarginVertical(18);
                page.DefaultTextStyle(t => t.FontSize(8.5f).FontFamily("Courier New").FontColor("#000000"));

                page.Content().Background("#F5F5F7").Padding(14).Column(col =>
                {
                    col.Spacing(3);

                    col.Item().AlignCenter().Text(name).FontSize(10.5f).Bold();
                    if (!string.IsNullOrWhiteSpace(vatNumber))
                        col.Item().AlignCenter().Text($"VAT {vatNumber}").FontColor("#666666");
                    if (!string.IsNullOrWhiteSpace(crNumber))
                        col.Item().AlignCenter().Text($"CR {crNumber}").FontColor("#666666");
                    col.Item().PaddingTop(2).AlignCenter().Text("INVOICE NO.").FontSize(7).FontColor("#888888").LetterSpacing(0.15f);
                    col.Item().AlignCenter().Text(order.OrderNumber).Bold();
                    col.Item().AlignCenter().Text(dateStr).FontColor("#666666");
                    if (!string.IsNullOrWhiteSpace(order.Customer?.FullName))
                        col.Item().AlignCenter().Text($"Customer: {order.Customer!.FullName}");

                    col.Item().PaddingVertical(5).BorderBottom(1).BorderColor("#bbbbbb");

                    foreach (var item in order.Items)
                    {
                        col.Item().Row(r =>
                        {
                            r.RelativeItem().Text($"{item.Quantity:G29} × {item.Product?.Name ?? "Item"}");
                            r.ConstantItem(64).AlignRight().Text((item.Quantity * item.UnitPrice).ToString("F2"));
                        });
                    }

                    col.Item().PaddingVertical(5).BorderBottom(1).BorderColor("#bbbbbb");

                    void Row(string label, string value, bool bold = false, float size = 8.5f)
                    {
                        col.Item().Row(r =>
                        {
                            var l = r.RelativeItem().Text(label).FontSize(size);
                            var v = r.ConstantItem(64).AlignRight().Text(value).FontSize(size);
                            if (bold) { l.Bold(); v.Bold(); }
                        });
                    }

                    Row("Subtotal", netSubtotal.ToString("F2"));
                    if (order.LoyaltyPointsRedeemed > 0)
                        Row($"Loyalty Redeemed ({order.LoyaltyPointsRedeemed:F0} pts)", $"-{order.LoyaltyDiscountAmount:F2}");
                    if (order.TobaccoFeeAmount > 0)
                        Row("Tobacco Excise", order.TobaccoFeeAmount.ToString("F2"));
                    foreach (var svc in order.ServiceCharges)
                        Row(svc.Name, svc.Amount.ToString("F2"));
                    Row($"VAT {vatPct:F0}%", order.TaxAmount.ToString("F2"));
                    Row("Total", $"SAR {order.TotalAmount:F2}", bold: true, size: 10f);

                    if (order.Payments.Count > 1)
                    {
                        Row("Payment", "Split");
                        foreach (var p in order.Payments)
                            Row($"  {Capitalize(p.PaymentMethod)}", p.Amount.ToString("F2"));
                    }
                    else if (order.Payments.Count == 1)
                    {
                        Row("Payment", Capitalize(order.Payments.First().PaymentMethod));
                    }

                    if (qrBytes != null)
                    {
                        col.Item().PaddingTop(8).AlignCenter().Column(qrCol =>
                        {
                            qrCol.Item().AlignCenter().Width(85).Height(85).Image(qrBytes);
                            qrCol.Item().PaddingTop(2).AlignCenter().Text("ZATCA Phase 2 — scan to verify").FontSize(6.5f).FontColor("#888888");
                        });
                    }
                });
            });
        }).GeneratePdf();
    }

    private static string Capitalize(string s) => string.IsNullOrEmpty(s) ? s : char.ToUpper(s[0]) + s[1..];

    // Same Phase-1-style 5-tag TLV QR builder duplicated in EmailService.cs / _app.pos.tsx /
    // order-invoice-dialog.tsx / escpos.ts / self-checkout's zatca.ts — used as a fallback when the
    // caller doesn't already have a real ZATCA Phase 2-signed QR (qrCodeOverride, e.g.
    // ZatcaInvoice.QrCodeValue from the ZATCA Invoices page).
    private static byte[]? BuildZatcaQr(Order order, string? vatNumber, string? sellerName, string? qrCodeOverride)
    {
        try
        {
            string base64;
            if (!string.IsNullOrWhiteSpace(qrCodeOverride))
            {
                base64 = qrCodeOverride;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(vatNumber)) return null;

                var timestamp = order.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ");

                static byte[] Tlv(byte tag, string value)
                {
                    var bytes = System.Text.Encoding.UTF8.GetBytes(value);
                    var result = new byte[2 + bytes.Length];
                    result[0] = tag;
                    result[1] = (byte)bytes.Length;
                    bytes.CopyTo(result, 2);
                    return result;
                }

                var tlv = new[]
                {
                    Tlv(1, sellerName ?? "Seller"),
                    Tlv(2, vatNumber),
                    Tlv(3, timestamp),
                    Tlv(4, order.TotalAmount.ToString("F2")),
                    Tlv(5, order.TaxAmount.ToString("F2")),
                }.SelectMany(f => f).ToArray();

                base64 = Convert.ToBase64String(tlv);
            }

            using var gen = new QRCodeGenerator();
            var data = gen.CreateQrCode(base64, QRCodeGenerator.ECCLevel.M);
            using var png = new PngByteQRCode(data);
            return png.GetGraphic(4);
        }
        catch
        {
            return null;
        }
    }
}
