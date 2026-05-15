#!/usr/bin/env bash
# Roll back frontend to previous release symlink target.
# Usage: sudo bash deploy/rollback-frontend.sh [release_TIMESTAMP]

set -euo pipefail

OTODIAL_ROOT="${OTODIAL_ROOT:-/var/www/oto-dial}"
FE="${OTODIAL_ROOT}/frontend"
RELEASES="${FE}/dist_releases"
CURRENT="${RELEASES}/current"
DIST_LINK="${FE}/dist"

if [[ ! -d "$RELEASES" ]]; then
  echo "ERROR: no dist_releases at $RELEASES" >&2
  exit 1
fi

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  TARGET="$(ls -1dt "${RELEASES}"/release_* 2>/dev/null | sed -n '2p' | xargs basename 2>/dev/null || true)"
fi

if [[ -z "$TARGET" || ! -d "${RELEASES}/${TARGET}" ]]; then
  echo "Available releases:"
  ls -1dt "${RELEASES}"/release_* 2>/dev/null || true
  echo "Usage: $0 release_<timestamp>" >&2
  exit 1
fi

ln -sfn "$TARGET" "$CURRENT"
ln -sfn dist_releases/current "$DIST_LINK"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || service nginx reload || true
fi

echo "Rolled back to ${RELEASES}/${TARGET}"
