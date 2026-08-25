import type { ReactNode } from 'react';

import type { IconType } from 'react-icons';
import {
  LuFile,
  LuFileArchive,
  LuFileAudio,
  LuFileCode,
  LuFileImage,
  LuFileJson,
  LuFileText,
  LuFileVideo,
  LuFolder,
  LuFolderOpen,
} from 'react-icons/lu';

import { languageForFile, previewKindForFile } from '../../lib/languages';

/**
 * A small, deliberately coarse icon map — the tree needs "code / text / media
 * / other" at a glance, not one glyph per language (that is what the name
 * column is for). New feature, so react-icons per the house rule.
 */
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'dmg']);

function iconFor(fileName: string): IconType {
  const kind = previewKindForFile(fileName);
  if (kind === 'image') return LuFileImage;
  if (kind === 'video') return LuFileVideo;
  if (kind === 'audio') return LuFileAudio;
  if (kind === 'markdown' || kind === 'pdf') return LuFileText;
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.') + 1);
  if (ext === 'json' || ext === 'jsonc') return LuFileJson;
  if (ARCHIVE_EXTS.has(ext)) return LuFileArchive;
  if (languageForFile(fileName)) return LuFileCode;
  return LuFile;
}

export function FileIcon({ name }: { name: string }): ReactNode {
  const Icon = iconFor(name);
  return <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

export function FolderIcon({ open }: { open: boolean }): ReactNode {
  const Icon = open ? LuFolderOpen : LuFolder;
  return <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}
