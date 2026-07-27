# yaml-to-gantt

A Vite + Preact app that renders an interactive Gantt chart from a YAML roadmap file. Preact is aliased as React via `vite.config.js`.

## Input format

```yaml
projects:
  Product Launch:
    - name: Market research
      start: 2025-07-01   # YYYY-MM-DD
      end: 2025-07-11
      description: "Interview <b>10 target customers</b> and summarize findings"   # optional; rendered as raw HTML
      assignees:
        - Alice
    - name: Landing page
      start: 2025-07-07
      end: 2025-07-24
      originallyPlannedStart: 2025-07-07   # optional baseline (delay viz)
      originallyPlannedEnd: 2025-07-18
      assignees:
        - Bob
        - Carol
    - name: Beta release
      start: 2025-07-21
      end: 2025-07-25
      assignees: []       # empty list is valid; description may be omitted
```

`description` is optional. It surfaces in a hover popover (the trailing "?" marker
on each task row) and is rendered as raw HTML, so inline tags like `<b>` or `<a>`
work — input is trusted (you author your own YAML).

`originallyPlannedStart` / `originallyPlannedEnd` are optional and must be
provided together — they render the task's original baseline alongside the
actual `start`/`end`, making slippage and delays visible at a glance. If only
one is set, the baseline is ignored (see `hasBaseline` in `src/parseYaml.ts`).

Parsed by `src/parseYaml.ts` using `js-yaml`. Date values are coerced to ISO strings (js-yaml parses `YYYY-MM-DD` as JS `Date` objects by default).

## Architecture

```
bin/
  cli.js          CLI entry point — starts server, passes absolute path in ?file=, opens browser
server/
  index.js        HTTP server — static files, YAML endpoint, SSE
src/
  main.tsx        Preact entry point
  App.tsx         Card layout, file loading, assignee filter pills, New button, theme toggle
                  Also contains EmptyState and Pill components
  GanttChart.tsx  Custom Gantt renderer — pure Preact + CSS
  parseYaml.ts    YAML → flat task array, exports Task interface
  themes.ts       DARK and LIGHT theme token objects, exports Theme interface
tests/
  parseYaml.test.ts
roadmap.yaml      Example .yaml file
vite.config.js    Preact alias, vitest config
tsconfig.json
```

### GanttChart layout

The chart is a scrollable flex layout — not a canvas or SVG. Key decisions:

- Each row is `display: flex`: label cell (`width: 280px, position: sticky, left: 0`) + timeline cell (`flex: 1, minWidth: totalDays * DAY_W`). This means the timeline fills the card when content is shorter than the viewport, and triggers horizontal scroll when longer. **Do not add `minWidth: '100%'` to any wrapper div** — that was the source of a phantom empty-space bug.
- Week gridlines use `repeating-linear-gradient` on `background-image` (zero DOM nodes, tiles infinitely to fill flex cells).
- Hover crosshair: mouse position is tracked on the scrollable container ref. `xInTimeline = e.clientX - containerRect.left - LABEL_W + container.scrollLeft` gives the correct day offset accounting for scroll.

## CLI flags

`--no-open` skips launching the browser. `--no-assignee-filter` hides the
toolbar's assignee filter pills (the per-bar assignee chips are unaffected).

CLI options reach the client through the URL: `bin/cli.ts` appends them to the
address it opens and prints (`?file=…&assigneeFilter=off`), and `App.tsx` reads
them from `URLSearchParams` at module init. A client that navigates to a bare
`http://localhost:3847/` therefore gets defaults — the same tradeoff `?file=`
already carries for the displayed filename.

## Releasing

`package.json` holds a permanent `"version": "0.0.0"` placeholder — **do not bump
it**. The git tag is the source of truth. Publishing a release (GitHub release
on tag `vX.Y.Z`) triggers `.github/workflows/publish.yml`, which strips the `v`
and runs `pnpm pkg set version=X.Y.Z` before `pnpm publish`, so the tarball
carries the real version while the repo never drifts. A tag that isn't
`vMAJOR.MINOR.PATCH` fails the job rather than publishing something wrong.

Consequence: a local `pnpm pack` produces `0.0.0`. Nothing reads the version at
runtime today; if a `--version` flag is ever added, it must read from the
*packed* `package.json`, not assume the checked-in value is meaningful.

## Theming

The app supports dark and light themes. The active theme is a plain object passed as a prop from `App` → `GanttChart` / `EmptyState` / `Pill`. All color tokens live in `src/themes.ts` — do not hardcode hex values in components.

**Toggle:** sun/moon icon button in the toolbar. Default: OS `prefers-color-scheme`. Override persisted to `localStorage` under key `theme` (`'dark'` | `'light'`). An inline script in `index.html` sets `colorScheme` before Preact loads to prevent a flash of the wrong theme.
