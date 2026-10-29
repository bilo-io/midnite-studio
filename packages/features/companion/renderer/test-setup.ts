import { beforeEach } from 'vitest';

// The main half's tests run under node (a docblock on each) and need no host.
if (typeof window !== 'undefined') {
  const { installCompanionHost } = await import('./host');
  const { createTestCompanionHost, openedBrowserUrls, useFileEditorStore, useGamePopped, useIssueModalStore } = await import('./testing');

  // Installed at load too: a few suites read the host while their module scope evaluates.
  installCompanionHost(createTestCompanionHost());

  beforeEach(() => {
    useFileEditorStore.setState({ pendingNav: null, target: null, content: '', savedContent: '' });
    useIssueModalStore.setState({ target: null });
    useGamePopped.setState({ popped: false });
    openedBrowserUrls.length = 0;
    installCompanionHost(createTestCompanionHost());
  });
}
