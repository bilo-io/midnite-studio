/**
 * Cross-app hand-off (Phase 113 Theme D): "open this workflow run in Agents" from Coder.
 *
 * A feature never imports another feature, so a surface that wants to send the user somewhere an
 * *other app* owns describes the destination as data — a {@link HandoffRequest} — and hands it to
 * whoever composes it. The composer asks {@link planHandoff}: if the target app is hosted in this
 * process (Studio hosts every app, so today always) the answer is `local` and the composer
 * navigates in-process; otherwise it is `external`, carrying the `midnite://open` link the Midnite
 * Apps launcher's router resolves (installed bundle, then Studio, then the launcher's detail sheet).
 *
 * Type-only imports besides the two link files, so it carries no zod and the launcher can take it
 * by source path. The ref is encoded, never validated, here — `ResourceRefSchema` does that on the
 * receiving end (`decodeResourceRefParam`).
 */

import type { ResourceRef } from './domain/resource-ref';
import type { SettingsPageId, ViewId } from './domain/view';
import type { MediaTab } from './media';
import { midniteOpenLink, type MidniteAppId, type MidniteLinkTarget } from './midnite-link';
import { encodeRefParam } from './studio-link';

export type HandoffRequest = {
  /** The app that owns the destination (`PLACEMENT` says which owns a view). */
  app: MidniteAppId;
  view?: ViewId;
  tab?: MediaTab;
  page?: SettingsPageId;
  /** The specific thing to select once there — a commit, a workflow run, a session. */
  ref?: ResourceRef;
};

export type HandoffPlan =
  | { kind: 'local'; request: HandoffRequest }
  | { kind: 'external'; link: string };

/** The `midnite://open` link for a request — what crosses a process boundary. */
export function handoffLink(request: HandoffRequest): string {
  const target: MidniteLinkTarget = { app: request.app };
  if (request.view !== undefined) target.view = request.view;
  if (request.tab !== undefined) target.tab = request.tab;
  if (request.page !== undefined) target.page = request.page;
  if (request.ref !== undefined) target.ref = encodeRefParam(request.ref);
  return midniteOpenLink(target);
}

/** `local` when this process hosts the target app, else `external` with the link to route. */
export function planHandoff(request: HandoffRequest, hosted: ReadonlySet<MidniteAppId>): HandoffPlan {
  return hosted.has(request.app) ? { kind: 'local', request } : { kind: 'external', link: handoffLink(request) };
}
