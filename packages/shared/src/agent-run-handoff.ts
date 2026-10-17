import { z } from 'zod';

import { encodeRefParam } from './studio-link';

/**
 * The agent-run hand-off (Phase 113 Theme O): "run this card's skill on its issue" sent from an app
 * with no terminal (Coder) to one that can start an agent.
 *
 * **Data only.** What crosses is `{ issueUrl, skill }` — never a prompt, an agent, a command, a path
 * or a repository id. The receiver builds the command itself from its own roster, resolves the
 * repository itself among the ones the user already has open, and always asks before anything runs;
 * see `docs/APPS.md`, "Coder slice 5". A link is remote-triggerable (any web page can open one), so
 * every rule below is checked again on arrival, never trusted from the sender.
 *
 * - `issueUrl` — an `https://<host>/<owner>/<repo>/(issues|pull)/<n>` URL: no credentials, port,
 *   query or fragment, and nothing past the number.
 * - `skill` — one slash command and at most four plain words after it (`/midnite-create 98 D`):
 *   letters, digits, `.`, `_`, `-`, single spaces, no word starting with `-`. No quotes, no shell
 *   metacharacters, no newline.
 */

const MAX_URL = 512;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const NUMBER = /^[1-9][0-9]{0,8}$/;
/** Two or more labels, the last starting with a letter — a DNS name, never an IP literal or `localhost`. */
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,62})(?:\.[a-z0-9](?:[a-z0-9-]{0,62}))*\.[a-z][a-z0-9-]{0,62}$/;

/** A slash command, then up to four words that each start with a letter or digit (so never a `--flag`). */
export const AGENT_RUN_SKILL = /^\/[A-Za-z0-9][A-Za-z0-9:_-]{0,63}(?: [A-Za-z0-9][A-Za-z0-9._-]{0,31}){0,4}$/;

export type AgentRunIssue = {
  host: string;
  owner: string;
  repo: string;
  kind: 'issue' | 'pull';
  number: number;
};

/** The parts of an issue or PR URL the hand-off accepts, or `null` for anything else. Never throws. */
export function parseAgentRunIssueUrl(raw: unknown): AgentRunIssue | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  if (url.search !== '' || url.hash !== '' || raw.includes('?') || raw.includes('#')) return null;
  if (!HOST.test(url.hostname)) return null;
  // The URL parser normalises `..` and `%2e`; compare against the raw input so nothing it rewrote slips by.
  if (raw !== `https://${url.hostname}${url.pathname}`) return null;
  const segments = url.pathname.split('/').slice(1);
  if (segments.length !== 4) return null;
  const [owner, repo, kind, number] = segments as [string, string, string, string];
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..' || !NUMBER.test(number)) return null;
  if (kind !== 'issues' && kind !== 'pull') return null;
  return { host: url.hostname, owner, repo, kind: kind === 'issues' ? 'issue' : 'pull', number: Number(number) };
}

export const AgentRunHandoffSchema = z
  .object({
    issueUrl: z.string().refine((url) => parseAgentRunIssueUrl(url) !== null, {
      message: 'Only an https issue or pull request URL can be handed off.',
    }),
    skill: z.string().max(200).regex(AGENT_RUN_SKILL, { message: 'Only a /skill and a few plain words can be handed off.' }),
  })
  .strict();

export type AgentRunHandoff = z.infer<typeof AgentRunHandoffSchema>;

/** The run a card hands off, or `null` when the card has no URL or skill that may cross. */
export function agentRunFor(issueUrl: string | null | undefined, skill: string): AgentRunHandoff | null {
  const parsed = AgentRunHandoffSchema.safeParse({ issueUrl: issueUrl ?? '', skill: skill.trim() });
  return parsed.success ? parsed.data : null;
}

/** What the receiver types into the agent: the skill, then the URL — exactly what Studio's own Play sends. */
export function agentRunPrompt(run: AgentRunHandoff): string {
  return `${run.skill} ${run.issueUrl}`;
}

/** base64url JSON, the `run=` parameter of `midnite://open` and `req=` of `midnite-studio://run`. */
export function encodeAgentRunParam(run: AgentRunHandoff): string {
  return encodeRefParam({ issueUrl: run.issueUrl, skill: run.skill });
}

/** The inverse of {@link encodeAgentRunParam}; `null` for bad base64, bad JSON or a schema failure. */
export function decodeAgentRunParam(param: unknown): AgentRunHandoff | null {
  try {
    if (typeof param !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(param)) return null;
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = AgentRunHandoffSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
