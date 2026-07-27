export interface UrlOptions {
  /** Absolute path of the roadmap to load, or null when the app was opened bare. */
  file: string | null;
  /** Set by the CLI's --no-assignee-filter flag. */
  hideAssigneeFilter: boolean;
}

/**
 * Reads the options the CLI passes through the query string (see `bin/cli.ts`).
 *
 * Takes the search string rather than reading `window.location` itself, so this
 * stays a pure function and the module can be imported outside a browser.
 */
export function readUrlOptions(search: string): UrlOptions {
  const params = new URLSearchParams(search);
  return {
    file: params.get('file') || null,
    hideAssigneeFilter: params.get('assigneeFilter') === 'off',
  };
}
