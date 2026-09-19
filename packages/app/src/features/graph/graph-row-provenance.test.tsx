import type { AgentDefinition, ClosedSession, CommitProvenance, GraphRow } from '@midnite/studio-shared';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommitGraphRow } from './graph-row';
import { graphThemeFor } from './graph-themes';
import { matchesProvenanceFilter } from './provenance-filter';
import { useGraphStore } from './graph-store';
import { useUiStore } from '../../store/ui-store';

const avatarTheme = graphThemeFor('git-graph', 'comfortable');
const classicTheme = graphThemeFor('classic', 'comfortable');

const makeRow = (sha: string, subject = 'feat: commit'): GraphRow => ({
  row: 0,
  commit: {
    sha,
    subject,
    authorEmail: 'author@example.com',
    authorName: 'Author Name',
    authorDate: 1_700_000_000,
    committerDate: 1_700_000_000,
    parents: [],
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  },
  lane: 0,
  colorIdx: 0,
  edges: [],
  laneCount: 1,
});

const claudeAgent: AgentDefinition = {
  id: 'claude',
  label: 'Claude',
  command: 'claude',
  args: [],
  accent: '#d97706',
};

const renderRow = (
  row: GraphRow,
  over: Partial<Parameters<typeof CommitGraphRow>[0]> = {},
) => {
  const result = render(
    <CommitGraphRow
      row={row}
      refs={[]}
      selected={false}
      gutterWidth={80}
      laneWidth={16}
      theme={avatarTheme}
      clipId="clip"
      dimmed={false}
      onSelect={vi.fn()}
      onContextMenu={vi.fn()}
      onRefContextMenu={vi.fn()}
      onRefActivate={vi.fn()}
      syncFor={() => []}
      onSync={vi.fn()}
      syncing={{}}
      currentBranch="main"
      {...over}
    />,
  );
  return result.container.querySelector('[role="row"]') as HTMLElement;
};

