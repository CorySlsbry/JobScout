#!/usr/bin/env bash
# Smoke test for the deployed JobScout service. Hits every critical
# endpoint with no-auth/wrong-auth requests and asserts they fail closed
# (401/402/403) rather than 500ing or — worse — returning data they
# shouldn't. Catches regressions in tier gates, auth checks, and the
# CORS preflight.
#
# Usage:
#   ./scripts/smoke-test.sh           (against prod)
#   ./scripts/smoke-test.sh staging   (or any base URL)

set -uo pipefail   # no -e: we WANT to continue on non-2xx (we're testing those)

BASE_URL="${1:-https://jobscout-wnwafxvfia-uw.a.run.app}"
PASS=0
FAIL=0
FAILED_NAMES=()

# colorless plain output — easier to diff
log_pass() { echo "  PASS  $1"; PASS=$((PASS+1)); }
log_fail() { echo "  FAIL  $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); }

# Hit a URL and check the status code matches. Reads JSON body too for
# the cases where we want to assert on `error` strings.
assert_status() {
  local name="$1" method="$2" path="$3" expected="$4" extra_args="${5:-}"
  local code
  if [ -n "$extra_args" ]; then
    code=$(curl -k -sS -o /tmp/jbsk-body.json -w "%{http_code}" -X "$method" "$BASE_URL$path" $extra_args)
  else
    code=$(curl -k -sS -o /tmp/jbsk-body.json -w "%{http_code}" -X "$method" "$BASE_URL$path")
  fi
  if [ "$code" = "$expected" ]; then
    log_pass "$name"
  else
    log_fail "$name" "$expected" "$code"
  fi
}

echo "Smoke test: $BASE_URL"
echo "================================"
echo ""
echo "Public surface — should be reachable without auth"
assert_status "landing /            renders 200"  GET  /            200
assert_status "/pricing              renders 200" GET  /pricing     200
assert_status "/terms                renders 200" GET  /terms       200
assert_status "/privacy              renders 200" GET  /privacy     200
assert_status "/signin               renders 200" GET  /signin      200
assert_status "/signup               renders 200" GET  /signup      200
assert_status "/manifest.webmanifest 200"          GET  /manifest.webmanifest 200

echo ""
echo "Protected pages — should redirect to /signin without session"
# /feed is protected — middleware should 307 to /signin
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/feed" --max-redirs 0)
if [ "$code" = "307" ] || [ "$code" = "308" ] || [ "$code" = "302" ]; then
  log_pass "/feed redirects unauthenticated user"
else
  log_fail "/feed redirect" "30x" "$code"
fi
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/settings" --max-redirs 0)
if [ "$code" = "307" ] || [ "$code" = "308" ] || [ "$code" = "302" ]; then
  log_pass "/settings redirects unauthenticated user"
else
  log_fail "/settings redirect" "30x" "$code"
fi

echo ""
echo "Extension-reachable API endpoints (in PUBLIC_PATHS) — should 401 JSON"
# These have their own auth gate (bearer or session) and bypass middleware.
assert_status "POST /api/upwork/score           401" POST /api/upwork/score             401  '-H content-type:application/json -d {}'
assert_status "POST /api/upwork/draft-bid       401" POST /api/upwork/draft-bid         401  '-H content-type:application/json -d {}'
assert_status "POST /api/upwork/draft-application 401" POST /api/upwork/draft-application 401 '-H content-type:application/json -d {}'

echo ""
echo "Session-required API endpoints — middleware-redirect (30x) OR 401"
# These are session-only routes; middleware redirects unauth POSTers to /signin.
# 307/308/302 (redirect) and 401 (JSON deny) are both valid 'denied' responses.
assert_deny_session() {
  local name="$1" path="$2"
  local code
  code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X POST "$path" -H "content-type:application/json" -d "{}" --max-redirs 0)
  if [ "$code" = "307" ] || [ "$code" = "308" ] || [ "$code" = "302" ] || [ "$code" = "401" ]; then
    log_pass "$name"
  else
    log_fail "$name" "30x/401" "$code"
  fi
}
assert_deny_session "POST /api/negotiate denies unauth"               "$BASE_URL/api/negotiate"
assert_deny_session "POST /api/comp/lookup denies unauth"             "$BASE_URL/api/comp/lookup"
assert_deny_session "POST /api/assessments denies unauth"             "$BASE_URL/api/assessments"
assert_deny_session "POST /api/assessments/extract denies unauth"     "$BASE_URL/api/assessments/extract"
assert_deny_session "POST /api/tailor-resume denies unauth"           "$BASE_URL/api/tailor-resume"
assert_deny_session "POST /api/generate-cover-letter denies unauth"   "$BASE_URL/api/generate-cover-letter"
assert_deny_session "POST /api/stripe/checkout denies unauth"         "$BASE_URL/api/stripe/checkout"
assert_deny_session "POST /api/stripe/portal denies unauth"           "$BASE_URL/api/stripe/portal"
assert_deny_session "POST /api/profile/extension-token denies unauth" "$BASE_URL/api/profile/extension-token"

