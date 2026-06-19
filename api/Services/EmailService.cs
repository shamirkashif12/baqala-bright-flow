using BaqalaPOS.Api.Models;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QRCoder;

namespace BaqalaPOS.Api.Services;

public interface IEmailService
{
    Task SendInvoiceAsync(string toEmail, string toName, Order order, string? vatNumber = null, string? sellerName = null);
}

public class SmtpEmailService(IConfiguration config, ILogger<SmtpEmailService> logger) : IEmailService
{
    public async Task SendInvoiceAsync(string toEmail, string toName, Order order, string? vatNumber = null, string? sellerName = null)
    {
        var host = config["Smtp:Host"];
        var user = config["Smtp:User"];
        var pass = config["Smtp:Password"];
        var from = config["Smtp:From"];
        var fromName = config["Smtp:FromName"] ?? "Baqala POS";

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(user) ||
            string.IsNullOrWhiteSpace(pass) || string.IsNullOrWhiteSpace(from))
        {
            logger.LogWarning("SMTP not configured — skipping invoice email for {OrderNumber}", order.OrderNumber);
            return;
        }

        try
        {
            QuestPDF.Settings.License = LicenseType.Community;
            var pdfBytes = GeneratePdf(order, vatNumber, sellerName);

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(fromName, from));
            message.To.Add(new MailboxAddress(toName, toEmail));
            message.Subject = $"Invoice {order.OrderNumber}";

            var body = new BodyBuilder
            {
                HtmlBody = $"""
                    <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;padding:32px">
                      <p>Dear {toName},</p>
                      <p>Please find attached your tax invoice for order <strong>{order.OrderNumber}</strong> dated {order.CreatedAt.ToLocalTime():dd MMM yyyy}.</p>
                      <p>Total amount: <strong>SAR {order.TotalAmount:F2}</strong></p>
                      <p style="margin-top:32px;color:#888;font-size:12px">Thank you for shopping with us.<br>{fromName}</p>
                    </body></html>
                    """
            };
            body.Attachments.Add($"invoice-{order.OrderNumber}.pdf", pdfBytes, ContentType.Parse("application/pdf"));
            message.Body = body.ToMessageBody();

            using var smtp = new SmtpClient();
            await smtp.ConnectAsync(host, int.Parse(config["Smtp:Port"] ?? "587"), SecureSocketOptions.StartTls);
            await smtp.AuthenticateAsync(user, pass);
            await smtp.SendAsync(message);
            await smtp.DisconnectAsync(true);

