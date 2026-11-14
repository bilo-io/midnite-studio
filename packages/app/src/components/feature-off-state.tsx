import { useFeatureTogglesStore } from '@midnite/studio-frame';
import { featureToggle, requirementsOf, type FeatureToggleId } from '@midnite/studio-shared';
import { LuPowerOff } from 'react-icons/lu';

import { useUiStore } from '../store/ui-store';

/**
 * What a view shows when its feature is switched off (Phase 135 Theme C) — reached by a deep link, a stale
 * active view or anything else that names the view directly. The rail and palette already leave it out; this
 * is the one place that says why, with the switch to bring it back.
 */
export function FeatureOffState({ feature }: { feature: FeatureToggleId }) {
  const spec = featureToggle(feature);
  const disabled = useFeatureTogglesStore((s) => s.disabled);
  const setEnabled = useFeatureTogglesStore((s) => s.setEnabled);
  const alsoOn = requirementsOf(feature)
    .filter((id) => id !== feature && disabled.includes(id))
    .map((id) => featureToggle(id).label);

  return (
    <div
      data-testid="feature-off-state"
      data-feature={feature}
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <LuPowerOff aria-hidden className="h-8 w-8 text-muted-foreground" />
      <h2 className="text-base font-semibold text-foreground">{spec.label} is switched off</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{spec.description}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Its data is kept. Turn it back on to pick up where you left off
        {alsoOn.length > 0 ? ` (this also turns on ${alsoOn.join(', ')})` : ''}.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEnabled(feature, true)}
          className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Turn on {spec.label}
        </button>
        <button
          type="button"
          onClick={() => {
            useUiStore.getState().setActiveView('settings');
            useUiStore.getState().setSettingsPage('features');
          }}
          className="h-7 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Open Settings ▸ Features
        </button>
      </div>
    </div>
  );
}
