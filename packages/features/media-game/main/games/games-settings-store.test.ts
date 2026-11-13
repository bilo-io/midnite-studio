// vitest (node): the stored Games settings read tolerantly — a file written before a field existed gets its default.
import { describe, expect, it } from 'vitest';

import { parseStoredGamesSettings } from './games-settings-store';

describe('parseStoredGamesSettings', () => {
  it('reads pauseWhenEditing as true from a file written before it existed', () => {
    const settings = parseStoredGamesSettings({
      version: 1,
      gamesRoot: '/Games',
      defaultEngine: 'three',
      defaultNetwork: 'on',
      squashRunCommits: true,
    });
    expect(settings.pauseWhenEditing).toBe(true);
    expect(settings.gamesRoot).toBe('/Games');
    expect(settings.defaultEngine).toBe('three');
  });

  it('keeps a stored false', () => {
    expect(
      parseStoredGamesSettings({
        version: 1,
        gamesRoot: null,
        defaultEngine: 'phaser',
        defaultNetwork: 'off',
        squashRunCommits: false,
        pauseWhenEditing: false,
      }).pauseWhenEditing,
    ).toBe(false);
  });
});
