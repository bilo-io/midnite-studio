// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { agentConsentOp, openAgentConsent } from './agent-consent';
import { handleStartupRequest } from './service';
import { openWorkspaceStore } from './workspace-store';

const dir = () => mkdtemp(join(tmpdir(), 'startup-consent-'));

describe('agent consent', () => {
  it('is off by default and survives a reopen', async () => {
    const d = await dir();
    const first = openAgentConsent(d);
    expect(first.get()).toEqual({ read: false, write: false });
    await first.set({ read: true, write: true });
    expect(openAgentConsent(d).get()).toEqual({ read: true, write: true });
    expect(JSON.parse(await readFile(join(d, 'agent-consent.json'), 'utf8'))).toEqual({ read: true, write: true });
  });

  it('stores "make changes" off whenever read is off', async () => {
    const store = openAgentConsent(await dir());
    expect(await store.set({ read: false, write: true })).toEqual({ read: false, write: false });
  });

  it('a garbage file leaves access off and says so once', async () => {
    const d = await dir();
    await writeFile(join(d, 'agent-consent.json'), '{"read": "yes"}');
    const warnings: string[] = [];
    expect(openAgentConsent(d, (m) => warnings.push(m)).get()).toEqual({ read: false, write: false });
    expect(warnings).toHaveLength(1);
  });

  it('is reachable through the startup ops and never touches the workspace', async () => {
    const d = await dir();
    const consent = openAgentConsent(d);
    const ws = await openWorkspaceStore({ dir: d });
    const deps = { agentConsent: consent };
    expect(await handleStartupRequest(ws, { op: 'getAgentConsent' }, deps)).toEqual({ ok: true, value: { read: false, write: false } });
    expect(await handleStartupRequest(ws, { op: 'setAgentConsent', consent: { read: true, write: false } }, deps)).toEqual({ ok: true, value: { read: true, write: false } });
    expect(consent.get().read).toBe(true);
    expect(ws.snapshot().revision).toBe(0);
  });

  it('answers the defaults, and refuses a write, when no store is mounted', async () => {
    expect(await agentConsentOp(undefined, { op: 'getAgentConsent' })).toEqual({ ok: true, value: { read: false, write: false } });
    expect(await agentConsentOp(undefined, { op: 'setAgentConsent', consent: { read: true, write: true } })).toMatchObject({ ok: false });
  });
});
