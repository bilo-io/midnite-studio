import { join } from 'node:path';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS, SimulatorRequestSchema, type GitOpResult, type SimulatorRequest } from '@midnite/studio-shared';

import type { SimulatorModuleServices } from './module';
import { createScenarioStore, type ScenarioStore } from './scenario-store';

type SimulatorResult = GitOpResult<unknown> | GitOpResult;

function dispatch(store: ScenarioStore, req: SimulatorRequest): Promise<SimulatorResult> {
  switch (req.op) {
    case 'list':
      return store.list(req.kind);
    case 'read':
      return store.read(req.id);
    case 'save':
      return store.save({ id: req.id, scenario: req.scenario });
    case 'rename':
      return store.rename(req.id, req.title);
    case 'remove':
      return store.remove(req.id);
  }
}

/** Registers the scenario channel (Phase 127 Theme F.2) over `<userData>/simulations`. */
export function registerSimulatorOn(ctx: FeatureMainContext, services: SimulatorModuleServices): ScenarioStore {
  const store = createScenarioStore(join(services.userData, 'simulations'), (path) => ctx.trashItem(path));
  ctx.ipc.handle(
    CHANNELS.simulator,
    SimulatorRequestSchema,
    (req) => dispatch(store, req),
    (issue): SimulatorResult => ({ ok: false, kind: 'error', message: issue }),
  );
  return store;
}
