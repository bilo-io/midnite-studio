/**
 * Every level-editor key binding, in one table (Phase 137 Theme J). The key handlers dispatch through
 * `matchShortcut` and the `?` cheat-sheet renders the same rows, so the sheet cannot drift from the keys.
 * Chord grammar matches the model editor's `shortcuts.ts`: `Mod+Shift+Z`, `Mod` is Cmd on macOS.
 */
export type LevelShortcutGroup = 'Tools' | 'Selection' | 'Edit' | 'View';

export type LevelCommandId =
  | 'tool.select' | 'tool.entity' | 'tool.paint' | 'tool.erase' | 'tool.rect' | 'tool.pick' | 'tool.volume' | 'tool.spawner' | 'tool.path' | 'tool.rotate' | 'tool.scatter'
  | 'scatter.smaller' | 'scatter.larger'
  | 'path.finish'
  | 'edit.undo' | 'edit.redo' | 'edit.cut' | 'edit.copy' | 'edit.paste' | 'edit.duplicate' | 'edit.delete'
  | 'select.all' | 'select.none' | 'select.nudge' | 'view.frame' | 'gizmo.translate' | 'gizmo.rotate' | 'gizmo.scale'
  | 'gizmo.pivot' | 'gizmo.space' | 'help.shortcuts' | 'play.stop' | 'play.here';

export type LevelShortcut = {
  id: LevelCommandId;
  chord: string;
  label: string;
  group: LevelShortcutGroup;
  /** Where the key is live: the plan canvas, the 3D view, or both. */
  views: ReadonlyArray<'plan' | '3d'>;
  /** Only on a level of this dimension; absent means either. */
  dimension?: '2d' | '3d';
};

const PLAN: LevelShortcut['views'] = ['plan'];
const BOTH: LevelShortcut['views'] = ['plan', '3d'];
const IN_3D: LevelShortcut['views'] = ['3d'];

export const LEVEL_SHORTCUTS: readonly LevelShortcut[] = [
  { id: 'tool.select', chord: 'V', label: 'Select / move', group: 'Tools', views: BOTH },
  { id: 'tool.entity', chord: 'O', label: 'Place entity', group: 'Tools', views: BOTH },
  { id: 'tool.scatter', chord: 'S', label: 'Scatter brush (Alt erases)', group: 'Tools', views: BOTH },
  { id: 'scatter.smaller', chord: '[', label: 'Scatter brush smaller', group: 'Tools', views: BOTH },
  { id: 'scatter.larger', chord: ']', label: 'Scatter brush larger', group: 'Tools', views: BOTH },
  { id: 'tool.paint', chord: 'B', label: 'Paint tiles', group: 'Tools', views: PLAN, dimension: '2d' },
  { id: 'tool.erase', chord: 'E', label: 'Erase tiles', group: 'Tools', views: PLAN, dimension: '2d' },
  { id: 'tool.rect', chord: 'R', label: 'Rectangle', group: 'Tools', views: PLAN, dimension: '2d' },
  { id: 'tool.pick', chord: 'I', label: 'Pick a tile', group: 'Tools', views: PLAN, dimension: '2d' },
  { id: 'tool.volume', chord: 'R', label: 'Volume', group: 'Tools', views: PLAN, dimension: '3d' },
  { id: 'tool.spawner', chord: 'N', label: 'Spawn zone', group: 'Tools', views: BOTH, dimension: '3d' },
  { id: 'tool.path', chord: 'P', label: 'Path', group: 'Tools', views: BOTH, dimension: '3d' },
  { id: 'path.finish', chord: 'Enter', label: 'Finish the path', group: 'Tools', views: BOTH, dimension: '3d' },
  { id: 'tool.rotate', chord: 'Y', label: 'Rotate (Shift snaps)', group: 'Tools', views: BOTH, dimension: '3d' },
  { id: 'gizmo.translate', chord: 'W', label: 'Move gizmo', group: 'Tools', views: IN_3D, dimension: '3d' },
  { id: 'gizmo.rotate', chord: 'E', label: 'Rotate gizmo', group: 'Tools', views: IN_3D, dimension: '3d' },
  { id: 'gizmo.scale', chord: 'R', label: 'Scale gizmo', group: 'Tools', views: IN_3D, dimension: '3d' },
  { id: 'gizmo.pivot', chord: 'Z', label: 'Pivot / centre', group: 'Tools', views: IN_3D, dimension: '3d' },
  { id: 'gizmo.space', chord: 'X', label: 'Local / world space', group: 'Tools', views: IN_3D, dimension: '3d' },
  { id: 'select.all', chord: 'Mod+A', label: 'Select all in the layer', group: 'Selection', views: BOTH },
  { id: 'select.none', chord: 'Escape', label: 'Clear selection / cancel path', group: 'Selection', views: BOTH },
  { id: 'select.nudge', chord: 'Arrows', label: 'Nudge by the snap step (Shift x10)', group: 'Selection', views: BOTH },
  { id: 'edit.undo', chord: 'Mod+Z', label: 'Undo', group: 'Edit', views: BOTH },
  { id: 'edit.redo', chord: 'Mod+Shift+Z', label: 'Redo', group: 'Edit', views: BOTH },
  { id: 'edit.cut', chord: 'Mod+X', label: 'Cut', group: 'Edit', views: BOTH },
  { id: 'edit.copy', chord: 'Mod+C', label: 'Copy', group: 'Edit', views: BOTH },
  { id: 'edit.paste', chord: 'Mod+V', label: 'Paste', group: 'Edit', views: BOTH },
  { id: 'edit.duplicate', chord: 'Mod+D', label: 'Duplicate', group: 'Edit', views: BOTH },
  { id: 'edit.delete', chord: 'Delete', label: 'Delete selection', group: 'Edit', views: BOTH },
  { id: 'edit.delete', chord: 'Backspace', label: 'Delete selection / last path point', group: 'Edit', views: BOTH },
  { id: 'view.frame', chord: 'F', label: 'Frame selection', group: 'View', views: IN_3D, dimension: '3d' },
  // Shift+F5 is listed first: a plain chord otherwise ignores Shift, so F5 would shadow it.
  { id: 'play.stop', chord: 'Shift+F5', label: 'Stop the game', group: 'View', views: BOTH },
  { id: 'play.here', chord: 'F5', label: 'Play from here', group: 'View', views: BOTH },
  { id: 'help.shortcuts', chord: '?', label: 'This shortcut list', group: 'View', views: BOTH },
];

