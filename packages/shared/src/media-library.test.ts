import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIBRARY_LAN_SETTINGS,
  DEFAULT_LIBRARY_SETTINGS,
  LibraryLanSettingsPatchSchema,
  LibraryLanSettingsSchema,
  LibraryPlaylistCreateRequestSchema,
  LibraryPlaylistIdSchema,
  LibraryFileRefSchema,
  LibraryRootIdSchema,
  libraryFileUrl,
  libraryIsFinished,
  libraryResumeAt,
} from './media-library';
import { MEDIA_TABS, REPO_SCOPED_MEDIA_TABS, MEDIA_TAB_EXPORT_FORMATS } from './media';
import { SECRET_KEYS } from './domain/secrets';

describe('media library contract (Phase 113 Theme R)', () => {
  it('is the last media tab, not repo-scoped, and exports nothing', () => {
    expect(MEDIA_TABS.at(-1)).toBe('library');
    expect(REPO_SCOPED_MEDIA_TABS).not.toContain('library');
    expect(MEDIA_TAB_EXPORT_FORMATS.library).toEqual([]);
  });

  it('keeps the online provider off by default', () => {
    expect(DEFAULT_LIBRARY_SETTINGS.onlineMetadata).toBe(false);
    expect(SECRET_KEYS).toContain('media.tmdbApiKey');
  });

  it('gives a real root an id that can never be the art cache', () => {
    expect(LibraryRootIdSchema.safeParse('r0123abcd').success).toBe(true);
    expect(LibraryRootIdSchema.safeParse('art').success).toBe(false);
    expect(LibraryRootIdSchema.safeParse('../x').success).toBe(false);
    expect(LibraryFileRefSchema.safeParse({ rootId: 'art', path: 'a.jpg' }).success).toBe(true);
  });

  it('encodes each path segment of a file URL on the library host', () => {
    expect(libraryFileUrl({ rootId: 'r0123abcd', path: 'Films/Up (2009)/Up #1?.mkv' })).toBe(
      'mstudio-file://library/r0123abcd/Films/Up%20(2009)/Up%20%231%3F.mkv',
    );
  });

  it('resumes only a play that is under way and not finished', () => {
    const at = (positionS: number, finished = false) => ({
      positionS,
      durationS: 6000,
      finished,
      updatedAt: 1,
    });
    expect(libraryResumeAt(null)).toBe(0);
    expect(libraryResumeAt(at(10))).toBe(0);
    expect(libraryResumeAt(at(1200))).toBe(1200);
    expect(libraryResumeAt(at(5900, true))).toBe(0);
    expect(libraryIsFinished(5600, 6000)).toBe(true);
    expect(libraryIsFinished(100, 6000)).toBe(false);
    expect(libraryIsFinished(1, 0, true)).toBe(true);
  });
});

describe('media library sharing and playlists contract (Phase 113 Theme R slice 2)', () => {
  it('keeps the LAN server off, unbound and not started with the app by default', () => {
    expect(DEFAULT_LIBRARY_LAN_SETTINGS).toMatchObject({
      address: null,
      startWithApp: false,
      wasOn: false,
      transcode: false,
      ffmpegPath: null,
    });
    expect(LibraryLanSettingsSchema.safeParse(DEFAULT_LIBRARY_LAN_SETTINGS).success).toBe(true);
  });

  it('never lets the renderer set wasOn, or a privileged port', () => {
    expect(LibraryLanSettingsPatchSchema.safeParse({ wasOn: true }).data).toEqual({});
    expect(LibraryLanSettingsPatchSchema.safeParse({ port: 80 }).success).toBe(false);
    // A path is never taken from the renderer; only clearing it is.
    expect(LibraryLanSettingsPatchSchema.safeParse({ ffmpegPath: '/x/ffmpeg' }).success).toBe(
      false,
    );
    expect(LibraryLanSettingsPatchSchema.safeParse({ ffmpegPath: null }).success).toBe(true);
    expect(
      LibraryLanSettingsSchema.safeParse({
        ...DEFAULT_LIBRARY_LAN_SETTINGS,
        ffmpegPath: '/x/ffmpeg',
      }).success,
    ).toBe(true);
    expect(LibraryLanSettingsPatchSchema.safeParse({ port: 47620 }).success).toBe(true);
  });

  it('mints playlist ids main-side and bounds names', () => {
    expect(LibraryPlaylistIdSchema.safeParse('p0123456789ab').success).toBe(true);
    expect(LibraryPlaylistIdSchema.safeParse('../p').success).toBe(false);
    expect(LibraryPlaylistCreateRequestSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(LibraryPlaylistCreateRequestSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(
      false,
    );
    expect(LibraryPlaylistCreateRequestSchema.parse({ name: ' Road trip ' }).name).toBe(
      'Road trip',
    );
  });
});
