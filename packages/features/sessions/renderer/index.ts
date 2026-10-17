import type { ComponentType } from 'react';

import type { SessionsManifest } from '../manifest';

/**
 * The sessions feature's renderer half (Phase 113 Theme O slice 4): the Sessions view — every terminal
 * and agent session, live or closed, grouped by repository and by workflow run — and, for an app with
 * no pty server of its own, a host over the guest channels and the terminal it attaches. Needs the frame
 * (chrome port, explorer, resizable panes, the activity glow) and its own {@link SessionsHost}.
 */
export { sessionsManifest, type SessionsManifest } from '../manifest';
export {
  SessionsHostProvider,
  useSessionsHost,
  type SessionConnectionState,
  type SessionLiveStatus,
  type SessionsGraphPort,
  type SessionsHistoryPort,
  type SessionsHost,
  type SessionsListWidth,
  type SessionsLoopsPort,
  type SessionsSelection,
  type SessionsWorkflowPort,
} from './host';
// The guest terminal itself is not here: `createGuestSessionsHost` loads it (and xterm) lazily.
export { createGuestSessionsHost, GUEST_SESSIONS_KEY, type GuestSessionsHostOptions } from './guest-host';
export type { ManagedLiveSession, ManagedSession, ManagedSessionLiveness } from './session-order';

type ViewIds = SessionsManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const sessionsViews = {
  sessions: () => import('./sessions-view').then((m) => m.SessionsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
