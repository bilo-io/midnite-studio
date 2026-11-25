// vitest/jsdom: form behaviour, roles and the mocked bridge. Real layout (sticky, columns) is judged on screen.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentBuilder } from './agent-builder';
import type { AgentProfilesHost } from './host';
import { mockBridge, mountWith, rosterWithout } from './test-harness';
import { profileFixture } from './testing';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

const noop = (): void => undefined;
const props = (overrides: Partial<Parameters<typeof AgentBuilder>[0]> = {}) => ({
  profile: profileFixture({ id: 'profile-a', name: 'Alpha', updatedAt: 5 }),
  isNew: false,
  onDirtyChange: noop,
  onSaved: noop,
  onDone: noop,
  ...overrides,
});
const name = (): HTMLInputElement => screen.getByTestId('builder-name') as HTMLInputElement;
const type = (el: HTMLElement, value: string): void => void fireEvent.change(el, { target: { value } });
const saveButton = (): HTMLButtonElement => screen.getByTestId('builder-save') as HTMLButtonElement;

const hostWith = (over: Partial<AgentProfilesHost> = {}): Partial<AgentProfilesHost> => ({
  useMcpTools: () => [
    { id: 'game_list', title: 'List repos', description: 'Lists repos.' },
    { id: 'game_create', title: 'Open repo', description: 'Opens a repo.' },
  ],
  ...over,
});

