import { MEDIA_TABS } from '@midnite/studio-shared';
import { LuMapPin } from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

import { MEDIA_TAB_META } from './media-tabs';

describe('MEDIA_TAB_META', () => {
  it('labels follow the strip order', () => {
    expect(MEDIA_TABS.map((t) => MEDIA_TAB_META[t].label)).toEqual([
      'Docs', 'Images', 'Video', 'Audio', 'Maps', 'Terrain', 'Models', 'Sprites', 'Games',
    ]);
  });
  it('Maps uses the map-pin glyph', () => {
    expect(MEDIA_TAB_META.map.icon).toBe(LuMapPin);
  });
});
