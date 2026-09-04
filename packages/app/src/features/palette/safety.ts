import type { CommandId } from '@midnite/studio-shared';

/**
 * Explicit allowlist of command IDs safe to execute from the Command Palette.
 *
 * Guardrail: The palette performs safe writes only (checkout, fetch, pull, stage,
 * commit box, file save, view/navigation toggles) and nothing whose inverse is
 * an unrecoverable reset or destructive operation (branch deletion, hard reset, etc.).
 *
 * Statically defined as an allowlist so any future destructive command added in
 * keybindings is absent from the palette by default rather than accidentally exposed.
 */
export const PALETTE_SAFE: readonly CommandId[] = [
  'terminal.toggle',
  'terminal.focus',
  // `terminal.new`/`terminal.close` are deliberately absent, same as
  // `browser.newTab`/`browser.closeTab`: they share a chord with a command
  // whose meaning depends on runtime state (which terminal is selected, or
  // whether the browser is open), and the palette has no such context to
  // resolve against.
  'repos.toggle',
  'browser.toggle',
  'fab.toggle',
  'repo.open',
  'repo.close',
  'view.refresh',
  // Both reload rows are safe: a reload discards renderer state and comes
  // back, which is recoverable by definition — it is the palette's answer to
  // a wedged view, and the same pair the title bar's reload button offers.
  'app.reload',
  'app.hardReload',
  'graph.focus',
  'status.focus',
  'status.commit',
  'sync.fetch',
  'sync.pull',
  'sync.push',
  'palette.open',
  'palette.files',
  'file.save',
  'markdown.presentAsSlides',
  // Starting a workflow run is recoverable by the same logic as `sync.fetch`:
  // nothing it does cannot be inspected or re-run, and it never deletes state.
  'workflow.run',
  // Detaching is a UI move, not a data change — re-docking (or closing the
  // popout) undoes it completely, the same recoverability `app.reload` has.
  'window.detachActive',
  'window.detachTerminal',
  'window.detachRepos',
  'window.detachFab',
  'window.detachBrowser',
] as const;

export function isPaletteSafe(id: CommandId): boolean {
  return PALETTE_SAFE.includes(id);
}
