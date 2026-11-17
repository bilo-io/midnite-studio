import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LevelShortcutHelp } from './level-shortcut-help';

afterEach(cleanup);

describe('LevelShortcutHelp (Phase 137 Theme J)', () => {
  it('J4 lists Mod+D as ⌘D on mac, grouped, and only the rows for the view', () => {
    render(<LevelShortcutHelp open onClose={() => undefined} view="plan" dimension="2d" mac />);
    const edit = within(screen.getByRole('region', { name: 'Edit' }));
    expect(edit.getByText('⌘D')).toBeTruthy();
    expect(edit.getByText('Duplicate')).toBeTruthy();
    expect(screen.queryByText('Move gizmo')).toBeNull();
    expect(screen.getByText('Paint tiles')).toBeTruthy();
  });
});
