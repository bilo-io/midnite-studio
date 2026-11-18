import { describe, expect, it } from 'vitest';

import { createPreviewOverlay } from './game-preview-overlay';

describe('createPreviewOverlay', () => {
  it('serves levels/<scene>.tmj for its game only', () => {
    const overlay = createPreviewOverlay();
    expect(overlay.set('ga', 'cave', '{"a":1}')).toBe(true);
    expect(overlay.get('ga', '/levels/cave.tmj')?.toString()).toBe('{"a":1}');
    expect(overlay.get('gb', '/levels/cave.tmj')).toBeNull();
    expect(overlay.scene('ga')).toBe('cave');
  });

  it('answers null for any other path, including traversal and encoded variants of another file', () => {
    const overlay = createPreviewOverlay();
    overlay.set('ga', 'cave', '{}');
    for (const path of ['/levels/other.tmj', '/index.html', '/levels/cave.tmj/x', '/levels/../levels/cave.tmj', '/levels/cave.tmj%00', '%']) {
      expect(overlay.get('ga', path)).toBeNull();
    }
  });

  it('refuses JSON over the cap and holds nothing', () => {
    const overlay = createPreviewOverlay(8);
    expect(overlay.set('ga', 'cave', '123456789')).toBe(false);
    expect(overlay.get('ga', '/levels/cave.tmj')).toBeNull();
  });

  it('clear drops the game', () => {
    const overlay = createPreviewOverlay();
    overlay.set('ga', 'cave', '{}');
    overlay.clear('ga');
    expect(overlay.get('ga', '/levels/cave.tmj')).toBeNull();
    expect(overlay.scene('ga')).toBeNull();
  });
});
