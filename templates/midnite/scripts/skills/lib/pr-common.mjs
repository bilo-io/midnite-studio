// Helpers shared by the PR skill scripts (Phase 151 Theme D): the repo slug and gh token (both from
// lib/skills-config.mjs), a branch-to-phase guess, and the attribution-trailer test.
import { ghToken, skillsConfig } from './skills-config.mjs';

/** `owner/name` of the repo the scripts run in: $MIDNITE_REPO > .midnite/skills.json > the origin remote. */
export const REPO = skillsConfig().repo;

/** Token for the configured gh account (`ghUser`), else the active one; '' when gh has none. */
export const repoToken = () => ghToken();

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
