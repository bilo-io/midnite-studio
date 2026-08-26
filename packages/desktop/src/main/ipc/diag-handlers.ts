import {
  CHANNELS,
  schemas,
  type DiagnosticsRun,
  type DiagnosticsTrustStatus,
} from '@midnite/git-shared';

import { detectCandidates, isProposedCommand } from '../diagnostics/detect';
import { runDiagnostics } from '../diagnostics/runner';
import { nullTrustStore, type TrustStore } from '../diagnostics/trust-store';
import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

/**
 * The diagnostics channels — and the enforcement point for the trust policy
 * stated in `../diagnostics/index.ts`.
 *
 * Two rules live here rather than deeper down, because this is the boundary
 * where renderer-supplied values stop being renderer-supplied:
 *
 * 1. **`run` refuses without a live grant.** The runner itself does what it is
 *    told; the check is here, once, rather than duplicated in the mechanism
 *    where a second copy could drift.
 * 2. **`trust` only records commands main itself proposed.** The command
 *    crosses on that call because it is the thing being approved — but the
 *    handler re-runs detection and refuses anything that is not in the result.
 *    Otherwise a compromised renderer could hand over an arbitrary executable
 *    and the "trust" verb would be an arbitrary-execution primitive with a
 *    consent-shaped name.
 *
 * Everything resolves. A repository that is closed, untrusted, unlintable or
 * broken produces a payload the footer renders — never a rejection.
 */

let store: TrustStore = nullTrustStore;

/** Injected at boot with a store rooted at `app.getPath('userData')`. */
export function configureDiagnostics(next: TrustStore): void {
  store = next;
}

const NO_REPO: DiagnosticsTrustStatus = { state: 'no-command', command: null, trustedAt: null };

export function registerDiagHandlers(): void {
  handle<typeof schemas.DiagTrustStatusRequest, DiagnosticsTrustStatus>(
    CHANNELS.diagTrustStatus,
    schemas.DiagTrustStatusRequest,
    (req) => store.status(req.repoId),
    () => NO_REPO,
  );

  handle<typeof schemas.DiagDetectRequest, { candidates: Awaited<ReturnType<typeof detectCandidates>> }>(
    CHANNELS.diagDetect,
    schemas.DiagDetectRequest,
    async (req) => {
      const workdir = await resolveWorkdir(req.repoId);
      // Detection reads the filesystem and executes nothing, so it is safe to
      // call for any repo at any time — but a repo we do not have open has no
      // checkout to read.
      if (!workdir) return { candidates: [] };
      return { candidates: await detectCandidates(workdir) };
    },
    () => ({ candidates: [] }),
  );

  handle<typeof schemas.DiagTrustRequest, DiagnosticsTrustStatus>(
    CHANNELS.diagTrust,
    schemas.DiagTrustRequest,
    async (req) => {
      const workdir = await resolveWorkdir(req.repoId);
      if (!workdir) return NO_REPO;

      // Re-derive what may legitimately be approved. The renderer's copy of the
      // command is a confirmation of something main offered, not an instruction.
      const candidates = await detectCandidates(workdir);
      if (!isProposedCommand(req.command, candidates)) {
        // Silently refuse to *store* it, and report the unchanged truth. There
        // is no error arm on purpose: the only way to reach this is a renderer
        // that is not the one we shipped, and it learns nothing from a message.
        return store.status(req.repoId);
      }

      return store.trust(req.repoId, req.command, Date.now());
    },
    () => NO_REPO,
  );

  handle<typeof schemas.DiagUntrustRequest, DiagnosticsTrustStatus>(
    CHANNELS.diagUntrust,
    schemas.DiagUntrustRequest,
    (req) => store.untrust(req.repoId),
    () => NO_REPO,
  );

  handle<typeof schemas.DiagRunRequest, DiagnosticsRun>(
    CHANNELS.diagRun,
    schemas.DiagRunRequest,
    async (req) => {
      const status = await store.status(req.repoId);

      if (status.state === 'no-command') {
        return {
          ok: false,
          reason: 'no-command',
          hint: 'No linter is configured for this repository.',
        };
      }
      if (status.state !== 'trusted') {
        return {
          ok: false,
          reason: 'untrusted',
          hint:
            status.state === 'command-changed'
              ? 'The configured command has changed since you enabled diagnostics.'
              : 'Diagnostics are not enabled for this repository.',
        };
      }

      // The workdir comes from the registry, never from the renderer — the
      // forge-handlers rule, and the reason the channel carries a repoId only.
      const [command, workdir] = await Promise.all([
        store.trustedCommand(req.repoId),
        resolveWorkdir(req.repoId),
      ]);
      if (!command) {
        return { ok: false, reason: 'untrusted', hint: 'The grant no longer applies.' };
      }
      if (!workdir) {
        return { ok: false, reason: 'no-command', hint: 'That repository is not open.' };
      }

      return runDiagnostics(command, workdir);
    },
    (issue) => ({ ok: false, reason: 'no-command', hint: issue }),
  );
}
