using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

// Windows counterpart to the CUPS calls in PrinterController — lets the same
// POST /api/printer/print-receipt endpoint autoprint silently on a Windows-hosted
// backend (no dialog, no spooler PDF rendering) instead of only on Linux/CUPS.
public static class WindowsPrinting
{
    // ── Raw ESC/POS printing via winspool.drv ───────────────────────────────
    // Sends bytes straight to the spooler as a RAW-datatype job, bypassing GDI
    // rendering (which would otherwise reformat/garble raw thermal-printer
    // escape sequences). This is the Windows analogue of CUPS' `lp -o raw`.

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOCINFOW
    {
        public string pDocName;
        public string? pOutputFile;
        public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinterW(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool StartDocPrinterW(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static (bool ok, string message) PrintRaw(string printerName, byte[] data, string docName = "Receipt")
    {
        if (!OpenPrinterW(printerName, out var hPrinter, IntPtr.Zero))
            return (false, $"Could not open printer \"{printerName}\" (Win32 error {Marshal.GetLastWin32Error()}).");

        try
        {
            var docInfo = new DOCINFOW { pDocName = docName, pOutputFile = null, pDataType = "RAW" };
            if (!StartDocPrinterW(hPrinter, 1, ref docInfo))
                return (false, $"StartDocPrinter failed (Win32 error {Marshal.GetLastWin32Error()}).");

            try
            {
                if (!StartPagePrinter(hPrinter))
                    return (false, $"StartPagePrinter failed (Win32 error {Marshal.GetLastWin32Error()}).");

                try
                {
                    if (!WritePrinter(hPrinter, data, data.Length, out var written) || written != data.Length)
                        return (false, $"WritePrinter failed (Win32 error {Marshal.GetLastWin32Error()}).");
                }
                finally { EndPagePrinter(hPrinter); }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }

        return (true, "ok");
    }

    // ── Printer enumeration / management via WMI (Win32_Printer / Win32_PrintJob) ──
    // Shelled out through PowerShell -EncodedCommand so no extra NuGet dependency is
    // needed; untrusted values (printer names) are passed as process argv entries
    // (exposed to the script as $args) rather than interpolated into script text,
    // so there is no PowerShell/WQL injection surface.

    private static async Task<(string stdout, string stderr, int exit)> RunPowerShell(string script, params string[] scriptArgs)
    {
        var encoded = Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(script));
        var psi = new ProcessStartInfo("powershell.exe")
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-NonInteractive");
        psi.ArgumentList.Add("-ExecutionPolicy");
        psi.ArgumentList.Add("Bypass");
        psi.ArgumentList.Add("-EncodedCommand");
        psi.ArgumentList.Add(encoded);
        foreach (var a in scriptArgs) psi.ArgumentList.Add(a);

        using var p = Process.Start(psi)!;
        var stdout = await p.StandardOutput.ReadToEndAsync();
        var stderr = await p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync();
        return (stdout.Trim(), stderr.Trim(), p.ExitCode);
    }

    public record InstalledPrinter(string Name, bool IsDefault, string PortName);

    public static async Task<List<InstalledPrinter>> ListPrintersAsync()
    {
        const string script = "Get-CimInstance -ClassName Win32_Printer | " +
            "Select-Object Name,Default,PortName | ConvertTo-Json -Compress";
        var (stdout, _, _) = await RunPowerShell(script);
        if (string.IsNullOrWhiteSpace(stdout)) return [];

        try
        {
            using var doc = JsonDocument.Parse(stdout);
            var elements = doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement.EnumerateArray().ToList()
                : [doc.RootElement];

            return elements
                .Select(el => new InstalledPrinter(
                    el.TryGetProperty("Name", out var n) ? n.GetString() ?? "" : "",
                    el.TryGetProperty("Default", out var d) && d.ValueKind == JsonValueKind.True,
                    el.TryGetProperty("PortName", out var p) ? p.GetString() ?? "" : ""))
                .Where(p => !string.IsNullOrWhiteSpace(p.Name))
                .ToList();
        }
        catch (JsonException) { return []; }
    }

    public static async Task<string?> GetDefaultPrinterNameAsync()
    {
        var printers = await ListPrintersAsync();
        return printers.FirstOrDefault(p => p.IsDefault)?.Name ?? printers.FirstOrDefault()?.Name;
    }

    public static async Task<(bool ok, string message)> SetDefaultPrinterAsync(string name)
    {
        const string script = """
            $name = $args[0]
            $p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $name }
            if (-not $p) { Write-Error "Printer not found"; exit 1 }
            Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter | Out-Null
            """;
        var (_, err, exit) = await RunPowerShell(script, name);
        return exit == 0 ? (true, "ok") : (false, string.IsNullOrWhiteSpace(err) ? "Failed to set default printer." : err);
    }

    public static async Task<(bool ok, string message)> RemovePrinterAsync(string name)
    {
        const string script = """
            $name = $args[0]
            $p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $name }
            if (-not $p) { Write-Error "Printer not found"; exit 1 }
            Remove-CimInstance -InputObject $p
            """;
        var (_, err, exit) = await RunPowerShell(script, name);
        return exit == 0 ? (true, "ok") : (false, string.IsNullOrWhiteSpace(err) ? $"Failed to remove printer \"{name}\"." : err);
    }

    public static async Task<List<string>> GetJobsAsync(string? printerName)
    {
        const string script = """
            $name = $args[0]
            $jobs = Get-CimInstance -ClassName Win32_PrintJob
            if ($name) { $jobs = $jobs | Where-Object { $_.Name -like "$name,*" } }
            $jobs | Select-Object Document,JobStatus,TotalPages | ConvertTo-Json -Compress
            """;
        var (stdout, _, _) = await RunPowerShell(script, printerName ?? "");
        if (string.IsNullOrWhiteSpace(stdout)) return [];

        try
        {
            using var doc = JsonDocument.Parse(stdout);
            var elements = doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement.EnumerateArray().ToList()
                : [doc.RootElement];

            return elements.Select(el =>
            {
                var document = el.TryGetProperty("Document", out var d) ? d.GetString() ?? "" : "";
                var status = el.TryGetProperty("JobStatus", out var s) ? s.GetString() ?? "" : "";
                return string.IsNullOrWhiteSpace(status) ? document : $"{document} ({status})";
            }).ToList();
        }
        catch (JsonException) { return []; }
    }

    public static async Task<(bool ok, string message)> CancelJobsAsync(string? printerName)
    {
        const string script = """
            $name = $args[0]
            $jobs = Get-CimInstance -ClassName Win32_PrintJob
            if ($name) { $jobs = $jobs | Where-Object { $_.Name -like "$name,*" } }
            $jobs | Remove-CimInstance
            """;
        var (_, err, exit) = await RunPowerShell(script, printerName ?? "");
        return exit == 0 ? (true, "ok") : (false, string.IsNullOrWhiteSpace(err) ? "Could not clear queue." : err);
    }

    // Best-effort kiosk launcher shortcut, mirroring the Chrome --kiosk-printing
    // .desktop launcher created on Linux in PrinterController.Activate.
    public static async Task CreateKioskShortcutAsync()
    {
        const string script = """
            $desktop = [Environment]::GetFolderPath('Desktop')
            $chromePaths = @(
                "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
            )
            $chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
            if (-not $chrome) { $chrome = "chrome.exe" }
            $shortcutPath = Join-Path $desktop "ECR-POS.lnk"
            $WshShell = New-Object -ComObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut($shortcutPath)
            $Shortcut.TargetPath = $chrome
            $Shortcut.Arguments = "--kiosk-printing --app=http://localhost:8081/pos"
            $Shortcut.Save()
            """;
        await RunPowerShell(script);
    }
}
