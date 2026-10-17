import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { DatabaseHostProvider, type DatabaseHost, type DatabaseQueryEditorProps } from './host';
import { createStandaloneDatabaseHost } from './standalone-host';

/**
 * The stand-in every view test uses for the SQL editor: a textarea driven by the same `sql`/
 * `onChange` the real one is. (Monaco needs a layout engine jsdom does not have; a view test is
 * about the view, not the editor.)
 */
export function TestQueryEditor({ sql, onChange }: DatabaseQueryEditorProps) {
  return <textarea aria-label="SQL" data-testid="query-editor" value={sql} onChange={(event) => onChange(event.target.value)} />;
}

/**
 * For this package's own tests: the frame's kit chrome (its `DialogHost` mounted beside the view),
 * the standalone host with the test editor, any member overridden. The storage key is the host's
 * own, so a test starts from the defaults.
 */
export function renderWithDatabaseHost(ui: ReactElement, overrides: Partial<DatabaseHost> = {}) {
  const { chrome, DialogHost } = createFrameChrome();
  const host: DatabaseHost = {
    ...createStandaloneDatabaseHost({ storageKey: `test-${Math.random()}` }),
    QueryEditor: TestQueryEditor,
    ...overrides,
  };
  return render(
    <FrameChromeProvider chrome={chrome}>
      <DatabaseHostProvider host={host}>
        {ui}
        <DialogHost />
      </DatabaseHostProvider>
    </FrameChromeProvider>,
  );
}
