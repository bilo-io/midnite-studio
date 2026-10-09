/**
 * Pure pieces of the "repos side panel closed in screenshots" default, kept
 * free of `@playwright/test` so vitest can cover them (`e2e/shots-helper.ts`
 * wires them into `installMockBridge`).
 */

/** True for a screenshot spec (`*-shots.spec.ts`), not a functional or visual one. */
export function isShotsSpecFile(file: string): boolean {
  return /-shots\.spec\.ts$/.test(file);
}

/**
 * Init-script body: defaults `reposOpen` in the persisted `midnite-studio.ui`
 * store, merging and never overwriting an explicit value a spec already
 * seeded. Self-contained: Playwright serialises it with `toString()`.
 */
export function seedReposPanelDefault(open: boolean): void {
  try {
    const raw = window.localStorage.getItem('midnite-studio.ui');
    const parsed = raw ? JSON.parse(raw) : { version: 18 };
    parsed.state = { ...parsed.state };
    if (!('reposOpen' in parsed.state)) parsed.state.reposOpen = open;
    window.localStorage.setItem('midnite-studio.ui', JSON.stringify(parsed));
  } catch {
    /* an unparseable profile is one the app discards too */
  }
}
