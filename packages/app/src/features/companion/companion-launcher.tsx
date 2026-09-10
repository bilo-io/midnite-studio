import { Tooltip } from '../../components/tooltip';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { COMPANION_LOOK } from './companion-look';

/**
 * Companion launcher button in the title bar, positioned to the right of
 * the loop launchers.
 *
 * Provides a dedicated one-click toggle for the Companion panel:
 * - Shows the dynamic icon and label matching the companion state (e.g. Ready, Thinking, etc.)
 * - Displays active/open state when the companion panel is open
 * - Disabled when companion is not enabled in settings
 */
export function CompanionLauncher() {
  const companionEnabled = useUiStore((s) => s.companionEnabled);
  const companionPanelOpen = useUiStore((s) => s.companionPanelOpen);
  const toggleCompanionPanel = useUiStore((s) => s.toggleCompanionPanel);
  const state = useCompanionStore((s) => s.state);

  const look = COMPANION_LOOK[state];
  const Icon = look.icon;
  const label = companionEnabled ? `Companion (${look.label})` : 'Companion (Disabled in Settings)';

  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        data-testid="companion-launcher"
        aria-label="Companion"
        aria-pressed={companionPanelOpen}
        disabled={!companionEnabled}
        onClick={() => {
          if (!companionEnabled) return;
          toggleCompanionPanel();
        }}
        className={`loop-launcher flex items-center rounded px-0.5 transition-colors ${
          companionPanelOpen ? 'is-open text-foreground' : 'text-muted-foreground hover:text-foreground'
        } ${!companionEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
