import type { ActivityStatus, SessionActivity } from '@midnite/studio-shared';

/**
 * One session bound to the target a glow is being resolved for — a kanban
 * card's live pty, a terminal row's own session, one of a workflow node's
 * (Theme J, not yet built) future group. Deliberately the smallest slice
 * each caller already has lying around (`useCardStatus`, the terminal
 * store's own rows) rather than a `TerminalSession` — this module has no
 * business importing the terminal feature.
 */
export type ActivityGlowSessionInput = {
  sessionId: string;
  /**
   * The **resolved** agent id — `resolveSessionAgentId(session,
   * liveAgentId)`'s own result, never the session's bare declared
   * `agentId`. `undefined` means a plain shell, live-probed or never
   * started as one; this is what makes `claude` typed into a bare terminal
   * flip its badge, the same rule `isAgentRow` enforces for the agent
   * count.
   */
  agentId: string | undefined;
  /** `SessionActivity` re-export — `thinking | waiting | idle`, `undefined` = live with no guess yet (treated as "actively working"). */
  activity: SessionActivity | undefined;
  /** `sessionPhase(session, state) === 'live'` — asleep/ended sessions never drive a glow, only a fallback status can. */
  running: boolean;
};

export type ActivityGlowInput = {
  /** Every session currently bound to this target. Usually 0 or 1 today; Theme J's workflow-node groups are why this is a list, not a single optional session. */
  sessions: readonly ActivityGlowSessionInput[];
  /**
   * The target's own run-state fallback (a workflow node's `queued|running|
   * done|failed`) — used only once no session in {@link sessions} is live.
   * Ranks above {@link fallbackColor}: an `ActivityStatus` paints through
   * the shared token family, a raw colour cannot.
   */
  fallbackStatus?: ActivityStatus;
  /**
   * A raw CSS colour — a card's own status-pill colour
   * (`fieldOptionColor(column.color)`) — painted as a static ring when
   * neither a live session nor {@link fallbackStatus} applies. Never
   * resolved through the `ActivityStatus` token family: `field-
   * option-colors.ts`'s own Theme A decision is that a board's arbitrary
   * column names are not this vocabulary, and forcing one through it here
   * would just be a second, worse way of doing what that file already does
   * on purpose.
   */
  fallbackColor?: string;
};

export type ActivityGlowBadge = {
  sessionId: string;
  kind: 'agent' | 'shell';
  /** The resolved agent id — `resolveAgentIcon({id: agentId})`'s own input. `undefined` for a shell badge. */
  agentId: string | undefined;
  /** Hover label — the agent id, or `'Terminal'` for a shell. */
  label: string;
};

export type ActivityGlow = {
  status: ActivityStatus;
  /** Set only for the `fallbackColor` tier — a static ring painted from a raw colour rather than a `data-activity-status` token. */
  ringColor: string | undefined;
  /** One badge per live session, in {@link ActivityGlowInput.sessions} order — `ActivityBadgeStack` caps the rendered count at three, this list is not pre-capped. */
  badges: ActivityGlowBadge[];
};

/**
 * A single session's own status, or `null` if it is not live — an ended or
 * asleep session contributes no status and no badge (Phase 41 Theme F's own
 * "ended/asleep never glow" rule, generalised past kanban cards).
 */
function sessionStatus(session: ActivityGlowSessionInput): ActivityStatus | null {
  if (!session.running) return null;
  if (session.agentId === undefined) return 'shell';
  if (session.activity === 'waiting') return 'waiting';
  if (session.activity === 'thinking') return 'thinking';
  // `undefined` (no guess yet) and `'idle'` (a frame that ended with no
  // spinner and no open question) both read as "actively working" — the
  // detector's own docs on `SessionActivity`: idle-live is the default, not
  // a fourth thing to draw.
  return 'agent';
}

/**
 * Precedence across several live sessions on one target (Theme J's future
 * workflow-node groups; today's callers only ever pass 0 or 1). `waiting`
 * outranks everything — a question left open for an hour is still the most
 * urgent thing on the target, `activity-detect.ts`'s own rule. `agent` beats
 * `thinking` beats `shell`: a session actively streaming output is more
 * "the thing driving this target" than one merely breathing between turns,
 * which in turn is still an agent and outranks a bystander plain shell.
 */
const STATUS_PRIORITY: Partial<Record<ActivityStatus, number>> = {
  waiting: 4,
  agent: 3,
  thinking: 2,
  shell: 1,
};

/**
 * Resolve a target's {@link ActivityGlow} — the one place "who is doing
 * what to this target" gets decided (Phase 95 Theme C), replacing
 * `deriveCardGlowState`'s callers: an agent actively working on it (`agent`
 * or `thinking`) or waiting on input (`waiting`) beats a plain shell
 * (`shell`), which beats the target's own run-state fallback, which beats
 * its status-pill colour. Pure — no store reads, no React — so the
 * precedence table is a plain vitest suite; {@link useActivityGlow} below is
 * the only thing that touches a hook.
 */
export function resolveActivityGlow(input: ActivityGlowInput): ActivityGlow {
  const badges: ActivityGlowBadge[] = [];
  let bestStatus: ActivityStatus | null = null;
  let bestPriority = -1;

  for (const session of input.sessions) {
    const status = sessionStatus(session);
    if (status === null) continue;

    badges.push({
      sessionId: session.sessionId,
      kind: session.agentId === undefined ? 'shell' : 'agent',
      agentId: session.agentId,
      label: session.agentId ?? 'Terminal',
    });

    const priority = STATUS_PRIORITY[status] ?? 0;
    if (priority > bestPriority) {
      bestPriority = priority;
      bestStatus = status;
    }
  }

  if (bestStatus !== null) {
    return { status: bestStatus, ringColor: undefined, badges };
  }
  if (input.fallbackStatus !== undefined) {
    return { status: input.fallbackStatus, ringColor: undefined, badges: [] };
  }
  if (input.fallbackColor !== undefined) {
    return { status: 'idle', ringColor: input.fallbackColor, badges: [] };
  }
  return { status: 'idle', ringColor: undefined, badges: [] };
}

/**
 * The hook callers actually reach for — a thin wrapper over
 * {@link resolveActivityGlow}. No `useMemo`: every caller already re-renders
 * off a zustand slice selector that changed, `sessions` is a handful of
 * entries at most, and memoising on a freshly-built array each render would
 * only add a dependency-array footgun for no saved work.
 */
export function useActivityGlow(input: ActivityGlowInput): ActivityGlow {
  return resolveActivityGlow(input);
}
