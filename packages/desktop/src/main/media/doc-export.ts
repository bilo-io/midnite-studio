import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  failure,
  MEDIA_EXPORT_FORMAT_INFO,
  ok,
  type DocExportFormat,
  type GitOpResult,
} from '@midnite/studio-shared';

/**
 * Docs export (Phase 99 Theme B) — md, html and pdf, none through ffmpeg.
 * The renderer builds the standalone HTML (prose CSS inlined); main only asks
 * where to put it and, for pdf, prints that HTML in a hidden window. Electron
 * is injected so the flow is testable under bare vitest.
 */
export type DocExportDeps = {
  /** Resolves the chosen path, or `null` when the dialog was dismissed. */
  pickDest: (defaultPath: string, format: DocExportFormat) => Promise<string | null>;
  /** Loads `htmlFile` in a hidden window and answers the PDF bytes. */
  printToPdf: (htmlFile: string) => Promise<Buffer>;
  write?: (dest: string, data: string | Buffer) => Promise<void>;
};

export async function exportDoc(
  req: { format: DocExportFormat; name: string; content: string; defaultDir?: string | undefined },
  deps: DocExportDeps,
): Promise<GitOpResult<{ dest: string }>> {
  const write = deps.write ?? ((dest, data) => writeFile(dest, data));
  const stem = req.name.replace(/\.md$/i, '').replace(/[/\\]/g, '-');
  const dest = await deps.pickDest(join(req.defaultDir ?? '', `${stem}.${MEDIA_EXPORT_FORMAT_INFO[req.format].ext}`), req.format);
  if (!dest) return failure('cancelled');

  if (req.format !== 'pdf') {
    await write(dest, req.content);
    return ok({ dest });
  }

  const dir = await mkdtemp(join(tmpdir(), 'mstudio-doc-pdf-'));
  try {
    const htmlFile = join(dir, `${stem}.html`);
    await writeFile(htmlFile, req.content);
    await write(dest, await deps.printToPdf(htmlFile));
    return ok({ dest });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
