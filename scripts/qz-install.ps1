<#
.SYNOPSIS
    Fresh download + silent install of QZ Tray with pre-configured certificate trust,
    so the POS connects with ZERO "Action Required" / "Untrusted website" dialogs.

.DESCRIPTION
    Mirrors the trust mechanism the project's one-click installer uses:
      * override.crt written into the QZ Tray install dir
      * authcert.override=override.crt added to qz-tray.properties  (what actually
        suppresses the dialog - allowed.dat alone does not)
      * allowed.dat entry for the cert fingerprint (belt-and-braces)
    Uses the project's own signing cert at ..\api\qz-certs\certificate.pem, which is
    the cert the POS server signs QZ requests with.

    Auto-elevates (one UAC prompt). Safe to re-run.

.USAGE
    Right-click -> "Run with PowerShell", approve UAC.
    Or:  powershell -ExecutionPolicy Bypass -File scripts\qz-install.ps1
#>
param([switch]$NoPause)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# - Auto-elevate -
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
          ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator rights (approve the UAC prompt)..." -ForegroundColor Yellow
    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($NoPause) { $argLine += " -NoPause" }
    try { Start-Process powershell -Verb RunAs -ArgumentList $argLine }
    catch { Write-Host "Elevation cancelled - nothing was changed." -ForegroundColor Red }
    exit
}

function Say($m,$c='Cyan') { Write-Host $m -ForegroundColor $c }

# The project QZ certificate (served by /api/printer/qz-certificate), embedded so this
# script is self-contained and can be run from anywhere.
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
'@.Trim()

# 1. Stop any running QZ Tray
Say "[1/6] Stopping any running QZ Tray..."
Get-Process qz-tray,qz-tray-console -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Get-Process javaw,java -EA SilentlyContinue | Where-Object { $_.Path -like '*QZ Tray*' } | Stop-Process -Force -EA SilentlyContinue
Start-Sleep -Seconds 2

# 2. Download QZ Tray (latest x86_64, fallback to pinned 2.2.6)
Say "[2/6] Downloading QZ Tray..."
$setup = Join-Path $env:TEMP 'qz-tray-setup.exe'
try {
    $rel = Invoke-RestMethod 'https://api.github.com/repos/qzind/tray/releases/latest' -Headers @{ 'User-Agent'='qz-install' }
    $asset = $rel.assets | Where-Object { $_.name -like '*.exe' -and $_.name -notlike '*arm64*' } | Select-Object -First 1
    $url = if ($asset) { $asset.browser_download_url } else { 'https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.exe' }
} catch { $url = 'https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.exe' }
Say "   $url"
Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing

# 3. Silent install, then find the install dir
Say "[3/6] Installing QZ Tray silently..."
Start-Process -FilePath $setup -ArgumentList '/S' -Wait
$qzDir = $null
for ($i=0; $i -lt 25 -and -not $qzDir; $i++) {
    $qzDir = @("$env:ProgramFiles\QZ Tray", "${env:ProgramFiles(x86)}\QZ Tray", "$env:LOCALAPPDATA\QZ Tray") |
             Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $qzDir) { Start-Sleep -Seconds 1 }
}
Remove-Item $setup -Force -EA SilentlyContinue
if (-not $qzDir) { Say "ERROR: QZ Tray install dir not found - install may have failed." Red; if(-not $NoPause){Read-Host "Enter to close"}; exit 1 }
Say "   installed at $qzDir"

# 4. override.crt + authcert.override  (this is what silences the dialog)
Say "[4/6] Writing override.crt + authcert.override..."
$certPem | Set-Content -Path (Join-Path $qzDir 'override.crt') -Encoding ASCII
$propsPath = Join-Path $qzDir 'qz-tray.properties'
$propLines = if (Test-Path $propsPath) { Get-Content $propsPath | Where-Object { $_ -notmatch '^authcert\.override=' } } else { @() }
$propLines += 'authcert.override=override.crt'
$propLines | Set-Content -Path $propsPath -Encoding ASCII
Say "   override.crt + property set"

# 5. allowed.dat entry (fingerprint auto-computed from the cert)
Say "[5/6] Writing allowed.dat trust entry..."
$c  = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([System.Text.Encoding]::ASCII.GetBytes($certPem))
$fp = $c.GetCertHashString('SHA1').ToLower()
$from = $c.NotBefore.ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
$to   = $c.NotAfter.ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
$allowedDir = Join-Path $env:APPDATA 'qz'
New-Item -ItemType Directory -Force $allowedDir | Out-Null
$entry = "$fp`tQZ Tray Demo Cert`tQZ Industries, LLC`t$from`t$to`ttrue"
$allowed = Join-Path $allowedDir 'allowed.dat'
$lines = if (Test-Path $allowed) { Get-Content $allowed | Where-Object { $_ -notmatch $fp } } else { @() }
$lines += $entry
$lines | Set-Content -Path $allowed -Encoding ASCII
Say "   fingerprint $fp trusted"

# 6. Kill all Chrome/Edge so they restart fresh (pick up policy + reconnect to QZ)
Say "[6/7] Closing all Chrome/Edge windows..."
$browsers = Get-Process chrome,msedge -EA SilentlyContinue
if ($browsers) { $browsers | Stop-Process -Force -EA SilentlyContinue; Say "   closed $($browsers.Count) browser process(es)" } else { Say "   no Chrome/Edge running" }

# 7. Start QZ Tray
Say "[7/7] Starting QZ Tray..."
$exe = Join-Path $qzDir 'qz-tray.exe'
if (Test-Path $exe) { Start-Process $exe }
Start-Sleep -Seconds 6
$up = [bool](Get-NetTCPConnection -State Listen -LocalPort 8181,8182 -EA SilentlyContinue)
Say ("   QZ Tray websocket listening: " + $up) $(if($up){'Green'}else{'Yellow'})

Write-Host "`nDone. QZ Tray is installed and pre-trusted - the POS should connect with NO dialog." -ForegroundColor Green
if (-not $NoPause) { Read-Host "`nPress Enter to close" }
