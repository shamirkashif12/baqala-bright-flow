<#
.SYNOPSIS
    Adds the project certificate to an already-installed QZ Tray so the POS connects
    with NO "Action Required" / "Allow" dialog, then kills all Chrome/Edge so the
    browser restarts fresh and reconnects. Fast - no download.

.DESCRIPTION
    The certificate is embedded below, so this script is fully self-contained and can
    be run from anywhere. It writes:
      * override.crt            - the project cert, in the QZ Tray install dir
      * authcert.override=...   - property that makes QZ pre-authorize that cert
                                  (this is what actually silences the dialog)
      * allowed.dat entry       - matching fingerprint in %APPDATA%\qz
    Then restarts QZ Tray and closes all Chrome/Edge windows.

    Auto-elevates (one UAC prompt - you MUST click "Yes"; override.crt lives in
    C:\Program Files, which is admin-only). Safe to re-run.

.USAGE
    Right-click -> "Run with PowerShell", click Yes on the UAC prompt.
    Or from an *Administrator* PowerShell:
        powershell -ExecutionPolicy Bypass -File scripts\qz-trust.ps1
#>
param([switch]$NoPause)
$ErrorActionPreference = 'Continue'

# - The project QZ certificate (served by /api/printer/qz-certificate) -
$certPem = @'
-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAZ8o1nicMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDcwMjE2MzYxMloXDTQ2MDcwMjE2MzYxMlowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCv
Cb2stTiLk75UcG5TpuPet7+QMtWv5/vgDSQakWJ3jWO8F5onqBZCcTboUTp7I4W9
EaBGMxvZIZRSgljt1dgQIQA5/QuLcBs4NCx8Vx0q6G6Y6W8qXPHDdHccv/KUm7u4
6QIQS85PZkKytNSiSVq8Lr8aae9aOfQ+/7RK01ttAmA+7ceej1sLbPCcqPQEJnzw
UiRm/bJB/KagrXBN3UzUxc5T3JEXatH9Tf0q9XJAIe3R6YF6Z/v7ZgsuWDBw6jpY
lHj8bmTruhGNgZJPiwcg1YkYQN1MV6CP8D8wiGmeGIQUQGKHNqJlFdER2Td/8LpN
YGOuGCIBugDp+nCipiiXAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBQztLFDyO5KrSK9K4WhkvXo4To6BzANBgkq
hkiG9w0BAQsFAAOCAQEAaWAlhEK+j1F5QaOu0nDHakVgxf/11RfmLFlsqZ+iYOck
6Fvb+jhV63lQrz+X9G8L8oMJssUW7fwZc962iqevwa+y2PLzkYw9B0o6SjsF0XKL
sU7mLr3dn57gmjH2FFDalKTtbsMiMgYQq/f3zf2RUcM1ozFSBH+Cx/ARhaTWj4bQ
r7jUsydzBxSR0vaDauJcLkPbOldQjNxxeqWu72+aUNp+lGCD9QVbUQeGg2RHiGbe
0W86Sot1LltxOwdbmpXIV+qj2mWsKc9yChZWUgy2m4Tv53YPYGuQpYK4ygHgNLmF
WUihSf7gQn1EOpIaLBd5sqyGf3iLBSbsMcAZjA1mRg==
-----END CERTIFICATE-----
'@

# - Auto-elevate -
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
          ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator rights - CLICK YES on the prompt..." -ForegroundColor Yellow
    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($NoPause) { $argLine += " -NoPause" }
    try { Start-Process powershell -Verb RunAs -ArgumentList $argLine }
    catch { Write-Host "Elevation cancelled - nothing changed." -ForegroundColor Red }
    exit
}
function Say($m,$c='Cyan') { Write-Host $m -ForegroundColor $c }
$certPem = $certPem.Trim()

# Locate the installed QZ Tray
$qzDir = @("$env:ProgramFiles\QZ Tray","${env:ProgramFiles(x86)}\QZ Tray","$env:LOCALAPPDATA\QZ Tray") |
         Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $qzDir) { Say "ERROR: QZ Tray is not installed. Install it first, then re-run." Red; if(-not $NoPause){Read-Host "Enter to close"}; exit 1 }
Say "QZ Tray found at $qzDir"

# 1. Stop QZ Tray so it reloads trust on next start
Say "[1/5] Stopping QZ Tray..."
Get-Process qz-tray,qz-tray-console -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Get-Process javaw,java -EA SilentlyContinue | Where-Object { $_.Path -like '*QZ Tray*' } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep -Seconds 2

# 2. override.crt in the install dir
Say "[2/5] Writing override.crt..."
$certPem | Set-Content -Path (Join-Path $qzDir 'override.crt') -Encoding ASCII
Say ("   override.crt present: " + (Test-Path (Join-Path $qzDir 'override.crt')))

# 3. authcert.override property (the actual dialog-suppressor)
Say "[3/5] Setting authcert.override in qz-tray.properties..."
$propsPath = Join-Path $qzDir 'qz-tray.properties'
$propLines = if (Test-Path $propsPath) { Get-Content $propsPath | Where-Object { $_ -notmatch '^authcert\.override=' } } else { @() }
$propLines += 'authcert.override=override.crt'
$propLines | Set-Content -Path $propsPath -Encoding ASCII
Say "   authcert.override=override.crt written"

# 4. allowed.dat entry (fingerprint auto-computed from the cert)
Say "[4/5] Writing allowed.dat trust entry..."
$c  = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([System.Text.Encoding]::ASCII.GetBytes($certPem))
$fp = $c.GetCertHashString('SHA1').ToLower()
$from = $c.NotBefore.ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
$to   = $c.NotAfter.ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
$allowedDir = Join-Path $env:APPDATA 'qz'
New-Item -ItemType Directory -Force $allowedDir | Out-Null
$allowed = Join-Path $allowedDir 'allowed.dat'
$lines = if (Test-Path $allowed) { Get-Content $allowed | Where-Object { $_ -notmatch $fp } } else { @() }
$lines += "$fp`tQZ Tray Demo Cert`tQZ Industries, LLC`t$from`t$to`ttrue"
$lines | Set-Content -Path $allowed -Encoding ASCII
Say "   fingerprint $fp trusted"

# 5. Kill all Chrome/Edge so they restart fresh and reconnect to QZ
Say "[5/5] Closing all Chrome/Edge windows (they must restart to reconnect)..."
$browsers = Get-Process chrome,msedge -EA SilentlyContinue
if ($browsers) { $browsers | Stop-Process -Force -EA SilentlyContinue; Say "   closed $($browsers.Count) browser process(es)" } else { Say "   no Chrome/Edge running" }

# Restart QZ Tray
$exe = Join-Path $qzDir 'qz-tray.exe'
if (Test-Path $exe) { Start-Process $exe }
Start-Sleep -Seconds 6
$up = [bool](Get-NetTCPConnection -State Listen -LocalPort 8181,8182 -EA SilentlyContinue)

Write-Host "`nDone. Certificate added, browsers closed, QZ Tray listening: $up" -ForegroundColor Green
Write-Host "Reopen the POS in Chrome - it should connect with NO Allow dialog." -ForegroundColor Green
if (-not $NoPause) { Read-Host "`nPress Enter to close" }
