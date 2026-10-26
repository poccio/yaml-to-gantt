import type { Task } from './parseYaml';

export function assigneesOf(tasks: Task[]): string[] {
  return [...new Set(tasks.flatMap((t) => t.assignees))].sort();
}

/** `null` is "All"; a selection that covers everyone (or no one) is the same thing. */
export function toggleAssignee(prev: Set<string> | null, name: string, all: string[]): Set<string> | null {
  if (prev === null) return new Set([name]);
  const next = new Set(prev);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next.size === 0 || next.size === all.length ? null : next;
}

/** Re-applies a filter to a freshly loaded roadmap, where a name may have vanished. */
export function pruneAssigneeFilter(prev: Set<string> | null, all: string[]): Set<string> | null {
  if (prev === null) return null;
  const next = new Set([...prev].filter((name) => all.includes(name)));
  return next.size === 0 || next.size === all.length ? null : next;
}
