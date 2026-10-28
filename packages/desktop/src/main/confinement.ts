import { join } from 'node:path';

import {
  VAULT_GRANTS_FILE,
  VAULT_NAMESPACES,
  createDenialWatcher,
  generateSeatbeltProfile,
  prepareConfinement,
  resolveSessionRoots,
  type ConfinementAvailability,
  type DenialFinding,
  type DenialWatcher,
  type PreparedConfinement,
} from '@midnite/studio-runtime';
import type { ConfinementStatus, NewAgentAuditRecord, NewSecurityFinding } from '@midnite/studio-shared';

/**
 * Studio's confined sessions (Phase 121 Theme E): decide whether a new session is confined, build and
 * write its Seatbelt profile, and attribute the kernel's denials to it afterwards. The mechanism
 * is the runtime's (`seatbelt-profile.ts`, `confine.ts`, `confine-denials.ts`); this is the wiring to
 * what only main knows: the repo registry, the setting, the audit trail and the findings ledger.
 *
 * Confinement is **default off** this phase (Decisions 4 and 5): `enabled()` is the
 * `confineNewSessions` setting. A caller may still force it either way for one session.
 */
export interface ConfinementDeps {
  userData: string;
  homeDir: string;
  availability: () => ConfinementAvailability;
  /** The "Confine new sessions" setting. */
  enabled: () => boolean;
  /** Every registered repo's path. */
  registryRepos: () => Promise<string[]>;
  audit: { record(input: NewAgentAuditRecord): string };
  raiseFinding: (finding: NewSecurityFinding) => unknown;
  /** Test seams. */
  resolveRoots?: (cwd: string) => Promise<string[]>;
  denials?: DenialWatcher;
  log?: (message: string) => void;
}

export type ConfinePrepared = { ok: true; profile: string; release: () => void } | { ok: false; message: string };

export interface ConfinementService {
  status(): ConfinementStatus;
  /**
   * `null` when this session is not confined. `requested` overrides the setting for one session
   * (`true` fails closed when confinement is unavailable; `false` opts out).
   */
  prepare(sessionId: string, cwd: string, requested?: boolean): Promise<ConfinePrepared | null>;
  /** The session's process is running: attribute its denials to it. */
  track(sessionId: string, pid: number): void;
  /** The session ended. */
  release(sessionId: string): void;
  stop(): void;
}

function findingFor(finding: DenialFinding): NewSecurityFinding {
  return {
    source: 'agents',
    severity: 'medium',
    category: 'agent',
    fingerprint: `agents:confine-denials:${finding.sessionId}`,
    title: 'A confined agent session keeps hitting the sandbox',
    detail: `${finding.count} operations were refused in ${Math.round(finding.windowMs / 1000)}s (latest: ${finding.sample.process} ${finding.sample.operation} ${finding.sample.target}). The agent is trying to reach files its profile does not allow.`,
    evidence: [],
    remediation: [{ id: 'pause-session', sessionId: finding.sessionId, description: 'Interrupt the session' }],
    sessionId: finding.sessionId,
  };
}

export function createConfinementService(deps: ConfinementDeps): ConfinementService {
  const prepared = new Map<string, PreparedConfinement>();
  const denials =
    deps.denials ??
    createDenialWatcher({
      audit: deps.audit,
      raiseFinding: (finding) => void deps.raiseFinding(findingFor(finding)),
      onError: (error) => deps.log?.(`confinement denial watcher: ${String(error)}`),
    });

  const protectedFiles = [
    ...Object.values(VAULT_NAMESPACES).map((spec) => join(deps.userData, spec.fileName)),
    join(deps.userData, VAULT_GRANTS_FILE),
  ];
  // The audit trail and the profiles themselves: an agent that could rewrite either could hide what it did.
  const protectedDirs = [join(deps.userData, 'security')];

  const release = (sessionId: string): void => {
    denials.untrack(sessionId);
    prepared.get(sessionId)?.dispose();
    prepared.delete(sessionId);
  };

  return {
    status() {
      const availability = deps.availability();
      return {
        available: availability.available,
        ...(availability.reason ? { reason: availability.reason } : {}),
        enabled: availability.available && deps.enabled(),
      };
    },
    async prepare(sessionId, cwd, requested) {
      const wanted = requested ?? deps.enabled();
      if (!wanted) return null;
      const availability = deps.availability();
      if (!availability.available) {
        // Settings default is a convenience, so it falls back; an explicit request must not run bare.
        return requested === true ? { ok: false, message: availability.reason ?? 'Confinement is not available.' } : null;
      }
      try {
        const [roots, registry] = await Promise.all([(deps.resolveRoots ?? resolveSessionRoots)(cwd), deps.registryRepos()]);
        const profile = generateSeatbeltProfile({
          repoRoots: roots,
          registryRepos: registry,
          userData: deps.userData,
          protectedFiles,
          protectedDirs,
          home: deps.homeDir,
        });
        const file = prepareConfinement(deps.userData, profile, sessionId.replace(/[^A-Za-z0-9._-]/g, '_'));
        prepared.set(sessionId, file);
        return { ok: true, profile: file.profilePath, release: () => release(sessionId) };
      } catch (error) {
        return { ok: false, message: `Could not build the sandbox profile: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    track(sessionId, pid) {
      denials.track(sessionId, pid);
    },
    release,
    stop() {
      denials.stop();
      for (const file of prepared.values()) file.dispose();
      prepared.clear();
    },
  };
}

let service: ConfinementService | null = null;

export function configureConfinement(next: ConfinementService | null): void {
  service?.stop();
  service = next;
}

export function confinementService(): ConfinementService | null {
  return service;
}
