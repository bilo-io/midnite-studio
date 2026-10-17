import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIBRARY_SETTINGS,
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
    const at = (positionS: number, finished = false) => ({ positionS, durationS: 6000, finished, updatedAt: 1 });
    expect(libraryResumeAt(null)).toBe(0);
    expect(libraryResumeAt(at(10))).toBe(0);
    expect(libraryResumeAt(at(1200))).toBe(1200);
    expect(libraryResumeAt(at(5900, true))).toBe(0);
    expect(libraryIsFinished(5600, 6000)).toBe(true);
    expect(libraryIsFinished(100, 6000)).toBe(false);
    expect(libraryIsFinished(1, 0, true)).toBe(true);
  });
});
