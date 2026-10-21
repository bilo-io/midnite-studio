import type { LibraryItem } from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/**
 * The Library feature's host port (Phase 113 Theme R) — what the tab takes from the app that composes it,
 * beyond the frame and the media kit. Every member is optional: the tab is complete without a host.
 *
 * - **`Player`** replaces the tab's own player. The library drives a plain `<video>`/`<audio>` element
 *   itself, because it needs to resume from and save watch progress, and neither shared player has that
 *   seam (Audio's player is bound to media-store projects and always starts at 0). An app with a richer
 *   player hands it in here; it gets the same resume point and progress callback.
 * - **`OnlineKeyField`** is where the online provider's key is entered. Studio's is its vault-backed key
 *   row; Midnite Media has none (its key is set in Studio's Vault and granted to Media), so it passes
 *   `onlineKeyHint` instead. A key value never reaches this port — the field writes it to main.
 */
export type LibraryPlayerProps = {
  item: LibraryItem;
  /** The `mstudio-file://library/…` URL to play. */
  src: string;
  /** Seconds to start from (0 for the beginning). */
  resumeAt: number;
  /** Start playing as soon as it loads — the next item of a playlist playing in sequence. */
  autoPlay?: boolean;
  /**
   * Called with the current position and why: `playing` as time advances (the tab throttles the saves),
   * `paused` on a pause or when the player goes away, `ended` at the end.
   */
  onProgress: (positionS: number, durationS: number, state: 'playing' | 'paused' | 'ended') => void;
};

export type LibraryHost = {
  Player?: ComponentType<LibraryPlayerProps>;
  OnlineKeyField?: ComponentType;
  /** Shown instead of a key field when the app offers none. */
  onlineKeyHint?: string;
};

const LibraryHostContext = createContext<LibraryHost>({});

export function LibraryHostProvider({
  host,
  children,
}: {
  host: LibraryHost;
  children: ReactNode;
}) {
  return <LibraryHostContext.Provider value={host}>{children}</LibraryHostContext.Provider>;
}

export function useLibraryHost(): LibraryHost {
  return useContext(LibraryHostContext);
}
