import { describe, test, expect } from 'vitest';
import { parseCliArgs, USAGE } from '../bin/cliArgs.js';

// This all used to live at the top of bin/cli.ts, which no test can import: its
// top-level `await start()` binds a socket and execSyncs a browser.

describe('parseCliArgs', () => {
  test('reads the file and every flag, in any order', () => {
    expect(parseCliArgs(['roadmap.yaml', '--no-open', '--no-assignee-filter', '--hide-empty-projects'])).toEqual({
      kind: 'run',
      file: 'roadmap.yaml',
      noOpen: true,
      noAssigneeFilter: true,
      hideEmptyProjects: true,
    });
    expect(parseCliArgs(['--no-open', 'roadmap.yaml'])).toEqual({
      kind: 'run',
      file: 'roadmap.yaml',
      noOpen: true,
      noAssigneeFilter: false,
      hideEmptyProjects: false,
    });
  });

  // Empty projects show by default, so the flag that hides them must default to
  // false rather than merely be absent.
  test('defaults every flag to false', () => {
    expect(parseCliArgs(['roadmap.yaml'])).toEqual({
      kind: 'run',
      file: 'roadmap.yaml',
      noOpen: false,
      noAssigneeFilter: false,
      hideEmptyProjects: false,
    });
  });

  // Each of these used to be accepted and ignored: the old membership test only
  // asked whether '--no-open' was present, so a typo opened the browser anyway.
  // Silence is the bug; the wording of node's message is not pinned.
  test.each([
    ['--no-assignee-filters', 'plural typo'],
    ['--no-assigneefilter', 'missing hyphen'],
    ['--no-opne', 'transposed letters'],
    ['--assignee-filter=off', 'value form of a flag that does not exist'],
    ['--hide-empty-project', 'singular typo'],
  ])('rejects %s (%s)', (flag) => {
    const result = parseCliArgs([flag, 'roadmap.yaml']);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain(flag.split('=')[0]);
  });

  // A single dash used to fall through the `startsWith('--')` check and be taken
  // as the file path, so `-no-open roadmap.yaml` reported the flag as a missing
  // file and never looked at the real one.
  test('rejects a single-dash flag instead of reading it as the file', () => {
    const result = parseCliArgs(['-no-open', 'roadmap.yaml']);

    expect(result.kind).toBe('error');
  });

  test('rejects a value passed to a boolean flag', () => {
    const result = parseCliArgs(['--no-open=true', 'roadmap.yaml']);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain('--no-open');
  });

  // The escape hatch the rejections above depend on: a dash-leading filename is
  // still reachable, so strictness costs nothing.
  test('takes a dash-leading positional after --', () => {
    expect(parseCliArgs(['--', '-roadmap.yaml'])).toMatchObject({
      kind: 'run',
      file: '-roadmap.yaml',
    });
  });

  test('names the extra argument when given more than one file', () => {
    const result = parseCliArgs(['roadmap.yaml', '/nope/missing.yaml']);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain('/nope/missing.yaml');
  });

  // --help exits 0 because it is what was asked for; bare argv exits 1 because
  // it is a usage error that happens to print the same text.
  test.each(['--help', '-h'])('treats %s as a request for usage, exit 0', (flag) => {
    expect(parseCliArgs([flag])).toEqual({ kind: 'usage', exitCode: 0 });
  });

  test('prints usage and exits 1 when no file is given', () => {
    expect(parseCliArgs([])).toEqual({ kind: 'usage', exitCode: 1 });
    expect(parseCliArgs(['--no-open'])).toEqual({ kind: 'usage', exitCode: 1 });
  });

  test('help wins over an otherwise valid invocation', () => {
    expect(parseCliArgs(['roadmap.yaml', '--help'])).toEqual({ kind: 'usage', exitCode: 0 });
  });
});

describe('USAGE', () => {
  // The old usage text listed neither --help nor -h, because neither was a real
  // flag at the time.
  test('lists every flag parseCliArgs accepts', () => {
    for (const flag of ['--no-open', '--no-assignee-filter', '--hide-empty-projects', '--help', '-h']) {
      expect(USAGE).toContain(flag);
    }
  });
});
