// vitest/jsdom: roles, keyboard and state; the two-column grid is CSS and is judged on screen.
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentBlueprint } from '@midnite/studio-shared';

import { BlueprintEditor } from './blueprint-editor';
import { mountWith } from './test-harness';

afterEach(cleanup);

function Harness({ initial = {}, compact = false }: { initial?: AgentBlueprint; compact?: boolean }) {
  const [value, setValue] = useState<AgentBlueprint>(initial);
  return <BlueprintEditor value={value} onChange={setValue} compact={compact} />;
}

describe('BlueprintEditor', () => {
  it('lists the five stages and activates one on click', () => {
    mountWith(<Harness />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByTestId('blueprint-stage-orchestrate').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('blueprint-stage-ground'));
    expect(screen.getByTestId('blueprint-stage-ground').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: /Ingest & Ground/ })).toBeTruthy();
  });

  it('moves with ArrowDown, ArrowUp, Home and End, using a roving tabindex', () => {
    mountWith(<Harness />);
    const first = screen.getByTestId('blueprint-stage-orchestrate');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = screen.getByTestId('blueprint-stage-ground');
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(second, { key: 'End' });
    expect(screen.getByTestId('blueprint-stage-operate').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByTestId('blueprint-stage-orchestrate').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(screen.getByTestId('blueprint-stage-orchestrate').getAttribute('aria-selected')).toBe('true');
  });

  it('toggles options independently, with a check on a pressed card', () => {
    mountWith(<Harness />);
    const a = screen.getByTestId('blueprint-option-langgraph');
    const b = screen.getByTestId('blueprint-option-crewai');
    expect(a.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(a);
    fireEvent.click(b);
    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(within(a).getByTestId('blueprint-check')).toBeTruthy();
    fireEvent.click(a);
    expect(a.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });

  it('counts the note against 500', () => {
    mountWith(<Harness />);
    expect(screen.getByTestId('blueprint-note-count').textContent).toBe('0 / 500');
    fireEvent.change(screen.getByTestId('blueprint-note'), { target: { value: 'hello' } });
    expect(screen.getByTestId('blueprint-note-count').textContent).toBe('5 / 500');
  });

  it('mirrors selections in the stack bar and activates a stage from its group', () => {
    mountWith(<Harness initial={{ orchestrate: { options: ['langgraph'], note: '' } }} />);
    const bar = screen.getByTestId('stack-bar');
    expect(within(bar).getByText('LangGraph')).toBeTruthy();
    expect(within(bar).getAllByText('None chosen')).toHaveLength(4);
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(bar.getAttribute('aria-atomic')).toBe('false');
    fireEvent.click(screen.getByTestId('blueprint-option-crewai'));
    expect(within(bar).getByText('CrewAI')).toBeTruthy();
    fireEvent.click(screen.getByTestId('stack-group-operate'));
    expect(screen.getByTestId('blueprint-stage-operate').getAttribute('aria-selected')).toBe('true');
  });

  it('sends a Docs link through openExternal, and has none for Custom', () => {
    const openExternal = vi.fn();
    mountWith(<Harness />, { openExternal });
    fireEvent.click(screen.getByRole('button', { name: 'Docs for CrewAI' }));
    expect(openExternal).toHaveBeenCalledWith('https://www.crewai.com');
    expect(screen.queryByRole('button', { name: /Docs for Custom/ })).toBeNull();
  });

  it('shows the pipeline compactly with the full label kept in each badge aria-label', () => {
    mountWith(<Harness compact />);
    expect(screen.getByTestId('blueprint-badge-orchestrate').getAttribute('aria-label')).toBe('1. Understand & Orchestrate');
    expect(screen.getByTestId('blueprint-badge-operate').getAttribute('aria-label')).toBe('5. Secure, Deploy & Operate');
    expect(screen.getByTestId('blueprint-stage-operate').textContent).toContain('Secure');
    expect(screen.getByTestId('blueprint-stage-operate').textContent).not.toContain('Production');
  });

  it('puts the option and stage tips below', () => {
    mountWith(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'About LangGraph' }));
    expect(screen.getByRole('tooltip').className).toContain('top-full');
  });
});
