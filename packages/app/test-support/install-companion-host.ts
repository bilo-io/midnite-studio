import { installCompanionHost } from '@midnite/studio-feature-companion/renderer';

import { STUDIO_COMPANION_HOST } from '../src/compose/companion-host';

/**
 * Import for the side effect: installs Studio's companion host, as `StudioProviders` does in the
 * app. For a test that mounts a companion-reaching module without `renderView` (which already wraps
 * `StudioProviders`). Imported rather than run in `vitest-setup.ts` because a setup file's imports
 * load before a test's own `vi.mock` calls and would pin the real modules.
 */
installCompanionHost(STUDIO_COMPANION_HOST);
