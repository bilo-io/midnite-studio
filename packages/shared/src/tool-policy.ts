import { z } from 'zod';

import { ContentProvenanceSchema, type ContentProvenance } from './provenance';

/**
 * The tool-call policy (Phase 121 Theme B): which calls an agent may make unasked, which need a human,
 * which are refused. Pure and wire-level (zod only), so the MCP dispatcher, a private run's server, the
 * chat patch path and the CLI hook script all evaluate the one thing.
 *
 * A policy is an ordered list of rules, **first match wins**; a call no rule matches is allowed. The
 * built-in {@link DEFAULT_TOOL_POLICY} `ask`s for the calls an agent could regret and `deny`s nothing:
 * refusing outright is the user's choice to make, per repo, in the overrides file.
 */

export const ToolEffectSchema = z.enum(['allow', 'ask', 'deny']);
export type ToolEffect = z.infer<typeof ToolEffectSchema>;

const ArgName = z.string().min(1).max(200);

/** A test on one argument of the call, named by a dotted path into its input (`options.force`). */
export const ArgMatcherSchema = z.discriminatedUnion('op', [
  /** The argument is exactly this value. */
  z.object({ op: z.literal('equals'), arg: ArgName, value: z.union([z.string(), z.number(), z.boolean()]) }),
  /** The argument is one of these values. */
  z.object({ op: z.literal('in'), arg: ArgName, values: z.array(z.string().max(500)).min(1).max(500) }),
  /** The argument, as text, matches a glob (`*` within a segment, `**` across them). */
  z.object({ op: z.literal('glob'), arg: ArgName, pattern: z.string().min(1).max(500) }),
  /** The argument is present and not empty, `false`, `0` or `null`. */
  z.object({ op: z.literal('present'), arg: ArgName }),
  /** The argument is a path that resolves outside the repository the call is for. */
  z.object({ op: z.literal('outside-repo'), arg: ArgName }),
  /**
   * Untrusted content reached a path or URL argument: `arg` names one, or every path- or URL-shaped
   * argument is checked when it is left out.
   */
  z.object({ op: z.literal('tainted'), arg: ArgName.optional() }),
]);
export type ArgMatcher = z.infer<typeof ArgMatcherSchema>;

export const ToolRuleSchema = z.object({
  /** Shown on the approval card and written to the audit trail. Defaults to the rule's position. */
  id: z.string().min(1).max(100).optional(),
  /** A tool id, or a glob over ids (`git.*`, `*`). */
  tool: z.string().min(1).max(200),
  /** Every matcher must hold. A lone matcher may be written without the array. */
  when: z.union([ArgMatcherSchema, z.array(ArgMatcherSchema).min(1).max(20)]).optional(),
  effect: ToolEffectSchema,
  /** Why. Shown to the user on the card, so it names what is at stake, not the rule. */
  reason: z.string().min(1).max(500),
});
export type ToolRule = z.infer<typeof ToolRuleSchema>;

export const ToolPolicySchema = z.object({
  rules: z.array(ToolRuleSchema).max(500),
});
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

/** The per-repo overrides file: each repo's rules, consulted before the defaults. Keyed by repository path. */
export const ToolPolicyOverridesSchema = z.object({
  version: z.literal(1),
  repos: z.record(z.string(), ToolPolicySchema),
});
export type ToolPolicyOverrides = z.infer<typeof ToolPolicyOverridesSchema>;

// --- the call being judged ---------------------------------------------------

/** A piece of untrusted text that an agent in this session has been handed, reduced to the path- and URL-shaped tokens in it. */
export interface TaintedToken {
  token: string;
  provenance: ContentProvenance;
}

export interface ToolCallContext {
  tool: string;
  input: unknown;
  /** The repository the call is for. A path argument is "outside" when it leaves this. */
  repoPath?: string | undefined;
  /** Untrusted path/URL tokens seen earlier in the session. */
  taint?: readonly TaintedToken[] | undefined;
  /** Provenance a caller declared for an argument outright, keyed by the argument's dotted path. */
  argProvenance?: Readonly<Record<string, ContentProvenance>> | undefined;
}

export interface ToolDecision {
  effect: ToolEffect;
  /** `default:3`, `repo:1`, or a rule's own id; `default:allow` when nothing matched. */
  ruleId: string;
  reason: string;
  /** Where the untrusted input that reached an argument came from, when a `tainted` matcher fired. */
  provenance: ContentProvenance[];
}

// --- the built-in policy -----------------------------------------------------

/**
 * Command ids `ui.command` may name that change or discard something the user did not ask this agent
 * to: pushing, aborting a rebase, killing a run, wiping browser data, closing a terminal or repo.
 */
