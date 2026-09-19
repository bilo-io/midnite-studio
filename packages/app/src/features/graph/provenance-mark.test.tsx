import type { AgentDefinition, ClosedSession, CommitProvenance } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getProvenanceTooltip,
  ProvenanceMark,
  resolveProvenanceDetails,
} from './provenance-mark';

afterEach(cleanup);

const mockAgents: AgentDefinition[] = [
  {
    id: 'claude',
    label: 'Claude',
    command: 'claude',
    args: [],
    accent: '#D97757',
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    args: [],
    accent: '#10A37F',
  },
];

const mockSessions: ClosedSession[] = [
  {
    id: 'sess-abc',
    kind: 'agent',
    agentId: 'claude',
    title: 'fix-login',
    name: 'login-fix-session',
    cwd: '/repo',
    repoId: 'r1',
    createdAt: 1000,
    closedAt: 2000,
    exitCode: 0,
    reason: 'closed',
    transcriptBytes: 100,
  },
];

describe('getProvenanceTooltip', () => {
  it('returns null for human provenance', () => {
    expect(getProvenanceTooltip({ provenance: { kind: 'human' } })).toBeNull();
  });

  it('formats co-author tooltip as "Co-authored by <Agent>"', () => {
    const prov: CommitProvenance = {
      kind: 'mixed',
      agentIds: ['claude'],
      source: 'co-author',
    };
    expect(getProvenanceTooltip({ provenance: prov, agentName: 'Claude' })).toBe(
      'Co-authored by Claude',
    );
  });

  it('formats session-trailer tooltip as "Made during <session> · <Agent>"', () => {
    const prov: CommitProvenance = {
      kind: 'agent',
      agentIds: ['claude'],
      source: 'session-trailer',
      sessionId: 'sess-123',
    };
    expect(
      getProvenanceTooltip({
        provenance: prov,
        sessionName: 'login-fix-session',
        agentName: 'Claude',
      }),
    ).toBe('Made during login-fix-session · Claude');
  });

  it('formats window-join tooltip as "Probably made during <session>" (load-bearing "probably")', () => {
    const prov: CommitProvenance = {
      kind: 'agent',
      agentIds: ['codex'],
      source: 'session-window',
      sessionId: 'sess-window',
    };
    const text = getProvenanceTooltip({
      provenance: prov,
      sessionName: 'refactor-task',
      agentName: 'Codex',
    });
    expect(text).toBe('Probably made during refactor-task');
    expect(text?.toLowerCase()).toContain('probably');
  });

  it('formats author source tooltip', () => {
    const prov: CommitProvenance = {
      kind: 'agent',
      agentIds: ['claude'],
      source: 'author',
    };
    expect(getProvenanceTooltip({ provenance: prov, agentName: 'Claude' })).toBe(
      'Authored by Claude',
    );
  });
});

describe('resolveProvenanceDetails', () => {
  it('resolves sessionName and agent definition', () => {
    const prov: CommitProvenance = {
      kind: 'agent',
      agentIds: ['claude'],
      source: 'session-trailer',
      sessionId: 'sess-abc',
    };
    const details = resolveProvenanceDetails(prov, mockAgents, mockSessions);
    expect(details.agent?.label).toBe('Claude');
    expect(details.sessionName).toBe('login-fix-session');
  });

  it('returns empty for human provenance', () => {
    const details = resolveProvenanceDetails({ kind: 'human' }, mockAgents, mockSessions);
    expect(details).toEqual({});
  });
});

describe('ProvenanceMark component', () => {
  it('renders nothing (0 extra DOM) for human provenance', () => {
    const { container } = render(<ProvenanceMark provenance={{ kind: 'human' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for null provenance', () => {
    const { container } = render(<ProvenanceMark provenance={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders badge for mixed co-authored commit with tooltip', () => {
    const prov: CommitProvenance = {
      kind: 'mixed',
      agentIds: ['claude'],
      source: 'co-author',
    };
    render(<ProvenanceMark provenance={prov} agent={mockAgents[0]} size={16} />);

    const mark = screen.getByTestId('provenance-mark');
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('data-provenance-kind')).toBe('mixed');
    expect(mark.getAttribute('data-provenance-source')).toBe('co-author');
    expect(mark.getAttribute('data-motion')).toBe('reduced');
    expect(mark.style.width).toBe('16px');
    expect(mark.style.height).toBe('16px');
  });

  it('renders badge for window-joined agent commit', () => {
    const prov: CommitProvenance = {
      kind: 'agent',
      agentIds: ['codex'],
      source: 'session-window',
      sessionId: 'sess-window',
    };
    render(
      <ProvenanceMark
        provenance={prov}
        agent={mockAgents[1]}
        sessionName="quick-edit"
      />,
    );

    const mark = screen.getByTestId('provenance-mark');
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('data-provenance-kind')).toBe('agent');
    expect(mark.getAttribute('data-provenance-source')).toBe('session-window');
  });
});
