# yaml-to-gantt

A Vite + React app that renders an interactive Gantt chart from a YAML roadmap file.

## Running

```bash
pnpm dev    # dev server
pnpm build  # production build
```

## Input format

YAML files placed in `data/` are bundled at build time and available in the Quick Load dropdown. The app also accepts file uploads at runtime.

```yaml
projects:
  Project Name:
    - name: Task name
      start: 2026-04-06   # YYYY-MM-DD
      end: 2026-04-10
      assignees:
        - Alice
        - Bob
    - name: Another task
      start: 2026-04-13
      end: 2026-04-17
      assignees: []       # empty list is valid
```

Parsed by `src/parseYaml.js` using `js-yaml`. Date values are coerced to ISO strings (js-yaml parses `YYYY-MM-DD` as JS `Date` objects by default).

## Architecture

```
bin/
  cli.js          CLI entry point — starts server, passes absolute path in ?file=, opens browser
server/
  index.js        HTTP server — static files, YAML endpoint, SSE
src/
  main.jsx        React entry point
  App.jsx         Card layout, file loading, assignee filter pills, New button, theme toggle
  GanttChart.jsx  Custom Gantt renderer — pure React + CSS
  parseYaml.js    YAML → flat task array
  themes.js       DARK and LIGHT theme token objects
example/
  roadmap.yaml    Example dataset
```

### GanttChart layout

The chart is a scrollable flex layout — not a canvas or SVG. Key decisions:

- Each row is `display: flex`: label cell (`width: 280px, position: sticky, left: 0`) + timeline cell (`flex: 1, minWidth: totalDays * DAY_W`). This means the timeline fills the card when content is shorter than the viewport, and triggers horizontal scroll when longer. **Do not add `minWidth: '100%'` to any wrapper div** — that was the source of a phantom empty-space bug.
- Week gridlines use `repeating-linear-gradient` on `background-image` (zero DOM nodes, tiles infinitely to fill flex cells).
- Hover crosshair: mouse position is tracked on the scrollable container ref. `xInTimeline = e.clientX - containerRect.left - LABEL_W + container.scrollLeft` gives the correct day offset accounting for scroll.

## Theming

The app supports dark and light themes. The active theme is a plain object passed as a prop from `App` → `GanttChart` / `EmptyState` / `Pill`. All color tokens live in `src/themes.js` — do not hardcode hex values in components.

**Toggle:** ☀/🌙 icon button in the toolbar. Default: OS `prefers-color-scheme`. Override persisted to `localStorage` under key `theme` (`'dark'` | `'light'`). An inline script in `index.html` sets `colorScheme` before React loads to prevent a flash of the wrong theme.

**Token reference** (`src/themes.js` exports `DARK` and `LIGHT`):

| Token | Dark | Light | Role |
|---|---|---|---|
| `bg` | `#0e1117` | `#f0f2f5` | Page background |
| `surface` | `#161a22` | `#ffffff` | Card / chart background |
| `raised` | `#1d2130` | `#f7f8fa` | Header, elevated rows |
| `border` | `#252d3d` | `#e2e5eb` | Primary borders |
| `borderInner` | `#1c2336` | `#eaecf2` | Inner row separators |
| `borderSubtle` | `#1a1f2c` | `#f0f2f5` | Subtlest row dividers |
| `borderHover` | `#4a5e80` | `#9aaabb` | Upload button hover border |
| `text` | `#ccd6f0` | `#1a2133` | Primary text |
| `textMuted` | `#5a6e8a` | `#6b7a99` | Secondary labels |
| `textFaint` | `#3d4e68` | `#b0bdd0` | Faint labels |
| `taskText` | `#8aa8cc` | `#3a4a66` | Task name in label column |
| `accent` | `#4f8ef7` | `#4f8ef7` | Wordmark, today line, hover badge |
| `error` | `#f87171` | `#f87171` | Error message text |
| `headerBg` | `#181d28` | `#f7f8fa` | Sticky header gradient top |
| `monthLabel` | `#3d5070` | `#9aaabb` | Month text and regular day ticks |
| `dayMonday` | `#7a98c0` | `#7a98c0` | Monday day number |
| `dayWeekend` | `#283344` | `#c8d0dc` | Weekend day number |
| `weekBandAlpha` | `rgba(255,255,255,0.014)` | `rgba(0,0,0,0.022)` | Alternating week band |
| `weekLineAlpha` | `rgba(255,255,255,0.045)` | `rgba(0,0,0,0.07)` | Monday gridline |
| `chipBg` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.05)` | Unselected assignee chip bg |
| `chipBorder` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.12)` | Unselected assignee chip border |
| `chipText` | `#7a9ab8` | `#4a5978` | Unselected assignee chip text |
| `colorScheme` | `'dark'` | `'light'` | CSS `color-scheme` value |

**Fonts** (Google Fonts): `JetBrains Mono` for all date/data labels, wordmark, and chips; `Plus Jakarta Sans` for task names and UI controls.

**Project colors** (8-color cycle, unchanged across both themes):
`#60a5fa #34d399 #f472b6 #fb923c #a78bfa #fbbf24 #2dd4bf #f87171`
