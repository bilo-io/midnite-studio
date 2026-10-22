import {
  BROWSER_AGENT_LOG_MAX,
  agentEgressAllowed,
  buildUntrustedPageContent,
  classifyAgentAction,
  normaliseAllowlistOrigin,
  originOfUrl,
  type AgentNeedsUserReason,
  type BrowserAgentSessionState,
  type BrowserAgentToolCall,
  type BrowserAgentToolResult,
  type PageSafetyLevel,
} from '@midnite/studio-shared';

import {
  AGENT_WORLD_ID,
  READ_PAGE_SCRIPT,
  asRawCapture,
  asTargetFacts,
  clickScript,
  findScript,
  targetFactsScript,
  typeScript,
} from './page-reader';

/**
 * `BrowserAgentSession`: the main-side agent session over one tab (Phase 117 Theme G).
 *
 * It replaces the Browser app's renderer placeholder. Nothing reaches a page except through the six
 * tools in `shared/browser-agent.ts`, and the rules sit in this one place:
 *
 * - **An allowlist of origins, chosen at start.** `navigate` off the list, typing into a password
 *   field, any form submit and any download are `needsUser`: the session pauses, the bar asks, and
 *   the call resolves only once the user answers (or after {@link USER_ANSWER_TIMEOUT_MS}, as declined).
 * - **No egress.** {@link BrowserAgentSessions.egressGate} cancels every request from the tab to an
 *   origin outside the allowlist and outside the page's own site, page-initiated navigations included.
 * - **No vault.** The session holds no vault handle, and nothing in its deps can reach one. Its
 *   principal, `browser-agent`, is refused by the vault itself (`runtime/src/vault/grants.ts`).
 * - **Page text only as `UntrustedPageContent`.** `read` returns the envelope; `find` returns a
 *   count; `screenshot` returns pixels. Injection markers are logged and set `verdict.caution`.
 *
 * Structural types only, so the whole thing runs against a fake `webContents` in vitest.
 */

export const USER_ANSWER_TIMEOUT_MS = 120_000;

/** The slice of a tab's `webContents` the session drives. */
export type AgentWebContents = {
  getURL(): string;
  loadURL(url: string): Promise<void>;
  executeJavaScriptInIsolatedWorld?(worldId: number, scripts: Array<{ code: string }>): Promise<unknown>;
  capturePage?(): Promise<{ toDataURL(): string }>;
};

export type BrowserAgentSessionDeps = {
  /** The live `webContents` of a tab, or `null` when the tab has no view. */
  contentsFor(tabId: string): AgentWebContents | null;
  /** Pushes the session's state to the tab's window (a `BrowserEvent` of kind `agent-session`). */
  emit(tabId: string, state: BrowserAgentSessionState): void;
  /**
   * The site verdict's level for the tab, when Theme C's verdict state is wired in. This is the
   * seam: absent, every capture reads `unknown` (and injection hits still raise it to `caution`).
   */
  siteLevel?(contents: AgentWebContents): Exclude<PageSafetyLevel, 'unknown'> | undefined;
  homeDir?: string;
  newId?: () => string;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  userAnswerTimeoutMs?: number;
};

type Pending = { id: string; reason: AgentNeedsUserReason; summary: string; resolve: (ok: boolean) => void; timer: unknown };

type Session = {
  state: BrowserAgentSessionState;
  /** The origin the user just approved, honoured for the one navigation it was approved for. */
  approvedOnce: string | null;
  pending: Pending | null;
  /** Origins already logged as blocked, so a page hammering one host does not flood the log. */
  blockedLogged: Set<string>;
};

export type StartResult = { ok: true; state: BrowserAgentSessionState } | { ok: false; message: string };

export type BrowserAgentSessions = {
  start(input: { tabId: string; goal: string; allowlist: readonly string[] }): StartResult;
  stop(sessionId: string, why?: string): void;
  runTool(sessionId: string, call: BrowserAgentToolCall): Promise<BrowserAgentToolResult>;
  respond(sessionId: string, pendingId: string, decision: 'allow' | 'deny'): void;
  /** For `requestGate`: true cancels. Only tabs under a live session are ever gated. */
  egressGate(details: { url: string; resourceType: string; webContents?: unknown }): boolean;
  /** Whether a live session drives these contents (downloads ask through the bar while one does). */
  activeFor(contents: unknown): boolean;
  /** Pauses the session on these contents and asks the user. Resolves false with no session. */
  askUser(contents: unknown, reason: AgentNeedsUserReason, summary: string): Promise<boolean>;
  /** Ends a tab's session (the tab closed or navigated away under the user's own hand). */
  endForTab(tabId: string, why: string): void;
  stateFor(tabId: string): BrowserAgentSessionState | null;
};

