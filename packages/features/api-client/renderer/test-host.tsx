import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { ApiClientHostProvider, type ApiClientCodeFieldProps, type ApiClientHost } from './host';
import { createStandaloneApiClientHost } from './standalone-host';

/**
 * The stand-in every view test uses for the code editor: a textarea driven by the same `value`/
 * `onChange` the real one is, surfacing `language` and `readOnly` as attributes so a test can say
 * which editor a view picked. (Monaco needs a layout engine jsdom does not have; a view test is
 * about the view, not the editor.)
 */
export function TestCodeField({ value, onChange, language, readOnly }: ApiClientCodeFieldProps) {
  return (
    <textarea
      data-testid="monaco-field"
      data-language={language}
      data-readonly={String(Boolean(readOnly))}
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * For this package's own tests: the frame's kit chrome (its `DialogHost` mounted beside the view),
 * the standalone host on `repo-1` with the test code field, any member overridden. Storage keys are
 * the host's own, so a test starts from the defaults.
 */
export function renderWithApiClientHost(ui: ReactElement, overrides: Partial<ApiClientHost> = {}) {
  const { chrome, DialogHost } = createFrameChrome();
  const host: ApiClientHost = {
    ...createStandaloneApiClientHost({ useActiveRepo: () => ({ repoId: 'repo-1' }), storageKey: `test-${Math.random()}` }),
    CodeField: TestCodeField,
    ...overrides,
  };
  return render(
    <FrameChromeProvider chrome={chrome}>
      <ApiClientHostProvider host={host}>
        {ui}
        <DialogHost />
      </ApiClientHostProvider>
    </FrameChromeProvider>,
  );
}
