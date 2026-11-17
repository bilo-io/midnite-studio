// Helpers shared by the PR skill scripts (Phase 151 Theme D): the bilo-io token, a branch-to-phase
// guess, and the attribution-trailer test. Pure except `biloToken`.
import { execFileSync } from 'node:child_process';

export const REPO = 'bilo-io/midnite-studio';

/** Token for the `bilo-io` account; the active gh account is often a different one and 403s. */
export function biloToken() {
  try {
    return execFileSync('gh', ['auth', 'token', '-u', 'bilo-io'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export const hasTrailer = (message) => /^(Co-Authored-By|Signed-off-by):/im.test(message ?? '');

/** `phase-151-skill-scripts` or `feature/p151-d` -> `{phase:151, theme:'D'}`. */
export function phaseFromBranch(branch) {
  const m = /(?:phase-?|\bp)(\d{1,3})(?:[-_/]([a-z])\b)?/i.exec(branch ?? '');
  return m ? { phase: Number(m[1]), theme: m[2] ? m[2].toUpperCase() : null } : { phase: null, theme: null };
}

export const arg = (argv, name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};
