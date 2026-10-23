import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Running a spawn under `sandbox-exec` — Phase 121 Theme E.
 *
 * The profile text comes from `seatbelt-profile.ts`; this module owns the rest: is the binary there
 * and does it accept a profile (the capability probe), where the 0600 profile file lives, and how a
 * `command args` pair becomes `sandbox-exec -f <profile> command args`. `sandbox-exec` is deprecated
 * and still ships in macOS 26 (Chromium confines its renderers through the same `sandbox_init`), so
 * "unavailable" is a first-class answer: the caller falls back to an unconfined spawn and the UI says so.
 */

import { SANDBOX_EXEC, removeProfileFile } from '../broker/confine-wrap';

export { SANDBOX_EXEC, isProfilePath, removeProfileFile, wrapWithSandbox, type ConfinedCommand } from '../broker/confine-wrap';
const PROFILES_DIR = join('security', 'profiles');

/** A minimal profile the probe asks the kernel to accept. */
const PROBE_PROFILE = '(version 1)(allow default)';

export interface ConfinementAvailability {
  available: boolean;
  /** Why not, in one sentence a settings row can show; absent when available. */
  reason?: string;
}

export interface ProbeDeps {
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
  /** Runs `sandbox-exec -p <profile> /usr/bin/true`; `true` when it exited 0. */
  run?: (command: string, args: string[]) => boolean;
}

/** Does `sandbox-exec` exist here and accept a profile? Synchronous, a few ms; cache the answer. */
export function probeConfinement(deps: ProbeDeps = {}): ConfinementAvailability {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'darwin') return { available: false, reason: 'Confinement uses macOS Seatbelt; it is not available on this platform.' };
  const exists = deps.exists ?? existsSync;
  if (!exists(SANDBOX_EXEC)) return { available: false, reason: 'sandbox-exec is not present on this Mac.' };
  const run =
    deps.run ??
    ((command, args) => {
      const result = spawnSync(command, args, { stdio: 'ignore', timeout: 5000 });
      return result.status === 0;
    });
  if (!run(SANDBOX_EXEC, ['-p', PROBE_PROFILE, '/usr/bin/true'])) {
    return { available: false, reason: 'sandbox-exec is present but refused a profile.' };
  }
  return { available: true };
}

let cached: ConfinementAvailability | null = null;
/** The probe, run once per process. */
export function confinementAvailability(): ConfinementAvailability {
  cached ??= probeConfinement();
  return cached;
}
export function resetConfinementProbeForTests(): void {
  cached = null;
}

/** `<userData>/security/profiles` */
export function profilesDirectory(userData: string): string {
  return join(userData, PROFILES_DIR);
}

/** Write `profile` as `<userData>/security/profiles/<id>.sb`, the directory 0700 and the file 0600. Returns the path. */
export function writeProfileFile(userData: string, profile: string, id: string = randomUUID()): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('A profile id may only hold letters, digits, dot, dash and underscore.');
  const dir = profilesDirectory(userData);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${id}.sb`);
  writeFileSync(path, profile, { mode: 0o600 });
  return path;
}

/** On boot, delete every profile left by a session that died with the app. Returns how many. */
export function sweepProfileFiles(userData: string): number {
  let removed = 0;
  try {
    for (const name of readdirSync(profilesDirectory(userData))) {
      if (!name.endsWith('.sb')) continue;
      removeProfileFile(join(profilesDirectory(userData), name));
      removed++;
    }
  } catch {
    // No directory yet.
  }
  return removed;
}

/** A prepared confinement for one spawn: the profile on disk and how to take it away. */
export interface PreparedConfinement {
  profilePath: string;
  /** Delete the profile file. Idempotent. */
  dispose(): void;
}

/** Write the profile and hand back the wrapper handle. */
export function prepareConfinement(userData: string, profile: string, id?: string): PreparedConfinement {
  const profilePath = writeProfileFile(userData, profile, id);
  return { profilePath, dispose: () => removeProfileFile(profilePath) };
}

/** Async `ps -A -o pid=,ppid=` as a parent map, for attributing a denial to a session's process tree. */
export function readProcessTable(): Promise<Map<number, number>> {
  return new Promise((resolve) => {
    execFile('/bin/ps', ['-A', '-o', 'pid=,ppid='], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      const parents = new Map<number, number>();
      if (!error) {
        for (const line of stdout.split('\n')) {
          const [pid, ppid] = line.trim().split(/\s+/).map(Number);
          if (Number.isInteger(pid) && Number.isInteger(ppid)) parents.set(pid as number, ppid as number);
        }
      }
      resolve(parents);
    });
  });
}
