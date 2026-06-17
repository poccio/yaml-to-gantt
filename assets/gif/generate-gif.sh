#!/bin/bash
#
# generate-gif.sh — end-to-end demo GIF builder (orchestrator).
#
# Produces an up-to-date assets/gif/demo.gif from assets/gif/roadmap.yaml by
# delegating each half to its own script and crossfading the results:
#   1. terminal/generate-gif.sh      -> terminal/terminal.gif
#   2. screenshot/generate-screenshot.sh -> screenshot/screenshot-dark.png
#   3. crossfade terminal -> screenshot into demo.gif
#
# roadmap.yaml is the single source of truth for both halves — the terminal
# types it and the screenshot renders it. Each sub-script is self-contained and
# can be run on its own while iterating (e.g. tweak typing speed by re-running
# terminal/generate-gif.sh and opening terminal/terminal.gif).
#
# Prerequisites (host): docker (running), ffmpeg/ffprobe, bc, pnpm, and the
# Playwright browser binary for the screenshot step:
#   pnpm exec playwright install chromium
#
# Usage:
#   bash assets/gif/generate-gif.sh [roadmap.yaml]
#
#   roadmap.yaml   optional path to the roadmap to render
#                  (default: assets/gif/roadmap.yaml)
#   TASK=<name>    env var: task whose popover to open in the screenshot,
#                  '' to skip (default: Design)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROADMAP="${1:-$HERE/roadmap.yaml}"
TASK="${TASK:-Design}"

TERMINAL_GIF="$HERE/terminal/terminal.gif"
SCREENSHOT="$HERE/screenshot/screenshot-dark.png"

if [ ! -f "$ROADMAP" ]; then
  echo "Roadmap not found: $ROADMAP" >&2
  exit 1
fi

FADE=0.5
BROWSER_DURATION=10

# 1) Record the terminal half (types the roadmap, runs the tool).
bash "$HERE/terminal/generate-gif.sh" "$ROADMAP"

# 2) Render the screenshot half (builds the app, screenshots the chart).
TASK="$TASK" bash "$HERE/screenshot/generate-screenshot.sh" "$ROADMAP"

# 3) Crossfade terminal recording into the screenshot -> demo.gif.
STAGE="$(mktemp -d "$HOME/.y2g-gif.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

ffmpeg -y -i "$TERMINAL_GIF" -vf "fps=24,scale=1280:720" -c:v libx264 -pix_fmt yuv420p "$STAGE/terminal.mp4"
ffmpeg -y -loop 1 -i "$SCREENSHOT" -vf "fps=24,scale=1280:720" -t $BROWSER_DURATION -c:v libx264 -pix_fmt yuv420p "$STAGE/screenshot-dark.mp4"

TERMINAL_DURATION=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$STAGE/terminal.mp4")
OFFSET=$(echo "$TERMINAL_DURATION - $FADE" | bc)

ffmpeg -y -i "$STAGE/terminal.mp4" -i "$STAGE/screenshot-dark.mp4" \
    -filter_complex "
        [0:v][1:v]xfade=transition=fade:duration=${FADE}:offset=${OFFSET}[xf];
        [xf]split[s0][s1];
        [s0]palettegen=stats_mode=full[p];
        [s1][p]paletteuse=dither=bayer[out]
    " \
    -map "[out]" -loop -1 "$HERE/demo.gif"

