# yaml-to-gantt

A Vite + Preact app that renders an interactive Gantt chart from a YAML roadmap.
The CLI serves one file, watches it, and hot-reloads the browser over SSE. Preact
is aliased as React in `vite.config.js`.

## Input format

```yaml
projects:
  Product Launch:
    - name: Market research
      start: 2025-07-01                              # YYYY-MM-DD
      end: 2025-07-11                                # inclusive
      description: "Interview <b>10 customers</b>"   # optional, raw HTML
      assignees: [Alice]                             # optional; [] is valid
    - name: Landing page
      start: 2025-07-07
      end: 2025-07-24
      originallyPlannedStart: 2025-07-07             # optional baseline for delay visualization (both or neither)
      originallyPlannedEnd: 2025-07-18
      assignees: [Bob, Carol]
```

`src/parseYaml.ts` flattens this into `Task[]` and **validates every date**
(`YYYY-MM-DD`, and a day that really exists). Keep that validation: one Invalid
Date poisons the min/max in `computeRange` and silently blanks the *whole* chart,
not just the bad row. `description` is raw HTML — input is trusted.

## Architecture

```
bin/
  cli.ts            Entry — validates the path, starts the server, opens the browser
  cliArgs.ts        Pure argv → CliCommand, plus USAGE
server/
  index.ts          Static dist/, /api/yaml, /api/events (SSE), fs.watch
src/
  main.tsx          Preact entry point
  App.tsx           Card layout, file loading, filter pills, theme toggle; also
                    EmptyState and Pill
  GanttChart.tsx    Chart renderer, Preact + CSS; also TaskInfoPopover
  timeline.ts       Calendar-day math — parseDay, addDays, daysBetween, computeRange, …
  chartLayout.ts    Pixel math — BASE_DAY_W, LABEL_W, effectiveDayW, bar/chip/hover
                    geometry
  popover.ts        placePopover
  parseYaml.ts      YAML → validated Task[]
  urlOptions.ts     Query string → CLI options
  themes.ts         DARK / LIGHT tokens
tests/              One file per module; GanttChart.test.tsx is the only jsdom file
.github/workflows/
  publish.yml       Release → typecheck, test, stamp version, publish to npm
  validate.yml      pull_request → typecheck, test
assets/gif/         Manual demo-GIF pipeline; each script's header is its usage doc
index.html          Vite entry + inline pre-paint theme script
roadmap.yaml        Example input
vite.config.js      Preact alias, vitest config
tsconfig.base.json  Shared strictness — app and server extend it, test extends app
tsconfig.app.json   src/ — browser, bundler resolution
tsconfig.server.json  server/ + bin/ — nodenext, emits the shipped JS
tsconfig.test.json  tests/ — extends app, adds node types, references server
tsconfig.json       Solution file — owns no source, just references the three
```

`bin/*.js` and `server/*.js` are gitignored build output, shipped in the tarball.

`pnpm typecheck` is `tsc --build`, which checks each project under its own
runtime's rules. Two of those settings are load-bearing and were silent bugs
before they existed: `tsconfig.app.json` sets `"types": []`, without which
`process.env` in a component typechecks clean and dies in the browser; and
`tsconfig.test.json` *references* the server project rather than including it.
Both files explain themselves — read them before editing either.

## Dates

Everything from `parseDay` onward is a `Date` at local midnight, and all day math
goes through `src/timeline.ts`.

- **Never move by raw milliseconds.** A DST day is 23 or 25 hours, so
  `getTime() + n * 86_400_000` drifts onto 23:00 of the previous date and stays
  there — that shipped as a duplicated column in the day header. Use `addDays`.
- **js-yaml hands back UTC midnight and `parseYaml` reads UTC parts back out.**
  That pairing is what makes it correct; reformatting it locally shifts every
  date a day west of UTC.
- Local midnight doesn't always exist (Chile starts DST at midnight), so never
  assert it in a test.

## Chart layout

- Rows are flex: sticky label cell + timeline cell at `flex: 1, minWidth:
  totalDays * BASE_DAY_W`. **Never add `minWidth: '100%'` to a wrapper** —
  phantom empty-space bug.
- Two `useLayoutEffect`s own `scrollLeft`: the focus-today latch, and the
  re-anchor that holds the same *date* at the left edge when a reload moves
  `rangeStart`. Both are subtler than they look and both must use `BASE_DAY_W`,
  never `effectiveDayW`. Their comments in `GanttChart.tsx` are the spec — read
  those before touching either.
- `computeRange` pads asymmetrically (`−RANGE_PAD` leading, `+RANGE_PAD + 2`
  trailing), so read `totalDays` off the function instead of re-deriving it.

## Testing

`pnpm test` (`vitest run`), node environment.

- **Logic worth testing lives in a pure module, not a component.** `timeline.ts`,
  `chartLayout.ts`, `popover.ts` and `bin/cliArgs.ts` were all extracted for that
  reason. Extract rather than reach for a heavier harness.
- `tests/` is typechecked by `tsconfig.test.json`, which is what catches a
  misspelled property in `toBeUndefined()` or a `Task` fixture missing fields —
  both pass vitest while asserting nothing. Don't move tests out of that project.
- `tests/timeline.test.ts` pins `TZ=America/New_York` and hand-derives every
  expectation in that zone; the DST transition is the point. Pass `todayOffset`
  an explicit `now`.
- **jsdom has no layout engine**: `clientWidth` and `getBoundingClientRect()`
  read 0, so only `scrollLeft` assertions mean anything and real geometry needs a
  browser. Keep DOM tests in `GanttChart.test.tsx` — jsdom costs ~800ms per file.
- Prefer positive assertions; `not.toContain(x)` passes while state is `null`.
- `App.tsx` is untested — mounting it needs `matchMedia`, `EventSource` and
  `fetch` stubs.

## CLI

```
yaml-to-gantt <file.yaml> [--no-open] [--no-assignee-filter] [--help|-h]
```

- Add flags to `OPTIONS` in `bin/cliArgs.ts`, not `bin/cli.ts`. `cliArgs` is pure
  and tested; `cli.ts` binds a socket at module scope and can't be imported by a
  test. `parseArgs` then rejects unknown flags for free.
- Flags cross to the client as `?file=…&assigneeFilter=off` — `bin/cli.ts` builds
  it, `readUrlOptions` parses it, and only the parsing half is tested, so change
  both sides together.
- `App.tsx` reads those options in a `useState` initializer, **not at module
  scope**: touching `window` on import throws outside a browser.

## Theming

Tokens are `DARK` / `LIGHT` in `src/themes.ts`; use `theme.*` and add new colors
there. Don't copy the surrounding code — about 60 raw color literals remain in
`App.tsx` and `GanttChart.tsx` (`ACCENT` duplicates `theme.accent`, 18 hand-typed
`rgba(79,142,247,…)`, plus `Pill`'s own palette). `PROJECT_COLORS` and
`GHOST_BARS` are intentionally theme-independent; everything else is drift.

The inline script in `index.html` duplicates `getInitialTheme`'s logic to avoid a
flash of the wrong theme — keep the two in sync.

## Releasing

`package.json` pins `"version": "0.0.0"` — **do not bump it.** The git tag is the
source of truth, and `publish.yml` stamps it with `npm pkg set` (pnpm has no `pkg`
command).

`publish.yml`'s `pnpm typecheck` and `pnpm test` are **the only gate a release
passes**: `validate.yml` is `pull_request`-only, `main` is unprotected, and
releases are cut from direct pushes. `prepublishOnly` is not a gate — it runs
`vite build`, which strips types without checking them.
