import { posix } from 'node:path';

import {
  AGENT_LIMIT_LABELS,
  type AgentAuditRecord,
  type AgentLimitKey,
  type EvidenceItem,
  type NewSecurityFinding,
  type SecurityFinding,
} from '@midnite/studio-shared';

/**
 * Rogue agent behaviour (Phase 120 Theme G): each rule is a **pure function over a window of audit-trail
 * records** (Phase 121 G's `AgentAuditRecord`s, as the runtime reader hands them out) that returns findings.
 * No clock, no disk, no `electron`: the sensor in `rogue-sensor.ts` reads the trail, feeds the new records
 * through {@link evaluateRogueRules} and records what comes back.
 *
 * What the trail can see is what a rule can judge. A command line typed into an agent's pty is a `command`
 * record; a refused sandbox operation is a `confine-denial`; the breaker's trips are `limit-trip`s. The
 * trail holds no file contents and no tool arguments, so "a read under ~/.ssh" means a command line that
 * names such a path, and "a write outside the scope jail" means a redirect or a copy to somewhere outside the
 * session's roots (or a write the sandbox itself refused).
 *
 * **Not through the write queue is every one of them, by construction.** The app's own git operations run in
 * main through `git-engine`'s write queue and never appear as a pty command, so a destructive git command
 * found in the trail was typed into an agent's terminal and is outside that queue.
 *
 * Findings carry the session they came from; the fingerprint is `agents:rogue:<rule>:<session>:<subject>`, so
 * the same behaviour twice in one session is one open finding whose count goes up, never a pile of rows.
 */

export type RogueRuleId =
  | 'secret-path-read'
  | 'write-outside-scope'
  | 'destructive-git'
  | 'keychain-password'
  | 'exfiltration'
  | 'canary-trip'
  | 'limit-burst'
  | 'correlated-change';

export interface RogueFinding extends Omit<NewSecurityFinding, 'source' | 'sessionId'> {
  rule: RogueRuleId;
  /** Always set: a rogue-behaviour finding belongs to the session that did it. */
  sessionId: string;
}

export interface RogueRuleContext {
  /** The real home directory (a trail record may carry `~` instead; both are understood). */
  homeDir: string;
  /**
   * The directories a session may write under (its working directory and worktree). Empty or unknown skips
   * the write rule for that session: a rule that cannot name the jail does not guess at it.
   */
  scopeRoots(sessionId: string): readonly string[];
  /**
   * Whether a session started with the user's intent to publish a package (Phase 121 D). Absent, or false, an
   * agent-issued `npm publish` is the `critical` shape: Shai-Hulud's propagation step. Nothing records a
   * session's launch intent yet, so today every real publish from an agent session lands here.
   */
  publishIntended?(sessionId: string): boolean;
}

export type RogueRule = (records: readonly AgentAuditRecord[], context: RogueRuleContext) => RogueFinding[];

// --- command-line reading ----------------------------------------------------------------------------

/** Split a command line into shell-ish words: quotes stripped, `;`, `|`, `&`, `<`, `>` and parens kept apart. */
export function commandWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  const flush = (): void => {
    if (current !== '') words.push(current);
    current = '';
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i] as string;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) current += command[(i += 1)] as string;
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '\\' && i + 1 < command.length) current += command[(i += 1)] as string;
    else if (/\s/.test(ch)) flush();
    else if (ch === '>' ) {
      flush();
      if (command[i + 1] === '>') i += 1;
      words.push('>');
    } else if (ch === ';' || ch === '|' || ch === '&' || ch === '<' || ch === '(' || ch === ')') {
      flush();
      words.push(ch);
    } else current += ch;
  }
  flush();
  return words;
}

const PREFIX_WORDS = new Set(['sudo', 'env', 'command', 'time', 'exec', 'nice', 'nohup']);

/** Index of the word that is the command itself: past env assignments (`A=1`) and wrappers such as `sudo`. */
function commandIndex(words: readonly string[]): number {
  let i = 0;
  while (i < words.length) {
    const w = words[i] as string;
    if (PREFIX_WORDS.has(w) || /^[A-Za-z_]\w*=/.test(w) || (w.startsWith('-') && i > 0)) i += 1;
    else break;
  }
  return i < words.length ? i : -1;
}

const SEPARATORS = new Set([';', '|', '&', '(', ')']);

