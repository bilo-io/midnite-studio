import { Accordion } from '@bilo-io/ui';
import { LuMapPin } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

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
          <Field
            label="Locate me by IP"
            hint="When off, title-bar weather never calls ipwho.is. Set a city manually or enable this switch to allow IP geolocation as a fallback after browser geolocation is denied."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={locateByIpEnabled}
                onChange={(event) => setLocateByIpEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Locate me by IP
            </label>
          </Field>
        </div>
      </Accordion>
    </div>
  );
}
