import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  failure,
  MEDIA_EXPORT_FORMAT_INFO,
  schemas,
  type GitOpResult,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { mediaDocsManifest } from '../manifest';
import { exportDoc } from './doc-export';

export { mediaDocsManifest, type MediaDocsManifest } from '../manifest';
export { exportDoc, type DocExportDeps } from './doc-export';

export type MediaDocEditRequest = z.output<typeof schemas.MediaDocEditRequest>;

/**
 * The Docs feature's main half (Phase 113 Theme Q): the md/html/pdf export
 * and the AI edit. Never imports `electron` — the save dialog and the PDF
 * printer arrive as services, as does the agent run behind Ask AI, which is
 * Studio's (its headless-agent runner); an app without one leaves it out and
 * the channel answers a plain failure.
 */
export type MediaDocsMainServices = {
  /** The native save dialog, sheeted on the asking window; null when dismissed. */
  pickSavePath: (options: {
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  /** Prints a standalone HTML file to a PDF (a hidden, script-less window in Electron). */
  printToPdf: (htmlFile: string) => Promise<Buffer>;
  /** Runs Ask AI's edit through an agent. Absent → "Ask AI is not available in this app." */
  runDocEdit?: (req: MediaDocEditRequest) => Promise<GitOpResult<{ replacement: string }>>;
};

const guard = async <R extends GitOpResult<unknown> | GitOpResult>(run: () => Promise<R>): Promise<R | GitOpResult> => {
  try {
    return await run();
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
};

export const mediaDocsMain = defineFeatureMain<MediaDocsMainServices>({
  feature: mediaDocsManifest.feature,
  channels: mediaDocsManifest.ipc,
  register(ctx, services) {
    const invalid = (issue: string) => failure(issue);

    ctx.ipc.handle(
      CHANNELS.mediaDocEdit,
      schemas.MediaDocEditRequest,
      (req) =>
        guard(async () =>
          services.runDocEdit ? services.runDocEdit(req) : failure('Ask AI is not available in this app.'),
        ),
      invalid,
    );

    ctx.ipc.handle(
      CHANNELS.mediaDocExport,
      schemas.MediaDocExportRequest,
      (req) =>
        guard(() =>
          exportDoc(req, {
            pickDest: (defaultPath, format) => {
              const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[format];
              return services.pickSavePath({ defaultPath, filters: [{ name: label, extensions: [ext] }] });
            },
            printToPdf: services.printToPdf,
          }),
        ),
      invalid,
    );
  },
});
