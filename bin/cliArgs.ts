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
 * What the argv asks the CLI to do. Returned rather than acted on, so the whole
 * parse stays pure and reachable from the node test suite — `bin/cli.ts` itself
 * cannot be imported by a test (it binds a socket and shells out to a browser).
 */
export type CliCommand =
  /** Serve `file`. */
  | { kind: 'run'; file: string; noOpen: boolean; noAssigneeFilter: boolean }
  /** Print USAGE and exit with this code: 0 when asked for, 1 when no file was given. */
  | { kind: 'usage'; exitCode: 0 | 1 }
  /** Print the message and exit 1. */
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
    // parseArgs rejects unknown options, bad short groups and values passed to
    // boolean flags. Every message ends with a paragraph about escaping
    // positionals after `--`; keep the first sentence and match the lowercase
    // "Error: …" style of the file checks in cli.ts.
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