/** The simple commands of a line: the words between separators. */
function segments(command: string): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const word of commandWords(command)) {
    if (SEPARATORS.has(word)) {
      if (current.length > 0) out.push(current);
      current = [];
    } else current.push(word);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** `~`, `~/x`, `$HOME/x` and `${HOME}/x` against the home directory; anything else is returned untouched. */
function expandHome(word: string, home: string): string {
  if (word === '~') return home;
  if (word.startsWith('~/')) return posix.join(home, word.slice(2));
  const m = /^\$\{?HOME\}?(\/.*)?$/.exec(word);
  if (m) return posix.join(home, m[1] ?? '');
  return word;
}

/** An absolute, normalised path for a word, or null when the word is not path-shaped. */
function resolveWord(word: string, home: string, cwd: string | undefined): string | null {
  const withEquals = word.startsWith('-') && word.includes('=') ? word.slice(word.indexOf('=') + 1) : word;
  if (withEquals === '' || withEquals.startsWith('-')) return null;
  const expanded = expandHome(withEquals, home);
  if (expanded.startsWith('/')) return posix.normalize(expanded);
  if (!/^[.\w@%+,:-]*\/|^\.\.?$/.test(expanded)) return null;
  return cwd ? posix.resolve(expandHome(cwd, home), expanded) : null;
}

const underDir = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

// --- rule: a secret path -----------------------------------------------------------------------------

const SECRET_DIRS = ['.ssh', '.aws', '.gnupg'] as const;
const VAULT_FILE = /(?:^|\/)(?:[^/]+\.vault\.json|vault-grants\.json)$/;

/** Which secret a path is, or null. The suite's vault files are matched by name wherever they sit. */
export function secretPathKind(path: string, home: string): string | null {
  for (const dir of SECRET_DIRS) if (underDir(path, posix.join(home, dir))) return `~/${dir}`;
  if (underDir(path, posix.join(home, 'Library/Keychains'))) return '~/Library/Keychains';
  if (path === posix.join(home, '.claude.json')) return '~/.claude.json';
  if (VAULT_FILE.test(path)) return "the suite's vault";
  return null;
}

/** A read under `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/Library/Keychains`, the suite's vault files or `~/.claude.json`. */
export const secretPathRule: RogueRule = (records, context) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    if (!record.sessionId) continue;
    const hits = new Map<string, string>();
    if (record.kind === 'command') {
      for (const words of segments(record.command)) {
        for (const word of words) {
          const path = resolveWord(word, context.homeDir, record.cwd);
          const kind = path === null ? null : secretPathKind(path, context.homeDir);
          if (path !== null && kind !== null) hits.set(path, kind);
        }
      }
    } else if (record.kind === 'confine-denial' && /read|open|stat|access|list/i.test(record.operation)) {
      const path = resolveWord(record.target, context.homeDir, undefined);
      const kind = path === null ? null : secretPathKind(path, context.homeDir);
      if (path !== null && kind !== null) hits.set(path, kind);
    }
    for (const [path, kind] of hits) {
      out.push({
        rule: 'secret-path-read',
        severity: 'high',
        category: 'agent',
        fingerprint: `agents:rogue:secret-path-read:${record.sessionId}:${path}`,
        title: `Agent touched ${kind}`,
        detail: `An agent session reached for ${path}, which holds credentials. Nothing it was asked to do should need it.`,
        evidence: [{ kind: 'path', path }, ...commandEvidence(record)],
        remediation: [pauseAction(record.sessionId)],
        sessionId: record.sessionId,
      });
    }
  }
  return out;
};

// --- rule: a write outside the scope jail ------------------------------------------------------------

/** Scratch locations every tool writes to; not what the jail is for. */
const SCRATCH = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', '/dev'];

function writeTargets(words: readonly string[]): string[] {
  const targets: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    if (words[i] === '>') {
      if (words[i + 1] !== undefined) targets.push(words[i + 1] as string);
      i += 1;
    } else rest.push(words[i] as string);
  }
  const cmd = commandIndex(rest);
  if (cmd === -1) return targets;
  const name = posix.basename(rest[cmd] as string);
  const args = rest.slice(cmd + 1).filter((w) => !w.startsWith('-'));
  if (name === 'tee' || name === 'rm' || name === 'touch' || name === 'mkdir' || name === 'rmdir' || name === 'truncate') targets.push(...args);
  else if (name === 'cp' || name === 'mv' || name === 'ln' || name === 'install') {
    const last = args[args.length - 1];
    if (last !== undefined) targets.push(last);
    if (name === 'mv') targets.push(...args.slice(0, -1));
  } else if (name === 'dd') {
    for (const w of rest) if (w.startsWith('of=')) targets.push(w.slice(3));
  }
  return targets;
}

