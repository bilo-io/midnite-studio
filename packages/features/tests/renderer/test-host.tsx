import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { TestsHostProvider, type TestsHost } from './host';

/** For this package's own tests: the frame's kit chrome and a host on `repo-1`, any member overridden. */
export function renderWithTestsHost(ui: ReactElement, overrides: Partial<TestsHost> = {}) {
  const { chrome } = createFrameChrome();
  const host: TestsHost = {
    useActiveRepo: () => ({ repoId: 'repo-1' }),
    useListWidth: () => ({ size: 320, setSize: () => undefined, initial: 320, min: 240, max: 640 }),
    ...overrides,
  };
  return render(
    <FrameChromeProvider chrome={chrome}>
      <TestsHostProvider host={host}>{ui}</TestsHostProvider>
    </FrameChromeProvider>,
  );
}
