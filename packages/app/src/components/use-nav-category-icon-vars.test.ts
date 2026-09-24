import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ForgeKind } from '@midnite/studio-shared';

import { useNavCategoryIconVars } from './use-nav-category-icon-vars';

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--nav-workspace-icon');
  document.documentElement.style.removeProperty('--nav-agents-icon');
  document.documentElement.style.removeProperty('--nav-git-icon');
  document.documentElement.style.removeProperty('--nav-git-icon-color');
});

function cssVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

describe('useNavCategoryIconVars', () => {
  it('publishes the static Workspace and Agents icons once, on mount', () => {
    renderHook(() => useNavCategoryIconVars(null));

    expect(cssVar('--nav-workspace-icon')).toContain('data:image/svg+xml');
    expect(cssVar('--nav-agents-icon')).toContain('data:image/svg+xml');
  });

  it('falls back to the plain Git mark and its brand orange with no forge', () => {
    renderHook(() => useNavCategoryIconVars(null));

    expect(cssVar('--nav-git-icon')).toContain('data:image/svg+xml');
    expect(cssVar('--nav-git-icon-color')).toBe('#F05032');
  });

  it('recolours the Git icon when the forge changes', () => {
    const { rerender } = renderHook<void, { kind: ForgeKind }>(({ kind }) => useNavCategoryIconVars(kind), {
      initialProps: { kind: 'gitlab' },
    });
    expect(cssVar('--nav-git-icon-color')).toBe('#FC6D26');

    rerender({ kind: 'azure' });
    expect(cssVar('--nav-git-icon-color')).toBe('#0078D7');
  });

  it('uses currentColor for GitHub', () => {
    renderHook(() => useNavCategoryIconVars('github'));
    expect(cssVar('--nav-git-icon-color')).toBe('currentColor');
  });
});
