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
```

- **projects**: top-level map of project names to task arrays
- **name**: task label shown in the chart
- **start** / **end**: date range (inclusive), in `YYYY-MM-DD` format
- **assignees**: list of people assigned to the task (can be empty)
- **description** _(optional)_: surfaces in a hover popover via the trailing "?" marker on the task row. Rendered as raw HTML, so inline tags like `<b>` or `<a>` work (input is trusted — you author your own YAML)
- **originallyPlannedStart** / **originallyPlannedEnd** _(optional)_: the task's original baseline dates. Set both to render the baseline alongside the actual `start`/`end`, making slippage and delays visible at a glance

## Features

- **Live reload** — edit your YAML, see changes instantly
- **Task descriptions** — add a `description` to any task; it surfaces in a hover popover (rich HTML supported)
- **Delay visualization** — set `originallyPlannedStart`/`originallyPlannedEnd` to show a task's baseline alongside its actual dates
- **Assignee filtering** — click pills to highlight specific people
- **Hover crosshair** — hover over the timeline to see exact dates
- **Light/dark theme** — toggle in the toolbar, defaults to OS preference
- **New** — reset to empty state to drop in a different YAML file
- **Zero config** — one command, no setup
