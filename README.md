# yaml-to-gantt

Visualize a YAML roadmap as an interactive Gantt chart in your browser.

![yaml-to-gantt demo](https://raw.githubusercontent.com/poccio/yaml-to-gantt/main/assets/gif/demo.gif)

## Quick Start

```bash
npx yaml-to-gantt roadmap.yaml
```

This starts a local server, opens your browser, and renders the Gantt chart. The chart **live-reloads** whenever you save the YAML file.

### Options

| Flag | Effect |
| --- | --- |
| `--no-open` | Start the server without opening a browser |
| `--no-assignee-filter` | Hide the assignee filter row to save vertical space. Assignee names still appear next to each bar |
| `--hide-empty-projects` | Skip projects with no tasks to show. By default they render as a bare header row, whether the file declares them with no tasks or the assignee filter has hidden all of them |
| `--help`, `-h` | Show usage and exit |

```bash
npx yaml-to-gantt roadmap.yaml --no-open --no-assignee-filter
```

## YAML Format

```yaml
projects:
  Product Launch:
    - name: Market research
      start: 2025-07-01   # YYYY-MM-DD
      end: 2025-07-11
      description: "Interview <b>10 target customers</b> and summarize findings"   # optional, rendered as HTML
      assignees:
        - Alice
    - name: Landing page
      start: 2025-07-07
      end: 2025-07-24
      originallyPlannedStart: 2025-07-07   # optional baseline
      originallyPlannedEnd: 2025-07-18
      assignees:
        - Bob
        - Carol
    - name: Beta release
      start: 2025-07-21
      end: 2025-07-25
      assignees: []       # empty list is valid

periods:                  # optional: sprints, releases, holidays…
  - name: Sprint 42
    start: 2025-07-07
    end: 2025-07-18
  - name: Release week
    start: 2025-07-21
    end: 2025-07-25
```

- **projects**: top-level map of project names to task arrays
- **name**: task label shown in the chart
- **start** / **end**: date range (inclusive), in `YYYY-MM-DD` format
- **assignees** _(optional)_: people assigned to the task; omit it or pass `[]` for none
- **description** _(optional)_: surfaces in a hover popover via the trailing "?" marker on the task row. Rendered as raw HTML, so inline tags like `<b>` or `<a>` work (input is trusted — you author your own YAML)
- **originallyPlannedStart** / **originallyPlannedEnd** _(optional)_: the task's original baseline dates. Set both to render the baseline alongside the actual `start`/`end`, making slippage and delays visible at a glance
- **periods** _(optional)_: a list of named stretches of the calendar. Each is a labelled tab in a lane under the day numbers, over a tinted, edged column down every row. `start`/`end` are inclusive, and periods may not overlap. Back-to-back periods alternate between two colours so a sprint cadence reads as blocks; a weekend-only gap still counts as back-to-back. The chart widens to include every period

## Features

- **Multiple projects** — each becomes its own section with its own bar color
- **Assignee filtering** — click a pill to highlight one person's tasks
- **Hover crosshair** — read the exact date under the cursor
- **Today marker** — the chart opens scrolled to today
- **Periods** — sprints, release weeks or holidays shaded behind the tasks
- **Light/dark theme** — toggle in the toolbar, defaults to your OS preference
- **Drag and drop** — "New" clears the chart so you can drop in another YAML file
- **Drag to reschedule** — drag a bar to move the task by whole days. The new dates are written back into your YAML file, leaving comments and formatting alone, and a task with no baseline keeps its old dates as `originallyPlannedStart` / `originallyPlannedEnd`. Works on the file the CLI serves, not on a dropped one

## License

MIT