            logger.LogInformation("Invoice email sent to {Email} for {OrderNumber}", toEmail, order.OrderNumber);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send invoice email to {Email}", toEmail);
        }
    }

    // ─── PDF ─────────────────────────────────────────────────────────────────────
    private static byte[] GeneratePdf(Order order, string? vatNumber, string? sellerName)
    {
        var qrBytes = BuildZatcaQr(order, vatNumber, sellerName);
        var branchName = sellerName ?? order.Branch?.Name ?? "";
        var dateStr = order.CreatedAt.ToLocalTime().ToString("dd/MM/yyyy  HH:mm");
        var customerName = order.Customer?.FullName ?? "";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginHorizontal(50);
                page.MarginVertical(45);
                page.DefaultTextStyle(t => t.FontSize(10).FontFamily("Arial").FontColor("#000000"));

                page.Content().Column(col =>
                {
                    // ── Header ───────────────────────────────────────────────
                    col.Item().BorderBottom(2).BorderColor("#000000").PaddingBottom(12).Column(hdr =>
                    {
                        hdr.Item().AlignCenter().Text("TAX INVOICE").FontSize(20).Bold().LetterSpacing(0.1f);
                        hdr.Item().Height(6);
                        hdr.Item().AlignCenter().Text(branchName).FontSize(13).Bold();
                        if (!string.IsNullOrWhiteSpace(vatNumber))
                            hdr.Item().AlignCenter().Text($"VAT Registration No: {vatNumber}").FontSize(9).FontColor("#444444");
                    });

                    col.Item().Height(12);

                    // ── Meta: order number, date, customer ────────────────────
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text(t =>
                            {
                                t.Span("Order No:  ").Bold();
                                t.Span(order.OrderNumber);
                            });
                            c.Item().Height(3);
                            c.Item().Text(t =>
                            {
                                t.Span("Date:         ").Bold();
                                t.Span(dateStr);
                            });
                            if (!string.IsNullOrWhiteSpace(customerName))
                            {
                                c.Item().Height(3);
                                c.Item().Text(t =>
                                {
                                    t.Span("Customer:  ").Bold();
                                    t.Span(customerName);
                                });
                            }
                        });

                        if (order.Payments.Any())
                        {
                            var method = order.Payments.First().PaymentMethod;
                            row.ConstantItem(120).AlignRight().Column(c =>
                            {
                                c.Item().Text("PAID").FontSize(22).Bold().FontColor("#000000");
                                c.Item().AlignRight().Text(char.ToUpper(method[0]) + method[1..]).FontSize(10).FontColor("#444444");
                            });
                        }
                    });

                    col.Item().Height(16);

                    // ── Items table ───────────────────────────────────────────
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(5);
                            cols.ConstantColumn(45);
                            cols.ConstantColumn(80);
                            cols.ConstantColumn(80);
                        });

                        // Header
                        static IContainer TH(IContainer c) =>
                            c.Background("#000000").Padding(7);

                        table.Header(h =>
                        {
                            h.Cell().Element(TH).Text("ITEM").FontColor("#ffffff").Bold().FontSize(9);
                            h.Cell().Element(TH).AlignCenter().Text("QTY").FontColor("#ffffff").Bold().FontSize(9);
                            h.Cell().Element(TH).AlignRight().Text("UNIT PRICE").FontColor("#ffffff").Bold().FontSize(9);
                            h.Cell().Element(TH).AlignRight().Text("TOTAL").FontColor("#ffffff").Bold().FontSize(9);
                        });

                        // Rows
                        var evenRow = false;
                        foreach (var item in order.Items)
                        {
                            evenRow = !evenRow;
                            var bg = evenRow ? "#f9f9f9" : "#ffffff";

                            static IContainer TD(IContainer c, string bg) =>
                                c.Background(bg).BorderBottom(1).BorderColor("#e0e0e0").Padding(7);

                            table.Cell().Element(c => TD(c, bg)).Text(item.Product?.Name ?? "Item");
                            table.Cell().Element(c => TD(c, bg)).AlignCenter().Text(item.Quantity.ToString("G29"));
                            table.Cell().Element(c => TD(c, bg)).AlignRight().Text($"SAR {item.UnitPrice:F2}");
                            table.Cell().Element(c => TD(c, bg)).AlignRight().Text($"SAR {item.TotalPrice:F2}");
                        }
                    });

                    col.Item().Height(16);

                    // ── Totals block ──────────────────────────────────────────
                    col.Item().AlignRight().Width(230).Column(totals =>
                    {
                        void Row(string label, string value, bool divider = false, bool isBold = false)
                        {
                            if (divider) totals.Item().BorderTop(1).BorderColor("#000000").Height(1);
                            totals.Item().PaddingVertical(3).Row(r =>
                            {
                                var lText = r.RelativeItem().Text(label).FontSize(10);
                                if (isBold) lText.Bold();
                                var rText = r.ConstantItem(100).AlignRight().Text(value).FontSize(10);
                                if (isBold) rText.Bold();
                            });
                        }

                        Row("Subtotal", $"SAR {order.Subtotal:F2}");
                        if (order.DiscountAmount > 0)
                            Row("Discount", $"-SAR {order.DiscountAmount:F2}");

                        var taxableBase = order.Subtotal - order.DiscountAmount;
                        var vatPct = taxableBase > 0 ? order.TaxAmount / taxableBase * 100 : 0;
                        Row($"VAT ({vatPct:F0}%)", $"SAR {order.TaxAmount:F2}");
                        Row("Total", $"SAR {order.TotalAmount:F2}", divider: true, isBold: true);
                    });

                    // ── ZATCA QR ──────────────────────────────────────────────
                    if (qrBytes != null)
                    {
                        col.Item().Height(24);
                        col.Item().AlignCenter().Column(qrCol =>
                        {
                            qrCol.Item().AlignCenter().Width(80).Height(80).Image(qrBytes);
                            qrCol.Item().Height(4);
                            qrCol.Item().AlignCenter().Text("ZATCA Phase 2 — scan to verify")
                                .FontSize(8).FontColor("#666666");
                        });
                    }

                    // ── Footer ────────────────────────────────────────────────
                    col.Item().Height(20);
                    col.Item().BorderTop(1).BorderColor("#cccccc").PaddingTop(10)
                        .AlignCenter().Text("Thank you for your business").FontSize(9).FontColor("#888888");
                });
            });
        }).GeneratePdf();
    }

    // ─── ZATCA TLV → Base64 → PNG QR ─────────────────────────────────────────
    private static byte[]? BuildZatcaQr(Order order, string? vatNumber, string? sellerName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(vatNumber) && string.IsNullOrWhiteSpace(sellerName)) return null;

            vatNumber ??= "000000000000000";
            sellerName ??= order.Branch?.Name ?? "Seller";

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
                Tlv(1, sellerName),
                Tlv(2, vatNumber),
                Tlv(3, timestamp),
                Tlv(4, order.TotalAmount.ToString("F2")),
                Tlv(5, order.TaxAmount.ToString("F2")),
            }.SelectMany(f => f).ToArray();

            var base64 = Convert.ToBase64String(tlv);

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
