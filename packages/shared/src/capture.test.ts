import { describe, expect, it } from 'vitest';

import {
  CaptureChangedSchema,
  CaptureOverlayConfirmRequestSchema,
  CaptureOverlayTokenSchema,
  capturePrCommentUrl,
  CaptureRegionStartResultSchema,
} from './capture';
import { DeepLinkSchema } from './ipc/schemas';

describe('capturePrCommentUrl', () => {
  it("scrolls a GitHub pull request to its conversation's comment box", () => {
    expect(capturePrCommentUrl('https://github.com/bilo-io/midnite-studio/pull/907')).toBe(
      'https://github.com/bilo-io/midnite-studio/pull/907#new_comment_field',
    );
    // An anchor already there is replaced, not stacked.
    expect(capturePrCommentUrl('https://github.example.com/a/b/pull/3#discussion_r1')).toBe(
      'https://github.example.com/a/b/pull/3#new_comment_field',
    );
  });

  it("opens any other forge's PR page as it is", () => {
    for (const url of [
      'https://gitlab.com/a/b/-/merge_requests/12',
      'https://bitbucket.org/a/b/pull-requests/4',
      'https://dev.azure.com/o/p/_git/r/pullrequest/9',
    ])
      expect(capturePrCommentUrl(url)).toBe(url);
  });

  it('opens nothing that is not an https page', () => {
    for (const url of [
      'not a url',
      'http://github.com/a/b/pull/1',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ])
      expect(capturePrCommentUrl(url)).toBeNull();
  });
});

describe('capture slice-2 contract', () => {
  it('a region start is the overlay, or the frozen frame for the in-view picker', () => {
    expect(CaptureRegionStartResultSchema.parse({ surface: 'overlay' })).toEqual({
      surface: 'overlay',
    });
    expect(CaptureRegionStartResultSchema.safeParse({ surface: 'in-view' }).success).toBe(false);
  });

  it('overlay calls carry a well-formed token and an in-frame rectangle', () => {
    const token = 'ovl-0123456789abcdef0123';
    expect(CaptureOverlayTokenSchema.safeParse(token).success).toBe(true);
    expect(CaptureOverlayTokenSchema.safeParse('ovl-xyz').success).toBe(false);
    expect(
      CaptureOverlayConfirmRequestSchema.safeParse({
        token,
        rect: { x: 0.5, y: 0.5, width: 0.6, height: 0.1 },
      }).success,
    ).toBe(false);
  });

  it('the changed event can say how an overlay ended', () => {
    expect(
      CaptureChangedSchema.parse({ reason: 'overlay', overlay: { outcome: 'cancelled' } }).overlay,
    ).toEqual({ outcome: 'cancelled' });
  });

  it('a capture deep link carries a capture id or null, never a path', () => {
    expect(DeepLinkSchema.safeParse({ kind: 'capture', id: null }).success).toBe(true);
    expect(
      DeepLinkSchema.safeParse({ kind: 'capture', id: 'cap-20261018-093000-abcdef12' }).success,
    ).toBe(true);
    expect(DeepLinkSchema.safeParse({ kind: 'capture', id: '../../etc/passwd' }).success).toBe(
      false,
    );
  });
});
