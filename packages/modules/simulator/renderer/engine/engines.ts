import { createNBody } from '../sims/nbody';

import type { EngineFactories } from './types';

/**
 * The worker's engine table. Themes C (life, elementary), D (nbody) and E (boids, predprey) register theirs
 * here; a kind with no entry answers `init` with an error frame instead of throwing.
 */
export const ENGINE_FACTORIES: EngineFactories = {
  nbody: () => createNBody() as never,
};
