import type { GameSummary } from '@midnite/studio-shared';
import { LuClipboardCopy, LuEyeOff, LuFolderSearch, LuPencil, LuStethoscope, LuTrash2 } from 'react-icons/lu';

import { KitContextMenu, type FrameMenuEntry } from '@midnite/studio-frame';

/** The tooltip on a disabled Remove from list: the games folder is scanned, so such a game cannot be removed. */
export const REMOVE_UNDER_ROOT_REASON = 'Games in the games folder always list — move or delete it to remove it.';

export type GameRowMenuHandlers = {
  onRename: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
  onForget: () => void;
  onDelete: () => void;
  /** Phase 149 Theme G's doctor panel. Absent → no "Run doctor" row. */
  onRunDoctor?: () => void;
};

/** The parent folder of an absolute path, either separator, no trailing slash. */
function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return cut <= 0 ? trimmed.slice(0, cut + 1) : trimmed.slice(0, cut);
}

/** A game sits "under the games root" when its folder is a direct child of it — what `listGames` scans. */
export function isUnderGamesRoot(game: GameSummary, gamesRoot: string | null | undefined): boolean {
  if (!gamesRoot) return false;
  return parentOf(game.path) === gamesRoot.replace(/[\\/]+$/, '');
}

/** The row's menu items, in order (Phase 149 Theme I). Pure, so the menu and its tests share one list. */
export function gameRowMenuItems({
  game,
  gamesRoot,
  removesRepo,
  handlers,
}: {
  game: GameSummary;
  gamesRoot: string | null | undefined;
  removesRepo: boolean;
  handlers: GameRowMenuHandlers;
}): FrameMenuEntry[] {
  const underRoot = isUnderGamesRoot(game, gamesRoot);
  return [
    { label: 'Rename…', icon: LuPencil, onSelect: handlers.onRename },
    { label: 'Reveal in Finder', icon: LuFolderSearch, onSelect: handlers.onReveal },
    { label: 'Copy path', icon: LuClipboardCopy, onSelect: handlers.onCopyPath },
    { type: 'separator' },
    ...(handlers.onRunDoctor ? ([{ label: 'Run doctor', icon: LuStethoscope, onSelect: handlers.onRunDoctor }, { type: 'separator' }] as FrameMenuEntry[]) : []),
    {
      label: removesRepo ? 'Remove from list (and repos panel)' : 'Remove from list',
      icon: LuEyeOff,
      onSelect: handlers.onForget,
      ...(underRoot ? { disabled: true, disabledReason: REMOVE_UNDER_ROOT_REASON } : {}),
    },
    { label: 'Delete game…', icon: LuTrash2, danger: true, onSelect: handlers.onDelete },
  ];
}

/** The menu itself: the frame's plain context menu at a point. */
export function GameRowMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: FrameMenuEntry[];
  onClose: () => void;
}) {
  return <KitContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
