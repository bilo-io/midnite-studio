import type { EditorAction, EditorState } from './editor-state';
import { nudgeDistance } from './snap';

/** What a key press means in the editor: a document edit, or a change to the view / tool. */
export type KeyOutcome =
  | { kind: 'dispatch'; action: EditorAction }
  | { kind: 'ui'; command: UiCommand };

export type UiCommand =
  | 'mode:translate'
  | 'mode:rotate'
  | 'mode:scale'
  | 'measure'
  | 'xray'
  | 'grid'
  | 'frame'
  | 'camera:perspective'
  | 'camera:front'
  | 'camera:side'
  | 'camera:top'
  | 'snap:down'
  | 'snap:up'
  | 'help'
  | 'save'
  | 'escape';

export type KeyInput = { key: string; mod: boolean; shift: boolean; alt?: boolean };

/**
 * Maps a key press to its outcome. Pure, so the whole shortcut table is unit-tested without a
 * canvas; `shortcuts.ts` is the documented list this implements.
 */
export function resolveKey(input: KeyInput, state: EditorState, gridStep: number): KeyOutcome | null {
  const key = input.key.toLowerCase();
  const { mod, shift } = input;
  const dispatch = (action: EditorAction): KeyOutcome => ({ kind: 'dispatch', action });
  const ui = (command: UiCommand): KeyOutcome => ({ kind: 'ui', command });
  const has = state.selection.length > 0;

  if (mod) {
    switch (key) {
      case 'z':
        return dispatch({ type: shift ? 'redo' : 'undo' });
      case 'y':
        return dispatch({ type: 'redo' });
      case 's':
        return ui('save');
      case 'c':
        return has ? dispatch({ type: 'copy' }) : null;
      case 'v':
        return state.clipboard ? dispatch({ type: 'paste' }) : null;
      case 'd':
        return has ? dispatch({ type: 'duplicate' }) : null;
      case 'g':
        return has ? dispatch({ type: shift ? 'ungroup' : 'group' }) : null;
      case 'a':
        return dispatch({ type: 'selectAll' });
      default:
        return null;
    }
  }

  const step = nudgeDistance(gridStep, shift);
  switch (key) {
    case 'w':
      return ui('mode:translate');
    case 'e':
      return ui('mode:rotate');
    case 'r':
      return ui('mode:scale');
    case 'm':
      return ui('measure');
    case 'x':
      return ui('xray');
    case 'g':
      return ui('grid');
    case 'f':
      return ui('frame');
    case '0':
      return ui('camera:perspective');
    case '1':
      return ui('camera:front');
    case '2':
      return ui('camera:side');
    case '3':
      return ui('camera:top');
    case '[':
      return ui('snap:down');
    case ']':
      return ui('snap:up');
    case '?':
    case '/':
      return shift || key === '?' ? ui('help') : null;
    case 'escape':
      return ui('escape');
    case 'h': {
      if (shift) return dispatch({ type: 'showAll' });
      if (!has) return null;
      const allHidden = state.selection.every((i) => state.spec.parts[i]?.hidden);
      return dispatch({ type: 'patchMany', indices: state.selection, patch: { hidden: allHidden ? undefined : true } });
    }
    case 'l': {
      if (!has) return null;
      const allLocked = state.selection.every((i) => state.spec.parts[i]?.locked);
      return dispatch({ type: 'patchMany', indices: state.selection, patch: { locked: allLocked ? undefined : true } });
    }
    case 'delete':
    case 'backspace':
      return has ? dispatch({ type: 'remove' }) : null;
    case 'arrowleft':
      return has ? dispatch({ type: 'nudge', delta: [-step, 0, 0] }) : null;
    case 'arrowright':
      return has ? dispatch({ type: 'nudge', delta: [step, 0, 0] }) : null;
    case 'arrowup':
      return has ? dispatch({ type: 'nudge', delta: [0, 0, -step] }) : null;
    case 'arrowdown':
      return has ? dispatch({ type: 'nudge', delta: [0, 0, step] }) : null;
    case 'pageup':
      return has ? dispatch({ type: 'nudge', delta: [0, step, 0] }) : null;
    case 'pagedown':
      return has ? dispatch({ type: 'nudge', delta: [0, -step, 0] }) : null;
    default:
      return null;
  }
}
