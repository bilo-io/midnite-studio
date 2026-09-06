import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { ProjectsPage } from './projects-page';

const INITIAL_BLOCKED_BY_FIELD_NAME = useUiStore.getState().blockedByFieldName;

afterEach(() => {
  cleanup();
  useUiStore.setState({ blockedByFieldName: INITIAL_BLOCKED_BY_FIELD_NAME });
});

describe('ProjectsPage — dependency graph field name (Phase 75 Theme H)', () => {
  it('shows the store value, defaulting to "Blocked by"', () => {
    render(<ProjectsPage />);
    expect((screen.getByLabelText('Blocked-by field name') as HTMLInputElement).value).toBe('Blocked by');
  });

  it('typing a new name persists it to the store', () => {
    render(<ProjectsPage />);
    fireEvent.change(screen.getByLabelText('Blocked-by field name'), { target: { value: 'Depends on' } });
    expect(useUiStore.getState().blockedByFieldName).toBe('Depends on');
  });

  it('clearing it disables the field layer (an empty string, not a fallback)', () => {
    render(<ProjectsPage />);
    fireEvent.change(screen.getByLabelText('Blocked-by field name'), { target: { value: '' } });
    expect(useUiStore.getState().blockedByFieldName).toBe('');
  });
});
