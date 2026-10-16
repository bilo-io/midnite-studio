import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import type { AgentTokenTotals, MonitorAgentUsage } from '@midnite/studio-shared';

/**
 * Token totals from an agent's own transcript (Phase 113 Theme I). Pure Node, no `electron`: the
 * home directory is a parameter, so tests point it at a temp dir of fixture jsonl and nothing here
 * ever reaches for the user's real `~/.claude` or `~/.codex`.
 *
 * Two shapes, told apart per line:
 * - **Claude** — `{type:'assistant', message:{id, model, usage:{input_tokens, output_tokens,
 *   cache_read_input_tokens, cache_creation_input_tokens}}}`. A streamed message is written more than
 *   once with a growing `usage`, so the last line per `message.id` wins.
 * - **Codex** — `{type:'event_msg', payload:{type:'token_count', info:{total_token_usage}}}`, which is
 *   already cumulative, so the last one wins. Its `input_tokens` includes the cached part, which is
 *   split out here to match Claude's meaning of `input`.
 */
const EMPTY: AgentTokenTotals = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export function addTotals(a: AgentTokenTotals, b: AgentTokenTotals): AgentTokenTotals {
  const model = b.model ?? a.model;
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    ...(model ? { model } : {}),
  };
}

const cache = new Map<string, { key: string; totals: AgentTokenTotals }>();

/** Sum one transcript's usage. Never throws: an unreadable file is zero, a malformed line is skipped. */
export async function readTranscriptUsage(path: string): Promise<AgentTokenTotals> {
  let key: string;
  try {
    const s = await stat(path);
    key = `${s.mtimeMs}:${s.size}`;
  } catch {
    return { ...EMPTY };
  }
  const hit = cache.get(path);
  if (hit?.key === key) return hit.totals;

  const claude = new Map<string, AgentTokenTotals>();
  let codex: AgentTokenTotals | null = null;
  let model: string | undefined;
  try {
    const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
    let anon = 0;
    for await (const line of lines) {
      let row: Record<string, unknown> | undefined;
      try {
        row = obj(JSON.parse(line));
      } catch {
        continue;
      }
      if (!row) continue;
      const message = obj(row.message);
      const usage = obj(message?.usage);
      if (row.type === 'assistant' && message && usage) {
        const id = typeof message.id === 'string' ? message.id : `anon-${anon++}`;
        const m = typeof message.model === 'string' ? message.model : undefined;
        if (m) model = m;
        claude.set(id, {
          input: num(usage.input_tokens),
          output: num(usage.output_tokens),
          cacheRead: num(usage.cache_read_input_tokens),
          cacheCreate: num(usage.cache_creation_input_tokens),
        });
        continue;
      }
      const payload = obj(row.payload);
      if (row.type === 'turn_context' && typeof payload?.model === 'string') model = payload.model;
      const total = obj(obj(payload?.info)?.total_token_usage);
      if (row.type === 'event_msg' && payload?.type === 'token_count' && total) {
        const cached = num(total.cached_input_tokens);
        codex = {
          input: Math.max(0, num(total.input_tokens) - cached),
          output: num(total.output_tokens),
          cacheRead: cached,
          cacheCreate: 0,
        };
      }
    }
  } catch {
    // Partial read: report what was summed so far.
  }
  const sum = codex ?? [...claude.values()].reduce(addTotals, EMPTY);
  const totals: AgentTokenTotals = { ...sum, ...(model ? { model } : {}) };
  cache.set(path, { key, totals });
  return totals;
}

/** Claude Code's project slug for a cwd: every non-alphanumeric, non-`-`/`_` becomes `-`. */
export function slugifyCwd(cwd: string): string {
  return cwd.replace(/[/\\]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
}

/**
 * Where a session's transcript lives, given the conversation id Studio captured for it
 * (`agentConversationId`). Claude: `<home>/.claude/projects/<slug>/<id>.jsonl`; Codex:
 * `<home>/.codex/sessions/**\/rollout-*-<id>.jsonl`. `null` for any other agent or a missing file.
 */
export async function locateTranscript(opts: {
  home: string;
  agentId: string;
  cwd: string;
  conversationId: string | undefined;
}): Promise<string | null> {
  const { home, agentId, cwd, conversationId } = opts;
  if (!conversationId || /[/\\]/.test(conversationId)) return null;
  if (agentId === 'claude') {
    const path = join(home, '.claude', 'projects', slugifyCwd(cwd), `${conversationId}.jsonl`);
    return stat(path).then(() => path, () => null);
  }
  if (agentId === 'codex') {
    const files: string[] = [];
    await walk(join(home, '.codex', 'sessions'), files);
    return files.find((f) => f.startsWith(join(home, '.codex')) && f.endsWith(`-${conversationId}.jsonl`)) ?? null;
  }
  return null;
}

/** What the usage roll-up needs to know about one live agent session. */
export type UsageSession = {
  id: string;
  agentId: string;
  title: string;
  cwd: string;
  agentConversationId?: string | undefined;
};

/** Per-session totals plus a per-agent roll-up. A session with no findable transcript has `totals: null`. */
export async function buildAgentUsage(
  home: string,
  sessions: readonly UsageSession[],
): Promise<MonitorAgentUsage> {
  const rows = await Promise.all(
    sessions.map(async (s) => {
      const path = await locateTranscript({ home, agentId: s.agentId, cwd: s.cwd, conversationId: s.agentConversationId });
      return { sessionId: s.id, agentId: s.agentId, title: s.title, totals: path ? await readTranscriptUsage(path) : null };
    }),
  );
  const byAgent = new Map<string, { sessions: number; totals: AgentTokenTotals }>();
  for (const r of rows) {
    const cur = byAgent.get(r.agentId) ?? { sessions: 0, totals: { ...EMPTY } };
    byAgent.set(r.agentId, { sessions: cur.sessions + 1, totals: r.totals ? addTotals(cur.totals, r.totals) : cur.totals });
  }
  return { sessions: rows, agents: [...byAgent].map(([agentId, v]) => ({ agentId, ...v })) };
}