/** A write outside the session's scope jail: a redirect or copy out of its roots, or a write the sandbox refused. */
export const writeOutsideScopeRule: RogueRule = (records, context) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    if (!record.sessionId) continue;
    // The jail is the session's own roots. The record's cwd stands in only when none are known: a cwd the agent
    // `cd`-ed into must not widen the jail.
    const known = context.scopeRoots(record.sessionId);
    const roots = (known.length > 0 ? known : record.kind === 'command' && record.cwd ? [record.cwd] : []).map((root) => posix.normalize(expandHome(root, context.homeDir)));
    if (roots.length === 0) continue;
    const outside = new Set<string>();
    const consider = (target: string, cwd: string | undefined): void => {
      const path = resolveWord(target, context.homeDir, cwd);
      if (path === null || path === '/dev/null') return;
      if (SCRATCH.some((dir) => underDir(path, dir))) return;
      if (!roots.some((root) => underDir(path, root))) outside.add(path);
    };
    if (record.kind === 'command') {
      for (const words of segments(record.command)) for (const target of writeTargets(words)) consider(target, record.cwd);
    } else if (record.kind === 'confine-denial' && /write|create|delete|unlink|rename|remove|chmod/i.test(record.operation)) {
      consider(record.target, undefined);
    }
    for (const path of outside) {
      out.push({
        rule: 'write-outside-scope',
        severity: 'high',
        category: 'agent',
        fingerprint: `agents:rogue:write-outside-scope:${record.sessionId}:${path}`,
        title: 'Agent wrote outside its scope',
        detail: `An agent session wrote to ${path}, which is outside the directories it was given.`,
        evidence: [{ kind: 'path', path }, ...commandEvidence(record)],
        remediation: [pauseAction(record.sessionId)],
        sessionId: record.sessionId,
      });
    }
  }
  return out;
};

// --- rule: destructive git, typed into a terminal ----------------------------------------------------

/** What a git command does that cannot be undone, or null when it is ordinary. `words` start at `git`. */
export function destructiveGit(words: readonly string[]): string | null {
  let i = 1;
  while (i < words.length) {
    const w = words[i] as string;
    if (w === '-C' || w === '-c' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') i += 2;
    else if (w.startsWith('-')) i += 1;
    else break;
  }
  const sub = words[i];
  if (sub === undefined) return null;
  const args = words.slice(i + 1);
  const flags = args.filter((a) => a.startsWith('-'));
  const cluster = (letter: string): boolean => flags.some((f) => !f.startsWith('--') && f.slice(1).includes(letter));
  const long = (name: string): boolean => flags.some((f) => f === `--${name}` || f.startsWith(`--${name}=`));
  switch (sub) {
    case 'push':
      if (long('force') || long('force-with-lease') || long('mirror') || long('delete') || cluster('f') || cluster('d')) return 'git push with --force or --delete';
      if (args.some((a) => !a.startsWith('-') && (a.startsWith('+') || a.startsWith(':')))) return 'git push of a forced or deleting refspec';
      return null;
    case 'reset':
      return long('hard') ? 'git reset --hard' : null;
    case 'clean':
      return (cluster('f') || long('force')) && (cluster('d') || cluster('x') || long('force')) ? 'git clean -fdx' : null;
    case 'branch':
      return flags.some((f) => /^-[dDf]+$/.test(f) && /[dD]/.test(f)) || long('delete') ? 'a git branch delete' : null;
    case 'rebase':
      return long('abort') || long('continue') || long('skip') || long('quit') ? null : 'a git rebase (history rewrite)';
    case 'commit':
      return long('amend') ? 'git commit --amend (history rewrite)' : null;
    case 'filter-branch':
    case 'filter-repo':
      return `git ${sub} (history rewrite)`;
    case 'reflog':
      return args[0] === 'expire' || args[0] === 'delete' ? 'a git reflog purge' : null;
    case 'update-ref':
      return cluster('d') ? 'a git ref delete' : null;
    default:
      return null;
  }
}

/** A `git push --force`, `reset --hard`, `clean -fdx`, branch delete or history rewrite typed into an agent's terminal. */
export const destructiveGitRule: RogueRule = (records) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    if (record.kind !== 'command' || !record.sessionId) continue;
    const seen = new Set<string>();
    for (const words of segments(record.command)) {
      const at = commandIndex(words);
      if (at === -1 || !/(^|\/)git$/.test(words[at] as string)) continue;
      const what = destructiveGit(words.slice(at));
      if (what === null || seen.has(what)) continue;
      seen.add(what);
      out.push({
        rule: 'destructive-git',
        severity: 'high',
        category: 'agent',
        fingerprint: `agents:rogue:destructive-git:${record.sessionId}:${what}`,
        title: `Agent ran ${what}`,
        detail: `An agent session ran ${what} from its own terminal, outside the app's git write queue and its blast-radius confirm.`,
        evidence: commandEvidence(record),
        remediation: [pauseAction(record.sessionId)],
        sessionId: record.sessionId,
      });
    }
  }
  return out;
};

