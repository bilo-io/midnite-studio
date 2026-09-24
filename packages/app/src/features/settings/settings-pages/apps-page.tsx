import { Accordion } from '@bilo-io/ui';
import { APP_DEFINITIONS, APP_IDS } from '@midnite/studio-shared';
import { LuLayoutGrid } from 'react-icons/lu';

import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { APP_ICON } from '../../../components/icons';
import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/**
 * The third-party apps rail's on/off switches (Phase 83 Theme E).
 *
 * A dedicated page rather than a section folded into an existing one — the
 * phase doc's own recommendation: Settings is already split into topic pages
 * (Phase 16), and three toggles plus room for future apps warrant their own
 * page rather than crowding Browser's or another page's.
 *
 * Each switch is the WHOLE of what enabling/disabling does from here:
 * `enabledApps` (`ui-store.ts`) is the persisted source of truth,
 * `use-apps-sync.ts` is what actually calls `bridge().apps.enable`/`disable`
 * in response to it changing, and disabling never touches the app's own
 * `persist:app-<id>` partition — the same session is there, logged in, the
 * next time it is switched back on.
 */
export function AppsPage() {
  const enabledApps = useUiStore((s) => s.enabledApps);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Third-party apps" icon={<LuLayoutGrid className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <p className="text-[11px] text-muted-foreground">
            Each app runs in its own isolated, persistent browser session — enabling one starts
            its own sign-in, and turning it off only hides it. Its session survives on disk until
            you turn it back on.
          </p>
          {APP_IDS.map((id) => {
            const Icon = APP_ICON[id];
            const definition = APP_DEFINITIONS[id];
            const enabled = enabledApps.includes(id);
            const discardIdle = useUiStore.getState().appDiscardIdle[id] ?? false;
            return (
              <Field
                key={id}
                label={definition.label}
                hint={new URL(definition.launchUrl).host}
              >
                <div className="flex flex-col gap-1">
                  <SettingsSwitchRow
                    id={id}
                    label={definition.label}
                    icon={<Icon aria-hidden className="h-4 w-4 shrink-0" />}
                    on={enabled}
                    onToggle={(_id, next) => useUiStore.getState().setAppEnabled(id, next)}
                    testId={`apps-settings-toggle-${id}`}
                  />
                  {enabled ? (
                    <SettingsSwitchRow
                      id={`${id}-discard-idle`}
                      label="Discard when idle (10 min hidden)"
                      on={discardIdle}
                      onToggle={(_id, next) => useUiStore.getState().setAppDiscardIdle(id, next)}
                      testId={`apps-settings-discard-toggle-${id}`}
                      className="ml-5 !w-auto !text-[11px]"
                    />
                  ) : null}
                </div>
              </Field>
            );
          })}
        </div>
      </Accordion>
    </div>
  );
}
