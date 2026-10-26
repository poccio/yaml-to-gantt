import { isAlias, isMap, isScalar, isSeq, parseDocument, Scalar } from 'yaml';
import type { Document, YAMLMap } from 'yaml';

export interface Move {
  project: string;
  /** Position within the project's task list, as the client flattened it. */
  index: number;
  start: string;
  end: string;
}

export class MoveRefused extends Error {}

interface Edit {
  at: number;
  remove: number;
  insert: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors `toDateStr` in src/parseYaml.ts: the regex alone lets 2025-02-31
// through, so the Date.UTC round-trip is what rejects it. Duplicated because
// `server/` cannot import from `src/`.
function assertDate(value: string, field: string): void {
  const [y, m, d] = value.split('-').map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  const ok =
    DATE_RE.test(value) &&
    real.getUTCFullYear() === y &&
    real.getUTCMonth() === m - 1 &&
    real.getUTCDate() === d;
  if (!ok) throw new MoveRefused(`${field} must be a YYYY-MM-DD date, got "${value}"`);
}

function rewrap(node: Scalar, date: string): string {
  switch (node.type) {
    case Scalar.PLAIN:
      return date;
    case Scalar.QUOTE_SINGLE:
      return `'${date}'`;
    case Scalar.QUOTE_DOUBLE:
      return `"${date}"`;
    default:
      throw new MoveRefused('start/end use a block or other scalar style that cannot be rewritten in place');
  }
}

function dateScalar(task: YAMLMap, key: string): Scalar {
  const node = task.get(key, true);
  if (!isScalar(node)) throw new MoveRefused(`task has no plain ${key} value`);
  if (node.anchor) throw new MoveRefused(`${key} carries an anchor`);
  return node;
}

function locateTask(doc: Document, move: Move): YAMLMap {
  const projects = isMap(doc.contents) ? doc.contents.get('projects', true) : undefined;
  if (!isMap(projects)) throw new MoveRefused('projects not found');
  // Matched by stringified key because `2026:` parses as a number.
  const pair = projects.items.find((p) => String((p.key as Scalar).value) === move.project);
  if (!pair) throw new MoveRefused(`project "${move.project}" not found`);
  if (isAlias(pair.value)) throw new MoveRefused('project is an alias');
  if (!isSeq(pair.value)) throw new MoveRefused(`project "${move.project}" not found`);

  const task = pair.value.items[move.index];
  if (task === undefined) throw new MoveRefused(`task ${move.index} not found in "${move.project}"`);
  if (isAlias(task)) throw new MoveRefused('task is an alias');
  if (!isMap(task)) throw new MoveRefused(`task ${move.index} not found in "${move.project}"`);
  if (task.flow) throw new MoveRefused('task is written in flow style ({ ... }) and cannot be edited in place');
  if (task.anchor) throw new MoveRefused('task carries an anchor');
  if (task.items.some((p) => isScalar(p.key) && p.key.value === '<<')) {
    throw new MoveRefused('task uses a merge key (<<)');
  }
  return task;
}

/**
 * Returns `text` with one task's `start`/`end` rewritten, touching nothing else.
 * Every edit is a splice at a node's source range, because re-serialising the
 * document would drop the user's comments, quoting and layout.
 */
export function moveTask(text: string, move: Move): string {
  assertDate(move.start, 'start');
  assertDate(move.end, 'end');
  if (move.end < move.start) throw new MoveRefused(`end ${move.end} is before start ${move.start}`);

  const doc = parseDocument(text);
  if (doc.errors.length) throw new MoveRefused(`YAML does not parse: ${doc.errors[0].message}`);

  const task = locateTask(doc, move);

  const start = dateScalar(task, 'start');
  const end = dateScalar(task, 'end');
  const edits: Edit[] = [
    { at: start.range![0], remove: start.range![1] - start.range![0], insert: rewrap(start, move.start) },
    { at: end.range![0], remove: end.range![1] - end.range![0], insert: rewrap(end, move.end) },
  ];

  const oldStart = String(start.value);
  const oldEnd = String(end.value);
  const baselineStart = task.items.find((p) => isScalar(p.key) && p.key.value === 'originallyPlannedStart');
  const baselineEnd = task.items.find((p) => isScalar(p.key) && p.key.value === 'originallyPlannedEnd');

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const isEmpty = (p: typeof baselineStart) =>
    !!p && (p.value === null || (isScalar(p.value) && p.value.value === null));

  if (!baselineStart && !baselineEnd) {
    const endPair = task.items.find((p) => isScalar(p.key) && p.key.value === 'end')!;
    const keyAt = (endPair.key as Scalar).range![0];
    const indent = ' '.repeat(keyAt - (text.lastIndexOf('\n', keyAt - 1) + 1));
    const lines = [
      `${indent}originallyPlannedStart: ${rewrap(start, oldStart)}`,
      `${indent}originallyPlannedEnd: ${rewrap(end, oldEnd)}`,
    ];
    const newline = text.indexOf('\n', end.range![1]);
    edits.push(
      newline === -1
        ? { at: text.length, remove: 0, insert: eol + lines.join(eol) }
        : { at: newline + 1, remove: 0, insert: lines.map((l) => l + eol).join('') },
    );
  } else if (isEmpty(baselineStart) && isEmpty(baselineEnd)) {
    for (const [p, date] of [[baselineStart!, oldStart], [baselineEnd!, oldEnd]] as const) {
      const v = p.value as Scalar | null;
      if (v && v.range && v.range[1] > v.range[0]) {
        edits.push({ at: v.range[0], remove: v.range[1] - v.range[0], insert: date });
      } else {
        // `key :` is valid YAML, so the colon is searched for rather than assumed adjacent.
        const colon = text.indexOf(':', (p.key as Scalar).range![1]);
        edits.push({ at: colon + 1, remove: 0, insert: ` ${date}` });
      }
    }
  }

  let out = text;
  for (const e of edits.sort((a, b) => b.at - a.at)) {
    out = out.slice(0, e.at) + e.insert + out.slice(e.at + e.remove);
  }

  // One guard for every splice path: a wrong range surfaces as a refusal, not a mangled file.
  const check = parseDocument(out);
  let readBack: YAMLMap | undefined;
  try {
    readBack = locateTask(check, move);
  } catch {
    // Falls through to the refusal below.
  }
  const wrote = (key: string, want: string) => readBack !== undefined && String(readBack.get(key)) === want;
  const leftBaselineAlone = edits.length === 2;
  const wroteBaseline = leftBaselineAlone || (wrote('originallyPlannedStart', oldStart) && wrote('originallyPlannedEnd', oldEnd));
  if (check.errors.length || !wrote('start', move.start) || !wrote('end', move.end) || !wroteBaseline) {
    throw new MoveRefused('the edit would not read back correctly, so the file was left alone');
  }
  return out;
}
