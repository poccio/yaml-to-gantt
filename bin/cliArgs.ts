import { parseArgs } from 'node:util';

export const USAGE = [
  'Usage: yaml-to-gantt <file.yaml> [options]',
  '',
  '  Visualize a YAML roadmap as an interactive Gantt chart.',
  '',
  'Options:',
  '  --no-open              Start the server without opening a browser',
  '  --no-assignee-filter   Hide the assignee filter row to save vertical space',
  '  --help, -h             Show this message',
  '',
  'Example:',
  '  npx yaml-to-gantt roadmap.yaml',
].join('\n');

/**
 * Returned rather than acted on so the parse stays testable — `bin/cli.ts` binds
 * a socket and shells out to a browser at module scope, so no test can import it.
 */
export type CliCommand =
  | { kind: 'run'; file: string; noOpen: boolean; noAssigneeFilter: boolean }
  /** 0 when usage was asked for, 1 when no file was given. */
  | { kind: 'usage'; exitCode: 0 | 1 }
  | { kind: 'error'; message: string };

const OPTIONS = {
  'no-open': { type: 'boolean', default: false },
  'no-assignee-filter': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
} as const;

export function parseCliArgs(argv: string[]): CliCommand {
  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true }));
  } catch (err) {
    // parseArgs appends a paragraph about escaping positionals after `--` to
    // every message. Keep the first sentence only, lowercased to match the
    // wording of the file checks in cli.ts.
    const raw = err instanceof Error ? err.message.split('. ')[0] : String(err);
    return { kind: 'error', message: raw.charAt(0).toLowerCase() + raw.slice(1) };
  }

  if (values.help) return { kind: 'usage', exitCode: 0 };
  if (positionals.length === 0) return { kind: 'usage', exitCode: 1 };
  if (positionals.length > 1) {
    return { kind: 'error', message: `unexpected extra argument: ${positionals.slice(1).join(', ')}` };
  }

  return {
    kind: 'run',
    file: positionals[0],
    noOpen: values['no-open'],
    noAssigneeFilter: values['no-assignee-filter'],
  };
}
