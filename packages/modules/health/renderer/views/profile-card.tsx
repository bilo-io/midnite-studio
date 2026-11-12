import { useState } from 'react';

import { Choice, SwitchRow } from '@midnite/studio-frame';
import type { HealthProfile } from '@midnite/studio-shared';

import { bmi, bmiBand, bmrMifflin, ageFrom, hasTarget, kcalTarget, tdee } from '../calc/body';
import { cmToFtIn, ftInToCm } from '../calc/units';
import { usePutProfile } from '../data/use-health';
import { NumField } from './num-field';

export const NOT_MEDICAL = 'Not medical advice. Talk to a clinician before big changes.';

const ACTIVITY: [HealthProfile['activity'], string, string][] = [
  ['sedentary', 'Sedentary', 'Little or no exercise, desk job'],
  ['light', 'Light', 'Exercise 1 to 3 days a week'],
  ['moderate', 'Moderate', 'Exercise 3 to 5 days a week'],
  ['active', 'Active', 'Hard exercise 6 to 7 days a week'],
  ['very-active', 'Very active', 'Physical job or twice-daily training'],
];

export const defaultProfile = (): HealthProfile => ({
  version: 1,
  units: 'metric',
  sex: 'unspecified',
  activity: 'sedentary',
  goal: 'maintain',
  updatedAt: new Date().toISOString(),
});

const MISSING_LABEL = { weight: 'weight', height: 'height', birthYear: 'birth year' } as const;

/** BMI, BMR, TDEE and the daily target — every number an estimate. */
export function DerivedBlock({ profile, latestWeightKg }: { profile: HealthProfile | null; latestWeightKg: number | undefined }) {
  const year = new Date().getFullYear();
  const target = kcalTarget(profile, latestWeightKg, year);
  const canBody = profile?.heightCm !== undefined && latestWeightKg !== undefined;
  const canBmr = canBody && profile?.birthYear !== undefined;
  const bmiValue = canBody ? bmi(latestWeightKg, profile.heightCm!) : undefined;
  const bmr = canBmr ? bmrMifflin({ weightKg: latestWeightKg, heightCm: profile.heightCm!, age: ageFrom(profile.birthYear!, year), sex: profile.sex }) : undefined;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-xs" data-testid="derived">
      {bmiValue !== undefined ? (
        <p>
          BMI <b>{bmiValue.toFixed(1)}</b> · {bmiBand(bmiValue)} <span className="opacity-60">(estimate)</span>
        </p>
      ) : null}
      {bmr !== undefined && profile ? (
        <>
          <p>
            BMR <b>{Math.round(bmr)} kcal</b> <span className="opacity-60">(estimate)</span>
          </p>
          <p>
            TDEE <b>{Math.round(tdee(bmr, profile.activity))} kcal</b> <span className="opacity-60">(estimate)</span>
          </p>
        </>
      ) : null}
      {hasTarget(target) ? (
        <p data-testid="target">
          Daily target <b>{target.kcal} kcal</b> <span className="opacity-60">({target.source === 'override' ? 'your own' : 'estimate'})</span>
          {target.floored ? <span className="ml-1 opacity-70">Held at the 1200 kcal minimum.</span> : null}
        </p>
      ) : (
        <p className="opacity-70" data-testid="target-missing">
          Add your {target.missing.map((m) => MISSING_LABEL[m]).join(', ')} to estimate a target.
        </p>
      )}
      <p className="opacity-60">{NOT_MEDICAL}</p>
    </div>
  );
}

function HeightField({ profile, save }: { profile: HealthProfile; save: (p: Partial<HealthProfile>) => void }) {
  const [hint, setHint] = useState<string | null>(null);
  if (profile.units === 'metric') {
    return <NumField label="Height" unit="cm" value={profile.heightCm === undefined ? undefined : Math.round(profile.heightCm)} min={50} max={272} integer onCommit={(v) => save({ heightCm: v })} />;
  }
  const split = profile.heightCm === undefined ? undefined : cmToFtIn(profile.heightCm);
  const apply = (ft: number | undefined, inches: number | undefined) => {
    if (ft === undefined && inches === undefined) {
      setHint(null);
      return save({ heightCm: undefined });
    }
    const cm = ftInToCm(ft ?? 0, inches ?? 0);
    if (cm < 50 || cm > 272) return setHint('Between 50 and 272 cm');
    setHint(null);
    save({ heightCm: Math.round(cm * 10) / 10 });
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Height" unit="ft" value={split?.ft} min={0} max={8} integer onCommit={(v) => apply(v, split?.in)} />
        <NumField label="Inches" unit="in" value={split?.in} min={0} max={11.5} step="0.5" onCommit={(v) => apply(split?.ft, v)} />
      </div>
      {hint ? (
        <p className="text-[11px] text-destructive" role="alert">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The all-optional profile form; each field saves on blur or change. */
export function ProfileCard({ profile, latestWeightKg }: { profile: HealthProfile | null; latestWeightKg: number | undefined }) {
  const put = usePutProfile();
  const base = profile ?? defaultProfile();
  const save = (patch: Partial<HealthProfile>) => put.mutate({ ...base, ...patch, updatedAt: new Date().toISOString() });
  const override = base.kcalTargetOverride !== undefined;
  const estimate = kcalTarget({ ...base, kcalTargetOverride: undefined }, latestWeightKg, new Date().getFullYear());
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-label="Profile">
      <h3 className="text-sm font-semibold">Profile — all optional</h3>
      <Choice label="Units" hint="Only changes how numbers are shown." value={base.units} onChange={(units) => save({ units })} options={[['metric', 'Metric'], ['imperial', 'Imperial']]} />
      <Choice label="Sex" hint="Used only for the calorie estimate." value={base.sex} onChange={(sex) => save({ sex })} options={[['female', 'Female'], ['male', 'Male'], ['unspecified', 'Prefer not to say']]} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Birth year" value={base.birthYear} min={1900} max={2100} integer onCommit={(v) => save({ birthYear: v })} />
        <HeightField profile={base} save={save} />
      </div>
      <Choice label="Activity" hint="How active a typical week is." value={base.activity} onChange={(activity) => save({ activity })} options={ACTIVITY} />
      <Choice label="Goal" hint="Shifts the daily target." value={base.goal} onChange={(goal) => save({ goal })} options={[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']]} />
      <SwitchRow
        id="kcal-override"
        label="Set my own calorie target"
        on={override}
        onToggle={(_id, on) => save({ kcalTargetOverride: on ? (hasTarget(estimate) ? estimate.kcal : 2000) : undefined })}
      />
      {override ? <NumField label="Calorie target" unit="kcal" value={base.kcalTargetOverride} min={800} max={6000} integer onCommit={(v) => save({ kcalTargetOverride: v })} /> : null}
      <DerivedBlock profile={profile} latestWeightKg={latestWeightKg} />
    </section>
  );
}