describe('AgentBuilder', () => {
  it('focuses the name and starts clean, with Save disabled', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    expect(name().value).toBe('Alpha');
    expect(document.activeElement).toBe(name());
    expect(saveButton().disabled).toBe(true);
  });

  it('saves the draft with expectedUpdatedAt set to the stored updatedAt', async () => {
    const bridge = mockBridge([]);
    const onSaved = vi.fn();
    mountWith(<AgentBuilder {...props({ onSaved })} />, hostWith());
    type(name(), 'Beta');
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(bridge.save).toHaveBeenCalled());
    expect(bridge.save.mock.calls[0]![0]).toMatchObject({ profile: { id: 'profile-a', name: 'Beta' }, expectedUpdatedAt: 5 });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await screen.findByText('Saved');
  });

  it('sends expectedUpdatedAt null for a new agent, which Save accepts untouched', async () => {
    const bridge = mockBridge([]);
    mountWith(<AgentBuilder {...props({ isNew: true })} />, hostWith());
    expect(screen.getByText('This agent is not saved yet.')).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => expect(bridge.save).toHaveBeenCalled());
    expect(bridge.save.mock.calls[0]![0]).toMatchObject({ expectedUpdatedAt: null });
  });

  it('blocks Save on an empty name and shows the message under it', () => {
    const bridge = mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    type(name(), '   ');
    fireEvent.click(saveButton());
    expect(bridge.save).not.toHaveBeenCalled();
    expect(screen.getByText('Give the agent a name.')).toBeTruthy();
    expect(name().getAttribute('aria-invalid')).toBe('true');
    expect(name().getAttribute('aria-describedby')).toBe('builder-name-error');
  });

  it('says "Pick a colour." for a bad hex and "Keep this under" for a long description', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    type(screen.getByLabelText('Colour', { selector: '#builder-accent' }), 'purple');
    type(screen.getByLabelText('Description'), 'x'.repeat(281));
    fireEvent.click(saveButton());
    expect(screen.getByText('Pick a colour.')).toBeTruthy();
    expect(screen.getByText('Keep this under 280 characters.')).toBeTruthy();
  });

  it('on conflict opens Reload / Overwrite; Reload replaces the draft with the current copy', async () => {
    const bridge = mockBridge([]);
    const current = profileFixture({ id: 'profile-a', name: 'Elsewhere', updatedAt: 9 });
    bridge.save.mockResolvedValueOnce({ ok: true, value: { status: 'conflict', current } } as never);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    type(name(), 'Mine');
    fireEvent.click(saveButton());
    await screen.findByText('This agent changed elsewhere.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.queryByText('This agent changed elsewhere.')).toBeNull());
    expect(name().value).toBe('Elsewhere');
    expect(saveButton().disabled).toBe(true);
  });

  it('Overwrite saves again against the current updatedAt', async () => {
    const bridge = mockBridge([]);
    const current = profileFixture({ id: 'profile-a', name: 'Elsewhere', updatedAt: 9 });
    bridge.save.mockResolvedValueOnce({ ok: true, value: { status: 'conflict', current } } as never);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    type(name(), 'Mine');
    fireEvent.click(saveButton());
    await screen.findByText('This agent changed elsewhere.');
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    await waitFor(() => expect(bridge.save).toHaveBeenCalledTimes(2));
    expect(bridge.save.mock.calls[1]![0]).toMatchObject({ profile: { name: 'Mine' }, expectedUpdatedAt: 9 });
  });

  it('resets the model to Default when the new base does not offer it, and announces it', () => {
    mockBridge([]);
    const useModelsFor: AgentProfilesHost['useModelsFor'] = (base) =>
      base === 'claude'
        ? [{ id: 'default', label: 'Default' }, { id: 'opus', label: 'Opus' }]
        : [{ id: 'default', label: 'Default' }];
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', model: 'opus' }) })} />, hostWith({ useModelsFor }));
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('opus');
    fireEvent.change(screen.getByLabelText('Base CLI'), { target: { value: 'codex' } });
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('default');
    expect(screen.getByTestId('model-note').textContent).toBe('Model reset to Default for Codex.');
    expect(screen.getByTestId('model-note').getAttribute('aria-live')).toBe('polite');
  });

  it('keeps a model the new base still offers', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', model: 'default' }) })} />, hostWith());
    fireEvent.change(screen.getByLabelText('Base CLI'), { target: { value: 'codex' } });
    expect(screen.getByTestId('model-note').textContent).toBe('');
  });

  it('lists installed bases first and disables uninstalled ones with their install hint', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, { ...hostWith(), ...rosterWithout(['claude', 'codex']) });
    const options = Array.from((screen.getByLabelText('Base CLI') as HTMLSelectElement).options);
    const firstMissing = options.findIndex((o) => o.textContent!.includes('not installed'));
    expect(firstMissing).toBeGreaterThan(0);
    expect(options.slice(firstMissing).every((o) => o.textContent!.includes('not installed'))).toBe(true);
    const codex = options.find((o) => o.value === 'codex')!;
    expect(codex.disabled).toBe(true);
    expect(codex.textContent).toMatch(/^Codex \(not installed: .+\)$/);
    // The saved base stays selectable even when its CLI has gone.
    expect(options.find((o) => o.value === 'claude')!.disabled).toBe(false);
  });

  it('maps the restrict switch to null, [] and a ticked list', async () => {
    const bridge = mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    const restrict = screen.getByRole('switch', { name: 'Restrict midnite tools' }) as HTMLInputElement;
    expect(restrict.checked).toBe(false);
    fireEvent.click(restrict);
    expect(screen.getByText("This agent can't use any midnite tools.")).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /List repos/ }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(bridge.save).toHaveBeenCalledTimes(1));
    expect(bridge.save.mock.calls[0]![0].profile.mcpTools).toEqual(['game_list']);
    fireEvent.click(restrict);
    fireEvent.click(saveButton());
    await waitFor(() => expect(bridge.save).toHaveBeenCalledTimes(2));
    expect(bridge.save.mock.calls[1]![0].profile.mcpTools).toBeNull();
  });

  it('saves [] when restricted with nothing ticked', async () => {
    const bridge = mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    fireEvent.click(screen.getByRole('switch', { name: 'Restrict midnite tools' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(bridge.save).toHaveBeenCalled());
    expect(bridge.save.mock.calls[0]![0].profile.mcpTools).toEqual([]);
  });

  it('filters the tools and selects the visible ones', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', mcpTools: [] }) })} />, hostWith());
    const tools = screen.getByRole('group', { name: 'Tools' });
    type(within(tools).getByPlaceholderText('Filter tools…'), 'open');
    expect(within(tools).queryByRole('checkbox', { name: /List repos/ })).toBeNull();
    fireEvent.click(within(tools).getByRole('button', { name: 'Select all' }));
    expect(within(tools).getByText('1 selected')).toBeTruthy();
    fireEvent.click(within(tools).getByRole('button', { name: 'Select none' }));
    expect(within(tools).getByText('0 selected')).toBeTruthy();
  });

  it.each([
    ['claude', 'Passed to Claude as a system prompt.'],
    ['codex', 'Sent to Codex as the first message of each new session.'],
    ['aider', "Aider can't take a prompt from Midnite; this text is saved but not sent."],
  ])('states how %s receives the prompt', (base, line) => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', baseAgentId: base }) })} />, hostWith());
    expect(screen.getByTestId('delivery-line').textContent).toBe(line);
    expect((screen.getByTestId('builder-prompt') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('warns that aider cannot be restricted, and notes strict mode for claude', () => {
    mockBridge([]);
    const view = mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', baseAgentId: 'aider', mcpTools: [] }) })} />, hostWith());
    expect(screen.getByText("Aider can't be restricted to these tools yet; the list is saved for when it can.")).toBeTruthy();
    expect(screen.getByText('Not enforced for Aider')).toBeTruthy();
    view.unmount();
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', baseAgentId: 'claude', mcpTools: [] }) })} />, hostWith());
    expect(screen.getByText(/see only these midnite tools, and no other MCP servers/)).toBeTruthy();
    expect(screen.queryByText('Not enforced for Claude')).toBeNull();
  });

  it('counts the prompt and turns the counter destructive past 95%', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    expect(screen.getByTestId('prompt-counter').textContent).toBe('0 / 20,000');
    expect(screen.getByTestId('prompt-counter').className).not.toContain('text-destructive');
    type(screen.getByTestId('builder-prompt'), 'x'.repeat(19_001));
    expect(screen.getByTestId('prompt-counter').textContent).toBe('19,001 / 20,000');
    expect(screen.getByTestId('prompt-counter').className).toContain('text-destructive');
  });

  it('lists skills with scope badges, keeps a vanished one ticked as "not found", and states loading and errors', () => {
    mockBridge([]);
    const useSkills = (): ReturnType<AgentProfilesHost['useSkills']> => ({
      skills: [{ name: 'review', description: 'Reviews a diff', scope: 'user' }],
      loading: false,
      error: null,
    });
    const view = mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', skills: ['review', 'gone'] }) })} />, hostWith({ useSkills }));
    const skills = screen.getByRole('group', { name: 'Skills' });
    expect(within(skills).getByText('user')).toBeTruthy();
    expect(within(skills).getByText('not found')).toBeTruthy();
    expect((within(skills).getByRole('checkbox', { name: /gone/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Skills are suggested in the prompt, not enforced.')).toBeTruthy();
    view.unmount();
    mountWith(<AgentBuilder {...props()} />, hostWith({ useSkills: () => ({ skills: [], loading: true, error: null }) }));
    expect(screen.getByText('Loading skills…')).toBeTruthy();
    cleanup();
    mountWith(<AgentBuilder {...props()} />, hostWith({ useSkills: () => ({ skills: [], loading: false, error: 'boom' }) }));
    expect(screen.getByText("Couldn't list skills: boom")).toBeTruthy();
    cleanup();
    mountWith(<AgentBuilder {...props()} />, hostWith());
    expect(screen.getByText('No skills found for Claude.')).toBeTruthy();
  });

  it('edits limits: empty is unset, No cap is null', async () => {
    const bridge = mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    const tool = screen.getByLabelText('Tool calls per minute') as HTMLInputElement;
    expect(tool.placeholder).toBe('120');
    type(tool, '7');
    fireEvent.click(screen.getByRole('checkbox', { name: 'No cap' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(bridge.save).toHaveBeenCalled());
    expect(bridge.save.mock.calls[0]![0].profile.limits).toEqual({ toolCallsPerMinute: 7, spendTokensPerSession: null });
  });

  it('rejects a limit below 1', () => {
    const bridge = mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    type(screen.getByLabelText('Tool calls per minute'), '0');
    fireEvent.click(saveButton());
    expect(bridge.save).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a whole number of 1 or more.')).toBeTruthy();
  });

  it('reports the draft as unsaved by name and clears it on Discard', () => {
    mockBridge([]);
    const onDirtyChange = vi.fn();
    mountWith(<AgentBuilder {...props({ onDirtyChange })} />, hostWith());
    expect(onDirtyChange).toHaveBeenLastCalledWith(null);
    type(name(), 'Beta');
    expect(onDirtyChange).toHaveBeenLastCalledWith('Beta');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(name().value).toBe('Alpha');
    expect(onDirtyChange).toHaveBeenLastCalledWith(null);
  });

  it('treats a cleared icon as unchanged', () => {
    mockBridge([]);
    const onDirtyChange = vi.fn();
    mountWith(<AgentBuilder {...props({ onDirtyChange })} />, hostWith());
    const icon = screen.getByLabelText('Icon') as HTMLSelectElement;
    fireEvent.change(icon, { target: { value: 'claude' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith('Alpha');
    fireEvent.change(icon, { target: { value: '' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(null);
  });

  it('Discard on an unsaved new agent returns to the list', () => {
    mockBridge([]);
    const onDone = vi.fn();
    mountWith(<AgentBuilder {...props({ isNew: true, onDone })} />, hostWith());
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('shows "Saving…" while the save is pending, then "Saved"', async () => {
    const bridge = mockBridge([]);
    let release!: () => void;
    bridge.save.mockImplementationOnce(
      ({ profile }: { profile: ReturnType<typeof profileFixture> }) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, value: { status: 'saved', profile } } as never);
        }),
    );
    mountWith(<AgentBuilder {...props()} />, hostWith());
    type(name(), 'Beta');
    fireEvent.click(saveButton());
    await screen.findByText('Saving…');
    expect(saveButton().disabled).toBe(true);
    await act(async () => release());
    await screen.findByText('Saved');
  });

  it('after a save with live sessions, notes that they keep their old settings', async () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith({ useLiveSessionCount: () => 2 }));
    type(name(), 'Beta');
    fireEvent.click(saveButton());
    await screen.findByText(/Running sessions keep their model, prompt and tools until relaunched/);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Running sessions keep/)).toBeNull();
  });

  it('shows no live-session notice when none run', async () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props()} />, hostWith({ useLiveSessionCount: () => 0 }));
    type(name(), 'Beta');
    fireEvent.click(saveButton());
    await screen.findByText('Saved');
    expect(screen.queryByText(/Running sessions keep/)).toBeNull();
  });

  it('gives every field an info popover', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', mcpTools: [] }) })} />, hostWith());
    const labels = Array.from(document.querySelectorAll('label[for]')).filter((l) => l.parentElement?.className.includes('items-center gap-1'));
    expect(labels.length).toBeGreaterThanOrEqual(15);
    for (const label of labels) {
      const text = label.textContent!;
      expect(within(label.parentElement as HTMLElement).getByRole('button', { name: `About ${text}` }), text).toBeTruthy();
    }
  });

  it('puts the section index in tab order before the form, with counts', () => {
    mockBridge([]);
    mountWith(<AgentBuilder {...props({ profile: profileFixture({ id: 'profile-a', skills: ['a', 'b'] }) })} />, hostWith());
    const nav = screen.getByRole('navigation', { name: 'Builder sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Identity', 'Base', 'Prompt', 'Tools', 'Skills2', 'Limits', 'Blueprint']);
    expect(screen.getByTestId('builder-index-identity').getAttribute('aria-current')).toBe('true');
  });

  describe('section index', () => {
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    it('clicking an entry scrolls to the section and focuses its heading', () => {
      mockBridge([]);
      mountWith(<AgentBuilder {...props()} />, hostWith());
      fireEvent.click(screen.getByTestId('builder-index-limits'));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Limits' }));
      expect(screen.getByTestId('builder-index-limits').getAttribute('aria-current')).toBe('true');
    });

    it('uses instant scrolling under prefers-reduced-motion', () => {
      mockBridge([]);
      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
      mountWith(<AgentBuilder {...props()} />, hostWith());
      fireEvent.click(screen.getByTestId('builder-index-base'));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    });

    it('marks the section an IntersectionObserver reports as current', () => {
      mockBridge([]);
      let callback!: IntersectionObserverCallback;
      class FakeObserver {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
      vi.stubGlobal('IntersectionObserver', FakeObserver);
      mountWith(<AgentBuilder {...props()} />, hostWith());
      act(() => callback([{ target: screen.getByRole('heading', { name: 'Skills' }), isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(screen.getByTestId('builder-index-skills').getAttribute('aria-current')).toBe('true');
      expect(screen.getByTestId('builder-index-identity').getAttribute('aria-current')).toBeNull();
      vi.unstubAllGlobals();
    });
  });

  it('sets --builder-footer-h from the measured footer height', () => {
    mockBridge([]);
    let callback!: ResizeObserverCallback;
    class FakeResize {
      constructor(cb: ResizeObserverCallback) {
        callback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeResize);
    mountWith(<AgentBuilder {...props()} />, hostWith());
    act(() => callback([{ contentRect: { height: 61 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByTestId('agents-builder').style.getPropertyValue('--builder-footer-h')).toBe('61px');
    vi.unstubAllGlobals();
  });
});
