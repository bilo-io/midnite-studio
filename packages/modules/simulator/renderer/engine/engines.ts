import { createElementaryEngine } from '../sims/elementary';
import { createLifeEngine } from '../sims/life';
import type { EngineFactories } from './types';

/**
 * The worker's engine table. Theme C registers life and elementary; D (nbody) and E (boids, predprey) add
 * theirs here. A kind with no entry answers `init` with an error message instead of throwing.
 */
export const ENGINE_FACTORIES: EngineFactories = {
  life: createLifeEngine,
  elementary: createElementaryEngine,
};
