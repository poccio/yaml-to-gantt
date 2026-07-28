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
```

- **projects**: top-level map of project names to task arrays
- **name**: task label shown in the chart
- **start** / **end**: date range (inclusive), in `YYYY-MM-DD` format
- **assignees** _(optional)_: people assigned to the task; omit it or pass `[]` for none
- **description** _(optional)_: surfaces in a hover popover via the trailing "?" marker on the task row. Rendered as raw HTML, so inline tags like `<b>` or `<a>` work (input is trusted — you author your own YAML)
- **originallyPlannedStart** / **originallyPlannedEnd** _(optional)_: the task's original baseline dates. Set both to render the baseline alongside the actual `start`/`end`, making slippage and delays visible at a glance

## Features

- **Multiple projects** — each becomes its own section with its own bar color
- **Assignee filtering** — click a pill to highlight one person's tasks
- **Hover crosshair** — read the exact date under the cursor
- **Today marker** — the chart opens scrolled to today
- **Light/dark theme** — toggle in the toolbar, defaults to your OS preference
- **Drag and drop** — "New" clears the chart so you can drop in another YAML file

## License

MIT
