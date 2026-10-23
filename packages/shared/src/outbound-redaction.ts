import { SECRET_PATTERNS, URL_CREDENTIAL } from './redact';

/**
 * Outbound redaction — Phase 121 Theme D. What a prompt carries out of this process is scrubbed first:
 * the rendered chat prompt, a council member's prompt, an Ollama request body. Pure, no I/O.
 *
 * Two matchers run on the text:
 *
 * 1. **Vault values, by literal match** — every secret the vault holds (and the two canaries), however it
 *    is shaped. A token with no recognisable prefix is still caught, because the vault knows its value.
 * 2. **{@link SECRET_PATTERNS}, by shape** — the credential formats Phase 65/91 already catch in crash records.
 *
 * Unlike `redactRecord`, the home directory is **not** collapsed to `~`: a prompt names the user's working
 * directory and the model needs the real path. Everything else is the same patterns.
 *
 * A match becomes `[redacted: <kind>]`, which is also the chip the thread shows, so the user can see the model
 * did not get it. The terminal's scrollback is never run through this (Phase 115 decided that).
 */

/** A secret value the vault holds, by name. The name is never sent anywhere; only `kind` reaches a thread. */
export interface OutboundSecret {
  name: string;
  value: string;
  /** `canary`: nothing legitimate ever sends it, so seeing it at all is a critical finding. */
  kind?: 'vault' | 'canary';
}

/** One kind of secret scrubbed, and how many times. */
export interface Redaction {
  kind: string;
  count: number;
}

export interface OutboundRedaction {
  text: string;
  redactions: Redaction[];
  /** A canary value was in the text. */
  canary: boolean;
}

/** Values shorter than this are not matched literally: a short "password" is also an ordinary word. */
export const MIN_VAULT_VALUE_LENGTH = 12;

export const redactionLabel = (kind: string): string => `[redacted: ${kind}]`;

/** What kind of credential a pattern match is, from its shape. */
export function classifySecret(match: string): string {
  if (/^(?:gh[pousr]_|github_pat_)/.test(match)) return 'github-token';
  if (/^gl(?:pat|dt|rt|oas)-/.test(match)) return 'gitlab-token';
  if (/^sk-ant-/.test(match)) return 'anthropic-key';
  if (/^(?:sk|rk)_(?:live|test)_/.test(match)) return 'stripe-key';
  if (/^sk-/.test(match)) return 'api-key';
  if (/^xox|^xapp-/.test(match)) return 'slack-token';
  if (/^(?:Bearer|Basic|token)\s/i.test(match)) return 'auth-header';
  if (/^eyJ/.test(match)) return 'jwt';
  if (/^ATATT3/.test(match)) return 'atlassian-token';
  if (/^-----BEGIN/.test(match)) return 'private-key';
  if (/^(?:AKIA|ASIA)/.test(match)) return 'aws-key';
  if (/^AIza/.test(match)) return 'google-key';
  if (/^npm_/.test(match)) return 'npm-token';
  if (/^[\w-]+=/.test(match)) return 'credential';
  return 'secret';
}

function bump(into: Map<string, number>, kind: string, by = 1): void {
  into.set(kind, (into.get(kind) ?? 0) + by);
}

/** Fold `b` into `a`: counts add per kind. Order is first-seen. */
export function mergeRedactions(a: readonly Redaction[], b: readonly Redaction[]): Redaction[] {
  const counts = new Map<string, number>();
  for (const r of [...a, ...b]) bump(counts, r.kind, r.count);
  return [...counts].map(([kind, count]) => ({ kind, count }));
}

export const redactionTotal = (redactions: readonly Redaction[]): number => redactions.reduce((n, r) => n + r.count, 0);

/** Scrub one string. The vault's values go first (longest first, so a value inside a longer one is not split). */
export function redactOutbound(text: string, secrets: readonly OutboundSecret[] = []): OutboundRedaction {
  const counts = new Map<string, number>();
  let canary = false;
  let out = text;
  const literal = secrets
    .filter((s) => s.value.length >= MIN_VAULT_VALUE_LENGTH)
    .sort((a, b) => b.value.length - a.value.length);
  for (const secret of literal) {
    if (!out.includes(secret.value)) continue;
    const kind = secret.kind === 'canary' ? 'canary' : 'vault-secret';
    if (kind === 'canary') canary = true;
    const parts = out.split(secret.value);
    bump(counts, kind, parts.length - 1);
    out = parts.join(redactionLabel(kind));
  }
  out = out.replace(URL_CREDENTIAL, (_m, scheme: string) => {
    bump(counts, 'url-credential');
    return `${scheme}${redactionLabel('url-credential')}@`;
  });
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const kind = classifySecret(match);
      bump(counts, kind);
      return redactionLabel(kind);
    });
  }
  return { text: out, redactions: [...counts].map(([kind, count]) => ({ kind, count })), canary };
}

/** Scrub the `content` of each message of a request body; the roles and everything else are untouched. */
export function redactOutboundMessages<M extends { content: string }>(
  messages: readonly M[],
  secrets: readonly OutboundSecret[] = [],
): { messages: M[]; redactions: Redaction[]; canary: boolean } {
  let redactions: Redaction[] = [];
  let canary = false;
  const out = messages.map((message) => {
    const r = redactOutbound(message.content, secrets);
    redactions = mergeRedactions(redactions, r.redactions);
    canary ||= r.canary;
    return r.redactions.length === 0 ? message : { ...message, content: r.text };
  });
  return { messages: out, redactions, canary };
}

// --- canaries ---------------------------------------------------------------------------------------

/** Where the canary file sits under the home directory. */
export const CANARY_RELATIVE_PATH = '.config/midnite/.env.canary';
export const CANARY_FILE_NAME = '.env.canary';
/** The vault namespace the two values live in, and their entry names. */
export const CANARY_VAULT_KEYS = { githubPat: 'github-pat', awsKey: 'aws-access-key' } as const;

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const AWS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function pick(alphabet: string, length: number, random: (n: number) => Uint8Array): string {
  const bytes = random(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[(bytes[i] as number) % alphabet.length];
  return out;
}

/**
 * Two values nothing legitimate reads. They are shaped to match {@link SECRET_PATTERNS} (so a leak is scrubbed
 * even by shape alone) and to look real to a thief: a classic GitHub PAT (`ghp_` + 36) and an AWS access key id
 * (`AKIA` + 16). `random` is injected (`crypto.randomBytes` in main), so this stays pure.
 */
export function generateCanaryValues(random: (n: number) => Uint8Array): { githubPat: string; awsKey: string } {
  return { githubPat: `ghp_${pick(BASE62, 36, random)}`, awsKey: `AKIA${pick(AWS_ALPHABET, 16, random)}` };
}

/** The canary file's text. */
export function canaryFileContent(values: { githubPat: string; awsKey: string }): string {
  return [
    '# Midnite canary. Nothing legitimate reads this file; a read of it is reported as a critical finding.',
    `GITHUB_TOKEN=${values.githubPat}`,
    `AWS_ACCESS_KEY_ID=${values.awsKey}`,
    '',
  ].join('\n');
}
