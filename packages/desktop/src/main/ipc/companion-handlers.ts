import { CHANNELS, emptyCompanionSnapshot, failure, ok, schemas } from '@midnite/studio-shared';
import type {
  CompanionAskReply,
  CompanionDigest,
  CompanionSnapshot,
  GitOpResult,
  SttProviderId,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { askCompanion } from '../companion/ask';
import { buildCompanionDigest } from '../companion/digest';
import { buildCompanionSnapshot } from '../companion/snapshot';
import {
  STT_PROVIDER_FACTORIES,
  sttDeps,
  testSttCredential,
  transcribeUtterance,
} from '../companion/stt';
import { getCompanionTtsStatus, synthesizeSpeech } from '../companion/tts';
import { handle, handleBare, handleOp } from './handle';

/**
 * The companion's grounding channels (Phase 79 Theme B) and its one headless
 * question (Theme E).
 *
 * Both are read-only, both compose the Phase 57 MCP tools in-process, and
 * both **always resolve** — `handle` answers a validation failure with a value
 * rather than a rejection (`handle.ts`), and the fallback for each is the
 * "nothing to say" shape rather than an error the renderer has to branch on.
 * An empty snapshot is a state the script already handles (no repo open); a
 * companion that threw would be a greeting that never arrives.
 *
 * `companionAsk` is the odd one out and answers a `GitOpResult` envelope
 * rather than a fallback value, because its failures are things the companion
 * *says* — "nothing is installed", "that took too long" — rather than states
 * it renders. `handleOp` is not used for it only because the payload's invalid
 * arm wants the same envelope with a channel-specific message.
 *
 * `mcp-handlers.ts` is the crib for the file's shape — forward to the module
 * that does the work, register nothing else here.
 */
export function registerCompanionHandlers(): void {
  handle<typeof schemas.CompanionSnapshotRequest, CompanionSnapshot>(
    CHANNELS.companionSnapshot,
    schemas.CompanionSnapshotRequest,
    (req) => buildCompanionSnapshot(req),
    () => emptyCompanionSnapshot(),
  );

  handle<typeof schemas.CompanionDigestRequest, CompanionDigest>(
    CHANNELS.companionDigest,
    schemas.CompanionDigestRequest,
    (req) => buildCompanionDigest(req),
    // A window with nothing in it, dated now: `summariseDigest` turns that
    // into "nothing has landed", which is the truthful answer to a request
    // this process could not read.
    () => ({ landed: [], inProgress: [], since: Date.now() }),
  );

  handle<typeof schemas.CompanionAskRequest, GitOpResult<CompanionAskReply>>(
    CHANNELS.companionAsk,
    schemas.CompanionAskRequest,
    (req) =>
      askCompanion({
        kind: req.kind,
        text: req.text,
        repoPath: req.repoPath,
        agentId: req.agentId,
        snapshot: req.snapshot,
      }),
    (issue) => failure(issue),
  );

  /*
    Theme F's three. `handleOp` for the two that can fail in ways a user acts
    on — `transcribeUtterance` and `testSttCredential` never throw, so an
    invalid payload arriving as `failure(...)` is the same shape as a 401 and
    the input bar has one branch, not two.
  */
  handleOp(CHANNELS.companionTranscribe, schemas.CompanionTranscribeRequest, (req) =>
    transcribeUtterance(req),
  );

  handleOp(CHANNELS.companionSttTest, schemas.CompanionSttTestRequest, (req) =>
    testSttCredential(req.providerId),
  );

  /*
    The key crosses the boundary here and only here, in this direction. There
    is no channel that reads one back: `companionSttStatus` answers with a
    boolean per provider, which is the only thing any UI needs to know.
  */
  handleOp(CHANNELS.companionSttSet, schemas.CompanionSttSetRequest, async (req) => {
    await sttDeps().credentials.set(req.providerId, req.key);
    return ok();
  });

  handleBare<z.infer<typeof schemas.CompanionSttStatusResponse>>(
    CHANNELS.companionSttStatus,
    async () => {
      const { credentials } = sttDeps();
      return {
        configured: await credentials.configured(),
        encryptionAvailable: credentials.isAvailable(),
        // `STT_PROVIDER_FACTORIES` is the one place "actually implemented"
        // is decided — reported here so the renderer's mic button can tell
        // "no key" apart from "a key for a provider that doesn't exist yet".
        implemented: Object.keys(STT_PROVIDER_FACTORIES) as SttProviderId[],
      };
    },
  );

  /*
    The local voice engine (Phase 80 Theme C). `handleOp` fits exactly:
    `synthesizeSpeech` already answers `GitOpResult` and never throws, so an
    invalid payload arriving as `failure(...)` is the same shape the renderer
    already branches on for every other failure mode (missing native module,
    unprovisioned model, a bad synthesis) — `speaker.ts` falls back to
    `speechSynthesis` for all of them alike.
  */
  handleOp(CHANNELS.companionTtsSynthesize, schemas.CompanionTtsSynthesizeRequest, (req) =>
    synthesizeSpeech(req.text),
  );

  /*
    The status sibling (Phase 80 Theme C follow-up): `handleOp` fits here too
    even though `getCompanionTtsStatus` cannot itself fail — it is always
    `ok(...)`, with the state living in the value per the schema's own doc —
    because it keeps this channel's answer shaped exactly like every other
    one here, so the renderer has one envelope to unwrap, not two.
  */
  handleOp(CHANNELS.companionTtsStatus, schemas.CompanionTtsStatusRequest, async (req) =>
    ok(await getCompanionTtsStatus(req.retry ?? false)),
  );
}