export const DESTRUCTIVE_COMMAND_IDS: readonly string[] = [
  'sync.push',
  'op.abort',
  'automate.kill',
  'browser.clearData',
  'terminal.close',
  'repo.close',
];

export const DEFAULT_TOOL_POLICY: ToolPolicy = {
  rules: [
    {
      id: 'git-push-lease',
      tool: 'git.push',
      when: { op: 'present', arg: 'forceWithLease' },
      effect: 'ask',
      reason: 'A force-push with lease rewrites history on the remote.',
    },
    {
      id: 'git-push-force',
      tool: 'git.push',
      when: { op: 'present', arg: 'force' },
      effect: 'ask',
      reason: 'A force-push rewrites history on the remote.',
    },
    { id: 'git-reset', tool: 'git.reset', effect: 'ask', reason: 'A reset moves the branch and can orphan commits.' },
    { id: 'git-branch-delete', tool: 'git.branch.delete', effect: 'ask', reason: 'Deleting a branch can orphan its commits.' },
    {
      id: 'fs-write-outside-repo',
      tool: 'fs.write',
      when: { op: 'outside-repo', arg: 'path' },
      effect: 'ask',
      reason: 'This writes a file outside the repository.',
    },
    {
      id: 'workflow-gate-decide',
      tool: 'workflow_gate_decide',
      effect: 'ask',
      reason: 'This decides a paused workflow run on your behalf.',
    },
    {
      id: 'ui-command-destructive',
      tool: 'ui.command',
      when: { op: 'in', arg: 'id', values: [...DESTRUCTIVE_COMMAND_IDS] },
      effect: 'ask',
      reason: 'This command discards or publishes something.',
    },
    {
      id: 'untrusted-path-or-url',
      tool: '*',
      when: { op: 'tainted' },
      effect: 'ask',
      reason: 'Text from an untrusted source (a web page, a pull request, a tool result) reached a path or URL this call uses.',
    },
  ],
};

// --- evaluation --------------------------------------------------------------

/** `*` matches within one dotted/slashed segment, `**` across them. Everything else is literal. */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*';
        i++;
      } else source += '[^./]*';
    } else source += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

export function toolMatches(pattern: string, tool: string): boolean {
  return pattern === '*' || pattern === tool || (pattern.includes('*') && globToRegExp(pattern).test(tool));
}

/** The value at a dotted path into `input`, or `undefined`. */
export function argAt(input: unknown, path: string): unknown {
  let at: unknown = input;
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

const asText = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

/** Collapses `.` and `..` segments lexically, so `repo/../etc` is judged by where it lands. */
function normalisePath(path: string): string {
  const absolute = path.startsWith('/');
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
    } else out.push(part);
  }
  return `${absolute ? '/' : ''}${out.join('/')}`;
}

/** Whether `path` (absolute, or relative to the repo) resolves outside `repoPath`. With no repo, any absolute path is. */
export function isOutsideRepo(path: string, repoPath: string | undefined): boolean {
  if (path.startsWith('~')) return true;
  const root = repoPath ? normalisePath(repoPath) : null;
  if (!path.startsWith('/')) {
    // Relative: inside unless it climbs out.
    return normalisePath(path).startsWith('..');
  }
  if (root === null) return true;
  const target = normalisePath(path);
  return !(target === root || target.startsWith(root.endsWith('/') ? root : `${root}/`));
}

const PATH_OR_URL_ARG = /(^|\.)(path|paths|file|filePath|filename|dir|directory|cwd|url|uri|href|target|dest|destination|src|source|from|to|endpoint|webhook)$/i;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
const PATH_LIKE = /^(\/|~\/|\.\.?\/)/;

/** Every `[dotted path, string]` leaf of `input` that is a path- or URL-shaped argument. `repoPath` itself is the registered repo, not data. */
function pathOrUrlLeaves(input: unknown, prefix = '', depth = 0): [string, string][] {
  if (depth > 6 || input === null) return [];
  if (typeof input === 'string') {
    const key = prefix.split('.').pop() ?? '';
    if (key === 'repoPath') return [];
    return PATH_OR_URL_ARG.test(prefix) || URL_LIKE.test(input) || PATH_LIKE.test(input) ? [[prefix, input]] : [];
  }
  if (typeof input !== 'object') return [];
  const entries = Array.isArray(input) ? input.map((v, i) => [String(i), v] as const) : Object.entries(input as Record<string, unknown>);
  return entries.flatMap(([key, value]) => pathOrUrlLeaves(value, prefix ? `${prefix}.${key}` : key, depth + 1));
}

/** The shortest token worth matching: shorter ones collide with ordinary arguments. */
export const MIN_TAINT_TOKEN_LENGTH = 6;

