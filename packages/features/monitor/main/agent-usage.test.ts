// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildAgentUsage, locateTranscript, readTranscriptUsage, slugifyCwd } from './agent-usage';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'monitor-usage-'));
});
afterEach(() => rm(home, { recursive: true, force: true }));

const asst = (id: string, out: number, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    message: { id, model: 'claude-x', usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, ...extra } },
  });

const CID = '11111111-2222-3333-4444-555555555555';

async function claudeFile(cwd: string, lines: string[]) {
  const dir = join(home, '.claude', 'projects', slugifyCwd(cwd));
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${CID}.jsonl`);
  await writeFile(path, lines.join('\n'));
  return path;
}

describe('readTranscriptUsage', () => {
  it('sums Claude usage, last line per message id wins, malformed lines skipped', async () => {
    const path = await claudeFile('/w/a', [asst('m1', 1), asst('m1', 7), 'not json', '{"type":"user"}', asst('m2', 3)]);
    expect(await readTranscriptUsage(path)).toEqual({ input: 20, output: 10, cacheRead: 200, cacheCreate: 10, model: 'claude-x' });
  });

  it('takes the last cumulative Codex token_count and splits cached input out', async () => {
    const dir = join(home, '.codex', 'sessions', '2026', '06');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `rollout-2026-06-11T13-05-11-${CID}.jsonl`);
    const tc = (i: number, c: number, o: number) =>
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: i, cached_input_tokens: c, output_tokens: o } } } });
    await writeFile(path, [JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-x' } }), tc(10, 2, 1), tc(300, 100, 40)].join('\n'));
    expect(await readTranscriptUsage(path)).toEqual({ input: 200, output: 40, cacheRead: 100, cacheCreate: 0, model: 'gpt-x' });
  });

  it('never throws on a missing file, and re-reads when the file changes', async () => {
    expect(await readTranscriptUsage(join(home, 'nope.jsonl'))).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
    const path = await claudeFile('/w/a', [asst('m1', 1)]);
    expect((await readTranscriptUsage(path)).output).toBe(1);
    await writeFile(path, [asst('m1', 1), asst('m2', 4)].join('\n'));
    expect((await readTranscriptUsage(path)).output).toBe(5);
  });
});

describe('locateTranscript + buildAgentUsage', () => {
  it('rolls up per agent and marks unmatched sessions null', async () => {
    await claudeFile('/w/a', [asst('m1', 2)]);
    const sessions = [
      { id: 's1', agentId: 'claude', title: 'A', cwd: '/w/a', agentConversationId: CID },
      { id: 's2', agentId: 'claude', title: 'B', cwd: '/w/b', agentConversationId: CID },
      { id: 's3', agentId: 'gemini', title: 'C', cwd: '/w/c' },
    ];
    const res = await buildAgentUsage(home, sessions);
    expect(res.sessions.map((s) => s.totals?.output ?? null)).toEqual([2, null, null]);
    expect(res.agents.find((a) => a.agentId === 'claude')).toMatchObject({ sessions: 2, totals: { output: 2 } });
    expect(res.agents.find((a) => a.agentId === 'gemini')?.totals.output).toBe(0);
  });

  it('refuses a conversation id that could escape the store', async () => {
    expect(await locateTranscript({ home, agentId: 'claude', cwd: '/w', conversationId: '../x' })).toBeNull();
  });
});
