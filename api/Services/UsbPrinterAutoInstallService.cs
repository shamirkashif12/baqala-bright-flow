namespace BaqalaPOS.Api.Services;

// Windows only shows a USB thermal printer under "Printers" once some printer queue is
// bound to its spooler port — otherwise it sits under "Unspecified devices" forever, even
// after unplug/replug, until someone adds it by hand. The one-time setup-installer script in
// PrinterController only catches a printer that happens to be plugged in during install; this
// keeps scanning afterward so a printer connected later (or on a different USB port) gets
// picked up automatically, with no manual "Add a device" step.
public class UsbPrinterAutoInstallService(ILogger<UsbPrinterAutoInstallService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!OperatingSystem.IsWindows()) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var added = await WindowsPrinting.AutoInstallUsbPrintersAsync();
                foreach (var name in added)
                    logger.LogInformation("Auto-installed USB printer \"{Name}\" — was showing as Unspecified.", name);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "USB printer auto-install scan failed.");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }
}
