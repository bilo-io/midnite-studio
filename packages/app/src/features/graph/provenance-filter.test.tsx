import type { AgentDefinition } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProvenanceFilter } from './provenance-filter';

afterEach(cleanup);

const mockAgents: AgentDefinition[] = [
  { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#D97757' },
  { id: 'codex', label: 'Codex', command: 'codex', args: [], accent: '#10A37F' },
];

describe('ProvenanceFilter', () => {
  it('renders All, Humans, Agents buttons', () => {
    render(
      <ProvenanceFilter
        selected="all"
        onChange={vi.fn()}
        matchingAgents={mockAgents}
      />,
    );

    const allBtn = screen.getByRole('radio', { name: 'All' });
    const humansBtn = screen.getByRole('radio', { name: 'Humans' });
    const agentsBtn = screen.getByRole('radio', { name: 'Agents' });

    expect(allBtn.getAttribute('aria-checked')).toBe('true');
    expect(humansBtn.getAttribute('aria-checked')).toBe('false');
    expect(agentsBtn.getAttribute('aria-checked')).toBe('false');
  });

  it('clicking buttons fires onChange', () => {
    const onChange = vi.fn();
    render(
      <ProvenanceFilter
        selected="all"
        onChange={onChange}
        matchingAgents={mockAgents}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Humans' }));
    expect(onChange).toHaveBeenCalledWith('humans');

    fireEvent.click(screen.getByRole('radio', { name: 'Agents' }));
    expect(onChange).toHaveBeenCalledWith('agents');
  });

  it('does not render sub-filter when matchingAgents <= 1', () => {
    render(
      <ProvenanceFilter
        selected="agents"
        onChange={vi.fn()}
        matchingAgents={[mockAgents[0]!]}
      />,
    );

    expect(screen.queryByLabelText('Filter by agent')).toBeNull();
  });

  it('renders sub-filter when matchingAgents > 1 and Agents is active', () => {
    const onChange = vi.fn();
    render(
      <ProvenanceFilter
        selected="agents"
        onChange={onChange}
        matchingAgents={mockAgents}
      />,
    );

    const select = screen.getByLabelText('Filter by agent') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('all-agents');

    fireEvent.change(select, { target: { value: 'claude' } });
    expect(onChange).toHaveBeenCalledWith('agent:claude');
  });

  it('reflects active agent in sub-filter', () => {
    render(
      <ProvenanceFilter
        selected="agent:codex"
        onChange={vi.fn()}
        matchingAgents={mockAgents}
      />,
    );

    const select = screen.getByLabelText('Filter by agent') as HTMLSelectElement;
    expect(select.value).toBe('codex');
    const agentsBtn = screen.getByRole('radio', { name: 'Agents' });
    expect(agentsBtn.getAttribute('aria-checked')).toBe('true');
  });
});
