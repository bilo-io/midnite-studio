import { app, shell } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { deleteFeatureData, describeFeatureData } from '../feature-data';
import { isFeatureEnabled } from '../feature-gate';
import { defaultLogger } from '../log';
import { handle } from './handle';

/** Settings ▸ Features' "Delete this feature's data" (Phase 135 Theme F): describe, then move to the Trash. */
export function registerFeatureDataHandlers(): void {
  handle(
    CHANNELS.featuresDataDescribe,
    schemas.FeatureDataRequest,
    async ({ feature }) => ({ files: await describeFeatureData(app.getPath('userData'), feature) }),
    () => ({ files: [] }),
  );
  handle(
    CHANNELS.featuresDataDelete,
    schemas.FeatureDataRequest,
    async ({ feature }) => {
      const out = await deleteFeatureData({
        userData: app.getPath('userData'),
        feature,
        isOn: isFeatureEnabled(feature),
        trash: (path) => shell.trashItem(path),
      });
      if (out.ok) defaultLogger.info(`feature-gate: moved ${out.removedFiles} ${feature} data files to the Trash`);
      return out;
    },
    (issue) => ({ ok: false as const, kind: 'error' as const, message: issue }),
  );
}
