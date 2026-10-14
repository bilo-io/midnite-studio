import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS, settingsSectionId } from './settings-sections';

/*
  Stays in packages/app though `settings-sections.ts` moved to the frame
  (Phase 113 Theme C): it cross-checks the frame's section registry against the
  pages Studio actually renders, and those pages are the app's.
*/
const pages = import.meta.glob(['./settings-pages/*-page.tsx', '../../../../features/*/renderer/settings/*-page.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = Object.values(pages).join('\n');

describe('SETTINGS_SECTIONS', () => {
  it('slugs headings', () => {
    expect(settingsSectionId('Agent & shell style')).toBe('agent-shell-style');
    expect(settingsSectionId('~/.claude')).toBe('dot-claude');
  });

  it('has unique ids per page', () => {
    for (const sections of Object.values(SETTINGS_SECTIONS)) {
      const ids = sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('names only headings a page actually renders as anchored sections', () => {
    for (const sections of Object.values(SETTINGS_SECTIONS)) {
      for (const s of sections) {
        const accordion = source.includes(`<SettingsAccordion title="${s.label}"`) || new RegExp(`<SettingsAccordion\\s+title="${s.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(source);
        const heading = source.includes(`data-settings-section="${s.id}"`);
        expect(accordion || heading, s.label).toBe(true);
      }
    }
  });
});
