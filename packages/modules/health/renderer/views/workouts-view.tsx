import { useState } from 'react';
import { LuEllipsis, LuPlus } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';
import type { HealthPlan } from '@midnite/studio-shared';

import { todayKey } from '../data/dates';
import { HealthMissing } from '../data/health-missing';
import { healthBridge, usePlans, useProfile, useRemovePlan, useWritePlan } from '../data/use-health';
import { blankPlan, duplicatePlan, planFromStarter, STARTERS } from '../workouts/starters';
import { PlanEditor } from './plan-editor';
import { SessionSheet } from './session-sheet';

const exerciseCount = (p: HealthPlan): number => p.days.reduce((n, d) => n + d.exercises.length, 0);

/** Workouts — plans, starter plans, the editor and the session log. */
export function WorkoutsView() {
  const plans = usePlans();
  const profile = useProfile();
  const write = useWritePlan();
  const remove = useRemovePlan();
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [openId, setOpenId] = useState<string | null>(null);
  const [logging, setLogging] = useState<{ plan: HealthPlan; dayId: string } | null>(null);
  if (healthBridge() === undefined) return <HealthMissing />;
  if (plans.isError) {
    return (
      <p className="p-8 text-sm" role="alert">
        Couldn't load your plans.
      </p>
    );
  }

  const list = plans.data?.plans ?? [];
  const units = profile.data?.units ?? 'metric';
  const open = list.find((p) => p.id === openId);

  const create = (plan: HealthPlan, andOpen: boolean) => {
    write.mutate(plan);
    if (andOpen) setOpenId(plan.id);
  };

  const cardMenu = (e: React.MouseEvent, plan: HealthPlan) =>
    dialogs.openMenu?.({ clientX: e.clientX, clientY: e.clientY }, [
      {
        label: 'Rename',
        onSelect: () =>
          dialogs.prompt?.({
            title: 'Rename plan',
            label: 'Name',
            initialValue: plan.name,
            confirmLabel: 'Rename',
            validate: (v) => (v.trim() === '' ? 'Give the plan a name' : v.length > 80 ? 'At most 80 characters' : null),
            onConfirm: (v) => {
              write.mutate({ ...plan, name: v.trim(), updatedAt: new Date().toISOString() });
              dialogs.close();
            },
          }),
      },
      { label: 'Duplicate', onSelect: () => write.mutate(duplicatePlan(plan)) },
      {
        label: 'Delete',
        danger: true,
        onSelect: () =>
          dialogs.confirm({
            title: `Move '${plan.name}' to the Trash?`,
            body: 'Logged sessions stay in your history. You can restore the plan from the Trash in Finder.',
            confirmLabel: 'Move to Trash',
            danger: true,
            blastRadius: { count: 1, sample: [] },
            blastRadiusKind: 'trash',
            onConfirm: () => {
              remove.mutate(plan.id);
              dialogs.close();
            },
          }),
      },
    ]);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6" data-testid="workouts-view">
      {open ? (
        <PlanEditor key={open.id} plan={open} onBack={() => setOpenId(null)} onLogSession={(plan, dayId) => setLogging({ plan, dayId })} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Plans</h3>
            <button type="button" className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => create(blankPlan(), true)}>
              <LuPlus aria-hidden /> New plan
            </button>
          </div>
          {plans.data !== undefined && plans.data.quarantined > 0 ? <p className="text-xs opacity-70">{plans.data.quarantined} unreadable plan file(s) were set aside.</p> : null}
          {list.length === 0 ? (
            <p className="text-xs opacity-70" data-testid="plans-empty">
              No plans yet. Start from one below, or make your own.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3" data-testid="plan-card">
                  <button type="button" className="flex-1 text-left" onClick={() => setOpenId(p.id)}>
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="ml-2 text-xs opacity-60">
                      {p.days.length} {p.days.length === 1 ? 'day' : 'days'} · {exerciseCount(p)} exercises
                    </span>
                  </button>
                  <button type="button" aria-label={`Actions for ${p.name}`} className="rounded p-1 hover:bg-accent" onClick={(e) => cardMenu(e, p)}>
                    <LuEllipsis aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-sm font-semibold">Starter plans</h3>
          <ul className="flex flex-col gap-2">
            {STARTERS.map((s) => (
              <li key={s.key} className="flex items-center justify-between rounded-lg border border-border p-3">
                <span>
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="ml-2 text-xs opacity-60">{s.summary}</span>
                </span>
                <button type="button" className="rounded px-3 py-1 text-xs hover:bg-accent" aria-label={`Use ${s.name}`} onClick={() => create(planFromStarter(s), false)}>
                  Use
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {logging !== null ? <SessionSheet plan={logging.plan} dayId={logging.dayId} date={todayKey()} units={units} onClose={() => setLogging(null)} /> : null}
    </div>
  );
}
