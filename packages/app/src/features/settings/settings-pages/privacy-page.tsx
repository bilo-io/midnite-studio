import { SettingsAccordion } from '../settings-section';
import { LuMapPin, LuShieldCheck } from 'react-icons/lu';

import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { useUiStore } from '../../../store/ui-store';

/**
 * Phase 76 Theme D — privacy controls for network lookups the renderer would
 * otherwise make silently on first load. Phase 117 Theme C adds the browser's
 * reputation feeds: each one a Phase 115 `EGRESS_HOSTS` entry, off by default.
 */
export function PrivacyPage() {
  const locateByIpEnabled = useUiStore((s) => s.locateByIpEnabled);
  const setLocateByIpEnabled = useUiStore((s) => s.setLocateByIpEnabled);
  const reputationFeeds = useUiStore((s) => s.browserReputationFeeds);
  const setReputationFeed = useUiStore((s) => s.setBrowserReputationFeed);

  return (
    <div className="flex flex-col gap-3">
      <SettingsAccordion title="Location" icon={<LuMapPin className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="locate-by-ip"
            label="Locate me by IP"
            description="When off, title-bar weather never calls ipwho.is. Set a city manually or enable this switch to allow IP geolocation as a fallback after browser geolocation is denied."
            on={locateByIpEnabled}
            onToggle={(_id, next) => setLocateByIpEnabled(next)}
          />
        </div>
      </SettingsAccordion>
      <SettingsAccordion title="Reputation feeds" icon={<LuShieldCheck className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <p className="text-[11px] text-muted-foreground">
            Open lists of known-bad sites the embedded browser checks every address against. Each list is downloaded
            whole every six hours and matched on this machine, so no address you visit is ever sent anywhere. While
            both are off, the site badge reads &ldquo;No reputation data&rdquo;.
          </p>
          <SettingsSwitchRow
            id="reputation-feed-urlhaus"
            label="URLhaus (abuse.ch)"
            description="Sites distributing malware. Downloaded from urlhaus.abuse.ch; the list is CC0."
            on={reputationFeeds.urlhaus}
            onToggle={(_id, next) => setReputationFeed('urlhaus', next)}
          />
          <SettingsSwitchRow
            id="reputation-feed-openphish"
            label="OpenPhish"
            description="Phishing pages, from the OpenPhish community feed at openphish.com."
            on={reputationFeeds.openphish}
            onToggle={(_id, next) => setReputationFeed('openphish', next)}
          />
        </div>
      </SettingsAccordion>
    </div>
  );
}
