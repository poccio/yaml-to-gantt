#!/bin/bash
#
# screenshot/generate-screenshot.sh — renders the "result" chart half of the
# demo and writes screenshot/screenshot-dark.png.
#
# This half serves the *local* build, so it builds the app first (so the
# rendered chart reflects current src/) and then drives a headless Chromium via
# generate-screenshot.mjs. The popover for $TASK is opened before the shot so
# the description bubble shows in the frame.
#
# Prerequisites (host): pnpm, and the Playwright browser binary:
#   pnpm exec playwright install chromium
#
# Usage:
#   bash assets/gif/screenshot/generate-screenshot.sh [roadmap.yaml]
#
#   roadmap.yaml   optional path to the roadmap to render (default: ../roadmap.yaml)
#   TASK=<name>    env var: task whose popover to open; '' to skip (default: Design)
#
# --display matches the filename the terminal half types, so the toolbar label
# in the screenshot reads "roadmap.yaml" regardless of the input path.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROADMAP="${1:-$HERE/../roadmap.yaml}"
TASK="${TASK:-Design}"
OUT="$HERE/screenshot-dark.png"

if [ ! -f "$ROADMAP" ]; then
  echo "Roadmap not found: $ROADMAP" >&2
  exit 1
fi

# Build the app so server/index.js serves an up-to-date dist/.
( cd "$HERE/../../.." && pnpm build )

node "$HERE/generate-screenshot.mjs" \
  --yaml "$ROADMAP" --out "$OUT" --theme dark \
  --task "$TASK" --display roadmap.yaml

echo "Wrote $OUT"
