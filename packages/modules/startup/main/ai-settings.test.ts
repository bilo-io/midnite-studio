// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { aiSettingsOp, openAiSettings } from './ai-settings';

const dir = () => mkdtemp(join(tmpdir(), 'startup-ai-'));

describe('ai settings', () => {
  it('defaults to claude, and survives a reopen outside the workspace file', async () => {
    const d = await dir();
    const first = openAiSettings(d);
    expect(first.get()).toEqual({ agentId: 'claude', ollamaModel: '' });
    await first.set({ agentId: 'codex', ollamaModel: 'llama3' });
    expect(openAiSettings(d).get()).toEqual({ agentId: 'codex', ollamaModel: 'llama3' });
    expect(JSON.parse(await readFile(join(d, 'ai-settings.json'), 'utf8'))).toEqual({ agentId: 'codex', ollamaModel: 'llama3' });
  });

  it('a garbage file falls back to the default and says so once', async () => {
    const d = await dir();
    await writeFile(join(d, 'ai-settings.json'), '{"agentId": 5}');
    const warnings: string[] = [];
    expect(openAiSettings(d, (m) => warnings.push(m)).get()).toEqual({ agentId: 'claude', ollamaModel: '' });
    expect(warnings).toHaveLength(1);
  });

  it('the op reads defaults and refuses a write with no store', async () => {
    expect(await aiSettingsOp(undefined, { op: 'getAiSettings' })).toEqual({ ok: true, value: { agentId: 'claude', ollamaModel: '' } });
    expect(await aiSettingsOp(undefined, { op: 'setAiSettings', settings: { agentId: 'claude', ollamaModel: '' } })).toMatchObject({ ok: false, kind: 'invalid' });
    const store = openAiSettings(await dir());
    expect(await aiSettingsOp(store, { op: 'setAiSettings', settings: { agentId: 'agy', ollamaModel: '' } })).toEqual({ ok: true, value: { agentId: 'agy', ollamaModel: '' } });
  });
});
