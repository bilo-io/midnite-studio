import type { z } from 'zod';

import { defineFeatureMain, type RuntimeIpc } from '@midnite/studio-runtime';
import { CHANNELS, emptyCompanionSnapshot, failure, ok, schemas } from '@midnite/studio-shared';
import type {
  CompanionAskReply,
  CompanionDigest,
  CompanionSnapshot,
  GitOpResult,
  SttProviderId,
} from '@midnite/studio-shared';

import { companionManifest } from '../manifest';
import { askCompanion } from './ask';
import { buildCompanionDigest } from './digest';
import { configureCompanionServices, type CompanionMainServices } from './services';
import { buildCompanionSnapshot } from './snapshot';
import { resolveUiReply } from './ui-bridge';
import {
  STT_PROVIDER_FACTORIES,
  getLocalWhisperStatus,
  sttDeps,
  testSttCredential,
  transcribeUtterance,
} from './stt';
import {
  cancelQueuedSynthesis,
  companionTtsModelOnDisk,
  getCompanionTtsStatusAsync,
  reloadCompanionTtsBroker,
  synthesizeSpeechAsync,
} from './tts-broker';

export { companionManifest, type CompanionManifest } from '../manifest';
export { askCompanion, resolveHeadlessAgent, type CompanionAskDeps } from './ask';
export { createCompanionStore, nullCompanionStore, type CompanionStore } from './companion-store';
export { configureCompanion } from './digest';
export { configureLocalStt, configureStt } from './stt';
export { createSttCredentials } from './stt/credentials';
export { configureCompanionTtsBroker, companionTtsModelOnDisk, disposeCompanionTtsBroker } from './tts-broker';
export { configureUiBridge, requestUiAction, resolveUiReply, UI_BRIDGE_TIMEOUT_MESSAGE, type UiBridgeWindow } from './ui-bridge';
export {
  STUB_COMPANION_SERVICES,
  companionServices,
  configureCompanionServices,
  type CompanionDispatchResult,
  type CompanionMainServices,
  type CompanionSafeStorage,
} from './services';

/** `handle` with the `GitOpResult` failure as its invalid-payload answer — desktop's `handleOp`. */
function handleOp<S extends z.ZodTypeAny>(
  ipc: RuntimeIpc,
  channel: string,
  schema: S,
  handler: (payload: z.output<S>) => Promise<GitOpResult>,
): void {
  ipc.handle<S, GitOpResult>(channel, schema, handler, (issue) => failure(issue));
}

/**
 * The companion's main half (Phase 123 Theme F): its grounding channels (Phase 79 Theme B), the one
 * headless question (Theme E), the UI-bridge reply, and the voice (STT and the local TTS engine).
 *
 * Both grounding reads are read-only, compose the MCP tools in-process through
 * `CompanionMainServices.dispatch`, and **always resolve** — a validation failure answers with a
 * "nothing to say" value rather than a rejection. `companionAsk` answers a `GitOpResult` because its
 * failures are things the companion *says*.
 */
