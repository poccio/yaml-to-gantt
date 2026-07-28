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
  projects: Record<string, YamlTaskItem[]>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `YYYY-MM-DD` names a day that exists, read the way `parseDay` reads it. */
function isRealDay(s: string): boolean {
  const [year, month, day] = s.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Coerce a YAML date value to `YYYY-MM-DD`, rejecting anything that is not one.
 *
 * Only an *unquoted* date reaches us as a `Date` — js-yaml leaves a quoted one a
 * plain string, so without a check here `"not-a-date"` flows straight into
 * `parseDay`. This is the last place to catch it: an Invalid Date poisons the
 * min/max in `computeRange`, which blanks the entire chart rather than the one
 * bad row, with no error anywhere.
 *
 * The round-trip through `Date` is what the regex alone cannot do — the
 * constructor rolls `2025-13-01` forward into January 2026 instead of failing.
 */
function toDateStr(val: string | Date, field: string, where: string): string {
  const s = val instanceof Date ? val.toISOString().slice(0, 10) : String(val);
  if (!DATE_RE.test(s) || !isRealDay(s)) {
    throw new Error(`${where}: ${field} must be a YYYY-MM-DD date, got "${s}"`);
  }
  return s;
}

export function parseYaml(text: string): Task[] {
  const doc = yaml.load(text) as YamlDocument;
  const tasks: Task[] = [];
  for (const [project, items] of Object.entries(doc.projects)) {
    for (const item of items) {
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
  return tasks;
}
