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
                    if (hostMatch.Success) model = $"Network Printer ({hostMatch.Groups[1].Value})";
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

        return Ok(new { defaultPrinter, installed });
    }

    // ── POST /api/printer/activate ────────────────────────────────────────────

    public record ActivateRequest(string Uri, string Name);

    [HttpPost("activate")]
    public async Task<IActionResult> Activate([FromBody] ActivateRequest req)
    {
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

    public record PrintReceiptRequest(string Html);

    [HttpPost("print-receipt")]
    public async Task<IActionResult> PrintReceipt([FromBody] PrintReceiptRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Html))
            return BadRequest(new { message = "No HTML provided." });

        var id = Guid.NewGuid().ToString("N");
        var htmlFile = Path.Combine(Path.GetTempPath(), $"receipt_{id}.html");
        var pdfFile  = Path.Combine(Path.GetTempPath(), $"receipt_{id}.pdf");

        await System.IO.File.WriteAllTextAsync(htmlFile, r.Html);

        // Render to PDF using Chrome headless
        var (_, chromErr, chromExit) = await Run("google-chrome",
            $"--headless --disable-gpu --no-sandbox --print-to-pdf={pdfFile} " +
            $"--print-to-pdf-no-header --no-margins file://{htmlFile}");

        System.IO.File.Delete(htmlFile);

        if (chromExit != 0 || !System.IO.File.Exists(pdfFile))
        {
            if (System.IO.File.Exists(pdfFile)) System.IO.File.Delete(pdfFile);
            return BadRequest(new { message = $"PDF render failed: {chromErr}" });
        }

        // Print PDF via lp
        var (_, lpErr, lpExit) = await Run("lp", pdfFile);
        System.IO.File.Delete(pdfFile);

        if (lpExit != 0)
            return BadRequest(new { message = $"Print failed: {lpErr}" });

        return Ok(new { message = "Receipt sent to printer." });
    }

    // ── DELETE /api/printer/{name} ─────────────────────────────────────────────

    [HttpDelete("{name}")]
    public async Task<IActionResult> Remove(string name)
    {
        if (!IsSafe(name))
            return BadRequest(new { message = "Invalid printer name." });

        var (_, err, exit) = await Run("lpadmin", $"-x {name}");
        if (exit != 0)
            return BadRequest(new { message = $"Failed to remove printer: {err}" });

        return Ok(new { message = $"Printer \"{name}\" removed." });
    }
}
