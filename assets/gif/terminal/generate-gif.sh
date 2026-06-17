#!/bin/bash
#
# terminal/generate-gif.sh — records the "type the roadmap, run the tool"
# terminal half of the demo and writes terminal/terminal.gif.
#
# Self-contained: needs only Docker (running). The npx command typed in the
# recording runs the *published* yaml-to-gantt package inside the container, so
# this half never touches the local build (that's the screenshot half's job).
#
# terminal.tape is a template; the "# >>> ROADMAP <<<" line is replaced at
# runtime with the typed-out contents of the roadmap. To keep the recording
# watchable, the FIRST task types at the tape's readable speed (it teaches the
# format); every task after it is "pasted" — a short pause, then the block pops
# in at once (Type@0ms) — since by then the viewer already knows the shape.
#
# Recording happens in an isolated staging dir (no pre-existing roadmap.yaml)
# so nano opens an empty buffer — re-running in place never duplicates the file.
#
# Usage:
#   bash assets/gif/terminal/generate-gif.sh [roadmap.yaml]
#
#   roadmap.yaml   optional path to the roadmap to type (default: ../roadmap.yaml)
#   PASTE_SPEED    env var: per-char speed for the pasted tasks (default: 0ms)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROADMAP="${1:-$HERE/../roadmap.yaml}"
TEMPLATE="$HERE/terminal.tape"
PASTE_SPEED="${PASTE_SPEED:-0ms}"

if [ ! -f "$ROADMAP" ]; then
  echo "Roadmap not found: $ROADMAP" >&2
  exit 1
fi

# Stage an isolated working dir (under $HOME so Docker Desktop can mount it,
# and with no roadmap.yaml so nano starts on an empty buffer).
STAGE="$(mktemp -d "$HOME/.y2g-gif-terminal.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

# Build the tape: copy the template, but replace the sentinel line with one
# Type/Enter pair per line of the roadmap. Lines are backtick-delimited so
# inner double quotes (e.g. description: "...") pass through verbatim — VHS has
# no string escaping, so `"..."` with embedded quotes would break parsing.
#
# Paste-aware: the first `- name:` task types at the tape's global speed; from
# the second task on, a short pause precedes an instant Type@PASTE_SPEED block,
# so the remaining tasks read as a single copy-paste rather than slow typing.
while IFS= read -r tline || [ -n "$tline" ]; do
  case "$tline" in
    '# >>> ROADMAP <<<'*)
      task_count=0
      while IFS= read -r yline || [ -n "$yline" ]; do
        # A task starts at a "- name:" list item (any indentation).
        case "${yline#"${yline%%[![:space:]]*}"}" in
          '- name:'*)
            task_count=$((task_count + 1))
            # Beat before the "paste" lands, the first time we hit task 2.
            [ "$task_count" -eq 2 ] && printf 'Sleep 500ms\n'
            ;;
        esac
        if [ "$task_count" -ge 2 ]; then
          printf 'Type@%s `%s`\nEnter\n' "$PASTE_SPEED" "$yline"
        else
          printf 'Type `%s`\nEnter\n' "$yline"
        fi
      done < "$ROADMAP"
      ;;
    *)
      printf '%s\n' "$tline"
      ;;
  esac
done < "$TEMPLATE" > "$STAGE/terminal.tape"

# Record with VHS in Docker. nano + node/npm are installed for the demo, and
# xdg-open is stubbed so the tool's "open browser" step is a no-op.
docker run --rm \
    -v "$STAGE":/vhs \
    --entrypoint="" \
    ghcr.io/charmbracelet/vhs \
    sh -c "apt-get update > /dev/null 2>&1 && apt-get install -y nano nodejs npm > /dev/null 2>&1 && ln -sf /bin/true /usr/local/bin/xdg-open && vhs terminal.tape"

cp "$STAGE/terminal.gif" "$HERE/terminal.gif"
echo "Wrote $HERE/terminal.gif"
