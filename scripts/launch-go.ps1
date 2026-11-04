# launch-go.ps1 — post-deploy automation for opening public signups.
#
# Run AFTER the Phase 1B refactor has been deployed (Cloud Run revision live).
# Executes the multi-tenant migration with your admin session cookie, then
# flips JOBSCOUT_SIGNUPS_OPEN=true so public traffic can sign up.
#
# Usage:
#   .\launch-go.ps1                              # prompts for cookie
#   .\launch-go.ps1 -SessionCookie "ey..."       # paste inline
#
# Pre-requisites Cory must do once:
#   1. Sign in to https://jobscout-wnwafxvfia-uw.a.run.app as cory.salisbury@gmail.com
#   2. DevTools > Application > Cookies > copy the `jobscout_session` value
#   3. Paste below when prompted

param(
  [string]$SessionCookie = "",
  [string]$BaseUrl = "https://jobscout-wnwafxvfia-uw.a.run.app",
  [switch]$SkipMigration,
  [switch]$SkipGateFlip
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " JobScout launch-go" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Base URL : $BaseUrl"
Write-Host ""

# 1. Migration
if (-not $SkipMigration) {
  if ([string]::IsNullOrWhiteSpace($SessionCookie)) {
    Write-Host "Paste your jobscout_session cookie value (admin session):"
    $secure = Read-Host "Cookie" -AsSecureString
    $SessionCookie = [System.Net.NetworkCredential]::new("", $secure).Password
  }

  Write-Host "Step 1/3: Running /api/admin/migrate-to-multi-tenant?confirm=YES_MIGRATE ..." -ForegroundColor Yellow
  try {
    $res = Invoke-RestMethod `
      -Uri "$BaseUrl/api/admin/migrate-to-multi-tenant?confirm=YES_MIGRATE" `
      -Method POST `
      -Headers @{ "Cookie" = "jobscout_session=$SessionCookie" } `
      -ErrorAction Stop
    Write-Host "  OK migration response:" -ForegroundColor Green
    $res | ConvertTo-Json -Depth 6
  } catch {
    Write-Host "  FAIL migration: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    exit 1
  }
} else {
  Write-Host "Step 1/3: Migration SKIPPED (-SkipMigration)" -ForegroundColor DarkGray
}

# 2. Verify admin profile still loads (data intact)
Write-Host ""
Write-Host "Step 2/3: Verifying admin /api/profile still returns your data ..." -ForegroundColor Yellow
try {
  $profile = Invoke-RestMethod `
    -Uri "$BaseUrl/api/profile" `
    -Method GET `
    -Headers @{ "Cookie" = "jobscout_session=$SessionCookie" } `
    -ErrorAction Stop
  if ($profile.email -or $profile.full_name) {
    Write-Host "  OK profile loaded: $($profile.full_name) <$($profile.email)>" -ForegroundColor Green
  } else {
    Write-Host "  WARN profile loaded but missing key fields" -ForegroundColor Yellow
    $profile | ConvertTo-Json -Depth 3
  }
} catch {
  Write-Host "  FAIL profile fetch: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 3. Flip JOBSCOUT_SIGNUPS_OPEN
if (-not $SkipGateFlip) {
  Write-Host ""
  Write-Host "Step 3/3: Setting JOBSCOUT_SIGNUPS_OPEN=true on Cloud Run ..." -ForegroundColor Yellow
  gcloud run services update jobscout `
    --region=us-west1 `
    --project=jobscout-app `
    --update-env-vars=JOBSCOUT_SIGNUPS_OPEN=true 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL gate flip (gcloud exit $LASTEXITCODE)" -ForegroundColor Red
    exit 1
  }
  Write-Host "  OK signups open." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Step 3/3: Gate flip SKIPPED (-SkipGateFlip)" -ForegroundColor DarkGray
}

# 4. Final smoke
Write-Host ""
Write-Host "Final smoke: hitting /signup ..." -ForegroundColor Yellow
$code = (Invoke-WebRequest -Uri "$BaseUrl/signup" -Method GET -UseBasicParsing).StatusCode
Write-Host "  /signup returns $code" -ForegroundColor Green

Write-Host ""
Write-Host "Done. JobScout is open for public signups." -ForegroundColor Green
Write-Host "Next: smoke-test a real signup at $BaseUrl/signup with a throwaway email."
Write-Host ""
