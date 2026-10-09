import { describe, expect, it } from 'vitest';

import {
  FFMPEG_EXPORT_FORMATS,
  MEDIA_EXPORT_FORMAT_INFO,
  MEDIA_TAB_EXPORT_FORMATS,
  MEDIA_TABS,
} from './media';

describe('media contract', () => {
  it('declares a non-empty export menu for every tab', () => {
    for (const tab of MEDIA_TABS) expect(MEDIA_TAB_EXPORT_FORMATS[tab].length).toBeGreaterThan(0);
  });

  it('keeps the 3D exports on main\'s own writers, never ffmpeg', () => {
    expect(MEDIA_TAB_EXPORT_FORMATS.model).toEqual(['obj', 'fbx', 'glb', 'fbx-ascii']);
    expect(MEDIA_TAB_EXPORT_FORMATS.model.every((f) => !MEDIA_EXPORT_FORMAT_INFO[f].needsFfmpeg)).toBe(true);
  });

  it('keeps docs off ffmpeg and every other tab on it', () => {
    expect(MEDIA_TAB_EXPORT_FORMATS.doc.every((f) => !MEDIA_EXPORT_FORMAT_INFO[f].needsFfmpeg)).toBe(true);
    for (const tab of ['image', 'video', 'audio'] as const) {
      expect(MEDIA_TAB_EXPORT_FORMATS[tab].every((f) => FFMPEG_EXPORT_FORMATS.includes(f))).toBe(true);
    }
  });
});
