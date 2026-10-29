import { captureMain, type CaptureMainServices } from '@midnite/studio-feature-capture/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

/**
 * The chord Midnite Capture ships with — the standalone app is the one a user installs *for* the
 * shortcut. Studio ships none. It is registered only while the app runs, and the user can change or
 * remove it in Capture's settings; a chord another app holds is reported, never fought over.
 */
export const CAPTURE_APP_SHORTCUT = 'CommandOrControl+Shift+2';

/**
 * The Capture module's main half (Phase 124 Theme D), on the feature seam so a host can mount it
 * through `mountModuleMains`. The host builds the capture service (it owns the electron port, the
 * recording gate and the overlay opener) and hands it in; the module registers the channels.
 */
export const captureModuleMain = defineFeatureMain<CaptureMainServices>({
  feature: 'capture',
  channels: captureMain.channels,
  register: (ctx, services) => captureMain.register(ctx, services),
});