export const companionMain = defineFeatureMain<CompanionMainServices>({
  feature: companionManifest.feature,
  channels: [...companionManifest.ipc, ...companionManifest.sends],
  register(ctx, services) {
    const { ipc } = ctx;
    configureCompanionServices(services);

  ipc.handle<typeof schemas.CompanionSnapshotRequest, CompanionSnapshot>(
    CHANNELS.companionSnapshot,
    schemas.CompanionSnapshotRequest,
    (req) => buildCompanionSnapshot(req),
    () => emptyCompanionSnapshot(),
  );

  ipc.handle<typeof schemas.CompanionDigestRequest, CompanionDigest>(
    CHANNELS.companionDigest,
    schemas.CompanionDigestRequest,
    (req) => buildCompanionDigest(req),
    // A window with nothing in it, dated now: `summariseDigest` turns that
    // into "nothing has landed", which is the truthful answer to a request
    // this process could not read.
    () => ({ landed: [], inProgress: [], since: Date.now() }),
  );

  ipc.handle<typeof schemas.CompanionAskRequest, GitOpResult<CompanionAskReply>>(
    CHANNELS.companionAsk,
    schemas.CompanionAskRequest,
    (req) =>
      askCompanion({
        kind: req.kind,
        text: req.text,
        repoPath: req.repoPath,
        agentId: req.agentId,
        snapshot: req.snapshot,
        personality: req.personality,
        aboutUser: req.aboutUser,
        vocabulary: req.vocabulary,
        persona: req.persona,
      }),
    (issue) => failure(issue),
  );

  /*
    Phase 81 Theme F's one new pair — the renderer's one-way reply to
    `EVENT_CHANNELS.companionUiRequest`. `handleSend`, not `handle`: there is
    nothing to answer back over IPC — `resolveUiReply` settles the promise
    `ui-bridge.ts` is already holding for this `id`, and a reply for an id
    nobody is waiting on (already timed out, or a stray message) is silently
    dropped rather than logged as a bug — a race between a 5s timeout and a
    slow renderer is an ordinary outcome, not one.
  */
  ipc.send(
    CHANNELS.companionUiReply,
    schemas.CompanionUiReplySchema,
    (req) => resolveUiReply(req.id, req.result),
    () => {},
  );

  /*
    Theme F's three (Phase 79). `handleOp` for the two that can fail in ways a user acts
    on — `transcribeUtterance` and `testSttCredential` never throw, so an
    invalid payload arriving as `failure(...)` is the same shape as a 401 and
    the input bar has one branch, not two.
  */
  handleOp(ipc, CHANNELS.companionTranscribe, schemas.CompanionTranscribeRequest, (req) =>
    transcribeUtterance(req),
  );

  handleOp(ipc, CHANNELS.companionSttTest, schemas.CompanionSttTestRequest, (req) =>
    testSttCredential(req.providerId),
  );

  /*
    The key crosses the boundary here and only here, in this direction. There
    is no channel that reads one back: `companionSttStatus` answers with a
    boolean per provider, which is the only thing any UI needs to know.
  */
  handleOp(ipc, CHANNELS.companionSttSet, schemas.CompanionSttSetRequest, async (req) => {
    await sttDeps().credentials.set(req.providerId, req.key);
    return ok();
  });

  ipc.handle<typeof schemas.CompanionSttStatusRequest, z.infer<typeof schemas.CompanionSttStatusResponse>>(
    CHANNELS.companionSttStatus,
    schemas.CompanionSttStatusRequest,
    async (req) => {
      const { credentials } = sttDeps();
      return {
        configured: await credentials.configured(),
        encryptionAvailable: credentials.isAvailable(),
        // `STT_PROVIDER_FACTORIES` is the one place "actually implemented"
        // is decided — reported here so the renderer's mic button can tell
        // "no key" apart from "a key for a provider that doesn't exist yet".
        implemented: Object.keys(STT_PROVIDER_FACTORIES) as SttProviderId[],
        localModel: await getLocalWhisperStatus(req.retry ?? false),
        microphoneAccess: services.microphoneAccess(),
      };
    },
    // Never actually invalid — every caller sends at least `{}` — but `handle` needs an arm.
    () => ({
      configured: [],
      encryptionAvailable: false,
      implemented: [],
      localModel: { state: 'idle', reason: null, message: null },
    }),
  );

  /*
    The local voice engine (Phase 80 Theme C; moved off the main thread onto
    its own `utilityProcess` — Ad Hoc "TTS synthesis blocks the UI"). `handleOp`
    fits exactly: `synthesizeSpeechAsync` (`tts-broker.ts`) already answers
    `GitOpResult` and never throws, so an invalid payload arriving as
    `failure(...)` is the same shape the renderer already branches on for
    every other failure mode (missing native module, unprovisioned model, a
    bad synthesis, or now a crashed/cancelled worker request) — `speaker.ts`
    falls back to `speechSynthesis` for all of them alike.
  */
  handleOp(ipc, CHANNELS.companionTtsSynthesize, schemas.CompanionTtsSynthesizeRequest, (req) =>
    synthesizeSpeechAsync(req.text, req.voice),
  );

  /*
    The status sibling (Phase 80 Theme C follow-up): `handleOp` fits here too
    even though `getCompanionTtsStatusAsync` cannot itself fail — it is
    always `ok(...)`, with the state living in the value per the schema's own
    doc — because it keeps this channel's answer shaped exactly like every
    other one here, so the renderer has one envelope to unwrap, not two.
  */
  handleOp(ipc, CHANNELS.companionTtsStatus, schemas.CompanionTtsStatusRequest, async (req) =>
    ok(await getCompanionTtsStatusAsync(req.retry ?? false)),
  );

  /*
    Ad Hoc: an interrupt (Escape, a click, a new utterance) has something
    worth cancelling in main now that synthesis runs in its own process —
    `cancelQueuedSynthesis` drops whatever `tts-broker.ts` has queued but not
    yet dispatched to the worker. One-way (`handleSend`, not `handleOp`):
    there is nothing to answer, and a malformed payload on a bare-signal
    channel is not evidence of anything worth logging the way
    `report-handlers.ts`'s own `handleSend` use is — `onInvalid` is a no-op.
  */
  ipc.send(
    CHANNELS.companionTtsCancel,
    schemas.CompanionTtsCancelRequest,
    () => cancelQueuedSynthesis(),
    () => {},
  );

  /*
    Settings' "Reload local engine" control (Ad Hoc: recover from a crashed
    worker without restarting the app). `handleOp` fits the same way
    `companionTtsStatus` does — `reloadCompanionTtsBroker` cannot itself
    fail; the state a reload landed in lives in the value it resolves with
    (the identical `CompanionTtsStatusResponse` shape), not in `ok`.
  */
  handleOp(ipc, CHANNELS.companionTtsReload, schemas.CompanionTtsReloadRequest, async () =>
    ok(await reloadCompanionTtsBroker()),
  );

  // Phase 109 Theme F: the audition's "is the local voice downloaded?" — from
  // disk, so asking never spawns the worker or starts the download.
  handleOp(ipc, CHANNELS.companionTtsModelOnDisk, schemas.CompanionTtsModelOnDiskRequest, async () =>
    ok({ onDisk: companionTtsModelOnDisk() }),
  );
  },
});
