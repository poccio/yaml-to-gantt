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

const toDateStr = (val: string | Date): string =>
  val instanceof Date ? val.toISOString().slice(0, 10) : String(val);

export function parseYaml(text: string): Task[] {
  const doc = yaml.load(text) as YamlDocument;
  const tasks: Task[] = [];
  for (const [project, items] of Object.entries(doc.projects)) {
    for (const item of items) {
      const hasBaseline =
        item.originallyPlannedStart != null && item.originallyPlannedEnd != null;
      tasks.push({
        project,
        name: item.name,
        start: toDateStr(item.start),
        end: toDateStr(item.end),
        assignees: item.assignees ?? [],
        description: item.description,
        originallyPlannedStart: hasBaseline ? toDateStr(item.originallyPlannedStart!) : undefined,
        originallyPlannedEnd: hasBaseline ? toDateStr(item.originallyPlannedEnd!) : undefined,
      });
    }
  }
  return tasks;
}
