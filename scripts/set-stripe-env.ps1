# set-stripe-env.ps1
# -----------------------------------------------------------------------
# Sets the 4 Stripe env vars on the Cloud Run jobscout service. Run once
# after creating Pro + Boost Prices and the webhook endpoint in Stripe.
#
# Prompts for each value interactively so secrets never live in shell
# history. Uses `--update-env-vars` (additive) so the other vars on the
# service (ANTHROPIC_API_KEY, GMAIL_OAUTH_*, etc.) aren't wiped.
#
# Usage:
#   .\scripts\set-stripe-env.ps1
# -----------------------------------------------------------------------

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "JobScout - Stripe env-var setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You should have already done these things in the Stripe Dashboard:" -ForegroundColor Yellow
Write-Host "  1. Created two recurring Prices:"
Write-Host "     - JobScout Pro    $19.00 USD monthly"
Write-Host "     - JobScout Boost  $29.00 USD monthly"
Write-Host "  2. Created the webhook endpoint:"
Write-Host "     https://jobscout-wnwafxvfia-uw.a.run.app/api/stripe/webhook"
Write-Host "     subscribed to: checkout.session.completed,"
Write-Host "                    customer.subscription.created,"
Write-Host "                    customer.subscription.updated,"
Write-Host "                    customer.subscription.deleted"
Write-Host ""

# Prompt for each value. Read-Host returns plain strings; SecureString isn't
# needed since the values get passed straight to gcloud anyway.
$secretKey = Read-Host "STRIPE_SECRET_KEY (sk_test_... or sk_live_...)"
if (-not $secretKey.StartsWith("sk_")) {
    Write-Host "ERROR: secret key must start with sk_test_ or sk_live_" -ForegroundColor Red
    exit 1
}

$webhookSecret = Read-Host "STRIPE_WEBHOOK_SECRET (whsec_...)"
if (-not $webhookSecret.StartsWith("whsec_")) {
    Write-Host "ERROR: webhook secret must start with whsec_" -ForegroundColor Red
    exit 1
}

$priceProId = Read-Host "STRIPE_PRICE_PRO ($19/mo recurring) (price_...)"
if (-not $priceProId.StartsWith("price_")) {
    Write-Host "ERROR: Pro price id must start with price_" -ForegroundColor Red
    exit 1
}

$priceBoostId = Read-Host "STRIPE_PRICE_BOOST ($29/mo recurring) (price_...)"
if (-not $priceBoostId.StartsWith("price_")) {
    Write-Host "ERROR: Boost price id must start with price_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Applying to Cloud Run service jobscout (us-west1)..." -ForegroundColor Cyan

$envArg = "STRIPE_SECRET_KEY=$secretKey,STRIPE_WEBHOOK_SECRET=$webhookSecret,STRIPE_PRICE_PRO=$priceProId,STRIPE_PRICE_BOOST=$priceBoostId"

& gcloud run services update jobscout `
    --region=us-west1 `
    --project=jobscout-app `
    --update-env-vars=$envArg

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Cloud Run update failed. If the gcloud SSL bug is back, run:" -ForegroundColor Red
    Write-Host "  .\scripts\reinstall-cloud-sdk.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Stripe env vars applied. Test the upgrade flow:" -ForegroundColor Green
Write-Host "  1. Sign into JobScout (admin override skips checkout, so" -ForegroundColor White
Write-Host "     test with a non-admin account OR temporarily disable" -ForegroundColor White
Write-Host "     the admin override in lib/users.ts)." -ForegroundColor White
Write-Host "  2. Settings -> Billing -> Upgrade to Pro." -ForegroundColor White
Write-Host "  3. Confirm the webhook fires (Stripe Dashboard -> Webhooks -> Events)." -ForegroundColor White
Write-Host "  4. Confirm the user record's plan flips to 'pro' in Firestore." -ForegroundColor White
Write-Host ""
