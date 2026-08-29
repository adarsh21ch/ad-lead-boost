#!/usr/bin/env bash
# Generate the 500 Marketing API calls Meta requires for the
# Marketing API Access Tier upgrade (needs >=85% success rate).
#
# These are REAL read endpoints AdsPro uses in normal operation —
# ad accounts, account details, datasets, campaigns. Nothing fabricated.
#
# HOW TO GET A TOKEN (do not use the production token from the database):
#   1. https://developers.facebook.com/tools/explorer
#   2. Top right: pick app "AdsPro India"
#   3. Token type: User Token
#   4. Add permissions: ads_management, ads_read, business_management
#   5. Click "Generate Access Token", approve, copy it
#   The token expires in ~1-2 hours. This script takes about 6 minutes.
#
# RUN:
#   export META_TOKEN='paste_token_here'
#   bash generate-marketing-api-calls.sh
#
# The token is read from the environment so it never lands in a file.

set -uo pipefail

TOKEN="${META_TOKEN:-}"
ACCOUNT="${META_AD_ACCOUNT:-act_863995570089897}"
API="https://graph.facebook.com/v21.0"
TARGET="${TARGET_CALLS:-520}"
DELAY="${DELAY:-0.6}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: META_TOKEN is not set."
  echo "Run:  export META_TOKEN='your_token_here'"
  exit 1
fi

endpoints=(
  "me/adaccounts?fields=name,account_id,account_status"
  "${ACCOUNT}?fields=name,account_status,currency,timezone_name"
  "${ACCOUNT}/adspixels?fields=id,name"
  "${ACCOUNT}/campaigns?fields=name,status,objective&limit=5"
)

echo "Target: $TARGET calls against $ACCOUNT"
echo "Pacing: ${DELAY}s between calls"
echo

ok=0; fail=0; i=0; consecutive_fail=0
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

while [ "$i" -lt "$TARGET" ]; do
  ep="${endpoints[$(( i % ${#endpoints[@]} ))]}"
  case "$ep" in *\?*) sep="&";; *) sep="?";; esac

  code=$(curl -s -o "$tmp" -w '%{http_code}' -m 25 \
         "${API}/${ep}${sep}access_token=${TOKEN}")

  if [ "$code" = "200" ]; then
    ok=$((ok+1)); consecutive_fail=0
  else
    fail=$((fail+1)); consecutive_fail=$((consecutive_fail+1))
    if [ "$fail" -le 3 ]; then
      echo "  [HTTP $code] $ep"
      head -c 400 "$tmp"; echo; echo
    fi
    # Likely rate limited or token dead — back off, then bail if it persists
    if [ "$consecutive_fail" -ge 5 ]; then
      echo "  5 failures in a row — backing off 60s"
      sleep 60
    fi
    if [ "$consecutive_fail" -ge 15 ]; then
      echo
      echo "ABORTING: 15 consecutive failures. Token expired or rate limited."
      echo "Generate a fresh token and re-run; completed calls still count."
      break
    fi
  fi

  i=$((i+1))
  if [ $((i % 25)) -eq 0 ]; then
    echo "$i/$TARGET   ok=$ok  fail=$fail"
  fi
  sleep "$DELAY"
done

echo
total=$((ok+fail))
if [ "$total" -gt 0 ]; then
  echo "DONE: $ok succeeded, $fail failed  ($(( ok * 100 / total ))% success rate)"
else
  echo "DONE: no calls made"
fi
echo
echo "Meta needs >=500 calls at >=85% success."
echo "The counter on the Marketing API Access Tier card can take up to 24 hours to update."
