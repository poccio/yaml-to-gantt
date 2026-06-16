# yaml-to-gantt

A Vite + Preact app that renders an interactive Gantt chart from a YAML roadmap file. Preact is aliased as React via `vite.config.js`.

## Input format

```yaml
projects:
  Project Name:
    - name: Task name
      start: 2026-04-06   # YYYY-MM-DD
      end: 2026-04-10
      description: "Ship the <b>v2</b> API."   # optional; rendered as raw HTML
      assignees:
        - Alice
        - Bob
    - name: Another task
      start: 2026-04-13
      end: 2026-04-17
      assignees: []       # empty list is valid; description may be omitted
```

`description` is optional. It surfaces in a hover popover (the trailing "?" marker
on each task row) and is rendered as raw HTML, so inline tags like `<b>` or `<a>`
work — input is trusted (you author your own YAML).

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

## Theming

The app supports dark and light themes. The active theme is a plain object passed as a prop from `App` → `GanttChart` / `EmptyState` / `Pill`. All color tokens live in `src/themes.ts` — do not hardcode hex values in components.

**Toggle:** sun/moon icon button in the toolbar. Default: OS `prefers-color-scheme`. Override persisted to `localStorage` under key `theme` (`'dark'` | `'light'`). An inline script in `index.html` sets `colorScheme` before Preact loads to prevent a flash of the wrong theme.