// --- rule: reading a stored password -----------------------------------------------------------------

const KEYCHAIN_SUBCOMMAND = /^find-(?:generic|internet)-password$/;

const asksKeychain = (command: string): boolean =>
  segments(command).some((words) => {
    const at = commandIndex(words);
    return at !== -1 && /(^|\/)security$/.test(words[at] as string) && words.slice(at + 1).some((w) => KEYCHAIN_SUBCOMMAND.test(w));
  });

/** `security find-generic-password` or `find-internet-password`: an agent asking the keychain for a secret. */
export const keychainPasswordRule: RogueRule = (records) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    if (record.kind !== 'command' || !record.sessionId || !asksKeychain(record.command)) continue;
    out.push({
      rule: 'keychain-password',
      severity: 'critical',
      category: 'agent',
      fingerprint: `agents:rogue:keychain-password:${record.sessionId}`,
      title: 'Agent asked the keychain for a password',
      detail: 'An agent session ran `security find-*-password`, which prints a stored credential. Its session was interrupted.',
      evidence: commandEvidence(record),
      remediation: [pauseAction(record.sessionId)],
      sessionId: record.sessionId,
    });
  }
  return out;
};

// --- rule: exfiltration shapes (Phase 121 Theme D) ----------------------------------------------------

/** One simple command with whether a `|` follows it (`a | b`; `a || b` is not a pipe). */
interface PipedSegment {
  words: string[];
  piped: boolean;
}

function pipedSegments(command: string): PipedSegment[] {
  const out: PipedSegment[] = [];
  const all = commandWords(command);
  let current: string[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const word = all[i] as string;
    if (SEPARATORS.has(word)) {
      const next = all[i + 1];
      const isPipe = word === '|' && next !== '|' && all[i - 1] !== '|';
      if (word === '|' && next === '|') i += 1;
      if (current.length > 0) out.push({ words: current, piped: isPipe });
      current = [];
    } else current.push(word);
  }
  if (current.length > 0) out.push({ words: current, piped: false });
  return out;
}

const KEYFILE_NAME = /(?:^|\/)(?:id_[a-z0-9]+|[^/]*\.(?:pem|key|p12|pfx|keystore)|credentials|\.env(?:\.[\w-]+)?|\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.pgpass)$/i;

/** A file whose contents are a credential: a secret path, a key or certificate, or a dotenv-style file. */
export function isKeyfile(path: string, home: string): boolean {
  return secretPathKind(path, home) !== null || KEYFILE_NAME.test(path);
}

const BENIGN_DOTFILES = new Set(['.gitignore', '.gitattributes', '.editorconfig', '.prettierrc', '.nvmrc', '.dockerignore', '.npmignore', '.eslintrc', '.gitkeep']);

/** A dotfile or a path under a dot-directory: where credentials and config live in a home directory. */
function isDotfile(word: string, home: string, cwd: string | undefined): boolean {
  const path = resolveWord(word, home, cwd) ?? word;
  const parts = path.split('/').filter((p) => p !== '' && p !== '.' && p !== '..');
  const hidden = parts.find((p) => p.startsWith('.') && !BENIGN_DOTFILES.has(p));
  if (hidden === undefined) return false;
  // `.git/` internals are the repo's own, not a credential store.
  return hidden !== '.git';
}

