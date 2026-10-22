import {
  BUILTIN_AGENTS,
  DEFAULT_LOOP_SCHEDULE,
  LOOP_SPECTRUM_HUES,
  type KnownSkill,
} from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { LoopComposer } from './loop-composer';
import { loopSpectrumProps, spectrumStops } from './loop-spectrum';

afterEach(cleanup);

/**
 * A composer fed by the store, the way `loop-tab.tsx` feeds it — so an edit
 * made in the editor comes back round as the loop the composer draws.
 */
function Harness({ onToggle = vi.fn() }: { onToggle?: (id: string, on: boolean) => void }) {
  const loop = useUiStore((s) => s.customLoops[0]);
  if (!loop) return null;
  return (
    <div data-testid="host" {...loopSpectrumProps(loop)}>
      <LoopComposer
        loop={loop}
        running={false}
        waiting={false}
        thinking={false}
        checked={{}}
        choiceIds={{}}
        agents={BUILTIN_AGENTS}
        agentId="claude"
        model="default"
        schedule={DEFAULT_LOOP_SCHEDULE}
        extras=""
        skills={{}}
        skillSuggestions={[] as readonly KnownSkill[]}
        reviewUsers={[]}
        contributorOptions={[]}
        autoRotatePercent={30}
        repeat
        disabled={false}
        disabledReason={undefined}
        onToggle={onToggle}
        onSkill={vi.fn()}
        onReviewUsers={vi.fn()}
        onAutoRotate={vi.fn()}
        onChoice={vi.fn()}
        onAgent={vi.fn()}
        onModel={vi.fn()}
        onSchedule={vi.fn()}
        onExtras={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />
    </div>
  );
}

const loop = () => useUiStore.getState().customLoops[0]!;
const ownOptions = () => loop().modifiers.filter((m) => m.section !== undefined);

beforeEach(() => {
  useUiStore.setState({ customLoops: [], customLoopEditing: null, customLoopFresh: null, activeFabTab: 'guard' });
});

describe('custom loop composer', () => {
  it('shows the Edit toggle on a custom loop and flips it to Done', () => {
    const id = useUiStore.getState().createCustomLoop();
    useUiStore.getState().setCustomLoopEditing(null);
    render(<Harness />);
    const toggle = screen.getByTestId('custom-loop-edit-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('No options yet — Edit to add some.')).toBeTruthy();
    fireEvent.click(toggle);
    expect(useUiStore.getState().customLoopEditing).toBe(id);
    expect(screen.getByTestId('custom-loop-edit-toggle').textContent).toContain('Done');
    expect(screen.getByTestId(`custom-loop-editor-${id}`)).toBeTruthy();
  });

  it('offers Start from while fresh, and duplicates a built-in from it', () => {
    useUiStore.getState().createCustomLoop();
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'guard' } });
    expect(loop().label).toBe('Guard copy');
    expect(loop().hue).toBe(LOOP_SPECTRUM_HUES['guard']);
    expect(ownOptions().map((m) => m.id)).toContain('secret-scan');
    // The first real edit retires the choice.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Night guard' } });
    expect(loop().label).toBe('Night guard');
    expect(screen.queryByLabelText('Start from')).toBeNull();
  });

  it('adds, renames, reorders and removes sections', () => {
    useUiStore.getState().createCustomLoop();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(loop().sections.map((s) => s.label)).toEqual(['Tasks', 'New section']);
    const names = screen.getAllByLabelText('Section name');
    fireEvent.change(names[1]!, { target: { value: 'Reviews' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Reviews up' }));
    expect(loop().sections.map((s) => s.label)).toEqual(['Reviews', 'Tasks']);
    expect(screen.getByRole('button', { name: 'Move Reviews up' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tasks' }));
    expect(loop().sections.map((s) => s.label)).toEqual(['Reviews']);
  });

  it('adds, edits and removes an option, which then runs as a switch', () => {
    useUiStore.getState().createCustomLoop();
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add option to Tasks' }));
    expect(ownOptions()).toHaveLength(1);
    const option = screen.getByTestId('custom-loop-sections').querySelector('[data-custom-option]') as HTMLElement;
    fireEvent.change(within(option).getByLabelText('Option label'), { target: { value: 'Review PRs' } });
    fireEvent.change(within(option).getByLabelText('Tooltip'), { target: { value: 'Reviews open PRs' } });
    fireEvent.change(within(option).getByLabelText('Prompt fragment'), { target: { value: 'Review open PRs.' } });
    fireEvent.change(within(option).getByLabelText('Default skill'), { target: { value: '/pr-review' } });
    fireEvent.click(within(option).getByRole('switch'));
    expect(ownOptions()[0]).toMatchObject({
      label: 'Review PRs',
      description: 'Reviews open PRs',
      promptFragment: 'Review open PRs.',
      defaultSkill: '/pr-review',
      defaultOn: true,
    });

    // Out of Edit mode the option is an ordinary switch row in its section.
    fireEvent.click(screen.getByTestId('custom-loop-edit-toggle'));
    fireEvent.click(screen.getByRole('switch', { name: /Review PRs/ }));
    expect(onToggle).toHaveBeenCalledWith(ownOptions()[0]!.id, expect.any(Boolean));

    fireEvent.click(screen.getByTestId('custom-loop-edit-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Review PRs' }));
    expect(ownOptions()).toHaveLength(0);
  });

  it('keeps the shared Run section outside the editor', () => {
    useUiStore.getState().createCustomLoop();
    const { container } = render(<Harness />);
    const run = container.querySelector('[data-loop-section="run"]') as HTMLElement;
    expect(run).toBeTruthy();
    expect(within(run).getAllByRole('switch').length).toBeGreaterThanOrEqual(2);
    expect(within(run).queryByLabelText('Section name')).toBeNull();
  });

  it('recolours the loop from a preset and from the custom hue', () => {
    useUiStore.getState().createCustomLoop();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Medic colour' }));
    expect(loop().hue).toBe(LOOP_SPECTRUM_HUES['medic']);
    expect(screen.getByRole('button', { name: 'Medic colour' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('Custom hue'), { target: { value: '200' } });
    expect(loop().hue).toBe(200);
    const host = screen.getByTestId('host');
    expect(host.getAttribute('data-fab-custom')).toBe('true');
    expect(host.style.getPropertyValue('--fab-spec-3')).toBe(spectrumStops(200)[2]);
    expect(host.style.getPropertyValue('--fab-custom-arc-from')).toBe('140deg');
  });

  it('picks an icon from the built-in set', () => {
    useUiStore.getState().createCustomLoop();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon medic' }));
    expect(loop().icon).toBe('medic');
  });

  it('deletes the loop behind a confirm', () => {
    useUiStore.getState().createCustomLoop();
    render(<Harness />);
    fireEvent.click(screen.getByTestId('custom-loop-delete'));
    expect(useUiStore.getState().customLoops).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete loop' }).at(-1)!);
    expect(useUiStore.getState().customLoops).toHaveLength(0);
  });
});
