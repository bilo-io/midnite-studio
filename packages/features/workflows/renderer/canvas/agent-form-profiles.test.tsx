import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowNode } from '@midnite/studio-shared';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { WorkflowsHostProvider, type WorkflowsHost } from '../host';
import { AgentForm, RouterForm, VerifyForm } from './node-forms';

/** #1699 — an agent node can run as one of your agents; a deleted one says what runs instead. */
afterEach(cleanup);

const PROFILES = [{ id: 'profile-rev', name: 'Reviewer', baseAgentId: 'codex' }];

function host(profiles: typeof PROFILES | undefined): WorkflowsHost {
  return { useAgentProfiles: () => profiles } as unknown as WorkflowsHost;
}

function node(config: Partial<{ agentId: string; agentProfileId: string; model: string }> = {}): WorkflowNode {
  return { id: 'n1', label: 'Ask', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude', prompt: 'Do it', ...config } };
}

function renderForm(n: WorkflowNode, profiles: typeof PROFILES | undefined = PROFILES) {
  const onChange = vi.fn();
  render(
    <WorkflowsHostProvider host={host(profiles)}>
      <AgentForm node={n} onChange={onChange} onInterpolatableFocus={() => undefined} />
    </WorkflowsHostProvider>,
  );
  return onChange;
}

describe('AgentForm — custom agents (#1699)', () => {
  it('lists your agents first, and picking one stores it beside its base agent', () => {
    const onChange = renderForm(node({ model: 'o3' }));
    const select = screen.getByRole('combobox', { name: 'Run as' }) as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe('Reviewer');
    fireEvent.change(select, { target: { value: 'profile-rev' } });
    const next = onChange.mock.calls[0]![0] as Extract<WorkflowNode, { kind: 'agent' }>;
    expect(next.config).toMatchObject({ agentProfileId: 'profile-rev', agentId: 'codex' });
    expect(next.config.model).toBeUndefined();
  });

  it('hides the roster id and model while a custom agent is picked, and clears it back to the roster', () => {
    const onChange = renderForm(node({ agentId: 'codex', agentProfileId: 'profile-rev' }));
    expect(screen.queryByLabelText('Agent')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Run as' }), { target: { value: '' } });
    const next = onChange.mock.calls[0]![0] as Extract<WorkflowNode, { kind: 'agent' }>;
    expect(next.config.agentProfileId).toBeUndefined();
    expect(next.config.agentId).toBe('codex');
  });

  it('says a deleted custom agent runs as its roster agent', () => {
    renderForm(node({ agentId: 'codex', agentProfileId: 'profile-gone' }));
    expect(screen.getByRole('status').textContent).toBe('This custom agent was deleted, so the node runs as codex.');
  });

  it('calls nothing deleted while the list is still loading', () => {
    renderForm(node({ agentId: 'codex', agentProfileId: 'profile-rev' }), undefined);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('router and verify agent pickers, and an app with no custom agents (#1713)', () => {
  it('a router in agent-label mode picks a custom agent beside its base agent', () => {
    const onChange = vi.fn();
    const router = {
      id: 'r',
      label: 'Route',
      x: 0,
      y: 0,
      kind: 'router',
      config: { mode: 'agent-label', cases: [], agent: { agentId: 'claude', prompt: 'Sort it' } },
    } as WorkflowNode;
    render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <WorkflowsHostProvider host={host(PROFILES)}>
          <RouterForm node={router} onChange={onChange} onInterpolatableFocus={() => undefined} />
        </WorkflowsHostProvider>
      </FrameChromeProvider>,
    );
    const select = screen.getByRole('combobox', { name: 'Run as' }) as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe('Reviewer');
    fireEvent.change(select, { target: { value: 'profile-rev' } });
    const next = onChange.mock.calls[0]![0] as Extract<WorkflowNode, { kind: 'router' }>;
    expect(next.config.agent).toMatchObject({ agentProfileId: 'profile-rev', agentId: 'codex', prompt: 'Sort it' });
  });

  it('a verify agent check picks a custom agent, and clearing it drops the id', () => {
    const onChange = vi.fn();
    const verify = {
      id: 'v',
      label: 'Check',
      x: 0,
      y: 0,
      kind: 'verify',
      config: { check: 'agent', agentId: 'codex', agentProfileId: 'profile-rev', prompt: 'Grade' },
    } as WorkflowNode;
    render(
      <WorkflowsHostProvider host={host(PROFILES)}>
        <VerifyForm node={verify} onChange={onChange} onInterpolatableFocus={() => undefined} />
      </WorkflowsHostProvider>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Run as' }), { target: { value: '' } });
    const next = onChange.mock.calls[0]![0] as Extract<WorkflowNode, { kind: 'verify' }>;
    expect('agentProfileId' in next.config).toBe(false);
  });

  it('says a custom agent is ignored in an app with no custom agents, instead of staying silent', () => {
    render(
      <WorkflowsHostProvider host={{} as unknown as WorkflowsHost}>
        <AgentForm
          node={node({ agentId: 'codex', agentProfileId: 'profile-rev' })}
          onChange={() => undefined}
          onInterpolatableFocus={() => undefined}
        />
      </WorkflowsHostProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'This app has no custom agents, so the node runs as codex, not as the saved agent.',
    );
  });
});
