#!/usr/bin/env bash
# OTODIAL — atomic frontend deploy (run on VPS as deploy user or root).
# Usage: sudo bash deploy/deploy-frontend-atomic.sh
# Env:
#   OTODIAL_ROOT   default /var/www/oto-dial
#   OTODIAL_URL    default https://otodial.com  (used for post-deploy curl check)

set -euo pipefail

OTODIAL_ROOT="${OTODIAL_ROOT:-/var/www/oto-dial}"
OTODIAL_URL="${OTODIAL_URL:-https://otodial.com}"
FE="${OTODIAL_ROOT}/frontend"
STAMP="$(date +%s)"
NEXT="dist.next.${STAMP}"
PREV="dist.prev.${STAMP}"

if [[ ! -d "$FE" ]]; then
  echo "ERROR: frontend dir missing: $FE" >&2
  exit 1
fi

cd "$OTODIAL_ROOT"

echo "[deploy] git pull (repo root)"
git pull origin main || true

cd "$FE"

echo "[deploy] npm ci"
npm ci

echo "[deploy] clean staging: $NEXT"
export OTODIAL_DIST_DIR="$NEXT"
node scripts/clean-dist.mjs

echo "[deploy] vite build -> $NEXT"
npx vite build --outDir "$NEXT"

echo "[deploy] verify assets + forbidden strings"
OTODIAL_DIST_DIR="$NEXT" node scripts/verify-dist-assets.mjs

if [[ -d dist ]]; then
  echo "[deploy] rotate: dist -> $PREV"
  mv dist "$PREV"
else
  echo "[deploy] no existing dist (first deploy)"
fi

mv "$NEXT" dist

echo "[deploy] previous dist kept at: ${FE}/${PREV}"
echo "[deploy] rollback hint: cd \"${FE}\" && sudo rm -rf dist && sudo mv \"${PREV}\" dist && sudo nginx -t && sudo systemctl reload nginx"

echo "[deploy] reload nginx"
if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || service nginx reload || true
fi

echo "[deploy] remote HTML sanity (must NOT contain legacy boot strings)"
HTML="$(curl -fsSL "$OTODIAL_URL/")"
if echo "$HTML" | grep -E 'still starting|hard refresh|otodial-boot-splash|Ctrl\+Shift\+R' >/dev/null; then
  echo "ERROR: production HTML still contains legacy strings. Wrong URL, cache layer, or wrong server." >&2
  echo "$HTML" | head -c 2000 >&2
  exit 1
fi

echo "[deploy] OK — $OTODIAL_URL served clean shell HTML"
