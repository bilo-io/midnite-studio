import type { CommandId, CompanionAccess } from '@midnite/studio-shared';

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
  // Opens the Notes modal — a UI toggle, not a data change, same
  // recoverability class as `fab.toggle`/`browser.toggle` beside it.
  'notes.toggle',
  // Opens the companion panel — the same class again. It greets on open
  // (Theme D), which speaks and writes a transcript turn, and neither is a
  // write this app cannot take back: closing the panel ends the sentence.
  'companion.toggle',
  // Flips one persisted preference and opens nothing — the same
  // recoverability class as `theme.select` below, and one click in
  // Settings ▸ Browser undoes it.
  'link.toggleTarget',
  // Opens a browser tab on a port already listening on loopback. Navigation
  // only, and the same class as `browser.toggle` above.
  'browser.openDevServer',
  // Opens a detached DevTools window for the active tab — inspection only,
  // the same recoverability class as `browser.openDevServer` just above.
  // `browser.clearData` is the one Theme G command that stays OUT: it
  // destroys every logged-in session in the `persist:browser` partition.
  'browser.devtools',
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
  // Both are navigation plus, at most, opening a file picker — neither
  // touches git or repository state, the same recoverability class as
  // `app.reload` and `repo.open`.
  'theme.select',
  'theme.import',
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

/**
 * Rows outside `PALETTE_SAFE` that are still fine for the companion to
 * dispatch **by id**. `PALETTE_SAFE` excludes each of these only because it
 * shares a chord with a command whose meaning depends on runtime state the
 * palette has no context to resolve against (which terminal is selected,
 * whether a tab strip is open) — a reason that does not apply to id
 * dispatch, which never goes through a chord at all.
 *
 * `COMMAND_ACCESS`'s own `safety.test.ts` asserts every `direct`/`confirm` id
 * is in `PALETTE_SAFE ∪ ID_DISPATCH_OK` and that everything else outside
 * `PALETTE_SAFE` is `never` — so this list, not prose, is what keeps the
 * companion provably no wider than the palette.
 */
const ID_DISPATCH_OK = new Set<CommandId>([
  'terminal.new',
  'terminal.close',
  'terminal.toggleHalfMaximized',
  'browser.newTab',
  'browser.closeTab',
  'browser.nextTab',
  'browser.prevTab',
  'browser.reopenTab',
  'browser.selectTab1',
  'browser.selectTab2',
  'browser.selectTab3',
  'browser.selectTab4',
  'browser.selectTab5',
  'browser.selectTab6',
  'browser.selectTab7',
  'browser.selectTab8',
  'browser.selectTab9',
  'browser.find',
  'browser.zoomIn',
  'browser.zoomOut',
  'browser.zoomReset',
  'app.zoomIn',
  'app.zoomOut',
  'app.zoomReset',
  'panel.back',
  'panel.forward',
  'search.open',
  'activity.toggle',
  'app.lock',
  'app.screensaver',
]);

/**
 * The starting tier for every `CommandId` (Decision 5), **total by type**:
 * `Record`, not `Partial`, so a new command fails `:typecheck` until someone
 * decides how the companion may use it — the same guarantee `VIEW_COMPONENT`
 * and `CommandRuntime` already give.
 *
 * `view.graph`/`view.files`/`view.issues`/`view.video`/`view.apiClient` are
 * `never` here — a deliberate narrowing of Decision 5's prose ("direct: every
 * `view.*`"), flagged in this PR's description. The companion's `navigate`
 * intent (Theme B) reaches every view through `CompanionVocabulary.views`
 * (`ViewId`, not `CommandId`), which is the non-duplicating path Finding 2
 * and "Not in this phase" both call for; exposing the same five views a
 * *second* time as `run`-able commands would be exactly the redundant row
 * the phase says the companion must not add, and (Theme A's own acceptance
 * test) none of the five is in `PALETTE_SAFE` or the `ID_DISPATCH_OK` list
 * above, so the test's own "everything else outside `PALETTE_SAFE` must be
 * `never`" rule settles it independently of the prose.
 */
