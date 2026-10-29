import { describe, expect, it } from 'vitest';

import { VIEW_IDS } from '@midnite/studio-shared/domain/view';
import { MEDIA_TABS } from '@midnite/studio-shared/media';
import { VANGUARD_TABS } from '@midnite/studio-shared/vanguard';

import { APPS, APP_IDS } from '../common/catalog';
import { appLink, targetLink } from './links';

describe('catalog → midnite-studio links', () => {
  it('lists every app id exactly once, with unique feature ids per app', () => {
    expect(APPS.map((a) => a.id).sort()).toEqual([...APP_IDS].sort());
    for (const app of APPS) {
      expect(new Set(app.features.map((f) => f.id)).size).toBe(app.features.length);
      expect(app.features.length).toBeGreaterThan(0);
    }
  });

  it('points every home and feature at a view Studio knows (and a real tab)', () => {
    for (const app of APPS) {
      for (const target of [app.home, ...app.features.map((f) => f.target)]) {
        const url = new URL(targetLink(target));
        expect(url.protocol).toBe('midnite-studio:');
        if (target.kind === 'browser') {
          expect(url.hostname).toBe('reveal');
          continue;
        }
        expect(url.hostname).toBe('view');
        expect(VIEW_IDS).toContain(url.searchParams.get('id'));
        const tab = url.searchParams.get('tab');
        if (tab !== null) expect(url.searchParams.get('id') === 'vanguard' ? VANGUARD_TABS : MEDIA_TABS).toContain(tab);
      }
    }
  });

  it('opens a named feature, and falls back to the home for an unknown one', () => {
    expect(appLink('agents', 'db')).toBe('midnite-studio://view?id=database');
    expect(appLink('gamer')).toBe('midnite-studio://view?id=media&tab=game');
    expect(appLink('gamer', 'nope')).toBe('midnite-studio://view?id=media&tab=game');
    expect(appLink('vanguard', 'optimizer')).toBe('midnite-studio://view?id=optimizer');
    expect(appLink('agents', 'tasks')).toBe('midnite-studio://view?id=tasks');
    // Knowledge lives in the frame now (Phase 113 placement map), not in Mind.
    expect(appLink('mind', 'knowledge')).toBe('midnite-studio://view?id=notes');
    expect(appLink('mind', 'tasks')).toBe('midnite-studio://view?id=notes');
    expect(appLink('vanguard', 'secrets')).toBe('midnite-studio://view?id=vault');
    expect(appLink('mind', 'recordings')).toBe('midnite-studio://view?id=capture');
    expect(appLink('vanguard', 'network')).toBe('midnite-studio://view?id=vanguard&tab=network');
    expect(appLink('vanguard')).toBe('midnite-studio://view?id=vanguard&tab=findings');
    expect(appLink('agents', 'models')).toBe('midnite-studio://view?id=models');
    expect(appLink('vanguard', 'sessions')).toBe('midnite-studio://view?id=sessions');
    expect(appLink('mind', 'review')).toBe('midnite-studio://view?id=notes');
  });

  it('opens a module on its own front door with module:<id>', () => {
    expect(appLink('agents', 'module:coder')).toBe('midnite-studio://view?id=sessions');
    expect(appLink('vanguard', 'module:cleaner')).toBe('midnite-studio://view?id=optimizer');
    expect(appLink('vanguard', 'module:monitor')).toBe('midnite-studio://view?id=settings');
    expect(appLink('gamer', 'module:creator')).toBe('midnite-studio://view?id=media&tab=doc');
    expect(appLink('agents', 'module:nope')).toBe('midnite-studio://view?id=chats');
  });

  it('still resolves a retired app id (an old link) to its host, on the module it became', () => {
    expect(appLink('coder')).toBe('midnite-studio://view?id=sessions');
    expect(appLink('coder', 'db')).toBe('midnite-studio://view?id=database');
    expect(appLink('cleaner')).toBe('midnite-studio://view?id=optimizer');
    expect(appLink('vault')).toBe('midnite-studio://view?id=vault');
    expect(appLink('capture', 'recordings')).toBe('midnite-studio://view?id=capture');
    expect(appLink('monitor')).toBe('midnite-studio://view?id=settings');
    expect(appLink('monitor', 'sessions')).toBe('midnite-studio://view?id=sessions');
    expect(appLink('creator')).toBe('midnite-studio://view?id=media&tab=doc');
  });
});
