import { createContext, useContext, type ReactNode } from 'react';

/**
 * The capture feature's host port (Phase 113 Theme K) — how a capture reaches another feature, which this
 * one may not import. The composing app fills it; each member it leaves null is a destination the
 * "Send to…" list shows as unavailable, with the reason.
 *
 * **Nothing is sent on its own.** Each member only *prepares* the destination — a chat draft with the
 * capture attached, the capture imported into a Creator project and shown there — and the user decides
 * what happens next (presses send in the chat, keeps or deletes the image in Creator).
 *
 * - `sendToChat` — Studio drops the attachment into a new agent-chat draft (chats' incoming-draft slot)
 *   and navigates there through its link router. Null in the standalone Capture app: chats are Studio's.
 * - `creator` — Studio's selected repository (read at click time) and how to reveal the imported file in
 *   Creator ▸ Images. Null where there is no Creator.
 */
export type CaptureCreatorHost = {
  /** The repository a Creator import lands in — Studio's selected one — or null when none is selected. */
  repo: () => { id: string; name: string } | null;
  /** Shows the imported image in Creator ▸ Images, through the app's link router. */
  reveal: (target: { repoId: string; project: string; path: string }) => void;
};

export type CaptureHost = {
  sendToChat: ((attachment: { name: string; text: string }) => void) | null;
  creator: CaptureCreatorHost | null;
};

/** The standalone app's host: no other feature to reach. */
export const STANDALONE_CAPTURE_HOST: CaptureHost = { sendToChat: null, creator: null };

const CaptureHostContext = createContext<CaptureHost | null>(null);

export function CaptureHostProvider({
  host,
  children,
}: {
  host: CaptureHost;
  children: ReactNode;
}) {
  return <CaptureHostContext.Provider value={host}>{children}</CaptureHostContext.Provider>;
}

/** The installed host, or the standalone one — Capture works without a provider, it just sends nowhere. */
export function useCaptureHost(): CaptureHost {
  return useContext(CaptureHostContext) ?? STANDALONE_CAPTURE_HOST;
}