describe('Phase 78 Theme C: The mark on the row', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    useUiStore.setState({ graphProvenanceFilter: 'all' });
  });

  afterEach(() => {
    cleanup();
  });

  describe('three distinct provenance visual states', () => {
    it('human commit renders normal avatar and 0 extra DOM', () => {
      const row = makeRow('sha-human', 'feat: human change');
      const humanProv: CommitProvenance = { kind: 'human' };

      const el = renderRow(row, {
        provenance: humanProv,
        theme: avatarTheme,
      });

      // No agent avatar and no mixed badge in avatar style
      expect(el.querySelector('[data-testid="svg-agent-avatar"]')).toBeNull();
      expect(el.querySelector('[data-testid="svg-mixed-badge"]')).toBeNull();
      expect(el.querySelector('[data-testid="node-provenance-tooltip"]')).toBeNull();

      // In classic style (shows author column), human row renders 0 extra DOM mark
      const classicEl = renderRow(row, {
        provenance: humanProv,
        theme: classicTheme,
      });
      expect(classicEl.querySelector('[data-testid="provenance-mark"]')).toBeNull();
    });

    it('Claude co-authored commit renders mixed badge and co-author tooltip', () => {
      const row = makeRow('sha-coauthor', 'feat: paired change');
      const mixedProv: CommitProvenance = {
        kind: 'mixed',
        source: 'co-author',
        agentIds: ['claude'],
      };

      const el = renderRow(row, {
        provenance: mixedProv,
        agent: claudeAgent,
        theme: avatarTheme,
      });

      // Renders mixed badge overlapping avatar
      expect(el.querySelector('[data-testid="svg-mixed-badge"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="svg-agent-avatar"]')).toBeNull();

      // Tooltip carries "Co-authored by Claude" when focused
      const trigger = el.querySelector('svg')?.parentElement;
      expect(trigger).not.toBeNull();
      fireEvent.focus(trigger!);
      const tooltip = document.body.querySelector('[data-testid="node-provenance-tooltip"]');
      expect(tooltip).not.toBeNull();
      expect(tooltip?.textContent).toBe('Co-authored by Claude');

      // In classic style, renders provenance mark beside author
      const classicEl = renderRow(row, {
        provenance: mixedProv,
        agent: claudeAgent,
        theme: classicTheme,
      });
      expect(classicEl.querySelector('[data-testid="provenance-mark"]')).not.toBeNull();
    });

    it('window-joined agent commit renders agent avatar and probable session tooltip', () => {
      const row = makeRow('sha-agent', 'feat: autonomous change');
      const agentProv: CommitProvenance = {
        kind: 'agent',
        source: 'session-window',
        agentIds: ['claude'],
        sessionId: 'sess-xyz',
      };

      const el = renderRow(row, {
        provenance: agentProv,
        sessionName: 'Feature Sprint',
        agent: claudeAgent,
        theme: avatarTheme,
      });

      // In avatar style, renders agent avatar in place of human avatar
      expect(el.querySelector('[data-testid="svg-agent-avatar"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="svg-mixed-badge"]')).toBeNull();

      // Tooltip carries "Probably made during Feature Sprint" (word 'probably' is load-bearing)
      const trigger = el.querySelector('svg')?.parentElement;
      expect(trigger).not.toBeNull();
      fireEvent.focus(trigger!);
      const tooltip = document.body.querySelector('[data-testid="node-provenance-tooltip"]');
      expect(tooltip).not.toBeNull();
      expect(tooltip?.textContent).toBe('Probably made during Feature Sprint');
    });
  });

  describe('Agents filter dims exactly the human row', () => {
    const humanProv: CommitProvenance = { kind: 'human' };
    const mixedProv: CommitProvenance = {
      kind: 'mixed',
      source: 'co-author',
      agentIds: ['claude'],
    };
    const agentProv: CommitProvenance = {
      kind: 'agent',
      source: 'session-window',
      agentIds: ['claude'],
      sessionId: 'sess-1',
    };

    it('matchesProvenanceFilter logic', () => {
      // 'all' filter: nobody is dimmed
      expect(matchesProvenanceFilter(humanProv, 'all')).toBe(true);
      expect(matchesProvenanceFilter(mixedProv, 'all')).toBe(true);
      expect(matchesProvenanceFilter(agentProv, 'all')).toBe(true);

      // 'agents' filter: exactly human returns false (dimmed)
      expect(matchesProvenanceFilter(humanProv, 'agents')).toBe(false);
      expect(matchesProvenanceFilter(mixedProv, 'agents')).toBe(true);
      expect(matchesProvenanceFilter(agentProv, 'agents')).toBe(true);

      // 'humans' filter: human returns true, agent-only returns false
      expect(matchesProvenanceFilter(humanProv, 'humans')).toBe(true);
      expect(matchesProvenanceFilter(agentProv, 'humans')).toBe(false);

      // per-agent sub-filter
      expect(matchesProvenanceFilter(mixedProv, 'agent:claude')).toBe(true);
      expect(matchesProvenanceFilter(mixedProv, 'agent:codex')).toBe(false);
    });

    it('renders human row dimmed with opacity-40 and data-dimmed when Agents filter is applied', () => {
      const humanRow = makeRow('sha-1');
      const mixedRow = makeRow('sha-2');
      const agentRow = makeRow('sha-3');

      const filter = 'agents';

      const humanEl = renderRow(humanRow, {
        provenance: humanProv,
        dimmed: !matchesProvenanceFilter(humanProv, filter),
      });
      const mixedEl = renderRow(mixedRow, {
        provenance: mixedProv,
        agent: claudeAgent,
        dimmed: !matchesProvenanceFilter(mixedProv, filter),
      });
      const agentEl = renderRow(agentRow, {
        provenance: agentProv,
        agent: claudeAgent,
        dimmed: !matchesProvenanceFilter(agentProv, filter),
      });

      // Exactly the human row is dimmed!
      expect(humanEl.hasAttribute('data-dimmed')).toBe(true);
      expect(humanEl.className).toContain('opacity-40');

      expect(mixedEl.hasAttribute('data-dimmed')).toBe(false);
      expect(mixedEl.className).not.toContain('opacity-40');

      expect(agentEl.hasAttribute('data-dimmed')).toBe(false);
      expect(agentEl.className).not.toContain('opacity-40');
    });
  });
});
