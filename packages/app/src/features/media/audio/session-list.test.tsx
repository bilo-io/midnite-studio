// vitest/jsdom: details disclosure + waveform progress split are DOM text/attrs, no real layout needed.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlayer } from './player-store';
import { SessionList } from './session-list';
import type { AudioSessionView, AudioVariant } from './use-audio';

vi.mock('./use-audio', async (orig) => ({
  ...(await orig<typeof import('./use-audio')>()),
  useWaveform: () => ({ peaks: [0.5, 0.5, 0.5, 0.5], durationS: 10 }),
}));

const variant = (key: string): AudioVariant => ({
  key,
  project: 'p',
  path: `${key}.mp3`,
  url: `file://${key}.mp3`,
  sidecar: null,
});

const sessions = [
  {
    id: 's1',
    kind: 'create',
    session: {
      createdAt: '2026-01-02T03:04:05.000Z',
      prompt: { title: 'Session', style: ['lofi', 'calm'], lyrics: '', instrumental: true, durationS: 10, count: 2 },
    },
    variants: [variant('a'), variant('b')],
  },
] as unknown as AudioSessionView[];

const renderList = () =>
  render(<SessionList repoId="r" sessions={sessions} loading={false} selectedKey={null} onSelect={() => {}} />);

describe('SessionList', () => {
  beforeEach(() => usePlayer.setState({ queue: [], order: [], pos: -1, playing: false, currentTime: 0, duration: 0 }));

  it('hides song details until the chevron expands the row', () => {
    renderList();
    expect(screen.queryByText('lofi · calm')).toBeNull();
    const toggle = screen.getAllByRole('button', { name: /Show details for/ })[0]!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('lofi · calm')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText('lofi · calm')).toBeNull();
  });

  it('fills bars before the playhead for the playing track only', () => {
    const queue = sessions[0]!.variants.map((v) => ({ key: v.key, title: v.key, url: v.url, project: 'p', path: v.path }));
    usePlayer.setState({ queue, order: [0, 1], pos: 0, currentTime: 5, duration: 10 });
    renderList();
    const [first, second] = screen.getAllByTestId('waveform');
    expect(first!.querySelectorAll('[data-played="true"]')).toHaveLength(2);
    expect(second!.querySelectorAll('[data-played="true"]')).toHaveLength(0);
  });
});
