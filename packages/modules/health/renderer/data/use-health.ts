import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { bridge, useFrameChrome } from '@midnite/studio-frame';
import type {
  GitOpResult,
  HealthBridge,
  HealthDate,
  HealthDay,
  HealthFood,
  HealthMonthLog,
  HealthPlan,
  HealthProfile,
} from '@midnite/studio-shared';

/** The Health bridge, or `undefined` outside the Health host (Studio carries none). */
export const healthBridge = (): HealthBridge | undefined => bridge()?.health;

/** A `{ ok: false }` result throws so the view's `isError` branch renders. */
function unwrap<T = void>(res: GitOpResult<T> | GitOpResult | undefined): T {
  if (res === undefined) throw new Error('Health runs in its own app.');
  if (!res.ok) throw new Error(res.kind === 'error' ? res.message : 'Conflict');
  return (res as { value: T }).value;
}

export const profileKey = ['health', 'profile'] as const;
export const monthsKey = (from: string, to: string) => ['health', 'months', from, to] as const;
export const foodsKey = ['health', 'foods'] as const;
export const plansKey = ['health', 'plans'] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: async () => unwrap(await healthBridge()?.getProfile()).profile,
  });
}

export type MonthsData = { months: HealthMonthLog[]; quarantined: number };

/** Months from `from` to `to` (`YYYY-MM`, at most 36). */
export function useMonths(from: string, to: string) {
  return useQuery({
    queryKey: monthsKey(from, to),
    queryFn: async (): Promise<MonthsData> => unwrap(await healthBridge()?.getMonths({ from, to })),
  });
}

export function useFoods() {
  return useQuery({
    queryKey: foodsKey,
    queryFn: async () => unwrap(await healthBridge()?.getFoods()).foods,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: async () => unwrap(await healthBridge()?.listPlans()),
  });
}

/** Folds one saved day into a cached months answer, adding the month when the range covers it. */
export function patchMonths(data: MonthsData, key: readonly unknown[], date: HealthDate, day: HealthDay, empty: boolean): MonthsData {
  const monthKey = date.slice(0, 7);
  const [from, to] = [key[2], key[3]] as [string, string];
  const id = `log-${monthKey}`;
  const existing = data.months.find((m) => m.id === id);
  if (existing === undefined && (monthKey < from || monthKey > to)) return data;
  const updatedAt = new Date().toISOString();
  const base: HealthMonthLog = existing ?? { version: 1, id, updatedAt, days: {} };
  const days = { ...base.days };
  if (empty) delete days[date];
  else days[date] = day;
  const next = { ...base, days, updatedAt };
  const months = existing === undefined ? [...data.months, next].sort((a, b) => (a.id < b.id ? -1 : 1)) : data.months.map((m) => (m.id === id ? next : m));
  return { ...data, months };
}

const isEmptyDay = (d: HealthDay): boolean =>
  d.weightKg === undefined &&
  d.bodyFatPct === undefined &&
  d.waistCm === undefined &&
  d.restingHr === undefined &&
  d.sleepHours === undefined &&
  (d.note === undefined || d.note === '') &&
  d.meals.length === 0 &&
  d.sessions.length === 0;

function monthsSnapshots(client: QueryClient) {
  return client.getQueriesData<MonthsData>({ queryKey: ['health', 'months'] });
}

/**
 * Saves one day. Optimistic: every cached `months` query holding that month shows the change at once, and a
 * `{ ok: false }` answer rolls it back with a notice.
 */
export function usePutDay() {
  const client = useQueryClient();
  const dialogs = useFrameChrome().useDialogs();
  return useMutation({
    mutationFn: async (req: { date: HealthDate; day: HealthDay }) => unwrap(await healthBridge()?.putDay(req)),
    onMutate: async ({ date, day }) => {
      await client.cancelQueries({ queryKey: ['health', 'months'] });
      const previous = monthsSnapshots(client);
      for (const [key, data] of previous) {
        if (data !== undefined) client.setQueryData(key, patchMonths(data, key, date, day, isEmptyDay(day)));
      }
      return { previous };
    },
    onError: (_err, _req, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) client.setQueryData(key, data);
      dialogs.notify({ title: "Couldn't save", body: 'Your last change was not saved. Try again.' });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['health', 'months'] }),
  });
}

export function usePutProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (profile: HealthProfile) => unwrap(await healthBridge()?.putProfile({ profile })),
    onSettled: () => void client.invalidateQueries({ queryKey: profileKey }),
  });
}

export function useUpsertFood() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (food: HealthFood) => unwrap(await healthBridge()?.upsertFood({ food })),
    onSettled: () => void client.invalidateQueries({ queryKey: foodsKey }),
  });
}

export function useRemoveFood() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await healthBridge()?.removeFood({ id })),
    onSettled: () => void client.invalidateQueries({ queryKey: foodsKey }),
  });
}

export function useWritePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (plan: HealthPlan) => unwrap(await healthBridge()?.writePlan({ plan })),
    onSettled: () => void client.invalidateQueries({ queryKey: plansKey }),
  });
}

export function useRemovePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await healthBridge()?.removePlan({ id })),
    onSettled: () => void client.invalidateQueries({ queryKey: plansKey }),
  });
}
