# yaml-to-gantt

Visualize a YAML roadmap as an interactive Gantt chart in your browser.

![yaml-to-gantt demo](https://raw.githubusercontent.com/poccio/yaml-to-gantt/main/assets/gif/demo.gif)

## Quick Start

```bash
npx yaml-to-gantt roadmap.yaml
```

This starts a local server, opens your browser, and renders the Gantt chart. The chart **live-reloads** whenever you save the YAML file.

## YAML Format

```yaml
projects:
  Project Name:
    - name: Task name
      start: 2025-07-01   # YYYY-MM-DD
      end: 2025-07-11
      assignees:
        - Alice
        - Bob
    - name: Another task
      start: 2025-07-14
      end: 2025-07-18
      assignees: []       # empty list is valid
```

- **projects**: top-level map of project names to task arrays
- **name**: task label shown in the chart
- **start** / **end**: date range (inclusive), in `YYYY-MM-DD` format
- **assignees**: list of people assigned to the task (can be empty)

## Features

- **Live reload** — edit your YAML, see changes instantly
- **Assignee filtering** — click pills to highlight specific people
- **Hover crosshair** — hover over the timeline to see exact dates
- **Light/dark theme** — toggle in the toolbar, defaults to OS preference
- **New** — reset to empty state to drop in a different YAML file
- **Zero config** — one command, no setup