/** Which untrusted tokens appear in `value`. */
function taintHits(value: string, taint: readonly TaintedToken[]): ContentProvenance[] {
  const hits: ContentProvenance[] = [];
  for (const { token, provenance } of taint) {
    if (token.length >= MIN_TAINT_TOKEN_LENGTH && value.includes(token)) hits.push(provenance);
  }
  return hits;
}

/** The path- and URL-shaped tokens in a stretch of untrusted text: what an injected instruction would hand a tool. */
export function extractTaintTokens(text: string, provenance: ContentProvenance, limit = 50): TaintedToken[] {
  const out: TaintedToken[] = [];
  const seen = new Set<string>();
  const pattern = /(?:[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]}]+|(?:~|\.{0,2})\/[\w@%+=:,.~-]+(?:\/[\w@%+=:,.~-]+)*)/gi;
  for (const match of text.matchAll(pattern)) {
    const token = match[0].replace(/[.,;:]+$/, '');
    if (token.length < MIN_TAINT_TOKEN_LENGTH || seen.has(token)) continue;
    seen.add(token);
    out.push({ token, provenance });
    if (out.length >= limit) break;
  }
  return out;
}

interface MatchResult {
  matched: boolean;
  provenance: ContentProvenance[];
}

function matchOne(matcher: ArgMatcher, ctx: ToolCallContext): MatchResult {
  const no: MatchResult = { matched: false, provenance: [] };
  switch (matcher.op) {
    case 'equals': {
      const text = asText(argAt(ctx.input, matcher.arg));
      return { matched: text !== null && text === String(matcher.value), provenance: [] };
    }
    case 'in': {
      const text = asText(argAt(ctx.input, matcher.arg));
      return { matched: text !== null && matcher.values.includes(text), provenance: [] };
    }
    case 'glob': {
      const text = asText(argAt(ctx.input, matcher.arg));
      return { matched: text !== null && globToRegExp(matcher.pattern).test(text), provenance: [] };
    }
    case 'present': {
      const value = argAt(ctx.input, matcher.arg);
      return { matched: value !== undefined && value !== null && value !== false && value !== '' && value !== 0, provenance: [] };
    }
    case 'outside-repo': {
      const value = argAt(ctx.input, matcher.arg);
      return typeof value === 'string' && value !== '' ? { matched: isOutsideRepo(value, ctx.repoPath), provenance: [] } : no;
    }
    case 'tainted': {
      const leaves = matcher.arg === undefined ? pathOrUrlLeaves(ctx.input) : [[matcher.arg, argAt(ctx.input, matcher.arg)] as const].filter((l): l is [string, string] => typeof l[1] === 'string');
      const provenance: ContentProvenance[] = [];
      for (const [name, value] of leaves) {
        const declared = ctx.argProvenance?.[name];
        if (declared && declared.trust === 'untrusted') provenance.push(declared);
        provenance.push(...taintHits(value, ctx.taint ?? []));
      }
      return { matched: provenance.length > 0, provenance };
    }
  }
}

function ruleMatches(rule: ToolRule, ctx: ToolCallContext): MatchResult {
  if (!toolMatches(rule.tool, ctx.tool)) return { matched: false, provenance: [] };
  if (rule.when === undefined) return { matched: true, provenance: [] };
  const matchers = Array.isArray(rule.when) ? rule.when : [rule.when];
  const provenance: ContentProvenance[] = [];
  for (const matcher of matchers) {
    const result = matchOne(matcher, ctx);
    if (!result.matched) return { matched: false, provenance: [] };
    provenance.push(...result.provenance);
  }
  return { matched: true, provenance };
}

