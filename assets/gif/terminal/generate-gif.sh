#!/bin/bash
#
# Records the "type the roadmap, run the tool" half of the demo into
# terminal.gif. Needs only Docker. The npx command typed in the recording runs
# the *published* package inside the container, so this half never sees the local
# build — that is the screenshot half's job.
#
# terminal.tape is a template whose "# >>> ROADMAP <<<" line is replaced at
# runtime with the typed-out roadmap. Only the first task types at readable
# speed, to teach the format; later tasks are "pasted" instantly, since by then
# the viewer knows the shape and slow typing is just dead screen time.
#
# Usage:
#   bash assets/gif/terminal/generate-gif.sh [roadmap.yaml]
#
#   roadmap.yaml   roadmap to type (default: ../roadmap.yaml)
#   PASTE_SPEED    per-char speed for the pasted tasks (default: 0ms)

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

# Replace the sentinel line with one Type/Enter pair per roadmap line. Lines are
# backtick-delimited because VHS has no string escaping, so a line containing
# double quotes (description: "...") would break parsing if quoted.
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
