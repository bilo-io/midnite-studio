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
] as const;

export function isPaletteSafe(id: CommandId): boolean {
  return PALETTE_SAFE.includes(id);
}
