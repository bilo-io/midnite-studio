import { beforeEach } from 'vitest';

import { installCompanionHost } from './host';
import { createTestCompanionHost, openedBrowserUrls, useFileEditorStore, useGamePopped, useIssueModalStore } from './testing';

// Installed at load too: a few suites read the host while their module scope evaluates.
installCompanionHost(createTestCompanionHost());

beforeEach(() => {
  useFileEditorStore.setState({ pendingNav: null, target: null, content: '', savedContent: '' });
  useIssueModalStore.setState({ target: null });
  useGamePopped.setState({ popped: false });
  openedBrowserUrls.length = 0;
  installCompanionHost(createTestCompanionHost());
});
