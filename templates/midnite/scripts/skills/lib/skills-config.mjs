// Per-repo settings for the skill scripts. These scripts ship verbatim in the onboarding kit
// (templates/midnite/scripts/skills/), so nothing here may name one repo: the repo slug, the gh account
// to push and file as, the tracker's project board and the full gate all come from, in order,
// an environment variable > `.midnite/skills.json` at the repo root > a neutral default
// (the `origin` remote, the active gh account, no board, no gate). See docs/TRACKER.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG_REL = '.midnite/skills.json';
export const ENV = { repo: 'MIDNITE_REPO', ghUser: 'MIDNITE_GH_USER', project: 'MIDNITE_TRACKER_PROJECT' };

const sh = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

/** `git@github.com:o/r.git`, `https://github.com/o/r(.git)` or `ssh://git@github.com/o/r` -> `o/r`; else null. */
export function slugFromRemote(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url ?? '');
  return m ? `${m[1]}/${m[2]}` : null;
}

const posInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Resolve the settings. Pure over its inputs: `readFile` and `git` are injectable for tests.
 * Returns `{ root, repo, ghUser, project, issueRepos, gate, source }` where every unknown is null.
 */
export function loadSkillsConfig({
  cwd = process.cwd(),
  env = process.env,
  git = (args) => sh('git', args, cwd),
  readFile = (p) => readFileSync(p, 'utf8'),
} = {}) {
  const root = git(['rev-parse', '--show-toplevel']) || cwd;
  let file = {};
  try {
    const parsed = JSON.parse(readFile(join(root, CONFIG_REL)));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) file = parsed;
  } catch {
    // absent or not JSON: every field falls through to its default
  }
  const repo = env[ENV.repo] || (typeof file.repo === 'string' && file.repo) || slugFromRemote(git(['remote', 'get-url', 'origin']));
  const ghUser = env[ENV.ghUser] || (typeof file.ghUser === 'string' && file.ghUser) || null;
  const project = posInt(env[ENV.project]) ?? posInt(file.project);
  const issueRepos = Array.isArray(file.issueRepos) && file.issueRepos.length
    ? file.issueRepos.filter((r) => r && typeof r.repo === 'string').map((r, i) => ({ id: String(r.id ?? `repo${i + 1}`), repo: r.repo, labelFilter: r.labelFilter ?? null, boost: Number(r.boost) || 0 }))
    : repo ? [{ id: 'repo', repo, labelFilter: null, boost: 0 }] : [];
  const gate = Array.isArray(file.gate) && file.gate.length && file.gate.every((a) => typeof a === 'string') ? file.gate : null;
  return { root, repo: repo || null, ghUser, project, issueRepos, gate };
}

let cached;
/** The settings of the repo the script runs in, read once per process. */
export function skillsConfig() {
  cached ??= loadSkillsConfig();
  return cached;
}

/** A gh token for the configured account (`ghUser`), else the active account's; '' when gh has none. */
export function ghToken({ ghUser = skillsConfig().ghUser, run = (args) => sh('gh', args) } = {}) {
  return run(ghUser ? ['auth', 'token', '-u', ghUser] : ['auth', 'token']);
}
