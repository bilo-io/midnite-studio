import { useState } from 'react';

import type { RepoDescriptor } from '@midnite/studio-shared';

import type { NotesHost } from './host';

/**
 * An in-memory {@link NotesHost} for this package's own tests — the feature
 * rendered with no app around it. Studio's adapter is tested where it lives
 * (`packages/app/src/compose/notes/`).
 *
 * Test-only: nothing outside `*.test.tsx` imports it.
 */
export function createTestNotesHost(
  options: {
    selectedRepoId?: string | null;
    repos?: readonly RepoDescriptor[];
    handoff?: ReturnType<NotesHost['useHandoff']>;
  } = {},
): NotesHost {
  const repos = options.repos ?? [];
  return {
    useRepoContext: () => ({ selectedRepoId: options.selectedRepoId ?? null, repos }),
    useListWidth: () => {
      const [width, setWidth] = useState(320);
      return { width, setWidth, initial: 320, min: 220, max: 560 };
    },
    useHandoff: () => options.handoff ?? null,
    Editor: ({ value, onChange, fileName }) => (
      <textarea data-testid="test-editor" data-filename={fileName} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
    Preview: ({ content }) => <div data-testid="test-preview">{content}</div>,
  };
}
