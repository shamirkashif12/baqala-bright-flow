<#
.SYNOPSIS
    Full clean-slate uninstaller for everything the MiMony/Baqala POS project installs
    on a Windows machine for QZ Tray printing. Removes QZ Tray itself, its certificates,
    the project's trust entries, autostart hooks, browser policies, and desktop shortcut.

.DESCRIPTION
    Safe to re-run (idempotent). Auto-elevates to Administrator (one UAC prompt).
    After running, the machine is in a from-zero state: reinstall QZ Tray + re-run the
    POS one-click installer for a fresh setup.

.USAGE
    Right-click this file -> "Run with PowerShell", and approve the UAC prompt.
    Or from an elevated PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\qz-uninstall.ps1
#>
param([switch]$NoPause)

$ErrorActionPreference = 'Continue'

# - Auto-elevate -
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
          ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator rights (approve the UAC prompt)..." -ForegroundColor Yellow
    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($NoPause) { $argLine += " -NoPause" }
    try { Start-Process powershell -Verb RunAs -ArgumentList $argLine }
    catch { Write-Host "Elevation was cancelled - nothing was changed." -ForegroundColor Red }
    exit
}

$log = Join-Path $env:TEMP 'qz-uninstall.log'
"=== QZ Tray clean-slate uninstall - $(Get-Date) ===" | Set-Content -Path $log -Encoding utf8
function Step($m) { Write-Host $m -ForegroundColor Cyan; Add-Content $log $m }
function Info($m) { Write-Host "   $m";              Add-Content $log "   $m" }

# 1. Stop QZ Tray / its bundled Java runtime (frees locked files)
Step "[1/10] Stopping QZ Tray processes..."
Get-Process qz-tray,qz-tray-console -EA SilentlyContinue | ForEach-Object { Info "stop $($_.ProcessName) ($($_.Id))"; Stop-Process -Id $_.Id -Force -EA SilentlyContinue }
Get-Process javaw,java -EA SilentlyContinue | Where-Object { $_.Path -like 'C:\Program Files\QZ Tray\*' } | ForEach-Object { Info "stop $($_.ProcessName) ($($_.Id))"; Stop-Process -Id $_.Id -Force -EA SilentlyContinue }
Start-Sleep -Seconds 2

# 2. Uninstall QZ Tray (silent) + remove leftover dir
Step "[2/10] Uninstalling QZ Tray..."
$uninst = 'C:\Program Files\QZ Tray\uninstall.exe'
if (Test-Path $uninst) {
    try { Start-Process -FilePath $uninst -ArgumentList '/S' -Wait; Info "uninstaller ran" } catch { Info "uninstaller error: $_" }
    for ($i=0; $i -lt 15 -and (Test-Path 'C:\Program Files\QZ Tray'); $i++) { Start-Sleep -Seconds 1 }
} else { Info "QZ Tray not installed" }
if (Test-Path 'C:\Program Files\QZ Tray') { Remove-Item 'C:\Program Files\QZ Tray' -Recurse -Force -EA SilentlyContinue }
Info ("QZ Tray dir remaining: " + (Test-Path 'C:\Program Files\QZ Tray'))

# 3. Chrome/Edge policy registry keys the installer wrote
Step "[3/10] Removing Chrome/Edge insecure-origin + local-network policies..."
@(
 'HKLM:\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin',
 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin',
 'HKLM:\SOFTWARE\Policies\Google\Chrome\LocalNetworkAccessAllowedForUrls',
 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\LocalNetworkAccessAllowedForUrls'
) | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Recurse -Force -EA SilentlyContinue; Info "removed $_" } }

# 4. Autostart Run keys
Step "[4/10] Removing autostart Run keys..."
@(
 @{ P='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; N='QZ Auto-Allow' },
 @{ P='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; N='MiMonyPOS Printer Watcher' },
 @{ P='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; N='QZ Tray' }
) | ForEach-Object {
    if ((Get-ItemProperty -Path $_.P -Name $_.N -EA SilentlyContinue).($_.N)) {
        Remove-ItemProperty -Path $_.P -Name $_.N -Force -EA SilentlyContinue; Info "removed [$($_.P)] '$($_.N)'"
    }
}

# 5. User QZ state (allowed.dat trust entry, prefs, logs)
Step "[5/10] Removing user QZ state (%APPDATA%\qz)..."
if (Test-Path "$env:APPDATA\qz") { Remove-Item "$env:APPDATA\qz" -Recurse -Force -EA SilentlyContinue; Info ("removed; remaining: " + (Test-Path "$env:APPDATA\qz")) }

# 6. Machine QZ SSL state
Step "[6/10] Removing machine QZ SSL state (C:\ProgramData\qz)..."
if (Test-Path 'C:\ProgramData\qz') { Remove-Item 'C:\ProgramData\qz' -Recurse -Force -EA SilentlyContinue; Info ("removed; remaining: " + (Test-Path 'C:\ProgramData\qz')) }

# 7. QZ Industries certificates from Root stores (certutil = no security-UI prompt)
Step "[7/10] Removing QZ Industries certificates from Root stores..."
$thumbs = @()
foreach ($store in 'Cert:\LocalMachine\Root','Cert:\CurrentUser\Root') {
    Get-ChildItem $store -EA SilentlyContinue | Where-Object { $_.Issuer -match 'QZ Industries' -or $_.Subject -match 'QZ Industries' } | ForEach-Object { $thumbs += $_.Thumbprint }
}
foreach ($t in ($thumbs | Select-Object -Unique)) {
    & certutil -delstore Root $t        | Out-Null
    & certutil -user -delstore Root $t  | Out-Null
    Info "delstore $t"
}
Info ("remaining QZ certs: " + @(Get-ChildItem Cert:\LocalMachine\Root,Cert:\CurrentUser\Root -EA SilentlyContinue | Where-Object { $_.Issuer -match 'QZ Industries' }).Count)

# 8. Receipt Printer (recreated by the project's print agent if it is running - stop it first)
Step "[8/10] Removing 'Receipt Printer'..."
if (Get-Printer -Name 'Receipt Printer' -EA SilentlyContinue) {
    Remove-Printer -Name 'Receipt Printer' -EA SilentlyContinue
    Info ("removed; remaining: " + [bool](Get-Printer -Name 'Receipt Printer' -EA SilentlyContinue))
    if (Get-Printer -Name 'Receipt Printer' -EA SilentlyContinue) { Info "NOTE: it came back - the BaqalaPOS.Api backend is running and re-adds it. Stop that process, then re-run." }
}

# 9. Desktop shortcut
Step "[9/10] Removing desktop shortcut..."
if (Test-Path 'C:\Users\Public\Desktop\MiMony POS.lnk') { Remove-Item 'C:\Users\Public\Desktop\MiMony POS.lnk' -Force -EA SilentlyContinue; Info "removed Public Desktop\MiMony POS.lnk" }

# 10. Project auto-allow / watcher scripts
Step "[10/10] Removing MiMonyPOS helper scripts..."
if (Test-Path "$env:LOCALAPPDATA\MiMonyPOS") { Remove-Item "$env:LOCALAPPDATA\MiMonyPOS" -Recurse -Force -EA SilentlyContinue; Info "removed $env:LOCALAPPDATA\MiMonyPOS" }

Write-Host "`nDone - QZ Tray and all project print artifacts removed." -ForegroundColor Green
Write-Host "Log saved to $log"
if (-not $NoPause) { Read-Host "`nPress Enter to close" }
