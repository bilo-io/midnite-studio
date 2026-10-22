import type { DownloadFileClass } from '@midnite/studio-shared';

/**
 * Policy before bytes (Phase 117 Theme D): what a download is and whether it may start.
 * Pure — the service asks this before `item.setSavePath`, so a refused file never touches disk.
 */

const CLASS_BY_EXT: Record<string, DownloadFileClass> = {};
const add = (cls: DownloadFileClass, exts: string): void => {
  for (const e of exts.split(' ')) CLASS_BY_EXT[e] = cls;
};
add('document', 'pdf txt md rtf csv tsv doc docx odt xls xlsx ods ppt pptx odp epub');
add('media', 'mp3 m4a wav flac ogg aac mp4 mov m4v webm mkv avi');
add('image', 'png jpg jpeg gif webp heic bmp ico tiff');
add('archive', 'zip tar gz tgz bz2 xz 7z rar zst');
add('disk-image', 'dmg iso img sparseimage sparsebundle');
add('installer', 'pkg mpkg');
add('script', 'sh bash zsh command py pl rb js mjs scpt applescript workflow jar ps1 bat cmd vbs');
add('executable', 'app exe bin run msi dylib so dll');

/** The class of a file by its **last** extension (`report.pdf.app` is an app, not a PDF). */
export function classifyFile(filename: string): DownloadFileClass {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return 'other';
  return CLASS_BY_EXT[filename.slice(dot + 1).toLowerCase()] ?? 'other';
}

/** Classes whose execution Gatekeeper judges — `spctl --assess` runs on these. */
export function needsGatekeeperAssessment(fileClass: DownloadFileClass): boolean {
  return fileClass === 'executable' || fileClass === 'disk-image' || fileClass === 'installer';
}

export const DEFAULT_MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;

/** Theme C's verdict, as far as this policy needs it. */
export type OriginVerdictLevel = 'safe' | 'caution' | 'danger';

export type DownloadDecision =
  | { action: 'allow'; fileClass: DownloadFileClass }
  | { action: 'confirm'; fileClass: DownloadFileClass }
  | { action: 'refuse'; fileClass: DownloadFileClass; reason: string };

export function decideDownload(input: {
  filename: string;
  /** Bytes, or `0`/negative when the server did not say. */
  size: number;
  maxBytes?: number;
  originVerdict?: OriginVerdictLevel;
}): DownloadDecision {
  const fileClass = classifyFile(input.filename);
  const max = input.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  if (input.originVerdict === 'danger') {
    return { action: 'refuse', fileClass, reason: 'This site is flagged as dangerous.' };
  }
  if (input.size > max) {
    return {
      action: 'refuse',
      fileClass,
      reason: `The file is larger than the ${Math.round(max / (1024 * 1024))} MB limit.`,
    };
  }
  if (fileClass === 'document' || fileClass === 'media' || fileClass === 'image') {
    return { action: 'allow', fileClass };
  }
  return { action: 'confirm', fileClass };
}

/** A safe leaf name: no path parts, no leading dots, no control characters, never empty. */
export function sanitiseFilename(raw: string): string {
  const leaf = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = leaf.replace(/[\u0000-\u001f:]/g, '_').replace(/^\.+/, '').trim();
  return cleaned === '' ? 'download' : cleaned.slice(0, 200);
}
