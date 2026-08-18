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
      originallyPlannedStart: 2025-07-07             # optional baseline, both or neither
      originallyPlannedEnd: 2025-07-18
      assignees: [Bob, Carol]
  Discovery: []                                    # a project may have no tasks
```

`src/parseYaml.ts` flattens this into a `Roadmap` — `Task[]` plus the project
names in declaration order — and **validates every date**. The name list exists
because a flat `Task[]` cannot tell a project declared with no tasks from one
that was never written; `Discovery:` with nothing under it is the same as `[]`.
Keep the two halves aligned: `GanttChart` hands out colours by position in that
list, so a project dropped from it recolours every project after it. Keep
that validation: one Invalid Date poisons the min/max in `computeRange` and
silently blanks the *whole* chart, not just the bad row. `description` is raw
HTML — input is trusted.

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
dist-server/        Gitignored — bin/ + server/ compiled, and what the tarball runs
```

## Dates

All day math goes through `src/timeline.ts`, on `Date`s at local midnight.

- **Never move by raw milliseconds.** A DST day is 23 or 25 hours, so
  `getTime() + n * 86_400_000` lands on 23:00 of the previous date and stays there
  — that shipped as a duplicated column in the day header. Use `addDays`.
- **js-yaml hands back UTC midnight and `parseYaml` reads UTC parts back out.**
  That pairing is what makes it correct; reformatting either half locally shifts
  every date a day west of UTC.
- Local midnight doesn't always exist (Chile starts DST at midnight), so never
  assert it in a test.

## Chart layout

`src/chartLayout.ts` docstrings are the spec for the math. What constrains code
outside it:

- **Never put `minWidth: '100%'` on a wrapper** — phantom empty-space bug. Pixel
  min-widths are the opposite case and required: rows go through `rowShell` at
  `rowMinW(totalDays)`, or their sticky label cells escape their containing block
  partway along a scrolling timeline.
- **In timeline coordinates the label column's right edge is `scrollLeft`.** That
  identity is why `scrollLeft` is mirrored into state, and it drives both
  `isBehindLabelColumn` and `hoverPillCenter`.
- Three `useLayoutEffect`s touch scroll. The focus-today latch and the `rangeStart`
  re-anchor must use `BASE_DAY_W`, never `effectiveDayW`; the third only mirrors
  `scrollLeft` and is **declared last**, so it sees what the other two just set.
- **Hover dimming goes on the row, never on its cells** — a faded sticky label cell
  goes translucent over the timeline it exists to occlude. The consequence is the
  trap: a faded row is a stacking context, so **nothing overlaying the rows from
  outside can reach the label column**, whatever zIndex the labels carry. The today
  bar clips its own glow instead of being covered.
- **The crosshair stores the cursor's `clientX`, not the day offset it resolved
  to.** Scrolling puts a new day under a still pointer, and because the pill is
  clamped, a stale offset parks a wrong date at the label edge.
- `computeRange` pads asymmetrically, so read `totalDays` off it instead of
  re-deriving it.

## CLI

```
yaml-to-gantt <file.yaml> [--no-open] [--no-assignee-filter]
                          [--hide-empty-projects] [--help|-h]
```

- Add flags to `OPTIONS` in `bin/cliArgs.ts`, never to `bin/cli.ts`: `cliArgs` is
  pure and tested, while `cli.ts` binds a socket at module scope and can't be
  imported by a test. `parseArgs` then rejects unknown flags for free.
- Flags cross to the client as `?file=…&assigneeFilter=off&emptyProjects=off` — `bin/cli.ts` builds
  it, `readUrlOptions` parses it, and only the parsing half is tested. Change both
  sides together.
- **The query string is not guaranteed to be there.** Someone can type
  `localhost:3849/` by hand and the chart still renders, so anything read off the
  URL is a preference, not a source of truth. The filename has a server-side
  fallback (`X-Yaml-Path` on `/api/yaml`); `assigneeFilter=off` and
  `emptyProjects=off` still have the hole, and the fix shape is the same. Both
  default to the *showing* side, so a bare URL degrades to more chart, not less.

## Theming

Tokens are `DARK` / `LIGHT` in `src/themes.ts` — use `theme.*` and add new colors
there. **Don't copy the surrounding code:** ~60 raw color literals remain in
`App.tsx` and `GanttChart.tsx`, and they are drift, not the pattern.
`PROJECT_COLORS` and `GHOST_BARS` are intentionally theme-independent.

`index.html`'s inline script duplicates `getInitialTheme` to avoid a flash of the
wrong theme — keep the two in sync.

## Releasing

`package.json` pins `"version": "0.0.0"` — **do not bump it.** The git tag is the
source of truth, and `publish.yml` stamps it with `npm pkg set` (pnpm has no `pkg`
command).

## Conventions

- Comments explain **why** — the edge case, the alternative that failed, the
  constraint that is invisible locally. Never what the line already says.
- **One fact, one place.** Call sites and tests point at the canonical docstring
  instead of re-telling it; re-narration is how this codebase and this file rot.
- Test names say what and assertions say how, so comment only the bug a case exists
  to prevent, or hand-derived arithmetic.
- **Logic worth testing goes in a pure module, not a component** — `timeline.ts`,
  `chartLayout.ts`, `popover.ts` and `cliArgs.ts` were all extracted for that.
  Extract rather than reach for a heavier harness: jsdom has no layout engine, so
  `clientWidth` and `getBoundingClientRect()` read 0, only `scrollLeft` assertions
  mean anything, and it costs ~800ms per file.
- Rename or extract before explaining.
