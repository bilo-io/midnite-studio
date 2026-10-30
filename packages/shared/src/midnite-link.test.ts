import { describe, expect, it } from 'vitest';

import { SETTINGS_PAGE_IDS, VIEW_IDS } from './domain/view';
import { MEDIA_TABS } from './media';
import { MIDNITE_APP_IDS, midniteOpenLink, parseMidniteLink } from './midnite-link';
import { APP_MODULES, MODULE_HOST_IDS, RETIRED_APP_ALIASES, RETIRED_APP_IDS } from './modules';

const vocab = { views: VIEW_IDS, tabs: MEDIA_TABS, pages: SETTINGS_PAGE_IDS };

describe('midnite:// links', () => {
  it('names exactly the module hosts bar science, and no retired app', () => {
    expect([...MIDNITE_APP_IDS].sort()).toEqual(MODULE_HOST_IDS.filter((id) => id !== 'science').sort());
    for (const retired of RETIRED_APP_IDS) expect(MIDNITE_APP_IDS as readonly string[]).not.toContain(retired);
  });

  it('builds links', () => {
    expect(midniteOpenLink({ app: 'agents' })).toBe('midnite://open?app=agents');
    expect(midniteOpenLink({ app: 'gamer', view: 'media', tab: 'game' })).toBe(
      'midnite://open?app=gamer&view=media&tab=game',
    );
    expect(midniteOpenLink({ app: 'vanguard', page: 'accounts' })).toBe('midnite://open?app=vanguard&page=accounts');
    // tab only rides along with the media view
    expect(midniteOpenLink({ app: 'agents', view: 'graph', tab: 'doc' })).toBe('midnite://open?app=agents&view=graph');
  });

  it('round-trips every app, and a view/tab/page target', () => {
    for (const app of MIDNITE_APP_IDS) expect(parseMidniteLink(midniteOpenLink({ app }), vocab)).toEqual({ app });
    expect(parseMidniteLink(midniteOpenLink({ app: 'gamer', view: 'media', tab: 'game' }), vocab)).toEqual({
      app: 'gamer',
      view: 'media',
      tab: 'game',
    });
    expect(parseMidniteLink(midniteOpenLink({ app: 'vanguard', page: 'accounts' }), vocab)).toEqual({
      app: 'vanguard',
      page: 'accounts',
    });
    expect(parseMidniteLink(midniteOpenLink({ app: 'agents', view: 'sessions' }), vocab)).toEqual({
      app: 'agents',
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
    expect(parseMidniteLink('midnite://open?app=agents&view=bogus', vocab)).toEqual({ app: 'agents' });
    expect(parseMidniteLink('midnite://open?app=gamer&view=media&tab=bogus', vocab)).toEqual({
      app: 'gamer',
      view: 'media',
    });
    expect(parseMidniteLink('midnite://open?app=vanguard&page=bogus', vocab)).toEqual({ app: 'vanguard' });
    expect(parseMidniteLink('midnite://open?app=agents&view=../etc&tab=a%00b', vocab)).toEqual({ app: 'agents' });
    // a tab without the media view, and a page beside a non-settings view, mean nothing
    expect(parseMidniteLink('midnite://open?app=agents&view=graph&tab=doc', vocab)).toEqual({
      app: 'agents',
      view: 'graph',
    });
    expect(parseMidniteLink('midnite://open?app=agents&view=graph&page=accounts', vocab)).toEqual({
      app: 'agents',
      view: 'graph',
    });
  });

  it('without a vocabulary only checks that a value is a short slug', () => {
    expect(parseMidniteLink('midnite://open?app=agents&view=anything')).toEqual({ app: 'agents', view: 'anything' });
    expect(parseMidniteLink('midnite://open?app=agents&view=a%20b')).toEqual({ app: 'agents' });
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
          });

    it('lets Studio address any module', () => {
      expect(parseMidniteLink('midnite://open?app=studio&module=capture')).toEqual({ app: 'studio', module: 'capture' });
    });
  });

  describe('retired apps (Phase 124 Theme G)', () => {
    it('resolves every retired id that has a host here to host + module', () => {
      for (const id of RETIRED_APP_IDS) {
        const alias = RETIRED_APP_ALIASES[id];
        const parsed = parseMidniteLink(`midnite://open?app=${id}`, vocab);
        if (!(MIDNITE_APP_IDS as readonly string[]).includes(alias.app)) {
          expect(parsed, id).toBeNull();
          continue;
        }
        expect(parsed, id).toEqual({ app: alias.app, module: alias.module, legacyApp: id });
        expect(APP_MODULES[alias.app]).toContain(alias.module);
        // the link a caller builds from a retired id round-trips to the same target
        expect(parseMidniteLink(midniteOpenLink({ app: id }), vocab), id).toEqual(parsed);
      }
    });

    it('keeps view, tab and page riding along a retired id', () => {
      expect(parseMidniteLink('midnite://open?app=coder&view=reviews', vocab)).toEqual({
        app: 'agents',
        module: 'coder',
        view: 'reviews',
        legacyApp: 'coder',
      });
      expect(parseMidniteLink('midnite://open?app=vault&page=accounts', vocab)).toEqual({
        app: 'vanguard',
        module: 'vault',
        page: 'accounts',
        legacyApp: 'vault',
      });
    });

    it('lets an explicit module the host carries win, and ignores one it does not', () => {
      expect(parseMidniteLink('midnite://open?app=coder&module=creator')).toMatchObject({ app: 'agents', module: 'creator' });
      expect(parseMidniteLink('midnite://open?app=coder&module=vault')).toMatchObject({ app: 'agents', module: 'coder' });
    });

    it('never offers a retired id as a resolved app', () => {
      expect(parseMidniteLink('midnite://open?app=coder')?.app).toBe('agents');
      expect(parseMidniteLink('midnite://open?app=agents')?.legacyApp).toBeUndefined();
    });
  });
});
