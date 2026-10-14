import { describe, expect, it } from 'vitest';

import { resourceRefLink } from './domain/resource-ref';
import { studioBrowserLink, studioViewLink } from './studio-link';

describe('studio-link', () => {
  it('builds a view link, keeping a tab only next to media', () => {
    expect(studioViewLink('sessions')).toBe('midnite-studio://view?id=sessions');
    expect(studioViewLink('media', 'game')).toBe('midnite-studio://view?id=media&tab=game');
    expect(studioViewLink('sessions', 'game')).toBe('midnite-studio://view?id=sessions');
  });

  it('builds the same browser-tab reveal link resourceRefLink does', () => {
    for (const url of ['https://github.com/bilo-io/midnite-apps', 'https://example.com/a?b=ü&c=1']) {
      expect(studioBrowserLink(url)).toBe(resourceRefLink({ kind: 'browserTab', url }));
    }
  });
});
