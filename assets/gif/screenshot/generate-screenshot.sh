#!/bin/bash
#
# Renders the "result" chart half of the demo into screenshot-dark.png. Builds
# the app first, because this half serves the local build — unlike the terminal
# half, which runs the published package.
#
# Prerequisites (host): pnpm, and the Playwright browser binary:
#   pnpm exec playwright install chromium
#
# Usage:
#   bash assets/gif/screenshot/generate-screenshot.sh [roadmap.yaml]
#
#   roadmap.yaml   roadmap to render (default: ../roadmap.yaml)
#   TASK=<name>    task whose popover to open; '' to skip (default: Design)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROADMAP="${1:-$HERE/../roadmap.yaml}"
TASK="${TASK:-Design}"
OUT="$HERE/screenshot-dark.png"

if [ ! -f "$ROADMAP" ]; then
  echo "Roadmap not found: $ROADMAP" >&2
  exit 1
fi

( cd "$HERE/../../.." && pnpm build )

node "$HERE/generate-screenshot.mjs" \
  --yaml "$ROADMAP" --out "$OUT" --theme dark \
  --task "$TASK" --display roadmap.yaml

echo "Wrote $OUT"
