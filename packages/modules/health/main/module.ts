import { defineFeatureMain } from '@midnite/studio-runtime';

/**
 * Electron's `dialog.showSaveDialog` shape, so the host passes `(o) => dialog.showSaveDialog(win, o)`
 * without this module importing `electron`. Theme G's export uses it.
 */
export type ShowSaveDialog = (opts: {
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}) => Promise<{ canceled: boolean; filePath?: string }>;

/** What the host hands the Health module: where its files live and the native save dialog. */
export type HealthModuleServices = { userData: string; showSaveDialog?: ShowSaveDialog };

/**
 * The Health module's main half (Phase 128 Theme A.4), on the feature seam so a host mounts it through
 * `mountModuleMains`. Theme A registers nothing; B adds the `health` channel.
 */
export const healthModuleMain = defineFeatureMain<HealthModuleServices>({
  feature: 'health',
  channels: [],
  register() {},
});
