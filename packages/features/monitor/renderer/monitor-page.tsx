import { useMetricsStream } from '@midnite/studio-frame';

import { CapacitySection } from './capacity-section';
import { CrashLogSection } from './crash-log-section';
import { SessionsSection } from './sessions-section';
import { SystemHealthSection } from './system-health-section';
import { TimelinesSection } from './timelines-section';

/**
 * The Monitor view (Phase 113 Theme I): the machine's readouts in one place —
 * CPU, memory and GPU timelines, disk and battery, toolchain health and the
 * crash log. Samples are requested at the active cadence only while it is
 * mounted (`useMetricsStream` ref-counts the sampler across callers).
 */
export function MonitorPage() {
  useMetricsStream({ detailed: true });
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-lg font-semibold">Monitor</h1>
        <p className="text-xs text-muted-foreground">Sampling every 2s while this is open.</p>
      </header>
      <TimelinesSection />
      <CapacitySection />
      <SessionsSection />
      <SystemHealthSection />
      <CrashLogSection />
    </div>
  );
}
