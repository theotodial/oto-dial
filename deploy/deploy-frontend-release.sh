#!/usr/bin/env bash
# OTODIAL — symlink-based atomic frontend release (nginx always sees a valid dist).
# Usage: sudo bash deploy/deploy-frontend-release.sh
# Env: OTODIAL_ROOT, OTODIAL_URL, KEEP_RELEASES (default 3)

set -euo pipefail

OTODIAL_ROOT="${OTODIAL_ROOT:-/var/www/oto-dial}"
OTODIAL_URL="${OTODIAL_URL:-https://otodial.com}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
FE="${OTODIAL_ROOT}/frontend"
STAMP="$(date +%s)"
RELEASE_NAME="release_${STAMP}"
RELEASE_DIR="${FE}/dist_releases/${RELEASE_NAME}"
DIST_LINK="${FE}/dist"
CURRENT_LINK="${FE}/dist_releases/current"

if [[ ! -d "$FE" ]]; then
  echo "ERROR: missing $FE" >&2
  exit 1
fi

cd "$OTODIAL_ROOT"
echo "[release] git pull"
git pull origin main || true

cd "$FE"
mkdir -p dist_releases

echo "[release] npm ci"
npm ci

echo "[release] build -> $RELEASE_DIR"
export OTODIAL_DIST_DIR="dist_releases/${RELEASE_NAME}"
node scripts/clean-dist.mjs
npx vite build --outDir "$OTODIAL_DIST_DIR"

echo "[release] verify"
OTODIAL_DIST_DIR="$OTODIAL_DIST_DIR" node scripts/verify-dist-assets.mjs

if [[ ! -f "${RELEASE_DIR}/index.html" ]]; then
  echo "ERROR: index.html missing in $RELEASE_DIR" >&2
  exit 1
fi

echo "[release] atomic symlink swap (never rm active dist first)"
ln -sfn "${RELEASE_NAME}" "$CURRENT_LINK"
ln -sfn "dist_releases/current" "$DIST_LINK"
# Resolve to absolute path for nginx (optional sanity)
readlink -f "$DIST_LINK" || true

echo "[release] prune old releases (keep $KEEP_RELEASES)"
cd dist_releases
ls -1dt release_* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || service nginx reload || true
fi

HTML="$(curl -fsSL "$OTODIAL_URL/")"
if echo "$HTML" | grep -E 'still starting|hard refresh|otodial-boot-splash|Ctrl\+Shift\+R' >/dev/null; then
  echo "ERROR: legacy boot strings in live HTML" >&2
  exit 1
fi

echo "[release] OK $OTODIAL_URL -> $RELEASE_DIR"
echo "[release] rollback: sudo bash deploy/rollback-frontend.sh"
