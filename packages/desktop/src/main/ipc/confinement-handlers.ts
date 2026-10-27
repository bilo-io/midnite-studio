import { CHANNELS } from '@midnite/studio-shared';

import { confinementService } from '../confinement';
import { handleBare } from './handle';

/** Phase 121 Theme E: is sandbox-exec usable here, and are new sessions confined by default. */
export function registerConfinementHandlers(): void {
  handleBare(CHANNELS.confinementStatus, () => confinementService()?.status() ?? { available: false, enabled: false, reason: 'Confinement has not started yet.' });
}
