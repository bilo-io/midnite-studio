// Batched `gh` JSON wrappers (Phase 151 Theme A). Every call resolves to an envelope, never throws:
// `{ok:true, data}` or `{ok:false, kind:'auth'|'rate-limit'|'not-found'|'error', message}`.
// `run(args) => Promise<string>` is injectable for tests. Set GH_TOKEN in the env to pick the account.
import { execFile } from 'node:child_process';

export const defaultRun = (args, { cwd, env } = {}) =>
  new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(stdout);
    });
  });

/** Map a gh failure to an error kind. */
export function classifyError(text) {
  const t = String(text);
  if (/rate limit|API rate|secondary rate/i.test(t)) return 'rate-limit';
  if (/auth|gh auth login|not logged in|bad credentials|HTTP 401|GH_TOKEN/i.test(t)) return 'auth';
  if (/not found|HTTP 404|Could not resolve/i.test(t)) return 'not-found';
  return 'error';
}

export async function ghJson(args, { run = defaultRun, cwd, env } = {}) {
  try {
    const out = await run(args, { cwd, env });
    return { ok: true, data: out.trim() === '' ? null : JSON.parse(out) };
  } catch (e) {
    const message = String(e?.stderr || e?.message || e).trim();
    return { ok: false, kind: classifyError(message), message };
  }
}

const repoArgs = (repo) => (repo ? ['--repo', repo] : []);
const PR_FIELDS = 'number,title,author,state,isDraft,headRefName,baseRefName,additions,deletions,changedFiles,mergeable,reviewDecision,statusCheckRollup,labels,url,createdAt,updatedAt';

export const prView = (n, o = {}) => ghJson(['pr', 'view', String(n), '--json', o.fields ?? PR_FIELDS, ...repoArgs(o.repo)], o);
export const prList = (o = {}) =>
  ghJson(['pr', 'list', '--state', o.state ?? 'open', '--limit', String(o.limit ?? 100), '--json', o.fields ?? PR_FIELDS, ...repoArgs(o.repo)], o);
export const prChecks = (n, o = {}) =>
  ghJson(['pr', 'checks', String(n), '--json', o.fields ?? 'name,state,bucket,workflow,link,startedAt,completedAt', ...repoArgs(o.repo)], o);
export const issueList = (o = {}) =>
  ghJson(
    ['issue', 'list', '--state', o.state ?? 'open', '--limit', String(o.limit ?? 100), '--json', o.fields ?? 'number,title,labels,assignees,author,createdAt,url,body', ...repoArgs(o.repo)],
    o,
  );
export const runList = (o = {}) =>
  ghJson(
    ['run', 'list', '--limit', String(o.limit ?? 20), ...(o.branch ? ['--branch', o.branch] : []), '--json', o.fields ?? 'databaseId,name,status,conclusion,headSha,headBranch,createdAt,updatedAt,url', ...repoArgs(o.repo)],
    o,
  );