export const COMMAND_ACCESS: Record<CommandId, CompanionAccess> = {
  'terminal.toggle': 'direct',
  'terminal.toggleHalfMaximized': 'direct',
  'terminal.focus': 'direct',
  'terminal.new': 'direct',
  'terminal.close': 'confirm',
  'repos.toggle': 'direct',
  'browser.toggle': 'direct',
  'fab.toggle': 'direct',
  'notes.toggle': 'direct',
  // Closing itself mid-sentence — Decision 5's `never`.
  'companion.toggle': 'never',
  'link.toggleTarget': 'direct',
  'browser.openDevServer': 'direct',
  'activity.toggle': 'direct',
  'browser.newTab': 'direct',
  'browser.closeTab': 'confirm',
  'browser.nextTab': 'direct',
  'browser.prevTab': 'direct',
  'panel.back': 'direct',
  'panel.forward': 'direct',
  'browser.reopenTab': 'direct',
  'browser.find': 'direct',
  'browser.zoomIn': 'direct',
  'browser.zoomOut': 'direct',
  'browser.zoomReset': 'direct',
  'app.zoomIn': 'direct',
  'app.zoomOut': 'direct',
  'app.zoomReset': 'direct',
  'browser.devtools': 'direct',
  // Destroys every logged-in session in the `persist:browser` partition —
  // `PALETTE_SAFE` excludes it for the same reason.
  'browser.clearData': 'never',
  'browser.selectTab1': 'direct',
  'browser.selectTab2': 'direct',
  'browser.selectTab3': 'direct',
  'browser.selectTab4': 'direct',
  'browser.selectTab5': 'direct',
  'browser.selectTab6': 'direct',
  'browser.selectTab7': 'direct',
  'browser.selectTab8': 'direct',
  'browser.selectTab9': 'direct',
  'repo.open': 'direct',
  'repo.close': 'confirm',
  'view.refresh': 'direct',
  'app.reload': 'confirm',
  'app.hardReload': 'confirm',
  'app.lock': 'confirm',
  'app.screensaver': 'direct',
  // See the docblock above: a deliberate `never`, not Decision 5's `direct`.
  'view.graph': 'never',
  'graph.focus': 'direct',
  'status.focus': 'direct',
  'status.commit': 'confirm',
  'sync.fetch': 'direct',
  // Decision 14 — open for a human: a pull on a dirty tree is what the user
  // least wants from a misheard word, so this stays `confirm` for now.
  'sync.pull': 'confirm',
  'sync.push': 'confirm',
  'search.open': 'direct',
  // Owned by Phase 22, disabled stubs — self-referential to "an operation is
  // running", which the companion cannot itself have started.
  'op.abort': 'never',
  'op.continue': 'never',
  'palette.open': 'direct',
  'palette.files': 'direct',
  'file.save': 'confirm',
  // See the docblock above.
  'view.files': 'never',
  'view.issues': 'never',
  'markdown.presentAsSlides': 'direct',
  'workflow.run': 'confirm',
  // See the docblock above.
  'view.video': 'never',
  'view.apiClient': 'never',
  'theme.select': 'direct',
  'theme.import': 'direct',
  'window.detachActive': 'direct',
  'window.detachTerminal': 'direct',
  'window.detachRepos': 'direct',
  'window.detachFab': 'direct',
  'window.detachBrowser': 'direct',
};

/**
 * Every `direct`/`confirm` id must be reachable — the companion is provably
 * no wider than the palette, except for the small `ID_DISPATCH_OK` carve-out
 * above (see its docblock). Exported for `safety.test.ts`, not consumed by
 * the app itself.
 */
export function isCompanionDispatchable(id: CommandId): boolean {
  return PALETTE_SAFE.includes(id) || ID_DISPATCH_OK.has(id);
}

export function isIdDispatchOk(id: CommandId): boolean {
  return ID_DISPATCH_OK.has(id);
}