echo ""
echo "CORS preflight on extension routes — should 204"
assert_status "OPTIONS /api/upwork/score 204"        OPTIONS /api/upwork/score             204
assert_status "OPTIONS /api/upwork/draft-bid 204"    OPTIONS /api/upwork/draft-bid         204
assert_status "OPTIONS /api/upwork/draft-application 204" OPTIONS /api/upwork/draft-application 204

echo ""
echo "Cron endpoints — should reject without token"
# These are GET endpoints and 401 without token
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/cron/sync")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  log_pass "/api/cron/sync rejects without token"
else
  log_fail "/api/cron/sync rejects without token" "401/403" "$code"
fi
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/cron/upwork-inbox")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  log_pass "/api/cron/upwork-inbox rejects without token"
else
  log_fail "/api/cron/upwork-inbox rejects without token" "401/403" "$code"
fi
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/cron/email-workflows")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  log_pass "/api/cron/email-workflows rejects without token"
else
  log_fail "/api/cron/email-workflows rejects without token" "401/403" "$code"
fi
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/cron/heal")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  log_pass "/api/cron/heal rejects without token"
else
  log_fail "/api/cron/heal rejects without token" "401/403" "$code"
fi
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/cron/autopilot")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  log_pass "/api/cron/autopilot rejects without token"
else
  log_fail "/api/cron/autopilot rejects without token" "401/403" "$code"
fi
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/cron/upwork-rss")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  log_pass "/api/cron/upwork-rss rejects without token"
else
  log_fail "/api/cron/upwork-rss rejects without token" "401/403" "$code"
fi

echo ""
echo "Error monitor — /api/errors is anon-friendly (expect 200)"
code=$(curl -k -sS -o /tmp/jbsk-body.json -w "%{http_code}" -X POST "$BASE_URL/api/errors" -H "content-type:application/json" -d '{"name":"TestError","message":"smoke test","stack":"at test","path":"/smoke","source":"client"}')
if [ "$code" = "200" ]; then
  log_pass "POST /api/errors accepts anon client report"
else
  log_fail "POST /api/errors accepts anon client report" "200" "$code"
fi

echo ""
echo "Bulk-hide — middleware-redirect (30x) OR 401 without session"
assert_deny_session "POST /api/jobs/hide-bulk denies unauth" "$BASE_URL/api/jobs/hide-bulk"

echo ""
echo "Auto-Pilot + Upwork pages — redirect to /signin without session"
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/autopilot" --max-redirs 0)
if [ "$code" = "307" ] || [ "$code" = "308" ] || [ "$code" = "302" ]; then
  log_pass "/autopilot redirects unauthenticated user"
else
  log_fail "/autopilot redirect" "30x" "$code"
fi

echo ""
echo "Trust + compliance pages — public, no auth required"
assert_status "/security             200"   GET /security              200
assert_status "/status               200"   GET /status                200
assert_status "/robots.txt           200"   GET /robots.txt            200
assert_status "/sitemap.xml          200"   GET /sitemap.xml           200

echo ""
echo "GDPR endpoints — middleware-redirect (30x) OR 401 without session"
assert_deny_session "GET  /api/account/export denies unauth"   "$BASE_URL/api/account/export"
assert_deny_session "POST /api/account/delete denies unauth"   "$BASE_URL/api/account/delete"

echo ""
echo "Per-user hide/restore — middleware-redirect (30x) OR 401 without session"
assert_deny_session "POST /api/jobs/SMOKETEST/hide denies unauth"    "$BASE_URL/api/jobs/SMOKETEST/hide"
assert_deny_session "POST /api/jobs/SMOKETEST/restore denies unauth" "$BASE_URL/api/jobs/SMOKETEST/restore"

echo ""
echo "Stripe webhook — 400 (missing signature, configured) OR 503 (Stripe not yet configured)"
code=$(curl -k -sS -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/stripe/webhook" -H "content-type:application/json" -d "{}" --max-redirs 0)
if [ "$code" = "400" ] || [ "$code" = "503" ]; then
  log_pass "/api/stripe/webhook rejects unsigned ($code)"
else
  log_fail "/api/stripe/webhook rejects unsigned" "400/503" "$code"
fi

echo ""
echo "================================"
echo "Summary: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  printf '  - %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
echo "All green."
