import { LuBot, LuBotOff } from 'react-icons/lu';

import { Tooltip } from '../../components/tooltip';
import { useUiStore } from '../../store/ui-store';

/**
 * The composer's companion switch — show, hide or enable the companion from
 * the chat box.
 *
 * **No state of its own.** The companion's master switch is
 * `ui-store.companionEnabled` (Settings ▸ Companion's toggle) and its panel is
 * `companionPanelOpen`; this button reads and writes exactly those, through the
 * same setters the quick-access menu and the `companion.toggle` command use, so
 * flipping it here and flipping it in Settings can never disagree.
 *
 * Three states, one button:
 * - **off** (companion disabled) → click enables it and opens the panel;
 * - **hidden** (enabled, panel closed) → click shows the panel;
 * - **shown** (enabled, panel open) → click hides the panel — it stays enabled.
 */
export type CompanionToggleState = 'off' | 'hidden' | 'shown';

export function companionToggleState(enabled: boolean, panelOpen: boolean): CompanionToggleState {
  return !enabled ? 'off' : panelOpen ? 'shown' : 'hidden';
}

const LABEL: Record<CompanionToggleState, string> = {
  off: 'Enable the companion',
  hidden: 'Show the companion',
  shown: 'Hide the companion',
};

export function CompanionToggle() {
  const enabled = useUiStore((s) => s.companionEnabled);
  const panelOpen = useUiStore((s) => s.companionPanelOpen);
  const state = companionToggleState(enabled, panelOpen);

  const onClick = () => {
    const ui = useUiStore.getState();
    if (state === 'off') {
      ui.setCompanionEnabled(true);
      ui.setCompanionPanelOpen(true);
    } else if (state === 'hidden') {
      ui.setCompanionPanelOpen(true);
    } else {
      ui.setCompanionPanelOpen(false);
    }
  };

  const Icon = state === 'off' ? LuBotOff : LuBot;
  return (
    <Tooltip label={LABEL[state]}>
      <button
        type="button"
        aria-label="Companion"
        aria-pressed={state === 'shown'}
        data-testid="chat-companion-toggle"
        data-state={state}
        onClick={onClick}
        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
          state === 'shown' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
