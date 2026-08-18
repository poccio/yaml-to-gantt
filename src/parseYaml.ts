import yaml from 'js-yaml';

export interface Task {
  project: string;
  name: string;
  start: string;
  end: string;
  assignees: string[];
  description?: string;
  originallyPlannedStart?: string;
  originallyPlannedEnd?: string;
}

interface YamlTaskItem {
  name: string;
  start: string | Date;
  end: string | Date;
  assignees?: string[];
  description?: string;
  originallyPlannedStart?: string | Date;
  originallyPlannedEnd?: string | Date;
}

interface YamlDocument {
  /** A project written as `Name:` with nothing under it arrives as null. */
  projects: Record<string, YamlTaskItem[] | null>;
}

export interface Roadmap {
  tasks: Task[];
  /**
   * Every project name in declaration order, including the ones with no tasks:
   * `tasks` alone cannot tell an empty project from one that was never written.
   */
  projects: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether the string names a day that exists, read the way `parseDay` reads it. */
function isRealDay(s: string): boolean {
  const [year, month, day] = s.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * js-yaml converts only *unquoted* dates to `Date`, so a quoted `"not-a-date"`
 * arrives as a plain string — and this is the last place to catch it: an Invalid
 * Date poisons the min/max in `computeRange` and blanks the whole chart, not just
 * the bad row, with nothing thrown. The `isRealDay` round-trip catches what the
 * regex cannot, since the Date constructor rolls `2025-13-01` into Jan 2026.
 */
function toDateStr(val: string | Date, field: string, where: string): string {
  const s = val instanceof Date ? val.toISOString().slice(0, 10) : String(val);
  if (!DATE_RE.test(s) || !isRealDay(s)) {
    throw new Error(`${where}: ${field} must be a YYYY-MM-DD date, got "${s}"`);
  }
  return s;
}

export function parseYaml(text: string): Roadmap {
  const doc = yaml.load(text) as YamlDocument;
  const tasks: Task[] = [];
  for (const [project, items] of Object.entries(doc.projects)) {
    for (const item of items ?? []) {
      const where = `${project} / ${item.name}`;
      const hasBaseline =
        item.originallyPlannedStart != null && item.originallyPlannedEnd != null;
      tasks.push({
        project,
        name: item.name,
        start: toDateStr(item.start, 'start', where),
        end: toDateStr(item.end, 'end', where),
        assignees: item.assignees ?? [],
        description: item.description,
        originallyPlannedStart: hasBaseline
          ? toDateStr(item.originallyPlannedStart!, 'originallyPlannedStart', where)
          : undefined,
        originallyPlannedEnd: hasBaseline
          ? toDateStr(item.originallyPlannedEnd!, 'originallyPlannedEnd', where)
          : undefined,
      });
    }
  }
  return { tasks, projects: Object.keys(doc.projects) };
}
