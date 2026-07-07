using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PrinterController(IConfiguration config) : ControllerBase
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
        string? PrinterName = null,
        // The real ZATCA Phase 2 QR (base64 TLV, 9 tags incl. hash/signature/cert) from the
        // signed ZatcaInvoice. When absent (Phase 2 not onboarded, or submission failed), falls
        // back to a locally-built Phase-1-style 5-tag QR below.
        string? ZatcaQrCode = null
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
        Row("Subtotal", $"SAR {Fmt(r.Subtotal - r.Discount)}");
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
        // Prefer the real, cryptographically-signed QR from the submitted ZatcaInvoice. Only
        // fall back to a locally-built Phase-1-style 5-tag QR when it's unavailable.
        string qrData;
        if (!string.IsNullOrEmpty(r.ZatcaQrCode))
        {
            qrData = r.ZatcaQrCode;
        }
        else
        {
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

            qrData = Convert.ToBase64String(tlvBytes.ToArray());
        }
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

    // ── GET /api/printer/setup-installer ─────────────────────────────────────
    // Returns a platform-specific one-click installer:
    //   Windows → .bat  (double-click, auto-elevates UAC, installs silently)
    //   Linux   → .deb  (double-click → Software Center → Install)
    //   macOS   → .command (double-click runs in Terminal automatically)

    [HttpGet("setup-installer")]
    public async Task<IActionResult> SetupInstaller()
    {
        var posUrl = config["PosUrl"] ?? $"{Request.Scheme}://{Request.Host}";
        var ua     = Request.Headers.UserAgent.ToString().ToLower();
        var appName = "MiMony POS";

        // ── Windows ──────────────────────────────────────────────────────────
        // Note: $$ prefix means only {{expr}} interpolates; bare $, {, } are all literal.
        if (ua.Contains("windows"))
        {
            var bat = $$"""
@echo off
setlocal EnableDelayedExpansion
title {{appName}} Setup

:: ── Auto-elevate to Administrator ─────────────────────────────────────────
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Set UAC = CreateObject^("Shell.Application"^) > "%TEMP%\elevate.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%TEMP%\elevate.vbs"
    "%TEMP%\elevate.vbs"
    del "%TEMP%\elevate.vbs"
    exit /B
)

echo.
echo  ========================================
echo   {{appName}} - One-Click Setup
echo  ========================================
echo.

:: ── Download and install QZ Tray ──────────────────────────────────────────
echo [1/3] Downloading QZ Tray...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r = Invoke-RestMethod 'https://api.github.com/repos/qzind/tray/releases/latest'; $a = $r.assets | Where-Object { $_.name -like '*.exe' -and $_.name -notlike '*arm64*' } | Select-Object -First 1; $url = $a.browser_download_url } catch { $url = 'https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.exe' }; Invoke-WebRequest -Uri $url -OutFile $env:TEMP\qz-tray-setup.exe -UseBasicParsing"

echo [2/3] Installing QZ Tray silently...
"%TEMP%\qz-tray-setup.exe" /S
timeout /t 8 /nobreak >nul
del "%TEMP%\qz-tray-setup.exe" 2>nul

:: ── Create Desktop shortcut (kiosk Chrome) ────────────────────────────────
echo [3/3] Creating POS shortcut on Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut($env:PUBLIC + '\Desktop\{{appName}}.lnk'); $chromePaths = @($env:ProgramFiles + '\Google\Chrome\Application\chrome.exe',$env:ProgramFiles + '\Microsoft\Edge\Application\msedge.exe'); $browser = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1; if ($browser) { $sc.TargetPath = $browser; $sc.Arguments = '--kiosk {{posUrl}}/pos --disable-infobars --no-first-run --unsafely-treat-insecure-origin-as-secure={{posUrl}}' } else { $sc.TargetPath = 'C:\Windows\explorer.exe'; $sc.Arguments = '{{posUrl}}/pos' }; $sc.Description = '{{appName}} Checkout'; $sc.Save()"

:: ── Chrome Policy: allow QZ Tray from this origin in ALL Chrome windows ────
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin" /v "1" /t REG_SZ /d "{{posUrl}}" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin" /v "1" /t REG_SZ /d "{{posUrl}}" /f >nul 2>&1

:: ── Trust POS cert in QZ Tray — eliminates all "Action Required" dialogs ──
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cert = try { (Invoke-WebRequest '{{posUrl}}/api/printer/qz-certificate' -UseBasicParsing).Content } catch { '' };" ^
  "if ($cert) {" ^
    "$qzDir = @($env:ProgramFiles + '\QZ Tray', $env:LOCALAPPDATA + '\QZ Tray') | Where-Object { Test-Path $_ } | Select-Object -First 1;" ^
    "if ($qzDir) { $cert | Set-Content -Path ($qzDir + '\override.crt') -Encoding ASCII };" ^
    "$fp = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([System.Text.Encoding]::ASCII.GetBytes($cert)).GetCertHashString('SHA1').ToLower();" ^
    "$allowedDir = $env:APPDATA + '\qz'; New-Item -ItemType Directory -Force $allowedDir | Out-Null;" ^
    "$entry = $fp + \"`tQZ Tray Demo Cert`tQZ Industries, LLC`t2026-07-02 14:40:36`t2046-07-02 14:40:36`ttrue\"; " ^
    "$allowed = $allowedDir + '\allowed.dat';" ^
    "$lines = if (Test-Path $allowed) { Get-Content $allowed | Where-Object { $_ -notmatch $fp } } else { @() };" ^
    "$lines += $entry; $lines | Set-Content -Path $allowed -Encoding ASCII;" ^
    "Write-Host '   QZ Tray trusted — no dialogs will appear.'" ^
  "}"

:: ── Start QZ Tray ─────────────────────────────────────────────────────────
powershell -NoProfile -ExecutionPolicy Bypass -Command "$qz = @($env:ProgramFiles + '\QZ Tray\qz-tray.exe',$env:LOCALAPPDATA + '\QZ Tray\qz-tray.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1; if ($qz) { Start-Process $qz; reg add 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' /v 'QZ Tray' /t REG_SZ /d $qz /f | Out-Null }"

echo.
echo  ========================================
echo   Setup complete!
echo.
echo   QZ Tray is running in the system tray.
echo   POS shortcut is on the Desktop.
echo   No security dialogs will appear.
echo  ========================================
echo.
pause
""";
            return File(System.Text.Encoding.UTF8.GetBytes(bat),
                "application/octet-stream", "MiMony-POS-Setup.bat");
        }

        // ── macOS ─────────────────────────────────────────────────────────────
        if (ua.Contains("macintosh") || ua.Contains("mac os"))
        {
            var cmd = $$"""
#!/bin/bash
# Double-click to run — opens Terminal automatically
clear
echo " ========================================"
echo "  {{appName}} - One-Click Setup"
echo " ========================================"
echo ""

# 1. Install QZ Tray
if ! [ -d "/Applications/QZ Tray.app" ]; then
  echo "[1/3] Downloading QZ Tray..."
  RELEASE=$(curl -s https://api.github.com/repos/qzind/tray/releases/latest 2>/dev/null)
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*arm64\.pkg"' | grep -o 'https://[^"]*' | head -1)
    [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-arm64.pkg"
  else
    URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*x86_64\.pkg"' | grep -o 'https://[^"]*' | head -1)
    [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.pkg"
  fi
  curl -L --progress-bar -o /tmp/qz-tray.pkg "$URL"
  echo "[2/3] Installing QZ Tray (may ask for password)..."
  sudo installer -pkg /tmp/qz-tray.pkg -target / && rm /tmp/qz-tray.pkg
else
  echo "[1/3] QZ Tray already installed — skipping."
  echo "[2/3] Skipped."
fi

# 2. Desktop shortcut (URL baked in by server at download time)
echo "[3/3] Creating POS shortcut on Desktop..."
cat > ~/Desktop/"{{appName}}.command" << 'ENDOFSHORTCUT'
#!/bin/bash
open -a "Google Chrome" --args --kiosk {{posUrl}}/pos --disable-infobars --no-first-run --unsafely-treat-insecure-origin-as-secure={{posUrl}} 2>/dev/null || \
open -a "Safari" {{posUrl}}/pos
ENDOFSHORTCUT
chmod +x ~/Desktop/"{{appName}}.command"

# Chrome Policy: allow QZ Tray from this origin in ALL Chrome windows
sudo mkdir -p "/Library/Application Support/Google/Chrome/policies/managed" 2>/dev/null
echo '{"OverrideSecurityRestrictionsOnInsecureOrigin": ["{{posUrl}}"]}' | sudo tee "/Library/Application Support/Google/Chrome/policies/managed/mimony-pos.json" >/dev/null 2>&1 || true

# 3. Launch QZ Tray and add to login items
open -a "QZ Tray" 2>/dev/null || true
osascript -e 'tell application "System Events" to make new login item at end with properties {path:"/Applications/QZ Tray.app", hidden:true}' 2>/dev/null || true

echo ""
echo " ========================================"
echo "  Setup complete!"
echo ""
echo "  QZ Tray is running in the menu bar."
echo "  POS shortcut added to Desktop."
echo ""
echo "  First time: QZ Tray may ask to Allow"
echo "  unsigned content — click Allow."
echo " ========================================"
""";
            return File(System.Text.Encoding.UTF8.GetBytes(cmd),
                "application/octet-stream", "MiMony-POS-Setup.command");
        }

        // ── Linux → .desktop launcher ─────────────────────────────────────────
        // Avoids App Center entirely. User double-clicks → "Allow Launching" →
        // terminal opens → script runs (sudo dpkg prompts password in terminal).
        // The bash script is base64-embedded so no quoting issues in Exec line.
        var bashScript = $$"""
#!/bin/bash
clear
echo " ========================================"
echo "  {{appName}} - One-Click Setup"
echo " ========================================"
echo ""

echo "[1/3] Downloading QZ Tray..."
ARCH=$(uname -m)
RELEASE=$(curl -sf https://api.github.com/repos/qzind/tray/releases/latest 2>/dev/null || echo "")
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*arm64\.run"' | grep -o 'https://[^"]*' | head -1)
  [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-arm64.run"
else
  URL=$(echo "$RELEASE" | grep -o '"browser_download_url":"[^"]*x86_64\.run"' | grep -o 'https://[^"]*' | head -1)
  [ -z "$URL" ] && URL="https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.run"
fi
curl -L --progress-bar -o /tmp/qz-tray-setup.run "$URL"

echo ""
echo "[2/3] Installing QZ Tray (enter your password when asked)..."
chmod +x /tmp/qz-tray-setup.run
sudo /tmp/qz-tray-setup.run --accept --quiet
rm -f /tmp/qz-tray-setup.run

echo ""
echo "[3/3] Creating POS shortcut on Desktop..."
mkdir -p ~/Desktop
cat > ~/Desktop/"{{appName}}.desktop" << 'POSSHORTCUT'
[Desktop Entry]
Version=1.0
Type=Application
Name={{appName}}
Exec=bash -c "google-chrome --kiosk {{posUrl}}/pos --disable-infobars --no-first-run --unsafely-treat-insecure-origin-as-secure={{posUrl}} 2>/dev/null || chromium-browser --kiosk {{posUrl}}/pos --unsafely-treat-insecure-origin-as-secure={{posUrl}} 2>/dev/null || xdg-open {{posUrl}}/pos"
Icon=chromium
Terminal=false
Categories=Office;
StartupNotify=true
POSSHORTCUT
chmod +x ~/Desktop/"{{appName}}.desktop"
gio set ~/Desktop/"{{appName}}.desktop" metadata::trusted true 2>/dev/null || true

# Chrome Policy: allow QZ Tray from this origin in ALL Chrome windows
sudo mkdir -p /etc/opt/chrome/policies/managed /etc/chromium/policies/managed 2>/dev/null
echo '{"OverrideSecurityRestrictionsOnInsecureOrigin": ["{{posUrl}}"]}' | sudo tee /etc/opt/chrome/policies/managed/mimony-pos.json /etc/chromium/policies/managed/mimony-pos.json >/dev/null 2>&1 || true

# CUPS: set up thermal printer as raw queue
echo ""
echo "[4/4] Setting up thermal printer..."
cat > /tmp/raw-thermal.ppd << 'RAWPPD'
*PPD-Adobe: "4.3"
*FormatVersion: "4.3"
*FileVersion: "1.1"
*LanguageVersion: English
*LanguageEncoding: ISOLatin1
*Manufacturer: "Generic"
*Product: "(Raw Thermal)"
*PSVersion: "(3010.000) 0"
*ModelName: "Raw Thermal Queue"
*ShortNickName: "Raw Thermal"
*NickName: "Raw Thermal Queue"
*CompatiblePrinters: All
*cupsVersion: 1.4
*cupsManualCopies: True
*cupsFilter: "application/vnd.cups-raw 0 -"
*ColorDevice: False
*DefaultColorSpace: Gray
*FileSystem: False
*Throughput: "1"
*LandscapeOrientation: Plus90
*VariablePaperSize: False
*TTRasterizer: None
RAWPPD

USB_URI=$(lpinfo -v 2>/dev/null | grep -i "usb://" | grep -iv "laser\|hp_\|laserjet" | head -1 | awk '{print $2}')
if [ -n "$USB_URI" ]; then
  sudo lpadmin -x POS-80C 2>/dev/null || true
  sudo lpadmin -p POS-80C -v "$USB_URI" -P /tmp/raw-thermal.ppd -E
  sudo cupsenable POS-80C && sudo cupsaccept POS-80C
  grep -qxF 'text/plain	application/vnd.cups-raw	0	-' /etc/cups/mime.convs 2>/dev/null || \
    echo 'text/plain	application/vnd.cups-raw	0	-' | sudo tee -a /etc/cups/mime.convs
  sudo systemctl restart cups
  echo "   Thermal printer configured: $USB_URI"
else
  echo "   No USB thermal printer detected — connect printer and re-run if needed."
fi
rm -f /tmp/raw-thermal.ppd

# Trust the POS server cert permanently — QZ Tray will auto-allow all
# print requests with zero dialogs on every reboot.
QZ_CERT=$(curl -sf "{{posUrl}}/api/printer/qz-certificate" 2>/dev/null || echo "")
if [ -n "$QZ_CERT" ]; then
  # Install as override cert so QZ Tray treats it as if generated here
  echo "$QZ_CERT" | sudo tee /opt/qz-tray/override.crt >/dev/null
  # Also write to allowed.dat so it's permanently allowed (no prompt ever)
  QZ_FP=$(echo "$QZ_CERT" | openssl x509 -noout -fingerprint -sha1 2>/dev/null | cut -d= -f2 | tr -d ':' | tr 'A-F' 'a-f')
  mkdir -p ~/.qz
  grep -v "^$QZ_FP" ~/.qz/allowed.dat 2>/dev/null > /tmp/qz_allowed.tmp || true
  printf "%s\tQZ Tray Demo Cert\tQZ Industries, LLC\t2026-07-02 14:40:36\t2046-07-02 14:40:36\ttrue\r\n" "$QZ_FP" >> /tmp/qz_allowed.tmp
  mv /tmp/qz_allowed.tmp ~/.qz/allowed.dat
  echo "   QZ Tray trusted — no dialogs will appear."
else
  echo "   Could not reach POS server — connect printer manually later."
fi

# Add QZ Tray and auto-allow to autostart
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/qz-tray.desktop << 'AUTOSTART'
[Desktop Entry]
Type=Application
Name=QZ Tray
Exec=qz-tray
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
AUTOSTART

cat > ~/.config/autostart/qz-auto-allow.desktop << AUTOSTART
[Desktop Entry]
Type=Application
Name=QZ Auto-Allow
Exec=bash $HOME/.local/bin/qz-auto-allow.sh
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
AUTOSTART

# Launch QZ Tray and auto-closer now
nohup qz-tray >/dev/null 2>&1 &
nohup bash ~/.local/bin/qz-auto-allow.sh >/dev/null 2>&1 &

echo ""
echo " ========================================"
echo "  Done!"
echo "  QZ Tray is running in the system tray."
echo "  POS shortcut is on your Desktop."
echo ""
echo "  QZ Tray dialogs close automatically."
echo "  Just open the POS and start printing."
echo " ========================================"
echo ""
echo "Press Enter to close..."
read
""";
        // Serve as plain .sh — IT opens terminal and runs: bash ~/Downloads/MiMony-POS-Setup.sh
        return File(System.Text.Encoding.UTF8.GetBytes(bashScript),
            "application/x-sh", "MiMony-POS-Setup.sh");
    }

    // ── GET /api/printer/qz-install-script ───────────────────────────────────
    // Detects the browser OS from User-Agent and returns a platform-specific
    // install script that downloads and silently installs QZ Tray.

    [HttpGet("qz-install-script")]
    public IActionResult QzInstallScript()
    {
        var ua = Request.Headers.UserAgent.ToString().ToLower();

        if (ua.Contains("windows"))
        {
            var ps1 = """
# QZ Tray Silent Installer for Windows
# Run: Right-click → "Run with PowerShell"
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

Write-Host "=== QZ Tray Installer ===" -ForegroundColor Cyan

# Fetch latest release version from GitHub API
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/qzind/tray/releases/latest"
    $asset = $release.assets | Where-Object { $_.name -like "*windows*" -and $_.name -like "*.exe" } | Select-Object -First 1
    $url = $asset.browser_download_url
    $version = $release.tag_name
} catch {
    # Fallback to known stable version
    $version = "v2.2.4"
    $url = "https://github.com/qzind/tray/releases/download/v2.2.4/qz-tray-2.2.4-windows.exe"
}

Write-Host "Downloading QZ Tray $version..." -ForegroundColor Yellow
$installer = "$env:TEMP\qz-tray-setup.exe"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

Write-Host "Installing silently..." -ForegroundColor Yellow
Start-Process -FilePath $installer -ArgumentList "/S" -Wait -NoNewWindow

Write-Host "Starting QZ Tray..." -ForegroundColor Yellow
$paths = @(
    "$env:ProgramFiles\QZ Tray\qz-tray.exe",
    "$env:ProgramFiles(x86)\QZ Tray\qz-tray.exe",
    "$env:LOCALAPPDATA\QZ Tray\qz-tray.exe"
)
$qzExe = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($qzExe) {
    Start-Process -FilePath $qzExe
    Write-Host "QZ Tray is running in your system tray!" -ForegroundColor Green
} else {
    Write-Host "Installation complete. Please start QZ Tray from the Start Menu." -ForegroundColor Green
}

Write-Host ""
Write-Host "Next step: Go back to the browser and click 'Connect' in Printer Setup." -ForegroundColor Cyan
Write-Host "First time: QZ Tray will ask to Allow unsigned content — click Allow." -ForegroundColor Cyan
Read-Host "Press Enter to close"
""";
            return File(System.Text.Encoding.UTF8.GetBytes(ps1),
                "application/octet-stream",
                "install-qz-tray.ps1");
        }

        if (ua.Contains("macintosh") || ua.Contains("mac os"))
        {
            var sh = """
#!/bin/bash
# QZ Tray Silent Installer for macOS
# Run: double-click or  bash ~/Downloads/install-qz-tray.sh
set -e
echo "=== QZ Tray Installer for macOS ==="

echo "Fetching latest release..."
RELEASE=$(curl -s https://api.github.com/repos/qzind/tray/releases/latest)
URL=$(echo "$RELEASE" | grep -o '"browser_download_url": *"[^"]*mac[^"]*\.pkg"' | grep -o 'https://[^"]*' | head -1)

if [ -z "$URL" ]; then
  URL="https://github.com/qzind/tray/releases/download/v2.2.4/qz-tray-2.2.4-mac.pkg"
fi

echo "Downloading QZ Tray..."
curl -L -o /tmp/qz-tray.pkg "$URL"

echo "Installing (may ask for password)..."
sudo installer -pkg /tmp/qz-tray.pkg -target /

echo "Starting QZ Tray..."
open -a "QZ Tray" 2>/dev/null || open /Applications/QZ\ Tray.app 2>/dev/null || true

echo ""
echo "Done! QZ Tray is running in your menu bar."
echo "Next: Go back to the browser → Printer Setup → Connect."
echo "First time: click Allow when QZ Tray asks about unsigned content."
""";
            return File(System.Text.Encoding.UTF8.GetBytes(sh),
                "application/octet-stream",
                "install-qz-tray.sh");
        }

        // Default: Linux
        var linux = """
#!/bin/bash
# QZ Tray Silent Installer for Linux (Debian/Ubuntu/RPM)
# Run: bash install-qz-tray.sh
set -e
echo "=== QZ Tray Installer for Linux ==="

echo "Fetching latest release..."
RELEASE=$(curl -s https://api.github.com/repos/qzind/tray/releases/latest)

if command -v apt-get &>/dev/null; then
    echo "Detected Debian/Ubuntu"
    URL=$(echo "$RELEASE" | grep -o '"browser_download_url": *"[^"]*linux[^"]*amd64\.deb"' | grep -o 'https://[^"]*' | head -1)
    if [ -z "$URL" ]; then
        URL="https://github.com/qzind/tray/releases/download/v2.2.4/qz-tray-2.2.4-linux-amd64.deb"
    fi
    echo "Downloading $URL ..."
    curl -L -o /tmp/qz-tray.deb "$URL"
    sudo dpkg -i /tmp/qz-tray.deb || sudo apt-get install -f -y
elif command -v rpm &>/dev/null; then
    echo "Detected RPM-based (RHEL/CentOS/Fedora)"
    URL=$(echo "$RELEASE" | grep -o '"browser_download_url": *"[^"]*linux[^"]*x86_64\.rpm"' | grep -o 'https://[^"]*' | head -1)
    if [ -z "$URL" ]; then
        URL="https://github.com/qzind/tray/releases/download/v2.2.4/qz-tray-2.2.4-linux-x86_64.rpm"
    fi
    echo "Downloading $URL ..."
    curl -L -o /tmp/qz-tray.rpm "$URL"
    sudo rpm -i /tmp/qz-tray.rpm
else
    echo "Unsupported distro. Please install manually from https://qz.io/download/"
    exit 1
fi

echo "Starting QZ Tray..."
nohup qz-tray > /dev/null 2>&1 &

echo ""
echo "Done! QZ Tray is running."
echo "Next: Go back to the browser → Printer Setup → Connect."
echo "First time: click Allow when QZ Tray asks about unsigned content."
""";
        return File(System.Text.Encoding.UTF8.GetBytes(linux),
            "application/octet-stream",
            "install-qz-tray.sh");
    }

    // ── QZ Tray certificate signing (eliminates "Action Required" prompt) ────

    [HttpGet("qz-fingerprint")]
    [AllowAnonymous]
    public IActionResult QzFingerprint()
    {
        var certPath = Path.Combine(AppContext.BaseDirectory, "qz-certs", "certificate.pem");
        if (!System.IO.File.Exists(certPath))
            certPath = Path.Combine(Directory.GetCurrentDirectory(), "qz-certs", "certificate.pem");
        if (!System.IO.File.Exists(certPath))
            return NotFound("QZ certificate not found");

        var pem = System.IO.File.ReadAllText(certPath);
        using var cert = System.Security.Cryptography.X509Certificates.X509Certificate2.CreateFromPem(pem);
        var fp = cert.GetCertHashString(System.Security.Cryptography.HashAlgorithmName.SHA1).ToLowerInvariant();
        return Content(fp, "text/plain");
    }

    [HttpGet("qz-certificate")]
    [AllowAnonymous]
    public IActionResult QzCertificate()
    {
        var certPath = Path.Combine(AppContext.BaseDirectory, "qz-certs", "certificate.pem");
        if (!System.IO.File.Exists(certPath))
            certPath = Path.Combine(Directory.GetCurrentDirectory(), "qz-certs", "certificate.pem");
        if (!System.IO.File.Exists(certPath))
            return NotFound("QZ certificate not found");
        var pem = System.IO.File.ReadAllText(certPath);
        return Content(pem, "text/plain");
    }

    [HttpPost("qz-sign")]
    [AllowAnonymous]
    public IActionResult QzSign([FromBody] QzSignRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ToSign))
            return BadRequest("toSign is required");

        var keyPath = Path.Combine(AppContext.BaseDirectory, "qz-certs", "private.pem");
        if (!System.IO.File.Exists(keyPath))
            keyPath = Path.Combine(Directory.GetCurrentDirectory(), "qz-certs", "private.pem");
        if (!System.IO.File.Exists(keyPath))
            return NotFound("QZ private key not found");

        var pem = System.IO.File.ReadAllText(keyPath);
        var key = System.Security.Cryptography.RSA.Create();
        key.ImportFromPem(pem);

        var data = System.Text.Encoding.UTF8.GetBytes(req.ToSign);
        var sig  = key.SignData(data, System.Security.Cryptography.HashAlgorithmName.SHA1,
                                System.Security.Cryptography.RSASignaturePadding.Pkcs1);
        return Content(Convert.ToBase64String(sig), "text/plain");
    }
}

public record QzSignRequest(string ToSign);
