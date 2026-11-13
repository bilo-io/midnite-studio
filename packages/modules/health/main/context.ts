import { join } from 'node:path';

import { writePrivateFile, type FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS, HealthRequestSchema, type GitOpResult, type HealthRequest } from '@midnite/studio-shared';

import { createHealthStore, type HealthStore } from './health-store';
import type { HealthModuleServices } from './module';

/** Any op's answer: with a value, without one, or a failure. */
type HealthResult = GitOpResult<unknown> | GitOpResult;

const ok = (value?: unknown): HealthResult => (value === undefined ? { ok: true } : { ok: true, value });

/** `YYYY-MM-DD` in local time, for the export's default file name. */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function exportAll(store: HealthStore, services: HealthModuleServices): Promise<HealthResult> {
  const picked = await services.showSaveDialog?.({
    defaultPath: `midnite-health-${localDate(new Date())}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (picked === undefined || picked.canceled || picked.filePath === undefined) return ok({ cancelled: true });
  const data = await store.readAll();
  const body = { format: 'midnite-health-export', version: 1, exportedAt: new Date().toISOString(), ...data };
  await writePrivateFile(picked.filePath, `${JSON.stringify(body, null, 2)}\n`);
  return ok({ path: picked.filePath });
}

async function dispatch(store: HealthStore, services: HealthModuleServices, req: HealthRequest): Promise<HealthResult> {
  switch (req.op) {
    case 'getProfile':
      return ok({ profile: await store.getProfile() });
    case 'putProfile':
      return store.putProfile(req.profile).then(() => ok());
    case 'getMonths':
      return ok(await store.getMonths(req.from, req.to));
    case 'putDay':
      return ok(await store.putDay(req.date, req.day));
    case 'getFoods':
      return ok({ foods: await store.getFoods() });
    case 'upsertFood':
      return store.upsertFood(req.food).then(() => ok());
    case 'removeFood':
      return store.removeFood(req.id).then(() => ok());
    case 'listPlans':
      return ok(await store.listPlans());
    case 'writePlan':
      return store.writePlan(req.plan).then(() => ok());
    case 'removePlan':
      return store.removePlan(req.id).then(() => ok());
    case 'exportAll':
      return exportAll(store, services);
    case 'eraseAll':
      return store.eraseAll().then(() => ok());
  }
}

/**
 * Registers the `health` channel (Phase 128 Theme B.4) over `<userData>/data`. A failure is answered, never
 * thrown, and **nothing logs a payload** (Decision 6): handlers log only the op and an error code or name,
 * never a message (a zod issue can quote a value) and never a field.
 */
export function registerHealthOn(ctx: FeatureMainContext, services: HealthModuleServices): HealthStore {
  const store = createHealthStore(join(services.userData, 'data'), (path) => ctx.trashItem(path));
  ctx.ipc.handle(
    CHANNELS.health,
    HealthRequestSchema,
    async (req): Promise<HealthResult> => {
      try {
        return await dispatch(store, services, req);
      } catch (e) {
        const code = e instanceof Error ? ((e as NodeJS.ErrnoException).code ?? e.name) : 'Error';
        // The host's log sink captures console; this line carries the op and an error code only (Decision 6).
        // eslint-disable-next-line no-console
        console.error(`health:${req.op} failed: ${code}`);
        return { ok: false, kind: 'error', message: 'Could not complete that action' };
      }
    },
    (): HealthResult => ({ ok: false, kind: 'error', message: 'Invalid request' }),
  );
  return store;
}
