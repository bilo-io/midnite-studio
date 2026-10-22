import { z } from 'zod';

import { UntrustedPageContentSchema } from './untrusted-page-content';

/**
 * The browser agent session contract (Phase 117 Theme G).
 *
 * An agent drives one tab with a fixed set of six tools. When the session starts, the user chooses
 * an allowlist of origins. Anything that could move private data off the page, or commit the user to
 * something, is a `needsUser` action: the session pauses and the agent-session bar asks.
 *
 * The rules here are pure so main and the tests share one copy:
 *
 * - {@link classifyAgentAction}: which tool calls need the user.
 * - {@link agentEgressAllowed}: which requests the tab may still make while a session is live. This
 *   is the egress leg of the lethal trifecta (private data, untrusted content, a way out).
 *
 * The private-data leg is the vault: the session's principal is `browser-agent`, which the runtime's
 * grants never authorise (`runtime/src/vault/grants.ts`). Untrusted content is the page itself, so
 * it stays. Removing the other two legs is what breaks the triangle.
 */

export const BROWSER_AGENT_TOOLS = ['navigate', 'read', 'find', 'click', 'type', 'screenshot'] as const;
export type BrowserAgentTool = (typeof BROWSER_AGENT_TOOLS)[number];

const SelectorSchema = z.string().min(1).max(512);

export const BrowserAgentToolCallSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('navigate'), url: z.string().min(1).max(8192) }).strict(),
  z.object({ tool: z.literal('read') }).strict(),
  z.object({ tool: z.literal('find'), text: z.string().min(1).max(256) }).strict(),
  z.object({ tool: z.literal('click'), selector: SelectorSchema }).strict(),
  z
    .object({ tool: z.literal('type'), selector: SelectorSchema, text: z.string().max(4096), submit: z.boolean().optional() })
    .strict(),
  z.object({ tool: z.literal('screenshot') }).strict(),
]);
export type BrowserAgentToolCall = z.infer<typeof BrowserAgentToolCallSchema>;

/** Why a call paused for the user. */
export const AgentNeedsUserReasonSchema = z.enum(['cross-origin', 'password-field', 'form-submit', 'download']);
export type AgentNeedsUserReason = z.infer<typeof AgentNeedsUserReasonSchema>;

/** What main learned about the call's target before deciding (`click`/`type` only). */
export type AgentTargetFacts = {
  /** The element is an `<input type=password>`. */
  isPassword?: boolean;
  /** Clicking the element submits a form (a submit button, or an input inside a form with one). */
  submitsForm?: boolean;
};

export type AgentActionDecision = { kind: 'allow' } | { kind: 'needsUser'; reason: AgentNeedsUserReason } | { kind: 'deny'; reason: string };

/**
 * An origin as the allowlist stores it: `https://example.com`. A bare host (`example.com`) is read
 * as `https://`. Anything that is not http(s) is `null`.
 */
export function normaliseAllowlistOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function originOfUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isOriginAllowed(allowlist: readonly string[], url: string): boolean {
  const origin = originOfUrl(url);
  return origin !== null && allowlist.includes(origin);
}

/**
 * Which tool calls pause for the user.
 *
 * - `navigate` outside the allowlist (or to anything that is not http(s), which is denied outright).
 * - `type` into a password field, and `type` with `submit`.
 * - `click` on something that submits a form.
 *
 * Downloads are not a tool. The tab's own `will-download` asks through the same bar while a session
 * is live (`browser-service.ts`).
 */
export function classifyAgentAction(
  call: BrowserAgentToolCall,
  context: { allowlist: readonly string[]; target?: AgentTargetFacts },
): AgentActionDecision {
  switch (call.tool) {
    case 'navigate': {
      if (originOfUrl(call.url) === null) return { kind: 'deny', reason: 'Only http and https pages can be opened.' };
      return isOriginAllowed(context.allowlist, call.url) ? { kind: 'allow' } : { kind: 'needsUser', reason: 'cross-origin' };
    }
    case 'type':
      if (context.target?.isPassword) return { kind: 'needsUser', reason: 'password-field' };
      if (call.submit) return { kind: 'needsUser', reason: 'form-submit' };
      return { kind: 'allow' };
    case 'click':
      return context.target?.submitsForm ? { kind: 'needsUser', reason: 'form-submit' } : { kind: 'allow' };
    default:
      return { kind: 'allow' };
  }
}

