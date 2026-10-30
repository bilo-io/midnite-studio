import { LuActivity } from 'react-icons/lu';

import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
  METRIC_IDS,
  type MetricId,
} from '@midnite/studio-shared';

import { Choice, Field } from '../form/field';
import { SettingsSwitchRow } from '../form/settings-switch-row';
import { METRIC_LABELS, metricColor } from '../metrics/metric-palette';
import { useMonitorPrefsStore } from '../prefs/monitor-prefs-store';
import { SettingsAccordion } from './settings-section';

/**
 * The status bar monitor segment's preferences (Phase 123 Theme H): which readouts show and how often
 * they refresh. Both live in the suite-prefs file's `monitor` group, so every app's bar agrees.
 *
 * This is the preference half of Studio's Monitor & Diagnostics page, moved here unchanged; Studio keeps the
 * repository-trust half beside it. A suite app offers the page only when its bar has a monitor segment
 * (`SuiteAppShell` checks `statusPanels.monitor`), so it never configures a readout that is not there.
 */
export function MonitorMetricsSection() {
  const hidden = useMonitorPrefsStore((s) => s.hiddenMetrics);
  const toggleMetric = useMonitorPrefsStore((s) => s.toggleMetric);
  const idleMs = useMonitorPrefsStore((s) => s.metricsIdleIntervalMs);
  const setIdleMs = useMonitorPrefsStore((s) => s.setMetricsIdleInterval);

  return (
    <SettingsAccordion title="Metrics" icon={<LuActivity className="h-4 w-4" />} defaultOpen>
      <div className="flex flex-col gap-4 p-3">
        <Field
          label="Metrics shown"
          hint="Readouts in the footer's right cluster. A metric this machine cannot report is never shown, whatever is ticked here."
        >
          <ul className="flex flex-col">
            {METRIC_IDS.map((id: MetricId) => (
              <li key={id}>
                <SettingsSwitchRow
                  id={id}
                  label={METRIC_LABELS[id]}
                  icon={<span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: metricColor(id) }} />}
                  on={!hidden.includes(id)}
                  onToggle={() => toggleMetric(id)}
                />
              </li>
            ))}
          </ul>
        </Field>

        <Choice<string>
          label="Refresh interval"
          hint={`How often the footer samples when the flyout is closed. Opening it always escalates to ${
            METRICS_ACTIVE_INTERVAL_MS / 1000
          }s, and sampling stops entirely when the window is not in front.`}
          value={String(idleMs)}
          onChange={(value) => setIdleMs(Number(value))}
          options={[
            [String(METRICS_ACTIVE_INTERVAL_MS), '2 seconds'],
            [String(METRICS_IDLE_INTERVAL_MS), '5 seconds'],
            ['15000', '15 seconds'],
            ['30000', '30 seconds'],
          ]}
        />
      </div>
    </SettingsAccordion>
  );
}

/** The suite Monitor page: the metrics section alone (a suite app has no repository to trust). */
export function SuiteMonitorPage() {
  return (
    <div className="flex flex-col gap-3">
      <MonitorMetricsSection />
    </div>
  );
}
