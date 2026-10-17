import { useCallback, useEffect, useRef, useState } from 'react';

import type { ForgeKind } from '@midnite/studio-shared';

import type { ForgeCascadeReveal, ForgeHost, ForgeLayoutKey, ForgePaneSize } from '../host';
import { useReviewsStore } from '../stores/reviews-store';
import { PLAIN_DIFF_KIT } from './plain-diff';
import {
  plainExternalLink,
  plainForgeRefLink,
  PlainMultiSelectMenu,
  PlainPopover,
  PlainTooltip,
  PlainTreeSection,
  PlainUserAvatar,
} from './plain-ui';

/**
 * A complete {@link ForgeHost} for an app that is not Studio (Phase 113 Theme
 * O) — media-core's `createStandaloneMediaHost`, for the forge. The app hands
 * over only what it alone knows: which repository is selected, a repository's
 * forge kind, how to open a URL, and whether forge writes are on. Everything
 * else is plain chrome over the frame, pane sizes in this window's
 * localStorage, and none of Studio's optional members (Present, the agent
 * hand-off, preview deployments, Fetch to compare, applying a suggestion).
 */
export type StandaloneForgeHostOptions = {
  useActiveRepo: ForgeHost['useActiveRepo'];
  useForgeKind: (repoId: string | null) => ForgeKind | null;
  /** Send a URL out of the app (the system browser). */
  openExternal: (url: string) => void;
  /** Settings' "review actions" switch. Defaults to off, as in Studio. */
  useForgeWritesEnabled?: () => boolean;
  /** After a run's "#123" chip selects the PR: bring the Reviews view forward. */
  onOpenReview?: (repoId: string, number: number) => void;
  /** localStorage key prefix for pane sizes and board memory. */
  storageKey?: string;
};

/** Studio's defaults and bounds (`ui-store`'s `DEFAULT_LAYOUT`/`LAYOUT_BOUNDS`). */
const PANES: Record<ForgeLayoutKey, { initial: number; min: number; max: number }> = {
  actionsListWidth: { initial: 360, min: 240, max: 640 },
  reviewsListWidth: { initial: 380, min: 280, max: 640 },
  actionsJobsHeight: { initial: 200, min: 80, max: 720 },
};

function readNumber(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the value lasts for this session only.
  }
}

const NO_CASCADE: ForgeCascadeReveal = { active: false, styleFor: () => ({}) };

export function createStandaloneForgeHost(options: StandaloneForgeHostOptions): ForgeHost {
  const prefix = options.storageKey ?? 'midnite-forge';

  function usePaneSize(key: ForgeLayoutKey): ForgePaneSize {
    const pane = PANES[key];
    const storage = `${prefix}.${key}`;
    const [size, setState] = useState(() => readNumber(storage) ?? pane.initial);
    const setSize = useCallback(
      (value: number) => {
        setState(value);
        write(storage, String(value));
      },
      [storage],
    );
    return { size, setSize, ...pane };
  }

  function useProjectBoard() {
    const storage = `${prefix}.projectBoardByRepo`;
    const [boardByRepo, setBoards] = useState<Record<string, string>>(() => {
      try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(storage) ?? '{}');
        return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
      } catch {
        return {};
      }
    });
    const setProjectBoard = useCallback(
      (repoId: string, boardId: string) =>
        setBoards((prev) => {
          const next = { ...prev, [repoId]: boardId };
          write(storage, JSON.stringify(next));
          return next;
        }),
      [storage],
    );
    return { boardByRepo, setProjectBoard };
  }

  function useDismiss(active: boolean, onDismiss: () => void) {
    const ref = useRef(onDismiss);
    ref.current = onDismiss;
    useEffect(() => {
      if (!active) return undefined;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') ref.current();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [active]);
  }

  return {
    Tooltip: PlainTooltip,
    UserAvatar: PlainUserAvatar,
    Popover: PlainPopover,
    MultiSelectMenu: PlainMultiSelectMenu,
    TreeSection: PlainTreeSection,
    ExternalLink: plainExternalLink(options.openExternal),
    ForgeRefLink: plainForgeRefLink(options.openExternal),
    diff: PLAIN_DIFF_KIT,
    useActiveRepo: options.useActiveRepo,
    useForgeKind: options.useForgeKind,
    useForgeWritesEnabled: options.useForgeWritesEnabled ?? (() => false),
    usePaneSize,
    useProjectBoard,
    useDismiss,
    useCascadeReveal: () => NO_CASCADE,
    openLink: (url) => options.openExternal(url),
    openInApp: (url) => options.openExternal(url),
    openReview: (repoId, number) => {
      useReviewsStore.getState().selectPull(repoId, number);
      options.onOpenReview?.(repoId, number);
    },
  };
}
