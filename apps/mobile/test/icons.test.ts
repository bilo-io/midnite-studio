// L2: every glyph the icon map names exists in Feather's own glyph map, mirroring desktop's icon-names.test.ts.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../src/ui/icons';

const require = createRequire(import.meta.url);

describe('ICONS', () => {
  const glyphs = JSON.parse(
    readFileSync(
      require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json'),
      'utf8',
    ),
  ) as Record<string, number>;

  it('maps only to glyphs Feather ships', () => {
    const missing = Object.entries(ICONS).filter(([, glyph]) => !(glyph in glyphs));
    expect(missing).toEqual([]);
  });

  it('holds the doc icon map', () => {
    expect(ICONS).toMatchObject({
      history: 'git-commit',
      tasks: 'trello',
      reviews: 'git-pull-request',
      agents: 'cpu',
      more: 'more-horizontal',
      panel: 'sidebar',
      plus: 'plus',
      openAgent: 'zap',
      board: 'columns',
      graph: 'share-2',
      offline: 'wifi-off',
      error: 'alert-triangle',
      checkPassed: 'check-circle',
      checkFailed: 'x-circle',
      checkPending: 'clock',
      reply: 'corner-down-right',
    });
  });
});