// Second-level labels under which a registrable domain takes one more label (`example.co.uk`).
// The browser feature's tracker filter uses the same heuristic.
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

function siteOf(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return h;
  const parts = h.split('.');
  const take = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]!) && parts[parts.length - 1]!.length === 2 ? 3 : 2;
  return parts.slice(-take).join('.');
}

/**
 * Whether a request from a tab under an agent session may leave.
 *
 * Allowed: a request to an allowlisted origin, or to the current page's own site. "Own site" means
 * the same registrable domain, so `cdn.example.com` serves `example.com`. Everything else is
 * cancelled, including a main-frame navigation the page starts itself, such as a redirect or a
 * script setting `location`. The agent reaches a new origin only through `navigate`, which asks.
 * `approvedOnce` is the origin the user just approved, honoured for that navigation only.
 */
export function agentEgressAllowed(input: {
  requestUrl: string;
  pageUrl: string | null;
  allowlist: readonly string[];
  isMainFrame: boolean;
  approvedOnce?: string | null;
}): boolean {
  // A WebSocket is judged by the origin it would have over http(s).
  const requestOrigin = originOfUrl(input.requestUrl.replace(/^ws(s?):/i, 'http$1:'));
  // `data:`, `blob:` and the like never leave the machine; Chromium serves them locally.
  if (requestOrigin === null) return !/^(?:https?|wss?|ftp):/i.test(input.requestUrl);
  if (input.allowlist.includes(requestOrigin)) return true;
  if (input.approvedOnce && requestOrigin === input.approvedOnce) return true;
  if (input.isMainFrame) return false;
  const pageOrigin = input.pageUrl ? originOfUrl(input.pageUrl) : null;
  if (pageOrigin === null) return false;
  return siteOf(new URL(requestOrigin).hostname) === siteOf(new URL(pageOrigin).hostname);
}

export const BrowserAgentStatusSchema = z.enum(['idle', 'running', 'waiting-for-user', 'stopped']);

export const BrowserAgentPendingSchema = z
  .object({
    id: z.string(),
    reason: AgentNeedsUserReasonSchema,
    /** One line for the bar: what the agent wants to do, with the origin or filename. */
    summary: z.string().max(300),
  })
  .strict();
export type BrowserAgentPending = z.infer<typeof BrowserAgentPendingSchema>;

export const BrowserAgentSessionStateSchema = z
  .object({
    sessionId: z.string(),
    tabId: z.string(),
    goal: z.string().max(500),
    allowlist: z.array(z.string()).max(32),
    status: BrowserAgentStatusSchema,
    pending: BrowserAgentPendingSchema.nullable(),
    /** Newest last, capped. Injection hits and refused requests land here. */
    log: z.array(z.string().max(400)).max(200),
  })
  .strict();
export type BrowserAgentSessionState = z.infer<typeof BrowserAgentSessionStateSchema>;

export const BROWSER_AGENT_LOG_MAX = 200;

/**
 * What a tool call returns. Page content only ever comes back as `UntrustedPageContent`. A
 * screenshot is a PNG data URL and carries no page text; `find` returns a match count.
 */
export const BrowserAgentToolResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      tool: z.enum(BROWSER_AGENT_TOOLS),
      page: UntrustedPageContentSchema.optional(),
      matches: z.number().int().nonnegative().optional(),
      screenshot: z.string().startsWith('data:image/png;base64,').optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      kind: z.enum(['declined', 'denied', 'no-session', 'error']),
      message: z.string().max(500),
    })
    .strict(),
]);
export type BrowserAgentToolResult = z.infer<typeof BrowserAgentToolResultSchema>;
