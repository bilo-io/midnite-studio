import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactElement } from 'react';

import { createFrameChrome, FrameChromeProvider, type FrameChrome, type FrameDialogs } from '@midnite/studio-frame';
import { BUILTIN_AGENTS, type AgentProfile, type AgentStatus } from '@midnite/studio-shared';

import { AgentProfilesHostProvider, type AgentProfilesHost } from './host';
import { TEST_AGENT_PROFILES_HOST } from './testing';

/** A mock `agentProfile` bridge over an in-memory list, for the component tests. */
export function mockBridge(initial: AgentProfile[]) {
  let list = [...initial];
  const agentProfile = {
    list: vi.fn(async () => ({ ok: true as const, value: { profiles: list } })),
    save: vi.fn(async ({ profile }: { profile: AgentProfile }) => {
      list = [...list.filter((p) => p.id !== profile.id), profile];
      return { ok: true as const, value: { status: 'saved' as const, profile } };
    }),
    delete: vi.fn(async ({ id }: { id: string }) => {
      list = list.filter((p) => p.id !== id);
      return { ok: true as const };
    }),
    export: vi.fn(async () => ({ ok: true as const, value: { path: '/tmp/a.json' } })),
    import: vi.fn(async () => ({ ok: true as const, value: { profile: null as AgentProfile | null } })),
  };
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { agentProfile };
  return agentProfile;
}

export function failingListBridge(message: string) {
  const agentProfile = { list: vi.fn(async () => ({ ok: false as const, kind: 'error' as const, message })) };
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { agentProfile };
  return agentProfile;
}

export function mountWith(ui: ReactElement, host: Partial<AgentProfilesHost> = {}, chromeOverrides: Partial<FrameChrome> = {}) {
  const confirm = vi.fn();
  const dialogs = { confirm, notify: vi.fn(), setBlastRadius: vi.fn(), close: vi.fn() } as unknown as FrameDialogs;
  const { chrome } = createFrameChrome({ useDialogs: () => dialogs, ...chromeOverrides });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={chrome}>
        <AgentProfilesHostProvider host={{ ...TEST_AGENT_PROFILES_HOST, ...host }}>{ui}</AgentProfilesHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
  return { ...view, confirm };
}

/** A roster host where the listed agents are not installed. */
export function rosterWithout(uninstalled: string[], drop: string[] = []): Partial<AgentProfilesHost> {
  const agents = BUILTIN_AGENTS.filter((a) => !drop.includes(a.id));
  const status: AgentStatus[] = agents.map((a) => ({ id: a.id, installed: !uninstalled.includes(a.id), resolvedPath: null }));
  return { useAgentRoster: () => ({ agents: [...agents], status }) };
}
