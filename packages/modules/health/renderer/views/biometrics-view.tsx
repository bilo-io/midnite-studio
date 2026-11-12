import { useState } from 'react';

import { todayKey } from '../data/dates';
import { healthBridge, useLatestWeight, useProfile } from '../data/use-health';
import { HealthMissing } from '../data/health-missing';
import { DataCard } from './data-card';
import { MeasurementLog } from './measurement-log';
import { ProfileCard } from './profile-card';

/** Biometrics — the optional profile with its estimates, and the measurement log. */
export function BiometricsView() {
  const profile = useProfile();
  const { latest } = useLatestWeight();
  const [date, setDate] = useState(todayKey);
  if (healthBridge() === undefined) return <HealthMissing />;
  if (profile.isError) {
    return (
      <p className="p-8 text-sm" role="alert">
        Couldn't load your profile.
      </p>
    );
  }
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6" data-testid="biometrics-view">
      <ProfileCard profile={profile.data ?? null} latestWeightKg={latest?.kg} />
      <MeasurementLog units={profile.data?.units ?? 'metric'} date={date} onDate={setDate} />
      <DataCard />
    </div>
  );
}
