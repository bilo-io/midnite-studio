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
