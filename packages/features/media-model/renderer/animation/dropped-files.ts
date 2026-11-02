import { ANIMATION_EXTENSIONS } from '@midnite/studio-shared';

/**
 * Files from a drag-drop (Phase 125 Theme B). Electron's renderer gives a dropped `File` its bytes but not its
 * path, so the importer takes bytes (`importBytes`). A dropped folder arrives as a directory entry, walked here
 * (never deeper than {@link MAX_DROP_DEPTH}, never more than {@link MAX_DROP_FILES} files), keeping the name of
 * the folder each file sat in so Mixamo folders still name and tag their clips.
 */

export const MAX_DROP_DEPTH = 4;
export const MAX_DROP_FILES = 500;

export type DroppedFile = { file: File; folder: string };

/** The slice of the File System Entry API the walk uses — declared here so a test can fake it. */
export type DropEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (resolve: (file: File) => void, reject: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (resolve: (entries: DropEntry[]) => void, reject: (error: unknown) => void) => void };
};

const isClipName = (name: string) => ANIMATION_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

async function readAll(dir: DropEntry): Promise<DropEntry[]> {
  const reader = dir.createReader?.();
  if (!reader) return [];
  const all: DropEntry[] = [];
  // `readEntries` returns at most a batch (100 in Chromium) per call and an empty list at the end.
  for (;;) {
    const batch = await new Promise<DropEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walk(entry: DropEntry, folder: string, depth: number, out: DroppedFile[]): Promise<void> {
  if (out.length >= MAX_DROP_FILES) return;
  if (entry.isFile) {
    if (!isClipName(entry.name) || !entry.file) return;
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    out.push({ file, folder });
    return;
  }
  if (!entry.isDirectory || depth > MAX_DROP_DEPTH || entry.name.startsWith('.')) return;
  const children = (await readAll(entry)).sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) await walk(child, entry.name, depth + 1, out);
}

/** Every clip file in a drop. Entries are taken synchronously first: the browser empties them after the event. */
export async function collectDropped(transfer: Pick<DataTransfer, 'items' | 'files'>): Promise<DroppedFile[]> {
  const entries: DropEntry[] = [];
  for (const item of Array.from(transfer.items ?? [])) {
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => DropEntry | null }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  const out: DroppedFile[] = [];
  if (entries.length === 0) {
    for (const file of Array.from(transfer.files ?? [])) if (isClipName(file.name)) out.push({ file, folder: '' });
    return out;
  }
  for (const entry of entries) await walk(entry, '', 0, out);
  return out;
}

/** A `File` as base64, without a data-URL round trip. */
export async function fileToBase64(file: Pick<File, 'arrayBuffer'>): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
