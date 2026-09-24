import { Accordion } from '@bilo-io/ui';
import { LuMapPin } from 'react-icons/lu';

import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { useUiStore } from '../../../store/ui-store';

/**
 * Phase 76 Theme D — privacy controls for network lookups the renderer would
 * otherwise make silently on first load.
 */
export function PrivacyPage() {
  const locateByIpEnabled = useUiStore((s) => s.locateByIpEnabled);
  const setLocateByIpEnabled = useUiStore((s) => s.setLocateByIpEnabled);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Location" icon={<LuMapPin className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="locate-by-ip"
            label="Locate me by IP"
            description="When off, title-bar weather never calls ipwho.is. Set a city manually or enable this switch to allow IP geolocation as a fallback after browser geolocation is denied."
            on={locateByIpEnabled}
            onToggle={(_id, next) => setLocateByIpEnabled(next)}
          />
        </div>
      </Accordion>
    </div>
  );
}
