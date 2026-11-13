import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { createJsonDirStore, ensurePrivateDir, writePrivateFile, type JsonDirStore } from '@midnite/studio-runtime';
import {
  healthMonthSpan,
  migrateHealthFoods,
  migrateHealthMonthLog,
  migrateHealthPlan,
  migrateHealthProfile,
  type HealthDate,
  type HealthDay,
  type HealthFood,
  type HealthFoodLibrary,
  type HealthMonthLog,
  type HealthPlan,
  type HealthProfile,
} from '@midnite/studio-shared';

export type HealthStore = {
  getProfile(): Promise<HealthProfile | null>;
  putProfile(profile: HealthProfile): Promise<void>;
  getMonths(from: string, to: string): Promise<{ months: HealthMonthLog[]; quarantined: number }>;
  putDay(date: HealthDate, day: HealthDay): Promise<{ updatedAt: string }>;
  getFoods(): Promise<HealthFood[]>;
  upsertFood(food: HealthFood): Promise<void>;
  removeFood(id: string): Promise<void>;
  listPlans(): Promise<{ plans: HealthPlan[]; quarantined: number }>;
  writePlan(plan: HealthPlan): Promise<void>;
  removePlan(id: string): Promise<void>;
  /** Every file's content, for Theme G's export. */
  readAll(): Promise<{ profile: HealthProfile | null; foods: HealthFood[]; plans: HealthPlan[]; months: HealthMonthLog[] }>;
  eraseAll(): Promise<void>;
};

const isEmptyDay = (d: HealthDay): boolean =>
  d.weightKg === undefined &&
  d.bodyFatPct === undefined &&
  d.waistCm === undefined &&
  d.restingHr === undefined &&
  d.sleepHours === undefined &&
  (d.note === undefined || d.note === '') &&
  d.meals.length === 0 &&
  d.sessions.length === 0;

/** `YYYY-MM` for each month from `from` to `to` inclusive. */
function monthKeys(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let i = 0; i < healthMonthSpan(from, to); i++) {
    const idx = fy * 12 + (fm - 1) + i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * The Health store (Phase 128 Theme B.3) under `dataDir`: `profile.json`, `foods.json`, `logs/log-YYYY-MM.json`
 * (one file per calendar month) and `plans/plan-<id>.json`. Every mutation runs through one promise chain so
 * two quick writes to one month cannot interleave their read-modify-write (Decision 5). Removing a plan and
 * erasing everything go to the OS Trash, never `unlink`.
 */
export function createHealthStore(dataDir: string, trashItem: (path: string) => Promise<void>): HealthStore {
  const months: JsonDirStore<HealthMonthLog> = createJsonDirStore<HealthMonthLog>({
    dir: join(dataDir, 'logs'),
    prefix: 'log-',
    idPattern: /^log-\d{4}-(0[1-9]|1[0-2])$/,
    parse: migrateHealthMonthLog,
  });
  const plans: JsonDirStore<HealthPlan> = createJsonDirStore<HealthPlan>({
    dir: join(dataDir, 'plans'),
    prefix: 'plan-',
    idPattern: /^plan-[a-z0-9]{12}$/,
    parse: migrateHealthPlan,
  });
  const profilePath = join(dataDir, 'profile.json');
  const foodsPath = join(dataDir, 'foods.json');

  let chain: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  /** A single-file read: a corrupt file is renamed aside (never deleted) and reads as "none". */
  async function readSingle<T>(path: string, migrate: (raw: unknown) => T | null): Promise<T | null> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      return null;
    }
    let value: T | null = null;
    try {
      value = migrate(JSON.parse(text));
    } catch {
      value = null;
    }
    if (value === null) {
      try {
        await rename(path, `${path}.corrupt-${Date.now()}`);
      } catch {
        // best effort
      }
    }
    return value;
  }

  async function writeSingle(path: string, value: unknown): Promise<void> {
    await ensurePrivateDir(dataDir);
    await writePrivateFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  const readFoods = async (): Promise<HealthFood[]> => (await readSingle<HealthFoodLibrary>(foodsPath, migrateHealthFoods))?.foods ?? [];
  const writeFoods = (foods: HealthFood[]): Promise<void> =>
    writeSingle(foodsPath, { version: 1, updatedAt: new Date().toISOString(), foods } satisfies HealthFoodLibrary);

  return {
    getProfile: () => readSingle(profilePath, migrateHealthProfile),
    putProfile: (profile) => serialize(() => writeSingle(profilePath, profile)),
    async getMonths(from, to) {
      const found: HealthMonthLog[] = [];
      let quarantined = 0;
      for (const key of monthKeys(from, to)) {
        const id = `log-${key}`;
        const log = await months.read(id);
        if (log !== null) {
          found.push(log);
          continue;
        }
        // Unreadable (as opposed to missing) files are set aside and counted.
        const path = months.pathOf(id);
        try {
          await readFile(path, 'utf8');
        } catch {
          continue;
        }
        quarantined += 1;
        try {
          await rename(path, `${path}.corrupt-${Date.now()}`);
        } catch {
          // best effort
        }
      }
      return { months: found, quarantined };
    },
    putDay(date, day) {
      return serialize(async () => {
        const id = `log-${date.slice(0, 7)}`;
        const updatedAt = new Date().toISOString();
        const existing = (await months.read(id)) ?? { version: 1 as const, id, updatedAt, days: {} };
        const days = { ...existing.days };
        if (isEmptyDay(day)) delete days[date];
        else days[date] = day;
        await months.write({ ...existing, days, updatedAt });
        return { updatedAt };
      });
    },
    getFoods: readFoods,
    upsertFood: (food) =>
      serialize(async () => {
        const foods = await readFoods();
        const i = foods.findIndex((f) => f.id === food.id);
        await writeFoods(i === -1 ? [...foods, food] : foods.map((f, j) => (j === i ? food : f)));
      }),
    removeFood: (id) => serialize(async () => writeFoods((await readFoods()).filter((f) => f.id !== id))),
    async listPlans() {
      const { items, quarantined } = await plans.list();
      return { plans: items, quarantined };
    },
    writePlan: (plan) => serialize(() => plans.write(plan)),
    removePlan: (id) => serialize(() => trashItem(plans.pathOf(id))),
    async readAll() {
      const all = await months.list();
      const p = await plans.list();
      return {
        profile: await readSingle(profilePath, migrateHealthProfile),
        foods: await readFoods(),
        plans: p.items,
        months: all.items.sort((a, b) => (a.id < b.id ? -1 : 1)),
      };
    },
    eraseAll: () => serialize(() => trashItem(dataDir)),
  };
}