/** `user@host:path` or `host:path` — an scp/rsync remote. */
const REMOTE_SPEC = /^(?:[^/\s@:]+@)?[^/\s:@]+:(?!\/\/)[^\s]*$/;

type ExfilShape = { id: string; severity: 'high' | 'critical'; title: string; detail: string };

const UPLOAD_FLAGS = new Set(['-d', '--data', '--data-binary', '--data-raw', '--data-urlencode', '--json']);

/** The exfiltration shape one simple command is, or null. */
export function exfiltrationShape(
  segment: PipedSegment,
  ctx: { home: string; cwd?: string | undefined; sessionIntendsPublish: boolean },
): ExfilShape | null {
  const at = commandIndex(segment.words);
  if (at === -1) return null;
  const name = posix.basename(segment.words[at] as string);
  const args = segment.words.slice(at + 1);

  if (name === 'curl' || name === 'wget') {
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i] as string;
      const eq = arg.indexOf('=');
      const flag = arg.startsWith('--') && eq !== -1 ? arg.slice(0, eq) : arg;
      const attached = arg.startsWith('--') && eq !== -1 ? arg.slice(eq + 1) : (args[i + 1] ?? '');
      const short = /^-[dFT]./.exec(arg);
      const value = short ? arg.slice(2) : attached;
      const flagName = short ? arg.slice(0, 2) : flag;
      if (UPLOAD_FLAGS.has(flagName) && /^@(?!-$)/.test(value) && value.length > 1) {
        return { id: 'upload-data', severity: 'high', title: `Agent uploaded a file with ${name} ${flagName}`, detail: `An agent session sent the contents of ${value.slice(1)} to a remote host with ${name} ${flagName} @file.` };
      }
      if ((flagName === '-F' || flagName === '--form') && /=@|^@/.test(value)) {
        return { id: 'upload-form', severity: 'high', title: `Agent uploaded a file with ${name} -F`, detail: `An agent session posted a file as multipart form data with ${name} -F ${value}.` };
      }
      if (name === 'curl' && (flagName === '-T' || flagName === '--upload-file')) {
        return { id: 'upload-file', severity: 'high', title: `Agent uploaded a file with ${name} --upload-file`, detail: `An agent session uploaded ${value} to a remote host with ${name}.` };
      }
      if (name === 'wget' && (flagName === '--post-file' || flagName === '--body-file')) {
        return { id: 'upload-file', severity: 'high', title: 'Agent posted a file with wget', detail: `An agent session sent ${value} to a remote host with wget ${flagName}.` };
      }
    }
    return null;
  }

  if (name === 'base64' || name === 'openssl' || name === 'xxd') {
    if (!segment.piped) return null;
    if (name === 'openssl' && args[0] !== 'base64') return null;
    if (args.some((a) => a === '-d' || a === '-D' || a === '--decode' || a === '-r')) return null;
    // A bare file name (`.env`, `server.pem`) is relative to the session's directory.
    const candidates = args
      .filter((a) => !a.startsWith('-') && a !== 'base64')
      .map((a) => resolveWord(a, ctx.home, ctx.cwd) ?? (ctx.cwd ? posix.join(expandHome(ctx.cwd, ctx.home), a) : a));
    const resolved = candidates.find((path) => isKeyfile(path, ctx.home)) ?? null;
    if (resolved !== null) {
      return { id: 'encode-keyfile', severity: 'high', title: 'Agent encoded a key file for transfer', detail: `An agent session ran ${name} over ${resolved} and piped the result onward, the usual first step of sending a credential out.` };
    }
    return null;
  }

  if (name === 'scp' || name === 'rsync') {
    const operands = args.filter((a) => !a.startsWith('-'));
    const remote = operands.some((a) => REMOTE_SPEC.test(a));
    const dot = operands.find((a) => !REMOTE_SPEC.test(a) && isDotfile(a, ctx.home, ctx.cwd));
    if (remote && dot !== undefined) {
      return { id: 'copy-dotfile', severity: 'high', title: `Agent copied a dotfile off the machine with ${name}`, detail: `An agent session ran ${name} with ${dot} and a remote destination.` };
    }
    return null;
  }

  if (name === 'gh') {
    const sub = args.filter((a) => !a.startsWith('-'));
    if (sub[0] === 'secret' && sub[1] === 'set') {
      const fromFile = segment.words.includes('<') || args.some((a) => a === '-f' || a === '--env-file' || a.startsWith('--env-file=') || /\bcat\b/.test(a));
      if (fromFile) return { id: 'gh-secret-from-file', severity: 'high', title: 'Agent set a GitHub secret from a file', detail: 'An agent session ran `gh secret set` with the value read from a file, which publishes that file to a repository or organisation.' };
    }
    return null;
  }

  if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
    const sub = args.filter((a) => !a.startsWith('-'));
    const isPublish = sub[0] === 'publish' || (name === 'yarn' && sub[0] === 'npm' && sub[1] === 'publish');
    if (!isPublish || args.includes('--dry-run')) return null;
    if (ctx.sessionIntendsPublish) return null;
    return { id: 'publish', severity: 'critical', title: `Agent ran ${name} publish`, detail: `An agent session published a package with ${name} publish. It did not start with the user's intent to release, and this is how a stolen token spreads: Shai-Hulud's propagation step.` };
  }
  return null;
}

