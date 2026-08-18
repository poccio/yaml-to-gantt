export interface UrlOptions {
  /** Absolute path of the roadmap, or null when the app was opened bare. */
  file: string | null;
  /** Set by the CLI's --no-assignee-filter flag. */
  hideAssigneeFilter: boolean;
  /** Set by the CLI's --hide-empty-projects flag. */
  hideEmptyProjects: boolean;
}

/**
 * The other half of the query string `bin/cli.ts` builds. Takes the search
 * string rather than reading `window.location`, so the module can be imported
 * outside a browser.
 */
export function readUrlOptions(search: string): UrlOptions {
  const params = new URLSearchParams(search);
  return {
    file: params.get('file') || null,
    hideAssigneeFilter: params.get('assigneeFilter') === 'off',
    hideEmptyProjects: params.get('emptyProjects') === 'off',
  };
}