export type ShortcutContext = { view: 'plan' | '3d'; dimension: '2d' | '3d'; mac: boolean };
type KeyLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

/** Whether a row is live in this view and dimension. */
export function shortcutApplies(row: LevelShortcut, ctx: Pick<ShortcutContext, 'view' | 'dimension'>): boolean {
  return row.views.includes(ctx.view) && (row.dimension === undefined || row.dimension === ctx.dimension);
}

function chordMatches(chord: string, e: KeyLike): boolean {
  const mod = e.metaKey || e.ctrlKey;
  const parts = chord.split('+');
  const key = parts[parts.length - 1]!;
  const wantsMod = parts.includes('Mod');
  const wantsShift = parts.includes('Shift');
  if (mod !== wantsMod) return false;
  // Alt never belongs to a chord; a Mod chord also ignores Shift unless it asks for it (Mod+Shift+Z is redo).
  if (wantsMod) {
    if (e.altKey || (e.shiftKey !== wantsShift && key.toLowerCase() === 'z')) return false;
  } else if (e.altKey || (wantsShift && !e.shiftKey)) return false;
  if (key === 'Arrows') return e.key.startsWith('Arrow');
  if (key === '?') return e.key === '?';
  return e.key.toLowerCase() === key.toLowerCase();
}

/** The command a key press means in this view, or null. A plain letter ignores Shift, as the tool keys always did. */
export function matchShortcut(e: KeyLike, ctx: ShortcutContext): LevelCommandId | null {
  for (const row of LEVEL_SHORTCUTS) {
    if (shortcutApplies(row, ctx) && chordMatches(row.chord, e)) return row.id;
  }
  return null;
}

/** A chord as the cheat-sheet shows it: `⌘D` on macOS, `Ctrl+D` elsewhere. */
export function formatChord(chord: string, mac: boolean): string {
  const parts = chord.split('+');
  if (!mac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
  const glyph: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Delete: '⌦', Backspace: '⌫', Escape: '⎋', Enter: '↩' };
  return parts.map((p) => glyph[p] ?? p).join('');
}

/** Mod is Cmd on macOS, Ctrl elsewhere. */
export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
