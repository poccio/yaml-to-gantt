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
  cli.ts          CLI entry point — starts server, passes absolute path in ?file=, opens browser
                  (bin/*.js and server/*.js are build output — gitignored, shipped in the tarball)
server/
  index.ts        HTTP server — static files, YAML endpoint, SSE
src/
  main.tsx        Preact entry point
  App.tsx         Card layout, file loading, assignee filter pills, New button, theme toggle
                  Also contains EmptyState and Pill components
  GanttChart.tsx  Custom Gantt renderer — pure Preact + CSS
  timeline.ts     Pure day-grid math — parseDay, daysBetween, computeRange, todayOffset
  parseYaml.ts    YAML → flat task array, exports Task interface
  urlOptions.ts   Query-string → CLI options (file path, hideAssigneeFilter)
  themes.ts       DARK and LIGHT theme token objects, exports Theme interface
tests/
  parseYaml.test.ts   server.test.ts   timeline.test.ts   urlOptions.test.ts
roadmap.yaml      Example .yaml file
vite.config.js    Preact alias, vitest config
tsconfig.json
```

### GanttChart layout

The chart is a scrollable flex layout — not a canvas or SVG. Key decisions:

- Each row is `display: flex`: label cell (`width: 280px, position: sticky, left: 0`) + timeline cell (`flex: 1, minWidth: totalDays * DAY_W`). This means the timeline fills the card when content is shorter than the viewport, and triggers horizontal scroll when longer. **Do not add `minWidth: '100%'` to any wrapper div** — that was the source of a phantom empty-space bug.
- Week gridlines use `repeating-linear-gradient` on `background-image` (zero DOM nodes, tiles infinitely to fill flex cells).
- Hover crosshair: mouse position is tracked on the scrollable container ref. `xInTimeline = e.clientX - containerRect.left - LABEL_W + container.scrollLeft` gives the correct day offset accounting for scroll.
- Initial scroll: a `useLayoutEffect` sets `scrollLeft` so today sits `TODAY_LEAD_IN` (7) days in from the left, instead of opening on `rangeStart` (= earliest task date − `RANGE_PAD`). It applies on the first pass where the container actually has layout (`clientWidth > 0`) and then latches on the `hasFocusedToday` ref. Once-only is deliberate — neither an SSE hot-reload nor a resize may move the user's scroll position. It keys off `containerWidth` rather than being mount-only because a chart mounted inside a `display: none` subtree has no layout box, so the assignment is silently discarded and today-focus is lost for any embedder that reveals the chart later (a reveal.js slide, a tab, an accordion). Roadmaps entirely in the past or future need no special case: the browser clamps `scrollLeft`, landing on the right edge or staying at the left.

## CLI flags

`--no-open` skips launching the browser. `--no-assignee-filter` hides the
toolbar's assignee filter pills (the per-bar assignee chips are unaffected).

CLI options reach the client through the URL: `bin/cli.ts` appends them to the
address it opens and prints (`?file=…&assigneeFilter=off`), and `readUrlOptions`
in `src/urlOptions.ts` parses them back out. `App.tsx` calls it in a `useState`
initializer, once per mount — **not at module scope.** Reading `window` while the
module evaluates throws outside a browser, which makes `App.tsx` unimportable in
the test suite's node environment. A client that navigates to a bare
`http://localhost:3847/` gets defaults — the same tradeoff `?file=` already
carries for the displayed filename.

## Testing

`vitest run`, node environment, no DOM. Nothing renders components, so the rule
is: **logic worth testing lives in a pure module, not inside a component.**
`src/timeline.ts` exists for exactly that reason — the day-grid math was private
to `GanttChart.tsx` and therefore unreachable, which is how a UTC-vs-local
off-by-one in the today marker shipped.

`tests/timeline.test.ts` pins `process.env.TZ` to `America/New_York` for the
whole file and hand-derives every expected value in that zone. Both properties
are load-bearing: a UTC-only run cannot catch a local-vs-UTC mix-up, and New
York has a DST transition that keeps `daysBetween`'s rounding honest. Feed
`todayOffset` an explicit `now` rather than reading the clock inside it.

**Everything rendered is untested.** Nothing in `App.tsx` or `GanttChart.tsx`
has coverage: bar and ghost-bar geometry, `effectiveDayW`, `dayTicks`, the
assignee-chip flip, the scroll-focus latch, popover placement, `EmptyState`'s
drag handling, and the empty-roadmap and hidden-filter render branches. Covering
any of it means adding a jsdom environment and a rendering library first, which
has not been done.

Until then the cheaper move is to keep pulling logic out of the components: two
functions still doing day math inline in `GanttChart.tsx` (`dayTicks` and
`hoverDate`, both stepping by a fixed `86_400_000`) desync from the bars across
a DST transition — the same class of bug `src/timeline.ts` was extracted to
catch, still sitting where no test can reach it.

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