/** Curl/wget uploads of a file, a key file encoded for transfer, a dotfile scp'd off, a secret set from a file, an unintended publish. */
export const exfiltrationRule: RogueRule = (records, context) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    if (record.kind !== 'command' || !record.sessionId) continue;
    const seen = new Set<string>();
    for (const segment of pipedSegments(record.command)) {
      const shape = exfiltrationShape(segment, {
        home: context.homeDir,
        cwd: record.cwd,
        sessionIntendsPublish: context.publishIntended?.(record.sessionId) ?? false,
      });
      if (shape === null || seen.has(shape.id)) continue;
      seen.add(shape.id);
      out.push({
        rule: 'exfiltration',
        severity: shape.severity,
        category: 'agent',
        fingerprint: `agents:rogue:exfiltration:${record.sessionId}:${shape.id}`,
        title: shape.title,
        detail: shape.detail,
        evidence: commandEvidence(record),
        remediation: [pauseAction(record.sessionId)],
        sessionId: record.sessionId,
      });
    }
  }
  return out;
};

// --- rule: a canary was touched (Phase 121 Theme D) ----------------------------------------------------

const CANARY_WORD = /(?:^|[/\s'"=:])\.env\.canary(?:$|[\s'"/;|&)])/;

/**
 * The canary file named in a command line, or in a refused sandbox operation; or a canary value found in an
 * outbound prompt (a `chat-turn` or `council-run` record the outbound redaction flagged). Nothing legitimate
 * touches any of them, so each is `critical`.
 */
export const canaryTripRule: RogueRule = (records) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    let session: string | undefined;
    let how: string | null = null;
    let evidence: EvidenceItem[] = [];
    if (record.kind === 'command' && CANARY_WORD.test(`${record.command} `)) {
      session = record.sessionId;
      how = 'read the canary file ~/.config/midnite/.env.canary';
      evidence = commandEvidence(record);
    } else if (record.kind === 'confine-denial' && CANARY_WORD.test(`${record.target} `)) {
      session = record.sessionId;
      how = 'was refused a read of the canary file ~/.config/midnite/.env.canary';
      evidence = [{ kind: 'path', path: record.target }];
    } else if ((record.kind === 'chat-turn' || record.kind === 'council-run') && record.canary === true) {
      session = record.sessionId ?? (record.kind === 'chat-turn' ? `chat:${record.chatId}` : `council:${record.runId}`);
      how = 'sent a canary value in an outbound prompt (it was scrubbed before it left)';
    }
    if (how === null || session === undefined) continue;
    out.push({
      rule: 'canary-trip',
      severity: 'critical',
      category: 'agent',
      fingerprint: `agents:rogue:canary-trip:${session}:${record.kind}`,
      title: 'Agent touched a canary',
      detail: `An agent session ${how}. Nothing it was asked to do should reach it: a credential-harvesting step is the likely cause.`,
      evidence,
      remediation: [pauseAction(session)],
      sessionId: session,
    });
  }
  return out;
};

// --- rule: a burst past the breaker's limits ---------------------------------------------------------

/**
 * A `limit-trip` record (Phase 121 F's breaker wrote it). The breaker raises its own finding in the same
 * moment, under this fingerprint; the sensor skips a row that already exists, so a trip is one finding, never
 * two. The rule still answers for a host with no breaker running.
 */
