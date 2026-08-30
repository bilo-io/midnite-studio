import type { CommandId } from '@midnite/git-shared';
import type { IconType } from 'react-icons';
import {
  LuDownload,
  LuFile,
  LuFolderOpen,
  LuGitBranch,
  LuGitCommitHorizontal,
  LuGlobe,
  LuPanelLeft,
  LuPlay,
  LuRefreshCw,
  LuSearch,
  LuSparkles,
  LuSquareTerminal,
  LuUpload,
  LuX,
} from 'react-icons/lu';

/**
 * Command icons mapping every CommandId to a react-icons icon.
 * Imported per-set (`react-icons/lu`) matching repository guidelines.
 */
export const COMMAND_ICONS: Record<CommandId, IconType> = {
  'terminal.toggle': LuSquareTerminal,
  'terminal.focus': LuSquareTerminal,
  'repos.toggle': LuPanelLeft,
  'browser.toggle': LuGlobe,
  'repo.open': LuFolderOpen,
  'repo.close': LuX,
  'view.refresh': LuRefreshCw,
  'view.graph': LuGitBranch,
  'graph.focus': LuGitBranch,
  'status.focus': LuGitCommitHorizontal,
  'status.commit': LuGitCommitHorizontal,
  'sync.fetch': LuRefreshCw,
  'sync.pull': LuDownload,
  'sync.push': LuUpload,
  'search.open': LuSearch,
  'op.abort': LuX,
  'op.continue': LuPlay,
  'palette.open': LuSearch,
  'palette.files': LuFile,
  'file.save': LuFile,
  'markdown.presentAsSlides': LuSparkles,
};