/** De-duplicated by origin and ref, in first-seen order. */
function uniqueProvenance(all: readonly ContentProvenance[]): ContentProvenance[] {
  const seen = new Set<string>();
  return all.filter((p) => {
    const key = `${p.origin}\u0000${p.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The first rule of `policies` (in order, each rule in order) that matches the call. `policies` is
 * `[{source: 'repo', policy: overrides}, {source: 'default', policy: DEFAULT_TOOL_POLICY}]` for a repo with
 * overrides; the caller composes it, so tests can hand in any list.
 */
export function evaluateToolPolicy(
  ctx: ToolCallContext,
  policies: readonly { source: string; policy: ToolPolicy }[] = [{ source: 'default', policy: DEFAULT_TOOL_POLICY }],
): ToolDecision {
  for (const { source, policy } of policies) {
    for (const [index, rule] of policy.rules.entries()) {
      const result = ruleMatches(rule, ctx);
      if (result.matched) {
        return { effect: rule.effect, ruleId: rule.id ?? `${source}:${index}`, reason: rule.reason, provenance: uniqueProvenance(result.provenance) };
      }
    }
  }
  return { effect: 'allow', ruleId: 'default:allow', reason: 'No rule asks about this call.', provenance: [] };
}

// --- the approval card -------------------------------------------------------

/** How long a card waits for an answer before the call is denied. */
export const TOOL_APPROVAL_TIMEOUT_MS = 10 * 60_000;

export const ToolApprovalDecisionSchema = z.enum(['approve-once', 'approve-session', 'deny']);
export type ToolApprovalDecision = z.infer<typeof ToolApprovalDecisionSchema>;

/** What the card shows, pushed to every suite window. Arguments are already redacted. */
export const ToolApprovalRequestSchema = z.object({
  id: z.string(),
  tool: z.string(),
  /** The call's arguments, pretty-printed and run through the outbound redactor. Never the raw input. */
  args: z.string(),
  ruleId: z.string(),
  reason: z.string(),
  provenance: z.array(ContentProvenanceSchema),
  repoPath: z.string().optional(),
  /** Epoch ms the card was raised; it denies itself `TOOL_APPROVAL_TIMEOUT_MS` later. */
  askedAt: z.number(),
  expiresAt: z.number(),
});
export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequestSchema>;

export const ToolApprovalAnswerRequest = z.object({ id: z.string(), decision: ToolApprovalDecisionSchema });
export type ToolApprovalAnswerRequest = z.infer<typeof ToolApprovalAnswerRequest>;

/** Pushed when a card is answered or times out, so every other window drops it. */
export const ToolApprovalResolvedSchema = z.object({ id: z.string(), decision: ToolApprovalDecisionSchema.or(z.literal('timeout')) });
export type ToolApprovalResolved = z.infer<typeof ToolApprovalResolvedSchema>;

// --- the chat patch path -----------------------------------------------------

const SENSITIVE_PREFIXES = ['.githooks/', '.claude/', '.husky/', '.github/workflows/', '.github/actions/', '.circleci/', '.buildkite/'];
const SENSITIVE_FILES = new Set(['.mcp.json', '.gitlab-ci.yml', '.gitlab-ci.yaml', 'azure-pipelines.yml', 'Jenkinsfile', '.cursor/mcp.json', '.vscode/mcp.json']);

export interface PatchConcern {
  path: string;
  /** What about the patch the policy refuses to wave through. */
  reason: string;
}

/** True when `patch` (one file's unified diff) changes a line inside `package.json`'s `"scripts"` object. */
export function patchEditsPackageScripts(patch: string): boolean {
  let inScripts = false;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      // `@@ -1,4 +1,5 @@ "scripts": {` — git puts the nearest enclosing line after the second `@@`.
      inScripts = /"scripts"\s*:/.test(raw.replace(/^@@[^@]*@@/, ''));
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff ') || raw.startsWith('index ')) continue;
    const marker = raw[0];
    const body = raw.slice(1).trim();
    if (/^"scripts"\s*:/.test(body)) {
      inScripts = true;
      if ((marker === '+' || marker === '-') && /^"scripts"\s*:\s*\{\s*\}/.test(body)) return true;
      if (marker === '+' || marker === '-') return true;
      continue;
    }
    if (inScripts && body.startsWith('}')) {
      inScripts = false;
      continue;
    }
    if (inScripts && (marker === '+' || marker === '-')) return true;
  }
  return false;
}

/**
 * The files in a chat's change set that the policy asks about whatever the review setting says: the ones
 * that run code the next time anyone commits, installs, opens the repo in an agent or pushes. A patch alone
 * cannot see this; the paths can.
 */
export function patchConcerns(files: readonly { path: string; patch?: string | undefined }[]): PatchConcern[] {
  const concerns: PatchConcern[] = [];
  for (const file of files) {
    const path = file.path.replace(/^\.\//, '');
    if (SENSITIVE_PREFIXES.some((p) => path.startsWith(p)) || SENSITIVE_FILES.has(path)) {
      const reason = path.startsWith('.githooks/') || path.startsWith('.husky/')
        ? 'A git hook runs on every commit.'
        : path.startsWith('.github/') || path.includes('ci') || path.startsWith('.circleci/') || path.startsWith('.buildkite/')
          ? 'A CI workflow runs with the repository\'s secrets.'
          : 'Agent and MCP configuration decides what an agent may run.';
      concerns.push({ path: file.path, reason });
    } else if (path === 'package.json' || path.endsWith('/package.json')) {
      if (file.patch !== undefined && patchEditsPackageScripts(file.patch)) {
        concerns.push({ path: file.path, reason: 'A package.json script runs on install, build and test.' });
      }
    }
  }
  return concerns;
}
