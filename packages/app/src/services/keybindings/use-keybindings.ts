import type { CommandId } from '@midnite/studio-shared';
import {
  useKeybindings as useFrameKeybindings,
  type CommandRuntime,
  type KeybindingGates,
} from '@midnite/studio-frame';

import { useUiStore } from '../../store/ui-store';

// The dispatcher moved to the frame (Phase 123 Theme D) — `packages/frame/src/commands/
// use-keybindings.ts`, where every suite app mounts it. Studio keeps this path, and binds the
// three things only Studio's window has: the embedded browser pane, and the overlays that own the
// keyboard while they are up.
export { shouldEscapeTerminal } from '@midnite/studio-frame';

/**
 * Studio's overlays. A module constant, so the frame's listener is not re-registered per render.
 *
 * - The quick-access menu (Phase 58 Theme E): while it is open every bound chord falls through —
 *   its own single-letter mnemonics are not in `DEFAULT_KEYMAP` at all, so this exists for every
 *   chord that IS bound, keeping the menu in uncontested ownership of the keyboard.
 * - The browser view switcher: only its own chord (`browser.toggle`) resolves, to cycle layouts
 *   while Mod is held.
 * - The Mod+T terminal/agent switcher HUD: only `terminal.new` resolves, so repeated taps keep
 *   advancing the highlight.
 */
const STUDIO_GATES: KeybindingGates = {
  browserOpen: () => useUiStore.getState().browserOpen,
  blocked: (command: CommandId) => {
    const ui = useUiStore.getState();
    if (ui.quickAccessOpen) return true;
    if (ui.browserSwitcherOpen && command !== 'browser.toggle') return true;
    return ui.terminalSwitcherOpen && command !== 'terminal.new';
  },
};

export function useKeybindings(runtime: CommandRuntime): void {
  useFrameKeybindings(runtime, STUDIO_GATES);
}
