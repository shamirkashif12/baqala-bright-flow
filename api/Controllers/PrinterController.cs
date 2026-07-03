using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PrinterController : ControllerBase
{
    // ── helpers ──────────────────────────────────────────────────────────────

    private static async Task<(string stdout, string stderr, int exit)> Run(string cmd, string args)
    {
        var psi = new ProcessStartInfo(cmd, args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };
        using var p = Process.Start(psi)!;
        var stdout = await p.StandardOutput.ReadToEndAsync();
        var stderr = await p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync();
        return (stdout.Trim(), stderr.Trim(), p.ExitCode);
    }

    // Sanitise name/URI: only allow safe characters
    private static bool IsSafe(string s) =>
        !string.IsNullOrWhiteSpace(s) && Regex.IsMatch(s, @"^[\w\-\.:/\?=&%@]+$");

    // ── GET /api/printer/detect ───────────────────────────────────────────────

    [HttpGet("detect")]
    public async Task<IActionResult> Detect()
    {
        if (OperatingSystem.IsWindows())
        {
            // Windows has no CUPS-style "raw unconfigured USB device" listing — a thermal
            // printer needs its driver installed via Windows first. Surface installed
            // printers here so the same setup UI can pick one and set it as default.
            var installedPrinters = await WindowsPrinting.ListPrintersAsync();
            var winPrinters = installedPrinters.Select(p => new
            {
                uri = p.PortName,
                model = p.Name,
                type = p.PortName.StartsWith("USB", StringComparison.OrdinalIgnoreCase) ? "usb" : "network",
                suggestedName = p.Name,
            }).ToList();
            return Ok(new { printers = winPrinters });
        }

        var (stdout, _, _) = await Run("lpinfo", "-v");

        var printers = stdout
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .Where(line => line.StartsWith("direct usb://") ||
                           line.StartsWith("direct hp:/usb/") ||
                           line.StartsWith("network socket://") ||
                           line.StartsWith("network ipp://") ||
                           line.StartsWith("network ipps://"))
            .Select(line =>
            {
                var parts = line.Split(' ', 2);
                var connectionType = parts[0]; // "direct" or "network"
                var uri = parts.Length > 1 ? parts[1].Trim() : "";

                // Extract model name from URI
                var model = uri;
                var usbMatch = Regex.Match(uri, @"usb://([^/]+)/([^\?]+)");
                var hpMatch  = Regex.Match(uri, @"hp:/usb/([^\?]+)");
                if (usbMatch.Success)
                    model = $"{Uri.UnescapeDataString(usbMatch.Groups[1].Value)} {Uri.UnescapeDataString(usbMatch.Groups[2].Value)}".Trim();
                else if (hpMatch.Success)
                    model = Uri.UnescapeDataString(hpMatch.Groups[1].Value).Replace('_', ' ').Trim();
                else
                {
                    var hostMatch = Regex.Match(uri, @"(?:socket|ipp|ipps)://([^:/]+)");
                    if (hostMatch.Success) model = $"Network Printer ({Uri.UnescapeDataString(hostMatch.Groups[1].Value)})";
                }

                return new
                {
                    uri,
                    model,
                    type = connectionType == "direct" ? "usb" : "network",
                    suggestedName = Regex.Replace(model, @"[^\w]", "_").Trim('_'),
                };
            })
            .ToList();

        return Ok(new { printers });
    }

    // ── GET /api/printer/status ───────────────────────────────────────────────

    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        if (OperatingSystem.IsWindows())
        {
            var winPrinters = await WindowsPrinting.ListPrintersAsync();
            return Ok(new
            {
                defaultPrinter = winPrinters.FirstOrDefault(p => p.IsDefault)?.Name,
                installed = winPrinters.Select(p => p.Name).ToList(),
                installedUris = winPrinters.ToDictionary(p => p.Name, p => p.PortName),
            });
        }

        // Default printer
        var (defOut, _, _) = await Run("lpstat", "-d");
        var defaultPrinter = defOut.Contains("system default destination:")
            ? defOut.Split(':').Last().Trim()
            : null;

        // All installed printers
        var (listOut, _, _) = await Run("lpstat", "-p");
        var installed = listOut
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Where(l => l.StartsWith("printer "))
            .Select(l => l.Split(' ').ElementAtOrDefault(1) ?? "")
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .ToList();

        // URI for each installed printer (lpstat -v → "device for NAME: URI")
        var (uriOut, _, _) = await Run("lpstat", "-v");
        var installedUris = uriOut
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(l => Regex.Match(l, @"device for ([^:]+):\s*(.+)"))
            .Where(m => m.Success)
            .ToDictionary(
                m => m.Groups[1].Value.Trim(),
                m => m.Groups[2].Value.Trim());

        return Ok(new { defaultPrinter, installed, installedUris });
    }

    // ── POST /api/printer/activate ────────────────────────────────────────────

    public record ActivateRequest(string Uri, string Name);

    [HttpPost("activate")]
    public async Task<IActionResult> Activate([FromBody] ActivateRequest req)
    {
        if (OperatingSystem.IsWindows())
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { message = "Invalid printer name." });

            var (ok, msg) = await WindowsPrinting.SetDefaultPrinterAsync(req.Name.Trim());
            if (!ok)
                return BadRequest(new { message = $"Failed to activate printer: {msg}" });

            await WindowsPrinting.CreateKioskShortcutAsync();

            return Ok(new
            {
                message    = $"Printer \"{req.Name}\" activated and set as default.",
                name       = req.Name.Trim(),
                kioskReady = true,
            });
        }

        if (!IsSafe(req.Uri) || !IsSafe(req.Name))
            return BadRequest(new { message = "Invalid printer URI or name." });

        // Sanitise printer name: letters, digits, dashes only (CUPS requirement)
        var safeName = Regex.Replace(req.Name, @"[^\w\-]", "_");
        if (safeName.Length > 64) safeName = safeName[..64];

        // 1. Add printer — hp:// URIs use HPLIP and cannot use the IPP Everywhere driver
        string addErr; int addExit;
        if (req.Uri.StartsWith("hp:/"))
        {
            // HPLIP backend: add without -m flag, HPLIP picks the driver automatically
            (_, addErr, addExit) = await Run("lpadmin", $"-p {safeName} -E -v {req.Uri}");
        }
        else
        {
            // Try IPP Everywhere first (best for network/modern USB printers)
            (_, addErr, addExit) = await Run("lpadmin",
                $"-p {safeName} -E -v {req.Uri} -m everywhere");
            if (addExit != 0)
                (_, addErr, addExit) = await Run("lpadmin", $"-p {safeName} -E -v {req.Uri}");
        }

        if (addExit != 0)
            return BadRequest(new { message = $"Failed to add printer: {addErr}" });

        // 2. Enable & accept jobs
        await Run("cupsenable", safeName);
        await Run("cupsaccept", safeName);

        // 3. Set as system default
        var (_, defErr, defExit) = await Run("lpoptions", $"-d {safeName}");
        if (defExit != 0)
            return BadRequest(new { message = $"Printer added but failed to set as default: {defErr}" });

        // 4. Create kiosk Chrome launcher script on the desktop
        var desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (string.IsNullOrEmpty(desktopDir)) desktopDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");

        if (Directory.Exists(desktopDir))
        {
            var launcherPath = Path.Combine(desktopDir, "ECR-POS.desktop");
            await System.IO.File.WriteAllTextAsync(launcherPath,
                "[Desktop Entry]\nType=Application\nName=ECR POS\n" +
                "Exec=google-chrome --kiosk-printing --app=http://localhost:8081/pos\n" +
                "Icon=chromium\nTerminal=false\nCategories=Office;\n");
            await Run("chmod", $"+x {launcherPath}");
        }

        return Ok(new
        {
            message    = $"Printer \"{safeName}\" activated and set as default.",
            name       = safeName,
            kioskReady = true,
        });
    }

    // ── POST /api/printer/print-receipt ──────────────────────────────────────────
    // Accepts structured invoice data and generates raw ESC/POS bytes.
    // This avoids Chrome → PDF → CUPS filter chain which produces garbage on thermal printers.

    public record ReceiptItem(string Name, int Qty, double Price);
    public record SplitPayment(string Method, double Amount);
    public record FeeItem(string Name, double Amount);

    public record PrintReceiptRequest(
        string OrderNumber,
        string CreatedAt,
        string SellerName,
        string BranchName,
        string? VatNumber,
        string? CustomerName,
        string? PaymentMethod,
        List<ReceiptItem> Items,
        double Subtotal,
        double Discount,
        double Vat,
        double Total,
        string TaxLabel,
        double? TobaccoExcise,
        List<FeeItem>? Fees,
        List<SplitPayment>? SplitBreakdown,
        string? PrinterName = null
    );

    [HttpPost("print-receipt")]
    public async Task<IActionResult> PrintReceipt([FromBody] PrintReceiptRequest r)
    {
        // Build ESC/POS byte stream
        var esc = BuildEscPos(r);

        if (OperatingSystem.IsWindows())
        {
            var winTarget = !string.IsNullOrWhiteSpace(r.PrinterName)
                ? r.PrinterName.Trim()
                : await WindowsPrinting.GetDefaultPrinterNameAsync();

            if (string.IsNullOrWhiteSpace(winTarget))
                return BadRequest(new { message = "No printer configured. Open Printer Setup and activate a printer first." });

            var (ok, msg) = WindowsPrinting.PrintRaw(winTarget, esc, $"Receipt {r.OrderNumber}");
            if (!ok)
                return BadRequest(new { message = $"Print failed on '{winTarget}': {msg}" });

            return Ok(new { message = $"Receipt sent to {winTarget}." });
        }

        // Resolve printer
        string? targetPrinter = null;
        if (!string.IsNullOrWhiteSpace(r.PrinterName) && IsSafe(r.PrinterName))
            targetPrinter = r.PrinterName.Trim();
        else
        {
            var (defOut, _, _) = await Run("lpstat", "-d");
            if (defOut.Contains("system default destination:"))
                targetPrinter = defOut.Split(':').Last().Trim();
        }

        if (string.IsNullOrWhiteSpace(targetPrinter))
            return BadRequest(new { message = "No printer configured. Open Printer Setup and activate a printer first." });

        var binFile = Path.Combine(Path.GetTempPath(), $"receipt_{Guid.NewGuid():N}.bin");
        await System.IO.File.WriteAllBytesAsync(binFile, esc);

        // Send raw bytes — bypass all CUPS filters
        var (lpOut, lpErr, lpExit) = await Run("lp", $"-d {targetPrinter} -o raw \"{binFile}\"");
        System.IO.File.Delete(binFile);

        if (lpExit != 0)
            return BadRequest(new { message = $"Print failed on '{targetPrinter}': {lpErr}" });

        var jobId = Regex.Match(lpOut ?? "", @"request id is ([\w\-]+)").Groups[1].Value;
        return Ok(new { message = $"Receipt sent to {targetPrinter}.", jobId });
    }

    private static byte[] BuildEscPos(PrintReceiptRequest r)
    {
        const int WIDTH = 48; // characters per line at normal size on 80mm paper
        var buf = new List<byte>();

        // Helpers
        void Raw(params byte[] b) => buf.AddRange(b);
        void Text(string s) => buf.AddRange(System.Text.Encoding.GetEncoding("cp437").GetBytes(s));
        void Lf(int n = 1) { for (int i = 0; i < n; i++) buf.Add(0x0A); }
        void Center() => Raw(0x1B, 0x61, 0x01);
        void Left()   => Raw(0x1B, 0x61, 0x00);
        void Bold(bool on) => Raw(0x1B, 0x45, (byte)(on ? 1 : 0));
        void DoubleSize(bool on) => Raw(0x1D, 0x21, (byte)(on ? 0x11 : 0x00));
        void Divider() { Text(new string('-', WIDTH)); Lf(); }
        string Fmt(double v) => v.ToString("F2");
        string PadRow(string left, string right)
        {
            int space = WIDTH - left.Length - right.Length;
            return space > 0 ? left + new string(' ', space) + right : left + " " + right;
        }
        void Row(string left, string right) { Text(PadRow(left, right)); Lf(); }

        // ── Init ────────────────────────────────────────────────────────────
        Raw(0x1B, 0x40); // ESC @ — initialize

        // ── Header ──────────────────────────────────────────────────────────
        Center(); Bold(true); DoubleSize(true);
        var name = (r.SellerName ?? r.BranchName ?? "Store").Trim();
        Text(name.Length > 24 ? name[..24] : name.PadLeft((24 + name.Length) / 2)); Lf();
        DoubleSize(false); Bold(false);

        if (!string.IsNullOrWhiteSpace(r.VatNumber))
        { Text($"VAT: {r.VatNumber}"); Lf(); }

        Text("TAX INVOICE"); Lf();
        Left();
        Divider();

        // ── Order info ──────────────────────────────────────────────────────
        var dt = DateTime.TryParse(r.CreatedAt, out var d) ? d : DateTime.Now;
        Text(r.OrderNumber); Lf();
        Text(dt.ToString("dd/MM/yyyy  HH:mm")); Lf();
        if (!string.IsNullOrWhiteSpace(r.CustomerName))
        { Text($"Customer: {r.CustomerName}"); Lf(); }
        Divider();

        // ── Items ───────────────────────────────────────────────────────────
        foreach (var item in r.Items)
        {
            var nameStr = item.Name.Length > 32 ? item.Name[..32] : item.Name;
            Text(nameStr); Lf();
            Row($"  {item.Qty} x SAR {Fmt(item.Price)}", $"SAR {Fmt(item.Qty * item.Price)}");
        }
        Divider();

        // ── Totals ──────────────────────────────────────────────────────────
        Row("Subtotal", $"SAR {Fmt(r.Subtotal)}");
        if (r.Discount > 0)
            Row("Discount", $"-SAR {Fmt(r.Discount)}");
        if (r.TobaccoExcise > 0)
            Row("Tobacco Excise", $"SAR {Fmt(r.TobaccoExcise!.Value)}");
        foreach (var fee in r.Fees ?? [])
            Row(fee.Name, $"SAR {Fmt(fee.Amount)}");
        if (r.Vat > 0)
            Row(r.TaxLabel ?? "VAT 15%", $"SAR {Fmt(r.Vat)}");

        Divider();
        Bold(true); DoubleSize(true);
        Row("TOTAL", $"SAR {Fmt(r.Total)}");
        DoubleSize(false); Bold(false);

        // ── Payment ─────────────────────────────────────────────────────────
        if (r.SplitBreakdown?.Count > 0)
        {
            Row("Payment", "Split");
            foreach (var p in r.SplitBreakdown)
                Row($"  {char.ToUpper(p.Method[0])}{p.Method[1..]}", $"SAR {Fmt(p.Amount)}");
        }
        else if (!string.IsNullOrWhiteSpace(r.PaymentMethod))
        {
            Row("Payment", r.PaymentMethod);
        }

        // ── Footer ──────────────────────────────────────────────────────────
        Divider();
        Center();
        Text("Thank you!"); Lf();
        Text("ZATCA Phase 2 Compliant"); Lf();
        Lf();

        // ── ZATCA QR Code ────────────────────────────────────────────────────
        // Build TLV payload (ZATCA Phase 2 — 5 required tags)
        var sellerName  = (r.SellerName ?? r.BranchName ?? "Store").Trim();
        var vatNum      = r.VatNumber ?? "";
        var timestamp   = dt.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");
        var totalStr    = Fmt(r.Total);
        var vatStr      = Fmt(r.Vat);

        byte[] TlvField(byte tag, string value)
        {
            var v   = System.Text.Encoding.UTF8.GetBytes(value);
            var tlv = new byte[2 + v.Length];
            tlv[0]  = tag;
            tlv[1]  = (byte)v.Length;
            Array.Copy(v, 0, tlv, 2, v.Length);
            return tlv;
        }

        var tlvBytes = new List<byte>();
        tlvBytes.AddRange(TlvField(1, sellerName));
        tlvBytes.AddRange(TlvField(2, vatNum));
        tlvBytes.AddRange(TlvField(3, timestamp));
        tlvBytes.AddRange(TlvField(4, totalStr));
        tlvBytes.AddRange(TlvField(5, vatStr));

        var qrData  = Convert.ToBase64String(tlvBytes.ToArray());
        var qrBytes = System.Text.Encoding.UTF8.GetBytes(qrData);

        // ESC/POS QR code commands (GS ( k)
        int dataLen = qrBytes.Length + 3; // +3 for cn, fn, m bytes
        byte qpL = (byte)(dataLen & 0xFF);
        byte qpH = (byte)((dataLen >> 8) & 0xFF);

        Raw(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
        Raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);        // size 6 (pixels/module)
        Raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);        // error correction M
        Raw(0x1D, 0x28, 0x6B, qpL, qpH, 0x31, 0x50, 0x30);          // store data
        buf.AddRange(qrBytes);
        Raw(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);        // print QR

        Left();

        // Feed + cut
        Raw(0x1B, 0x64, 0x05); // feed 5 lines
        Raw(0x1D, 0x56, 0x42, 0x00); // partial cut

        return [.. buf];
    }

    // ── GET /api/printer/jobs ─────────────────────────────────────────────────

    [HttpGet("jobs")]
    public async Task<IActionResult> Jobs([FromQuery] string? printer = null)
    {
        if (OperatingSystem.IsWindows())
            return Ok(new { jobs = await WindowsPrinting.GetJobsAsync(printer) });

        var args = printer != null && IsSafe(printer) ? $"-o -P {printer}" : "-o";
        var (stdout, _, _) = await Run("lpstat", args);

        var jobs = stdout
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrWhiteSpace(l))
            .ToList();

        return Ok(new { jobs });
    }

    // ── DELETE /api/printer/jobs — cancel ALL pending jobs ───────────────────────

    [HttpDelete("jobs")]
    public async Task<IActionResult> CancelAllJobs([FromQuery] string? printer = null)
    {
        if (OperatingSystem.IsWindows())
        {
            var (ok, msg) = await WindowsPrinting.CancelJobsAsync(printer);
            if (!ok) return BadRequest(new { message = $"Could not clear queue: {msg}" });
            return Ok(new { message = "Print queue cleared." });
        }

        // cancel -a [-x] cancels all jobs; -x also removes the job data
        var args = printer != null && IsSafe(printer) ? $"-a -x -u all -P {printer}" : "-a -x";
        var (_, err, exit) = await Run("cancel", args);
        // exit code 1 just means "no jobs to cancel" — not an error
        if (exit != 0 && !string.IsNullOrWhiteSpace(err) && !err.Contains("cancel: No jobs"))
            return BadRequest(new { message = $"Could not clear queue: {err}" });

        return Ok(new { message = "Print queue cleared." });
    }

    // ── DELETE /api/printer/{name} ─────────────────────────────────────────────

    [HttpDelete("{name}")]
    public async Task<IActionResult> Remove(string name)
    {
        if (OperatingSystem.IsWindows())
        {
            var (winOk, winMsg) = await WindowsPrinting.RemovePrinterAsync(name);
            if (!winOk) return BadRequest(new { message = $"Failed to remove printer: {winMsg}" });
            return Ok(new { message = $"Printer \"{name}\" removed." });
        }

        if (!IsSafe(name))
            return BadRequest(new { message = "Invalid printer name." });

        var (_, err, exit) = await Run("lpadmin", $"-x {name}");
        if (exit != 0)
            return BadRequest(new { message = $"Failed to remove printer: {err}" });

        return Ok(new { message = $"Printer \"{name}\" removed." });
    }
}