export const limitBurstRule: RogueRule = (records) => {
  const out: RogueFinding[] = [];
  for (const record of records) {
    if (record.kind !== 'limit-trip' || !record.sessionId) continue;
    const label = AGENT_LIMIT_LABELS[record.limit as AgentLimitKey] ?? record.limit;
    out.push({
      rule: 'limit-burst',
      severity: 'medium',
      category: 'agent',
      // The breaker's own fingerprint (`agentLimitFingerprint` in runtime/security/agent-breaker.ts).
      fingerprint: `agents:limit-trip:${record.sessionId}:${record.limit}`,
      title: `Agent hit its ${label} limit`,
      detail: `An agent session went past its limit: ${record.observed} ${label} against ${record.threshold}.`,
      evidence: [],
      remediation: [pauseAction(record.sessionId)],
      sessionId: record.sessionId,
    });
  }
  return out;
};

// --- rule: a change that appeared while a session was live -------------------------------------------

export interface LiveSession {
  sessionId: string;
  title?: string;
  /** Epoch ms of the session's newest trail record; null when the trail has shown nothing of it. */
  lastActivityAt: number | null;
}

/** How close, in time, a change must be to a session's activity to be put down to it. */
export const CORRELATION_WINDOW_MS = 120_000;

/**
 * A persistence item (Theme D) or a new outbound host (Theme E) first seen while a session was live and
 * acting, correlated by time. A session counts when it is live and its newest trail record is within
 * `windowMs` before the finding first appeared (or after: the trail is read in batches). A finding the
 * sensor already put down to a session (`sessionId` set) is attributed to that one alone. One finding per
 * (change, session); `high`, with the session named in the evidence.
 */
export function correlateLiveChanges(
  changes: readonly SecurityFinding[],
  sessions: readonly LiveSession[],
  windowMs: number = CORRELATION_WINDOW_MS,
): RogueFinding[] {
  const out: RogueFinding[] = [];
  for (const change of changes) {
    if (change.source !== 'vanguard' || (change.category !== 'persistence' && change.category !== 'network')) continue;
    const named = change.sessionId === undefined ? null : sessions.find((s) => s.sessionId === change.sessionId);
    const candidates =
      change.sessionId !== undefined
        ? named ? [named] : []
        : sessions.filter((s) => s.lastActivityAt !== null && Math.abs(s.lastActivityAt - change.firstSeen) <= windowMs);
    for (const session of candidates) {
      const what = change.category === 'persistence' ? 'a new persistence item' : 'a new outbound host';
      const label = session.title ? `${session.title} (${session.sessionId})` : session.sessionId;
      const evidence: EvidenceItem[] = [
        ...change.evidence,
        { kind: 'command', command: `agent session ${session.sessionId}`, ...(session.title ? { args: [session.title] } : {}) },
      ];
      out.push({
        rule: 'correlated-change',
        severity: 'high',
        category: 'agent',
        fingerprint: `agents:rogue:correlated-change:${session.sessionId}:${change.fingerprint}`,
        title: `${what[0]?.toUpperCase()}${what.slice(1)} appeared during agent session ${session.sessionId}`,
        detail: `${change.title}. It first appeared while agent session ${label} was live and active, so the session may be responsible.`,
        evidence,
        remediation: [pauseAction(session.sessionId)],
        sessionId: session.sessionId,
      });
    }
  }
  return out;
}

// --- the set -----------------------------------------------------------------------------------------

export const ROGUE_RULES: Readonly<Record<Exclude<RogueRuleId, 'correlated-change'>, RogueRule>> = {
  'secret-path-read': secretPathRule,
  'write-outside-scope': writeOutsideScopeRule,
  'destructive-git': destructiveGitRule,
  'keychain-password': keychainPasswordRule,
  exfiltration: exfiltrationRule,
  'canary-trip': canaryTripRule,
  'limit-burst': limitBurstRule,
};

/** Every trail rule over one window of records, findings in rule order. */
export function evaluateRogueRules(records: readonly AgentAuditRecord[], context: RogueRuleContext): RogueFinding[] {
  return Object.values(ROGUE_RULES).flatMap((rule) => rule(records, context));
}

function pauseAction(sessionId: string): RogueFinding['remediation'][number] {
  return { id: 'pause-session', sessionId, description: 'Interrupt the session' };
}

function commandEvidence(record: AgentAuditRecord): EvidenceItem[] {
  return record.kind === 'command' ? [{ kind: 'command', command: record.command }] : [];
}
