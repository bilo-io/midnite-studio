// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createAgentsBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => 'answer'), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

describe('createAgentsBridge', () => {
  it('exposes exactly chats, council, workflow, demoApi, mcp, agentAudit, ollama, agent.list and secrets.has', () => {
    const bridge = createAgentsBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['agent', 'agentAudit', 'chats', 'council', 'demoApi', 'mcp', 'ollama', 'report', 'secrets', 'workflow']);
    expect(Object.keys(bridge.agent)).toEqual(['list']);
  });

  it('leaves out what is Studio\'s: the terminal-session event and the Settings push', () => {
    const { workflow } = createAgentsBridge(fakeIpc());
    expect('onNodeSessionStarted' in workflow).toBe(false);
    expect('setDefaults' in workflow).toBe(false);
  });

  it('can never read or write a secret: only `has` is exposed, so no LLM key can reach the window', () => {
    const { secrets } = createAgentsBridge(fakeIpc());
    expect(Object.keys(secrets)).toEqual(['has']);
    expect('get' in secrets).toBe(false);
    expect('set' in secrets).toBe(false);
  });

  it('invokes the matching channels', async () => {
    const ipc = fakeIpc();
    const bridge = createAgentsBridge(ipc);
    await bridge.chats.list();
    await bridge.council.run.start({ councilId: 'c', prompt: 'p' });
    await bridge.ollama.status();
    await bridge.agent.list();
    await bridge.secrets.has({ key: 'ollama.apiKey' });
    await bridge.workflow.runs.list({ workflowId: 'w' });
    await bridge.mcp.get();
    await bridge.agentAudit.list({});
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([
      CHANNELS.chatsList,
      CHANNELS.councilRunStart,
      CHANNELS.ollamaStatus,
      CHANNELS.agentList,
      CHANNELS.secretsHas,
      CHANNELS.workflowRunsList,
      CHANNELS.mcpGet,
      CHANNELS.agentAuditList,
    ]);
  });

  it('subscribes to the chat, run-change and pull-progress events, and tears each down', () => {
    const ipc = fakeIpc();
    const bridge = createAgentsBridge(ipc);
    const off = bridge.chats.onEvent(() => undefined);
    bridge.workflow.onRunChanged(() => undefined);
    bridge.ollama.onPullProgress(() => undefined);
    expect(vi.mocked(ipc.on).mock.calls.map((c) => c[0])).toEqual([
      EVENT_CHANNELS.chatsEvent,
      EVENT_CHANNELS.workflowRunChanged,
      EVENT_CHANNELS.ollamaPullProgress,
    ]);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(EVENT_CHANNELS.chatsEvent, expect.any(Function));
  });
});

describe('report namespace', () => {
  it("is the report feature's own bridge: its channels over invoke, the crash report over send, the Help-menu event over on", async () => {
    const ipc: RendererIpc = { invoke: vi.fn(async () => ({})), send: vi.fn(), on: vi.fn(() => undefined), removeListener: vi.fn() };
    const { report } = createAgentsBridge(ipc);
    await report.ghStatus();
    report.error({ source: 'window', name: 'E', message: 'm', stack: '' } as never);
    const off = report.onOpen?.(() => undefined);
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([CHANNELS.reportGhStatus]);
    expect(vi.mocked(ipc.send).mock.calls.map((c) => c[0])).toEqual([CHANNELS.reportError]);
    expect(vi.mocked(ipc.on).mock.calls.map((c) => c[0])).toEqual([EVENT_CHANNELS.reportOpen]);
    expect(typeof off).toBe('function');
  });
});
