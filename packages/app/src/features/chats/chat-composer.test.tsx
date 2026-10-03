/**
 * Vitest/jsdom: the Chats composer — Stop/Send placement, the keyboard contract,
 * attachments, the engine/mode/repo option sheets and the companion switch. No
 * browser capability needed (the auto-grow height is a style write jsdom cannot
 * measure, so it is asserted only as "does not throw").
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatAttachment } from '@midnite/studio-shared';
import { LuBot } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';
import { ChatComposer, type ChatSettings } from './chat-composer';
import type { ChatEngine } from './use-chat-engines';

const engine = (id: string, over: Partial<ChatEngine> = {}): ChatEngine => ({
  id,
  label: id === 'claude' ? 'Claude Code' : id,
  kind: 'agent',
  icon: LuBot,
  available: true,
  models: id === 'claude' ? [{ id: 'default', label: 'Default', recommended: true }, { id: 'opus-5', label: 'Opus 5' }] : [],
  defaultModelId: 'default',
  ...over,
});

const ENGINES: ChatEngine[] = [engine('claude'), engine('codex'), engine('ollama', { kind: 'ollama', available: false, reason: 'Ollama is not running' })];

type Props = Partial<React.ComponentProps<typeof ChatComposer>>;

function Harness({ onSend = () => {}, onStop = () => {}, streaming = false, initial = '', settings, onSettingsChange = () => {}, attachments: seed = [], ...rest }: Props & { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([...seed]);
  const base: ChatSettings = { engine: 'claude', model: null, mode: 'edit', repoId: null };
  return (
    <ChatComposer
      value={value}
      onChange={setValue}
      onSend={onSend}
      onStop={onStop}
      streaming={streaming}
      engines={ENGINES}
      settings={settings ?? base}
      onSettingsChange={onSettingsChange}
      repos={[{ id: 'repo:/x/app', name: 'app' }]}
      attachments={attachments}
      onAttachmentsChange={setAttachments}
      focusToken={0}
      {...rest}
    />
  );
}

const input = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
const send = () => screen.getByTestId('chat-input-send');
const controls = () => screen.getByTestId('chat-input-controls');

beforeEach(() => useUiStore.setState({ companionEnabled: false, companionPanelOpen: false }));
afterEach(cleanup);

describe('Stop and Send', () => {
  it('shows no Stop button while idle', () => {
    render(<Harness initial="hi" />);
    expect(screen.queryByTestId('chat-input-stop')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('shows Stop immediately to the left of Send while streaming — adjacent, in the same group', () => {
    render(<Harness streaming initial="hi" />);
    const stop = screen.getByRole('button', { name: 'Stop' });
    const buttons = [...controls().querySelectorAll('button')];
    expect(buttons[buttons.indexOf(send() as HTMLButtonElement) - 1]).toBe(stop);
    expect(stop.nextElementSibling).toBe(send());
    expect(stop.parentElement).toBe(send().parentElement);
    // Send is still the last control on the right.
    expect(controls().lastElementChild).toBe(send());
  });

  it('Stop calls onStop, and Send does not fire while a reply streams', () => {
    const onStop = vi.fn();
    const onSend = vi.fn();
    render(<Harness streaming initial="queued text" onStop={onStop} onSend={onSend} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledTimes(1);
    fireEvent.click(send());
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().getAttribute('aria-disabled')).toBe('true');
  });

  it('freezes the engine, mode and repo pickers while streaming', () => {
    render(<Harness streaming initial="x" />);
    expect(screen.getByTestId('chat-mode-picker').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('chat-repo-picker').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('chat-engine-picker').parentElement!.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('keyboard', () => {
  it('Enter sends', () => {
    const onSend = vi.fn();
    render(<Harness initial="hello" onSend={onSend} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter is a newline, not a send', () => {
    const onSend = vi.fn();
    render(<Harness initial="hello" onSend={onSend} />);
    const notPrevented = fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    // The default action (inserting the newline) was left alone.
    expect(notPrevented).toBe(true);
  });

  it('Enter that commits an IME composition is not a send', () => {
    const onSend = vi.fn();
    render(<Harness initial="こんにちは" onSend={onSend} />);
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Enter with nothing typed does not send', () => {
    const onSend = vi.fn();
    render(<Harness initial="   " onSend={onSend} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().getAttribute('aria-disabled')).toBe('true');
  });

  it('the Send button sends too', () => {
    const onSend = vi.fn();
    render(<Harness initial="hello" onSend={onSend} />);
    fireEvent.click(send());
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('typing grows the field without throwing', () => {
    render(<Harness />);
    expect(() => fireEvent.change(input(), { target: { value: 'a\nb\nc\nd\ne' } })).not.toThrow();
    expect(input().value).toBe('a\nb\nc\nd\ne');
  });
});

describe('engine availability', () => {
  it('will not send on an engine that is unavailable, and says why', () => {
    const onSend = vi.fn();
    render(<Harness initial="hello" onSend={onSend} settings={{ engine: 'ollama', model: null, mode: 'ask', repoId: null }} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().getAttribute('aria-disabled')).toBe('true');
  });

  it('lists every engine in the provider picker, the unavailable one disabled with its reason', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Provider: Claude Code/ }));
    const list = await screen.findByRole('listbox', { name: 'Providers' });
    const ollama = within(list).getByRole('option', { name: /ollama/ }) as HTMLButtonElement;
    expect(ollama.disabled).toBe(true);
    expect(ollama.title).toBe('Ollama is not running');
    expect((within(list).getByRole('option', { name: /codex/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('picking an engine reports it with the model reset', async () => {
    const onSettingsChange = vi.fn();
    render(<Harness onSettingsChange={onSettingsChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Provider: Claude Code/ }));
    fireEvent.click(await screen.findByRole('option', { name: /codex/ }));
    expect(onSettingsChange).toHaveBeenCalledWith({ engine: 'codex', model: null });
  });

  it('picking a model reports it; the default row is null on the wire', async () => {
    const onSettingsChange = vi.fn();
    render(<Harness onSettingsChange={onSettingsChange} settings={{ engine: 'claude', model: 'opus-5', mode: 'edit', repoId: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /Model: Opus 5/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Default/ }));
    expect(onSettingsChange).toHaveBeenCalledWith({ model: null });
  });
});

describe('mode and repository sheets', () => {
  it('offers Ask and Edit with their descriptions and reports the choice', async () => {
    const onSettingsChange = vi.fn();
    render(<Harness onSettingsChange={onSettingsChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Mode: Edit/ }));
    const list = await screen.findByRole('listbox', { name: 'Mode' });
    expect(within(list).getByText(/Read-only/)).toBeTruthy();
    expect(within(list).getByText(/you review every change/)).toBeTruthy();
    fireEvent.click(within(list).getByRole('option', { name: /Ask/ }));
    expect(onSettingsChange).toHaveBeenCalledWith({ mode: 'ask' });
  });

  it('chooses a repository, or none', async () => {
    const onSettingsChange = vi.fn();
    render(<Harness onSettingsChange={onSettingsChange} settings={{ engine: 'claude', model: null, mode: 'edit', repoId: 'repo:/x/app' }} />);
    expect(screen.getByRole('button', { name: /Repository: app/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Repository: app/ }));
    fireEvent.click(await screen.findByRole('option', { name: /No repository/ }));
    expect(onSettingsChange).toHaveBeenCalledWith({ repoId: null });
  });
});

describe('attachments', () => {
  it('shows an attached text file as a chip, removable', async () => {
    render(<Harness attachments={[{ id: 'a1', name: 'notes.md', text: 'hello' }]} />);
    const chips = screen.getByRole('list', { name: 'Attached files' });
    expect(within(chips).getByText('notes.md')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.md' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Attached files' })).toBeNull());
  });

  it('an attachment alone is enough to send', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} attachments={[{ id: 'a1', name: 'a.txt', text: 'x' }]} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('reads a picked file into a chip, and refuses a binary one', async () => {
    render(<Harness />);
    const fileInput = screen.getByTestId('chat-file-input') as HTMLInputElement;
    const good = new File(['const x = 1;'], 'a.ts', { type: 'text/plain' });
    const bad = new File(['abc\0def'], 'b.bin');
    for (const f of [good, bad]) Object.defineProperty(f, 'text', { value: () => Promise.resolve(f === good ? 'const x = 1;' : 'abc\0def') });
    fireEvent.change(fileInput, { target: { files: [good, bad] } });
    await screen.findByText('a.ts');
    expect(screen.queryByText('b.bin')).toBeNull();
  });
});

describe('companion switch', () => {
  it('lives in the composer', () => {
    render(<Harness />);
    expect(within(screen.getByTestId('chat-input')).getByTestId('chat-companion-toggle')).toBeTruthy();
  });

  it('enables the companion and opens its panel when it is off', () => {
    render(<Harness />);
    const toggle = screen.getByTestId('chat-companion-toggle');
    expect(toggle.dataset['state']).toBe('off');
    fireEvent.click(toggle);
    expect(useUiStore.getState()).toMatchObject({ companionEnabled: true, companionPanelOpen: true });
  });

  it('shows and hides the panel of an enabled companion without disabling it', () => {
    useUiStore.setState({ companionEnabled: true, companionPanelOpen: false });
    render(<Harness />);
    const toggle = screen.getByTestId('chat-companion-toggle');
    expect(toggle.dataset['state']).toBe('hidden');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(useUiStore.getState().companionPanelOpen).toBe(true);
    expect(toggle.dataset['state']).toBe('shown');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(useUiStore.getState()).toMatchObject({ companionEnabled: true, companionPanelOpen: false });
  });

  it('is the same state Settings flips — no copy of its own', () => {
    render(<Harness />);
    expect(screen.getByTestId('chat-companion-toggle').dataset['state']).toBe('off');
    act(() => useUiStore.getState().setCompanionEnabled(true));
    expect(screen.getByTestId('chat-companion-toggle').dataset['state']).toBe('hidden');
  });
});

describe('/ skills and @ files pickers', () => {
  const SKILLS = [
    { name: 'code-review', description: 'Review the current diff for correctness bugs.', scope: 'user' as const },
    { name: 'midnite-sitrep', description: 'Post the standing sitrep table.', scope: 'project' as const },
    { name: 'sitrep', description: 'Short status.', scope: 'project' as const },
    ...Array.from({ length: 12 }, (_, i) => ({ name: `zz-extra-${i}`, description: `Extra ${i}`, scope: 'user' as const })),
  ];
  const FILES = ['README.md', 'src/app.tsx', 'src/features/chats/chat-composer.tsx', 'docs/chat.md'];

  const typeText = (text: string) => fireEvent.change(input(), { target: { value: text } });
  const picker = () => screen.queryByTestId('chat-picker');
  const options = () => screen.queryAllByRole('option');
  const key = (k: string, extra: Record<string, unknown> = {}) => fireEvent.keyDown(input(), { key: k, ...extra });
  const pills = () => screen.queryAllByTestId('chat-pill');

  it('"/" opens a picker of at most ten discovered skills, each with its description', () => {
    render(<Harness skills={SKILLS} files={FILES} />);
    typeText('/');
    expect(picker()?.dataset['kind']).toBe('skill');
    expect(options()).toHaveLength(10);
    expect(options()[0]!.textContent).toContain('/code-review');
    expect(options()[0]!.textContent).toContain('Review the current diff');
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('matches any substring and highlights it', () => {
    render(<Harness skills={SKILLS} files={FILES} />);
    typeText('/SITR');
    expect(options().map((o) => o.querySelector('.truncate')!.textContent)).toEqual(['/sitrep', '/midnite-sitrep']);
    expect(within(options()[1]!).getByTestId('chat-picker-match').textContent).toBe('sitr');
    typeText('/nothing-like-it');
    expect(options()).toHaveLength(0);
    expect(screen.getByTestId('chat-picker-empty').textContent).toContain('/nothing-like-it');
  });

  it('arrows move, Tab inserts the skill as a pill, and the picker closes', () => {
    render(<Harness skills={SKILLS} files={FILES} />);
    typeText('/sitr');
    key('ArrowDown');
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true');
    key('ArrowDown');
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true'); // wraps
    key('ArrowUp');
    key('Tab');
    expect(input().value).toBe('/midnite-sitrep ');
    expect(picker()).toBeNull();
    expect(pills()).toHaveLength(1);
    expect(pills()[0]!.textContent).toBe('/midnite-sitrep');
    expect(pills()[0]!.className).toContain('composer-pill');
  });

  it('Enter picks instead of sending while the picker is open; Esc closes it', () => {
    const onSend = vi.fn();
    render(<Harness skills={SKILLS} files={FILES} onSend={onSend} />);
    typeText('fix it /code');
    key('Enter');
    expect(onSend).not.toHaveBeenCalled();
    expect(input().value).toBe('fix it /code-review ');

    typeText('fix it /code-review /mid');
    expect(picker()).not.toBeNull();
    key('Escape');
    expect(picker()).toBeNull();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Backspace at a pill removes the whole token', () => {
    render(<Harness skills={SKILLS} files={FILES} initial="/sitrep" />);
    input().setSelectionRange(7, 7);
    expect(pills()).toHaveLength(1);
    key('Backspace');
    expect(input().value).toBe('');
    expect(pills()).toHaveLength(0);
  });

  it('a plain Backspace away from any pill is left to the textarea', () => {
    render(<Harness skills={SKILLS} files={FILES} initial="/sitrep hi" />);
    input().setSelectionRange(10, 10);
    const event = fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(event).toBe(true); // not default-prevented
    expect(input().value).toBe('/sitrep hi');
  });

  it('"@" offers files by substring with the directory as subtitle, and serialises to @path on send', () => {
    const onSend = vi.fn(() => sent.push(input().value));
    const sent: string[] = [];
    render(<Harness skills={SKILLS} files={FILES} onSend={onSend} />);
    typeText('look at @chat');
    expect(picker()?.dataset['kind']).toBe('file');
    const rows = options();
    expect(rows.map((o) => o.textContent)).toEqual(['chat.mddocs', 'chat-composer.tsxsrc/features/chats']);
    expect(within(rows[0]!).getAllByTestId('chat-picker-match').map((m) => m.textContent)).toEqual(['chat']);
    key('ArrowDown');
    key('Tab');
    expect(input().value).toBe('look at @src/features/chats/chat-composer.tsx ');
    expect(pills()[0]!.dataset['kind']).toBe('file');
    key('Enter');
    expect(sent).toEqual(['look at @src/features/chats/chat-composer.tsx ']);
  });

  it('clicking a row inserts it', () => {
    render(<Harness skills={SKILLS} files={FILES} />);
    typeText('@READ');
    fireEvent.click(options()[0]!);
    expect(input().value).toBe('@README.md ');
  });

  it('says so when the engine has no skills at all', () => {
    render(<Harness files={FILES} />);
    typeText('/');
    expect(screen.getByTestId('chat-picker-empty').textContent).toBe('No skills found for Claude Code');
  });

  it('stays closed for a slash inside a word or a path', () => {
    render(<Harness skills={SKILLS} files={FILES} />);
    typeText('and/or');
    expect(picker()).toBeNull();
    typeText('/usr/bin');
    expect(picker()).toBeNull();
  });
});
