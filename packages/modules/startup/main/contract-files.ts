import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

import type { Contract } from '@midnite/studio-shared';

export const CONTRACT_EXTENSIONS = ['pdf', 'docx', 'png', 'jpg'] as const;
export const MAX_CONTRACT_BYTES = 25 * 1024 * 1024;

type StoredFile = NonNullable<Contract['file']>;

/** What the host injects: a native file picker and "open with the system", so main stays free of `electron`. */
export type ContractFilePort = {
  /** The chosen file's absolute path, or `null` when the person cancelled. */
  pickContractFile: () => Promise<string | null>;
  /** Opens a path with the system app; resolves to an error message, or `''` on success (Electron's `shell.openPath`). */
  openPath: (path: string) => Promise<string>;
};

export type AttachOutcome = { ok: true; file: StoredFile } | { ok: false; message: string } | { ok: 'cancelled' };

/** Where an attachment lives: `<dir>/<sha256>.<ext>`, a content-addressed name so two contracts share one copy. */
export function attachmentPath(dir: string, file: StoredFile): string {
  return join(dir, `${file.sha256}.${file.ext}`);
}

/** The attachment's path only when it stays inside `dir`; the stored fields are hex and an allowed extension, but check anyway. */
export function confinedAttachmentPath(dir: string, file: StoredFile): string | null {
  const root = resolve(dir);
  const target = resolve(attachmentPath(root, file));
  return target.startsWith(root + sep) ? target : null;
}

/** Picks, validates (type and 25 MB), hashes and copies a file into the contracts folder. */
export async function attachContractFile(port: ContractFilePort, dir: string): Promise<AttachOutcome> {
  const picked = await port.pickContractFile();
  if (picked === null) return { ok: 'cancelled' };
  const ext = extname(picked).slice(1).toLowerCase().replace('jpeg', 'jpg');
  if (!(CONTRACT_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, message: 'Attach a PDF, Word document, PNG or JPEG file.' };
  const info = await stat(picked).catch(() => null);
  if (info === null || !info.isFile()) return { ok: false, message: 'That file could not be read.' };
  if (info.size > MAX_CONTRACT_BYTES) return { ok: false, message: 'Contract files are limited to 25 MB.' };
  const sha256 = createHash('sha256').update(await readFile(picked)).digest('hex');
  const file: StoredFile = { name: picked.split(sep).pop()!.slice(0, 260), sha256, ext: ext as StoredFile['ext'] };
  await mkdir(dir, { recursive: true });
  await copyFile(picked, attachmentPath(dir, file));
  return { ok: true, file };
}
