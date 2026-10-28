import { rmSync } from 'node:fs';

/**
 * The few confinement helpers the pty broker needs (Phase 121 Theme E). They live under `broker/`
 * because that is the only subpath of the runtime the broker bundle can import; `security/confine.ts`
 * re-exports them for everyone else.
 */

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

/** The path shape a broker will accept as a profile: ours, under `security/profiles`, one file deep. */
export function isProfilePath(path: string): boolean {
  return /\/security\/profiles\/[A-Za-z0-9._-]+\.sb$/.test(path) && !path.includes('..');
}

export interface ConfinedCommand {
  command: string;
  args: string[];
}

/** `sandbox-exec -f <profile> <command> <args...>` */
export function wrapWithSandbox(profilePath: string, command: string, args: readonly string[] = []): ConfinedCommand {
  return { command: SANDBOX_EXEC, args: ['-f', profilePath, command, ...args] };
}

/** Remove one profile file; never throws. */
export function removeProfileFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Already gone, or not ours to remove.
  }
}
