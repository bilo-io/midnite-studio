import { cleanup, render, screen } from '@testing-library/react';
import { SiGithub } from 'react-icons/si';
import { afterEach, describe, expect, it } from 'vitest';

import type { ReachableRepo } from '@midnite/studio-shared';

import { languageColor, languageShares, ReachableRepoRow, relativeUpdated } from './reachable-repo-row';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const DAY = 86_400_000;

describe('relativeUpdated', () => {
  it.each([
    [NOW - 30_000, 'just now'],
    [NOW - 5 * 60_000, '5m ago'],
    [NOW - 3 * 3_600_000, '3h ago'],
    [NOW - 2 * DAY, '2d ago'],
    [NOW - 21 * DAY, '3w ago'],
    [NOW - 95 * DAY, '3mo ago'],
    [NOW - 800 * DAY, '2y ago'],
  ])('%s → %s', (then, label) => {
    expect(relativeUpdated(new Date(then).toISOString(), NOW)).toBe(label);
  });

  it('is null for an unparseable timestamp', () => {
    expect(relativeUpdated('not a date', NOW)).toBeNull();
  });
});

describe('languageShares', () => {
  it('is empty with no languages or zero bytes', () => {
    expect(languageShares(undefined)).toEqual([]);
    expect(languageShares([{ name: 'Go', size: 0 }])).toEqual([]);
  });

  it('sorts largest-first and folds the long tail into Other', () => {
    const shares = languageShares([
      { name: 'A', size: 1 },
      { name: 'TypeScript', size: 90 },
      { name: 'B', size: 1 },
      { name: 'C', size: 2 },
      { name: 'D', size: 2 },
      { name: 'E', size: 2 },
      { name: 'F', size: 2 },
    ]);
    expect(shares.map((s) => s.name)).toEqual(['TypeScript', 'C', 'D', 'E', 'F', 'Other']);
    expect(shares[0]?.percent).toBe(90);
    expect(shares[5]?.percent).toBe(2);
  });

  it('uses linguist colours for known languages and a stable hue otherwise', () => {
    expect(languageColor('TypeScript')).toBe('#3178c6');
    expect(languageColor('Brainfuck')).toBe(languageColor('Brainfuck'));
    expect(languageColor('Brainfuck')).toMatch(/^hsl\(/);
  });
});

describe('ReachableRepoRow', () => {
  afterEach(cleanup);
  const base: ReachableRepo = {
    owner: 'me',
    name: 'app',
    fullName: 'me/app',
    url: 'https://github.com/me/app',
    private: true,
  };

  it('shows the provider mark, name and the full metadata line', () => {
    render(
      <ReachableRepoRow
        repo={{
          ...base,
          updatedAt: new Date(NOW - 21 * DAY).toISOString(),
          stars: 7,
          defaultBranch: 'main',
          languages: [
            { name: 'TypeScript', size: 75 },
            { name: 'CSS', size: 25 },
          ],
        }}
        providerIcon={SiGithub}
        providerLabel="GitHub"
        now={NOW}
      >
        <button type="button">Clone…</button>
      </ReachableRepoRow>,
    );
    expect(screen.getByRole('img', { name: 'GitHub' })).toBeTruthy();
    expect(screen.getByText('me/app')).toBeTruthy();
    expect(screen.getByLabelText('Private')).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByLabelText('7 stars')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    expect(screen.getByText('updated 3w ago')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Languages: TypeScript 75%, CSS 25%' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clone…' })).toBeTruthy();
  });

  it('draws no metadata or bar when the provider supplied none', () => {
    render(<ReachableRepoRow repo={{ ...base, private: false }} providerIcon={SiGithub} providerLabel="GitHub" now={NOW} />);
    expect(screen.queryByLabelText('Private')).toBeNull();
    expect(screen.queryByText(/updated/)).toBeNull();
    expect(screen.queryByRole('img', { name: /^Languages/ })).toBeNull();
  });
});
