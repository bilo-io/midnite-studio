import { describe, expect, it } from 'vitest';

import { ownerRepoFromGithubUrl, resolveGithubImageSrc } from './github-image-src';

describe('ownerRepoFromGithubUrl', () => {
  it('reads owner/repo out of a PR URL', () => {
    expect(ownerRepoFromGithubUrl('https://github.com/bilo-io/midnite-studio/pull/466')).toBe(
      'bilo-io/midnite-studio',
    );
  });

  it('reads owner/repo out of an issue URL', () => {
    expect(ownerRepoFromGithubUrl('https://github.com/acme/widgets/issues/7')).toBe('acme/widgets');
  });

  it('returns null for a non-GitHub host', () => {
    expect(ownerRepoFromGithubUrl('https://gitlab.com/acme/widgets/-/merge_requests/7')).toBeNull();
  });

  it('returns null for a URL with no repo segment', () => {
    expect(ownerRepoFromGithubUrl('https://github.com/acme')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(ownerRepoFromGithubUrl('not a url')).toBeNull();
  });
});

describe('resolveGithubImageSrc', () => {
  const context = { ownerRepo: 'bilo-io/midnite-studio', ref: 'a'.repeat(40) };

  it('rewrites a bare repo-relative path to a raw.githubusercontent.com URL pinned to the ref', () => {
    expect(resolveGithubImageSrc('docs/screenshots/agent-icon-fit/before.png', context)).toBe(
      `https://raw.githubusercontent.com/bilo-io/midnite-studio/${'a'.repeat(40)}/docs/screenshots/agent-icon-fit/before.png`,
    );
  });

  it('strips a leading slash before joining onto the raw-content path', () => {
    expect(resolveGithubImageSrc('/docs/x.png', context)).toBe(
      `https://raw.githubusercontent.com/bilo-io/midnite-studio/${'a'.repeat(40)}/docs/x.png`,
    );
  });

  it('strips a leading ./ before joining onto the raw-content path', () => {
    expect(resolveGithubImageSrc('./docs/x.png', context)).toBe(
      `https://raw.githubusercontent.com/bilo-io/midnite-studio/${'a'.repeat(40)}/docs/x.png`,
    );
  });

  it('leaves an absolute https URL unchanged', () => {
    const src = 'https://user-images.githubusercontent.com/1/abc.png';
    expect(resolveGithubImageSrc(src, context)).toBe(src);
  });

  it('leaves a protocol-relative URL unchanged', () => {
    const src = '//user-images.githubusercontent.com/1/abc.png';
    expect(resolveGithubImageSrc(src, context)).toBe(src);
  });

  it('leaves a data: URI unchanged', () => {
    const src = 'data:image/png;base64,AAAA';
    expect(resolveGithubImageSrc(src, context)).toBe(src);
  });

  it('returns the src unchanged when there is no context', () => {
    expect(resolveGithubImageSrc('docs/x.png', null)).toBe('docs/x.png');
  });

  it('passes undefined through unchanged', () => {
    expect(resolveGithubImageSrc(undefined, context)).toBeUndefined();
  });
});
