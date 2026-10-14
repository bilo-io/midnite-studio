import { describe, expect, it } from 'vitest';
import { resourceRefLink, studioSettingsLink, studioViewLink } from '@midnite/studio-shared';
import { parseDeepLink } from './protocol-parse';

describe('parseDeepLink', () => {
  it('parses valid open deep link', () => {
    expect(parseDeepLink('midnite-studio://open?repo=%2FUsers%2Ffoo%2Fbar')).toEqual({
      kind: 'open',
      repo: '/Users/foo/bar',
    });
  });

  it('parses valid clone deep link', () => {
    expect(parseDeepLink('midnite-studio://clone?url=https%3A%2F%2Fgithub.com%2Ffoo%2Fbar.git')).toEqual({
      kind: 'clone',
      url: 'https://github.com/foo/bar.git',
    });
  });

  it('rejects foreign schemes, relative paths, and NUL bytes', () => {
    expect(parseDeepLink('https://open?repo=/tmp')).toBeNull();
    expect(parseDeepLink('midnite-studio://open?repo=relative/path')).toBeNull();
    expect(parseDeepLink('midnite-studio://open?repo=/tmp%00foo')).toBeNull();
    expect(parseDeepLink('midnite-studio://clone?url=file%3A%2F%2Fetc%2Fpasswd')).toBeNull();
  });

  it('parses a reveal link carrying a ResourceRef', () => {
    const ref = { kind: 'pull', repoId: 'repo:/r', number: 812 } as const;
    expect(parseDeepLink(resourceRefLink(ref))).toEqual({ kind: 'reveal', ref });
  });

  it('answers a malformed or schema-failing reveal ref with ref: null, never a throw', () => {
    expect(parseDeepLink('midnite-studio://reveal?ref=***')).toEqual({ kind: 'reveal', ref: null });
    expect(parseDeepLink('midnite-studio://reveal')).toEqual({ kind: 'reveal', ref: null });
    const bad = btoa(JSON.stringify({ kind: 'pull', number: -1 })).replace(/=+$/, '');
    expect(parseDeepLink(`midnite-studio://reveal?ref=${bad}`)).toEqual({ kind: 'reveal', ref: null });
  });

  it('parses a view link built by studioViewLink, with a media tab', () => {
    expect(parseDeepLink(studioViewLink('sessions'))).toEqual({ kind: 'view', view: 'sessions' });
    expect(parseDeepLink(studioViewLink('media', 'game'))).toEqual({ kind: 'view', view: 'media', tab: 'game' });
  });

  it('parses a settings page, dropping an unknown page or one on another view', () => {
    expect(parseDeepLink(studioSettingsLink('mcp'))).toEqual({ kind: 'view', view: 'settings', page: 'mcp' });
    expect(parseDeepLink('midnite-studio://view?id=settings&page=nope')).toEqual({ kind: 'view', view: 'settings' });
    expect(parseDeepLink('midnite-studio://view?id=settings')).toEqual({ kind: 'view', view: 'settings' });
    expect(parseDeepLink('midnite-studio://view?id=sessions&page=mcp')).toEqual({ kind: 'view', view: 'sessions' });
    expect(parseDeepLink('midnite-studio://view?id=settings&tab=game&page=mcp')).toEqual({ kind: 'view', view: 'settings', page: 'mcp' });
  });

  it('rejects an unknown view and drops a tab that does not belong', () => {
    expect(parseDeepLink('midnite-studio://view?id=nowhere')).toBeNull();
    expect(parseDeepLink('midnite-studio://view')).toBeNull();
    expect(parseDeepLink('midnite-studio://view?id=media&tab=nope')).toEqual({ kind: 'view', view: 'media' });
    expect(parseDeepLink('midnite-studio://view?id=sessions&tab=game')).toEqual({ kind: 'view', view: 'sessions' });
  });
});