const REASON_LABEL: Record<AgentNeedsUserReason, string> = {
  'cross-origin': 'open a site outside this session',
  'password-field': 'type into a password field',
  'form-submit': 'submit a form',
  download: 'download a file',
};

export function createBrowserAgentSessions(deps: BrowserAgentSessionDeps): BrowserAgentSessions {
  const sessions = new Map<string, Session>();
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const timeoutMs = deps.userAnswerTimeoutMs ?? USER_ANSWER_TIMEOUT_MS;

  const live = (s: Session | undefined): s is Session => s !== undefined && s.state.status !== 'stopped';
  const byTab = (tabId: string): Session | undefined => [...sessions.values()].find((s) => s.state.tabId === tabId && live(s));
  const byContents = (contents: unknown): Session | undefined => {
    if (!contents) return undefined;
    return [...sessions.values()].find((s) => live(s) && deps.contentsFor(s.state.tabId) === contents);
  };

  const push = (s: Session) => deps.emit(s.state.tabId, structuredClone(s.state));
  const log = (s: Session, line: string) => {
    s.state.log = [...s.state.log, line.slice(0, 400)].slice(-BROWSER_AGENT_LOG_MAX);
  };

  const askUser = (s: Session, reason: AgentNeedsUserReason, summary: string): Promise<boolean> => {
    if (s.pending) {
      log(s, `[declined] ${summary} — another question is already waiting`);
      push(s);
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const id = newId();
      const finish = (ok: boolean, how: string) => {
        if (s.pending?.id !== id) return;
        clearTimer(s.pending.timer);
        s.pending = null;
        s.state.pending = null;
        if (s.state.status === 'waiting-for-user') s.state.status = 'running';
        log(s, `[${how}] ${summary}`);
        push(s);
        resolve(ok);
      };
      const timer = setTimer(() => finish(false, 'timed out'), timeoutMs);
      s.pending = { id, reason, summary, timer, resolve: (ok) => finish(ok, ok ? 'allowed' : 'declined') };
      s.state.pending = { id, reason, summary: summary.slice(0, 300) };
      s.state.status = 'waiting-for-user';
      log(s, `[needs you] ${summary}`);
      push(s);
    });
  };

  const exec = async (contents: AgentWebContents, code: string): Promise<unknown> => {
    if (!contents.executeJavaScriptInIsolatedWorld) throw new Error('This tab cannot run the agent tools.');
    return contents.executeJavaScriptInIsolatedWorld(AGENT_WORLD_ID, [{ code }]);
  };

  const fail = (kind: 'declined' | 'denied' | 'no-session' | 'error', message: string): BrowserAgentToolResult => ({ ok: false, kind, message: message.slice(0, 500) });

  async function run(s: Session, call: BrowserAgentToolCall): Promise<BrowserAgentToolResult> {
    const contents = deps.contentsFor(s.state.tabId);
    if (!contents) return fail('error', 'The tab is gone.');

    let target: ReturnType<typeof asTargetFacts> = null;
    if (call.tool === 'click' || call.tool === 'type') {
      target = asTargetFacts(await exec(contents, targetFactsScript(call.selector)));
      if (!target?.found) return fail('error', `Nothing on the page matches ${call.selector}.`);
    }

    const decision = classifyAgentAction(call, { allowlist: s.state.allowlist, target: target ?? undefined });
    if (decision.kind === 'deny') {
      log(s, `[denied] ${call.tool}: ${decision.reason}`);
      return fail('denied', decision.reason);
    }
    if (decision.kind === 'needsUser') {
      const what = call.tool === 'navigate' ? `${REASON_LABEL[decision.reason]}: ${originOfUrl(call.url) ?? call.url}` : REASON_LABEL[decision.reason];
      const ok = await askUser(s, decision.reason, `The agent wants to ${what}.`);
      if (!live(s)) return fail('no-session', 'The session ended.');
      if (!ok) return fail('declined', `You declined: ${what}.`);
      if (call.tool === 'navigate') s.approvedOnce = originOfUrl(call.url);
    }

    switch (call.tool) {
      case 'navigate':
        log(s, `[navigate] ${originOfUrl(call.url) ?? call.url}`);
        push(s);
        await contents.loadURL(call.url);
        s.approvedOnce = null;
        return { ok: true, tool: 'navigate' };
      case 'read': {
        const raw = asRawCapture(await exec(contents, READ_PAGE_SCRIPT), contents.getURL());
        const page = buildUntrustedPageContent(raw, {
          siteLevel: deps.siteLevel?.(contents),
          homeDir: deps.homeDir,
          capturedAt: (deps.now?.() ?? new Date()).toISOString(),
        });
        log(s, `[read] ${page.origin} (${page.verdict.level}${page.truncated ? ', truncated' : ''})`);
        for (const hit of page.verdict.injection) log(s, `[heuristic] ${hit.kind} (${hit.rule}): ${hit.excerpt}`);
        push(s);
        return { ok: true, tool: 'read', page };
      }
      case 'find': {
        const matches = Number(await exec(contents, findScript(call.text)));
        return { ok: true, tool: 'find', matches: Number.isFinite(matches) && matches >= 0 ? Math.floor(matches) : 0 };
      }
      case 'click':
        log(s, `[click] ${call.selector}`);
        push(s);
        await exec(contents, clickScript(call.selector));
        return { ok: true, tool: 'click' };
      case 'type':
        // The typed text is never logged: it may be the very password the user just approved.
        log(s, `[type] ${call.selector}${call.submit ? ' (submit)' : ''}`);
        push(s);
        await exec(contents, typeScript(call.selector, call.text, call.submit === true));
        return { ok: true, tool: 'type' };
      case 'screenshot': {
        if (!contents.capturePage) return fail('error', 'This tab cannot take a screenshot.');
        const image = await contents.capturePage();
        const url = image.toDataURL();
        return url.startsWith('data:image/png;base64,') ? { ok: true, tool: 'screenshot', screenshot: url } : fail('error', 'The screenshot was not a PNG.');
      }
    }
  }

  const stop = (sessionId: string, why = 'Stopped — you have the wheel'): void => {
    const s = sessions.get(sessionId);
    if (!live(s)) return;
    s.pending?.resolve(false);
    s.state.status = 'stopped';
    s.state.pending = null;
    log(s, `[stop] ${why}`);
    push(s);
    sessions.delete(sessionId);
  };

  return {
    start({ tabId, goal, allowlist }) {
      if (byTab(tabId)) return { ok: false, message: 'An agent session is already driving this tab.' };
      const contents = deps.contentsFor(tabId);
      if (!contents) return { ok: false, message: 'Open a page first.' };
      const origins = [...new Set(allowlist.map(normaliseAllowlistOrigin).filter((o): o is string => o !== null))].slice(0, 32);
      if (origins.length === 0) return { ok: false, message: 'Give the session at least one site it may use.' };
      const sessionId = newId();
      const s: Session = {
        state: {
          sessionId,
          tabId,
          goal: goal.trim().slice(0, 500),
          allowlist: origins,
          status: 'running',
          pending: null,
          log: [`[start] ${goal.trim().slice(0, 200)} — allowed: ${origins.join(', ')}`],
        },
        approvedOnce: null,
        pending: null,
        blockedLogged: new Set(),
      };
      sessions.set(sessionId, s);
      push(s);
      return { ok: true, state: structuredClone(s.state) };
    },

    stop,

    async runTool(sessionId, call) {
      const s = sessions.get(sessionId);
      if (!live(s)) return fail('no-session', 'No agent session is running.');
      try {
        return await run(s, call);
      } catch (e) {
        // The raw error goes to the user's log only. An exception thrown inside a page can carry the
        // page's words, and page words reach the agent only inside the envelope.
        const message = e instanceof Error ? e.message : String(e);
        log(s, `[error] ${call.tool}: ${message.slice(0, 300)}`);
        push(s);
        return fail('error', `The ${call.tool} step failed on this page.`);
      }
    },

    respond(sessionId, pendingId, decision) {
      const s = sessions.get(sessionId);
      if (!live(s) || s.pending?.id !== pendingId) return;
      s.pending.resolve(decision === 'allow');
    },

    egressGate(details) {
      const s = byContents(details.webContents);
      if (!s) return false;
      const contents = details.webContents as { getURL?(): string };
      const allowed = agentEgressAllowed({
        requestUrl: details.url,
        pageUrl: contents.getURL?.() ?? null,
        allowlist: s.state.allowlist,
        isMainFrame: details.resourceType === 'mainFrame',
        approvedOnce: s.approvedOnce,
      });
      if (!allowed) {
        const key = originOfUrl(details.url.replace(/^ws(s?):/i, 'http$1:')) ?? details.url.slice(0, 40);
        if (!s.blockedLogged.has(key)) {
          s.blockedLogged.add(key);
          log(s, `[blocked] a request to ${key} (not on this session's list)`);
          push(s);
        }
      }
      return !allowed;
    },

    activeFor: (contents) => byContents(contents) !== undefined,

    askUser(contents, reason, summary) {
      const s = byContents(contents);
      return s ? askUser(s, reason, summary) : Promise.resolve(false);
    },

    endForTab(tabId, why) {
      const s = byTab(tabId);
      if (s) stop(s.state.sessionId, why);
    },

    stateFor: (tabId) => {
      const s = byTab(tabId);
      return s ? structuredClone(s.state) : null;
    },
  };
}
