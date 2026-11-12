import { createBoids } from '../sims/boids';
import { createElementaryEngine } from '../sims/elementary';
import { createLifeEngine } from '../sims/life';
import { createNBody } from '../sims/nbody';
import { createPredPrey } from '../sims/predprey';

import type { EngineFactories } from './types';

/**
 * The worker's engine table. Theme C registers life and elementary, D nbody, E boids and predprey. A kind with no entry answers `init` with an error message instead of throwing.
 */
export const ENGINE_FACTORIES: EngineFactories = {
  life: createLifeEngine,
  elementary: createElementaryEngine,
  nbody: () => createNBody() as never,
  boids: () => createBoids() as never,
  predprey: () => createPredPrey() as never,
};
