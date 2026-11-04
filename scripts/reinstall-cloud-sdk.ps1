# reinstall-cloud-sdk.ps1
# -----------------------------------------------------------------------
# Fixes the Python certifi bundle SSL bug on this machine that prevents
# `gcloud auth print-access-token` and `gcloud builds submit` from
# refreshing OAuth tokens. The bug:
#
#   SSLCertVerificationError: certificate verify failed: unable to get
#   local issuer certificate (_ssl.c:1032)
#
# Cause: the bundled Python's certifi store inside the Cloud SDK install
# can't validate oauth2.googleapis.com's cert chain. The `disable_ssl_
# validation` property only covers some gcloud paths, NOT the OAuth refresh
# path used by builds submit / print-access-token / run deploy.
#
# Fix: reinstall the SDK over itself. The fresh install ships an up-to-date
# certifi bundle. Existing configurations + credentials in %APPDATA%\gcloud
# are PRESERVED by the installer (backed up here too as belt-and-suspenders).
#
# Usage (from a regular PowerShell prompt — does NOT require admin):
#   .\scripts\reinstall-cloud-sdk.ps1
#
# Estimated runtime: 3-5 minutes.
# -----------------------------------------------------------------------

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "JobScout - Cloud SDK SSL Fix" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# 1. Probe current install -----------------------------------------------
$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloud) {
    Write-Host "[1/6] Found existing gcloud at:" -ForegroundColor Yellow
    Write-Host "      $($gcloud.Source)"
    & gcloud version 2>&1 | Select-Object -First 5 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
} else {
    Write-Host "[1/6] No existing gcloud in PATH (clean install path)." -ForegroundColor Cyan
}
Write-Host ""

# 2. Back up config directory --------------------------------------------
$configDir = Join-Path $env:APPDATA "gcloud"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $env:TEMP "gcloud-backup-$timestamp"
if (Test-Path $configDir) {
    Write-Host "[2/6] Backing up your gcloud config (auth tokens, configurations)..." -ForegroundColor Yellow
    Copy-Item -Path $configDir -Destination $backupDir -Recurse -Force
    Write-Host "      Backup saved to: $backupDir" -ForegroundColor DarkGray
} else {
    Write-Host "[2/6] No existing gcloud config dir to back up." -ForegroundColor DarkGray
}
Write-Host ""

# 3. Download fresh installer --------------------------------------------
$installerUrl = "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe"
$installerPath = Join-Path $env:TEMP "GoogleCloudSDKInstaller.exe"
Write-Host "[3/6] Downloading latest Cloud SDK installer..." -ForegroundColor Yellow
Write-Host "      $installerUrl" -ForegroundColor DarkGray

# Use TLS 1.2 explicitly (older PS defaults to 1.0)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
} catch {
    Write-Host "      Download failed: $_" -ForegroundColor Red
    Write-Host "      Try manually from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}
$size = [Math]::Round((Get-Item $installerPath).Length / 1MB, 1)
Write-Host "      Downloaded ($size MB)." -ForegroundColor DarkGray
Write-Host ""

# 4. Run installer -------------------------------------------------------
Write-Host "[4/6] Launching the installer." -ForegroundColor Yellow
Write-Host "      An installer window will open." -ForegroundColor DarkGray
Write-Host "      Accept defaults. When asked, allow it to OVERWRITE the existing install." -ForegroundColor DarkGray
Write-Host "      Your auth tokens and configurations are preserved." -ForegroundColor DarkGray
Write-Host ""
Write-Host "      Press ENTER to continue..." -ForegroundColor Cyan -NoNewline
Read-Host | Out-Null

Start-Process -FilePath $installerPath -Wait
Write-Host "      Installer exited." -ForegroundColor DarkGray
Write-Host ""

# 5. Verify gcloud works -------------------------------------------------
Write-Host "[5/6] Verifying gcloud + OAuth refresh..." -ForegroundColor Yellow

# Re-resolve gcloud in case PATH was updated
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
    Write-Host "      gcloud not in PATH yet." -ForegroundColor Red
    Write-Host "      Close this terminal, open a NEW one, and re-run the verify step:" -ForegroundColor Yellow
    Write-Host "        gcloud version" -ForegroundColor White
    Write-Host "        gcloud auth print-access-token" -ForegroundColor White
    exit 0
}

Write-Host "      Found: $($gcloud.Source)" -ForegroundColor DarkGray
& gcloud version 2>&1 | Select-Object -First 3 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }

# Test the exact path that was broken
Write-Host ""
Write-Host "[6/6] Testing OAuth token refresh (this was the broken path)..." -ForegroundColor Yellow
$tokenOutput = & gcloud auth print-access-token 2>&1
$tokenExit = $LASTEXITCODE

if ($tokenExit -eq 0 -and $tokenOutput -notmatch "ERROR") {
    Write-Host "      OAuth refresh works. The fix is in." -ForegroundColor Green
    Write-Host ""
    Write-Host "Ready to deploy. From the JobScout repo:" -ForegroundColor Green
    Write-Host "  gcloud builds submit --config cloudbuild.yaml --project=jobscout-app \" -ForegroundColor White
    Write-Host "    --substitutions=_VAPID_PUB=...,_FB_API_KEY=...,_FB_AUTH_DOMAIN=...,_FB_PROJECT_ID=...,_FB_APP_ID=... ." -ForegroundColor White
} else {
    Write-Host "      Still failing:" -ForegroundColor Red
    Write-Host "      $tokenOutput" -ForegroundColor DarkRed
    Write-Host ""
    Write-Host "      One more step usually fixes it - refresh login interactively:" -ForegroundColor Yellow
    Write-Host "        gcloud auth login" -ForegroundColor White
    Write-Host ""
    Write-Host "      If it STILL fails, the certifi bundle may be in a different location." -ForegroundColor Yellow
    Write-Host "      Open a new PowerShell window and re-run this script - %APPDATA% PATH refresh" -ForegroundColor Yellow
    Write-Host "      sometimes needs a fresh shell to take effect." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Backup of pre-reinstall config is at:" -ForegroundColor DarkGray
Write-Host "  $backupDir" -ForegroundColor DarkGray
Write-Host "Safe to delete after a few successful deploys." -ForegroundColor DarkGray
Write-Host ""
