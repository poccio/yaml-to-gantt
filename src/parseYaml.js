import yaml from 'js-yaml';

// js-yaml parses YYYY-MM-DD values as JavaScript Date objects by default.
// Convert them back to ISO date strings.
const toDateStr = (val) =>
  val instanceof Date ? val.toISOString().slice(0, 10) : String(val);

export function parseYaml(text) {
  const doc = yaml.load(text);
  const tasks = [];
  for (const [project, items] of Object.entries(doc.projects)) {
    for (const item of items) {
      tasks.push({
        project,
        name: item.name,
        start: toDateStr(item.start),
        end: toDateStr(item.end),
        assignees: item.assignees ?? [],
      });
    }
  }
  return tasks;
}
