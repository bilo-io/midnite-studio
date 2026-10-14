import { describe, expect, it } from 'vitest';

import { VIEW_IDS } from '@midnite/studio-shared/domain/view';
import { MEDIA_TABS } from '@midnite/studio-shared/media';

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

  it('points every home and feature at a view Studio knows (and a real media tab)', () => {
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
        if (tab !== null) expect(MEDIA_TABS).toContain(tab);
      }
    }
  });

  it('opens a named feature, and falls back to the home for an unknown one', () => {
    expect(appLink('coder', 'db')).toBe('midnite-studio://view?id=database');
    expect(appLink('gamer')).toBe('midnite-studio://view?id=media&tab=game');
    expect(appLink('gamer', 'nope')).toBe('midnite-studio://view?id=media&tab=game');
    expect(appLink('cleaner')).toBe('midnite-studio://view?id=optimizer');
  });
});
