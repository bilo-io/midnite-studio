import { describe, expect, it } from 'vitest';

import { PLACEMENT_APP_IDS } from './domain/placement';
import { SETTINGS_PAGE_IDS, VIEW_IDS } from './domain/view';
import { MEDIA_TABS } from './media';
import { MIDNITE_APP_IDS, midniteOpenLink, parseMidniteLink } from './midnite-link';

const vocab = { views: VIEW_IDS, tabs: MEDIA_TABS, pages: SETTINGS_PAGE_IDS };

describe('midnite:// links', () => {
  it('names exactly the placement apps plus studio', () => {
    expect([...MIDNITE_APP_IDS].sort()).toEqual([...PLACEMENT_APP_IDS, 'studio'].sort());
  });

  it('builds links', () => {
    expect(midniteOpenLink({ app: 'coder' })).toBe('midnite://open?app=coder');
    expect(midniteOpenLink({ app: 'gamer', view: 'media', tab: 'game' })).toBe(
      'midnite://open?app=gamer&view=media&tab=game',
    );
    expect(midniteOpenLink({ app: 'vault', page: 'accounts' })).toBe('midnite://open?app=vault&page=accounts');
    // tab only rides along with the media view
    expect(midniteOpenLink({ app: 'coder', view: 'graph', tab: 'doc' })).toBe('midnite://open?app=coder&view=graph');
  });

  it('round-trips every app, and a view/tab/page target', () => {
    for (const app of MIDNITE_APP_IDS) expect(parseMidniteLink(midniteOpenLink({ app }), vocab)).toEqual({ app });
    expect(parseMidniteLink(midniteOpenLink({ app: 'gamer', view: 'media', tab: 'game' }), vocab)).toEqual({
      app: 'gamer',
      view: 'media',
      tab: 'game',
    });
    expect(parseMidniteLink(midniteOpenLink({ app: 'vault', page: 'accounts' }), vocab)).toEqual({
      app: 'vault',
      page: 'accounts',
    });
    expect(parseMidniteLink(midniteOpenLink({ app: 'monitor', view: 'sessions' }), vocab)).toEqual({
      app: 'monitor',
      view: 'sessions',
    });
  });

  it('returns null for unknown apps, other schemes and other actions', () => {
    expect(parseMidniteLink('midnite://open?app=nope')).toBeNull();
    expect(parseMidniteLink('midnite://open')).toBeNull();
    expect(parseMidniteLink('midnite://reveal?app=coder')).toBeNull();
    expect(parseMidniteLink('midnite-studio://open?app=coder')).toBeNull();
    expect(parseMidniteLink('https://open?app=coder')).toBeNull();
    expect(parseMidniteLink('not a url')).toBeNull();
    expect(parseMidniteLink('')).toBeNull();
    expect(parseMidniteLink(42)).toBeNull();
  });

  it('drops a bad view, tab or page instead of failing the link', () => {
    expect(parseMidniteLink('midnite://open?app=coder&view=bogus', vocab)).toEqual({ app: 'coder' });
    expect(parseMidniteLink('midnite://open?app=gamer&view=media&tab=bogus', vocab)).toEqual({
      app: 'gamer',
      view: 'media',
    });
    expect(parseMidniteLink('midnite://open?app=vault&page=bogus', vocab)).toEqual({ app: 'vault' });
    expect(parseMidniteLink('midnite://open?app=coder&view=../etc&tab=a%00b', vocab)).toEqual({ app: 'coder' });
    // a tab without the media view, and a page beside a non-settings view, mean nothing
    expect(parseMidniteLink('midnite://open?app=coder&view=graph&tab=doc', vocab)).toEqual({
      app: 'coder',
      view: 'graph',
    });
    expect(parseMidniteLink('midnite://open?app=coder&view=graph&page=accounts', vocab)).toEqual({
      app: 'coder',
      view: 'graph',
    });
  });

  it('without a vocabulary only checks that a value is a short slug', () => {
    expect(parseMidniteLink('midnite://open?app=coder&view=anything')).toEqual({ app: 'coder', view: 'anything' });
    expect(parseMidniteLink('midnite://open?app=coder&view=a%20b')).toEqual({ app: 'coder' });
  });
  describe('module param (Phase 124 Theme E)', () => {
    it('round-trips a module the app hosts, ahead of view', () => {
      const link = midniteOpenLink({ app: 'vanguard', module: 'vault', view: 'vault' });
      expect(link).toBe('midnite://open?app=vanguard&module=vault&view=vault');
      expect(parseMidniteLink(link)).toEqual({ app: 'vanguard', module: 'vault', view: 'vault' });
    });

    it('parses a module-only link and stays optional for every older link', () => {
      expect(parseMidniteLink('midnite://open?app=agents&module=creator')).toEqual({ app: 'agents', module: 'creator' });
      expect(parseMidniteLink('midnite://open?app=agents&view=chats')).toEqual({ app: 'agents', view: 'chats' });
    });

    it('drops a module the app does not carry, or an unknown one, and still opens the app', () => {
      expect(parseMidniteLink('midnite://open?app=media&module=vault')).toEqual({ app: 'media' });
      expect(parseMidniteLink('midnite://open?app=agents&module=nope')).toEqual({ app: 'agents' });
      expect(parseMidniteLink('midnite://open?app=coder&module=coder')).toEqual({ app: 'coder' });
    });

    it('lets Studio address any module', () => {
      expect(parseMidniteLink('midnite://open?app=studio&module=capture')).toEqual({ app: 'studio', module: 'capture' });
    });
  });
});
