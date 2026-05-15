#!/usr/bin/env bash
# Run from laptop or CI: bash deploy/verify-remote-frontend.sh [https://otodial.com]
# Exits non-zero if legacy boot strings appear in live HTML.

set -euo pipefail
URL="${1:-https://otodial.com}"
HTML="$(curl -fsSL "$URL/")"
if echo "$HTML" | grep -E 'still starting|hard refresh|otodial-boot-splash|Ctrl\+Shift\+R' >/dev/null; then
  echo "FAIL: $URL still serves legacy HTML"
  exit 1
fi
echo "OK: $URL has no legacy boot strings in HTML"
