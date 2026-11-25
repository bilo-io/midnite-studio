// vitest/jsdom: rendered text, roles and click calls; nothing here needs a real browser.
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AGENT_BLUEPRINT_STAGES, BUILTIN_AGENTS } from '@midnite/studio-shared';

import { AgentsInfo } from './agents-info';
import { GLOSSARY } from './info-copy';
import { mountWith } from './test-harness';

afterEach(cleanup);

describe('AgentsInfo', () => {
  it('renders every stage and option', () => {
    mountWith(<AgentsInfo />);
    for (const stage of AGENT_BLUEPRINT_STAGES) {
      const card = screen.getByTestId(`info-stage-${stage.id}`);
      expect(within(card).getByText(stage.label)).toBeTruthy();
      expect(within(card).getByText(stage.summary)).toBeTruthy();
      for (const option of stage.options) expect(within(card).getByTestId(`info-option-${option.id}`).textContent).toContain(option.summary);
    }
  });

  it('covers every roster agent in the delivery and enforcement tables', () => {
    mountWith(<AgentsInfo />);
    for (const agent of BUILTIN_AGENTS) {
      expect(screen.getByTestId(`info-delivery-${agent.id}`)).toBeTruthy();
      expect(screen.getByTestId(`info-enforcement-${agent.id}`)).toBeTruthy();
    }
  });

  it('gives each yes/no cell its screen-reader text', () => {
    mountWith(<AgentsInfo />);
    const claude = screen.getByTestId('info-enforcement-claude');
    expect(within(claude).getAllByText('Enforced')).toHaveLength(2);
    const aider = screen.getByTestId('info-enforcement-aider');
    expect(within(aider).getAllByText('Not enforced')).toHaveLength(2);
  });

  it('lists the glossary terms sorted and unique', () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(new Set(terms).size).toBe(terms.length);
    expect([...terms].sort((a, b) => a.localeCompare(b))).toEqual(terms);
    for (const required of ['RAG', 'Vector database', 'Hybrid search', 'MCP', 'Tool call', 'Fine-tuning', 'Open-weight model', 'Evaluation', 'Guardrails', 'Observability', 'Orchestration', 'System prompt']) {
      expect(terms).toContain(required);
    }
    for (const entry of GLOSSARY) expect(entry.definition.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 1).length).toBeLessThanOrEqual(2);
    mountWith(<AgentsInfo />);
    const rendered = within(screen.getByTestId('info-glossary-list')).getAllByRole('term').map((el) => el.textContent);
    expect(rendered).toEqual(terms);
  });

  it('opens docs links through openExternal', () => {
    const openExternal = vi.fn();
    mountWith(<AgentsInfo />, { openExternal });
    fireEvent.click(within(screen.getByTestId('info-option-langgraph')).getByRole('button', { name: 'Docs ↗' }));
    expect(openExternal).toHaveBeenCalledWith('https://www.langchain.com/langgraph');
    fireEvent.click(screen.getByRole('button', { name: 'Claude docs' }));
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it('has the four anchored sections', () => {
    mountWith(<AgentsInfo />);
    for (const id of ['info-stages', 'info-how', 'info-glossary', 'info-links']) expect(document.getElementById(id)).toBeTruthy();
  });
});
