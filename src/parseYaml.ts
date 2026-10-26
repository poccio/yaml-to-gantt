import yaml from 'js-yaml';

export interface Task {
  project: string;
  name: string;
  /**
   * 0-based position within the project's list in the file. `/api/move` names a
   * task by project + index, so the server's lookup and this value must agree.
   */
  index: number;
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
  periods?: unknown;
}

/** A named stretch of the calendar drawn under the tasks: a sprint, a freeze, a holiday. */
export interface Period {
  name: string;
  start: string;
  /** Inclusive, like a task's. */
  end: string;
}

export interface Roadmap {
  tasks: Task[];
  /**
   * Every project name in declaration order, including the ones with no tasks:
   * `tasks` alone cannot tell an empty project from one that was never written.
   */
  projects: string[];
  /** Sorted by start, whatever order the file lists them in. */
  periods: Period[];
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

function isPlainMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

/**
 * Held to the same date rules as tasks, since a period's dates feed
 * `computeRange` too, plus two a task gets away with: an end before its start,
 * and two periods sharing a day. Periods share one header lane, so an overlap
 * there has no place to be drawn.
 */
function parsePeriods(raw: unknown): Period[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('periods must be a list of periods, each with name, start and end');
  }
  const periods = raw.map((item: unknown, i): Period => {
    if (!isPlainMap(item)) throw new Error(`periods #${i + 1}: must be a map with name, start and end`);
    if (item.name == null || String(item.name).trim() === '') {
      throw new Error(`periods #${i + 1}: name is required`);
    }
    const name = String(item.name);
    const where = `periods / ${name}`;
    const start = toDateStr(item.start as string | Date, 'start', where);
    const end = toDateStr(item.end as string | Date, 'end', where);
    // Zero-padded YYYY-MM-DD orders the same as the dates it names.
    if (end < start) throw new Error(`${where}: end ${end} is before start ${start}`);
    return { name, start, end };
  });
  periods.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (let i = 1; i < periods.length; i++) {
    const [prev, next] = [periods[i - 1], periods[i]];
    if (next.start <= prev.end) {
      throw new Error(`periods: "${prev.name}" and "${next.name}" overlap — periods cannot share a day`);
    }
  }
  return periods;
}

export function parseYaml(text: string): Roadmap {
  const doc = yaml.load(text) as YamlDocument;
  const tasks: Task[] = [];
  for (const [project, items] of Object.entries(doc.projects)) {
    for (const [index, item] of (items ?? []).entries()) {
      const where = `${project} / ${item.name}`;
      const hasBaseline =
        item.originallyPlannedStart != null && item.originallyPlannedEnd != null;
      tasks.push({
        project,
        name: item.name,
        index,
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
  return { tasks, projects: Object.keys(doc.projects), periods: parsePeriods(doc.periods) };
}
