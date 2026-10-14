import { useState } from 'react';
import { FrameChromeProvider } from '@midnite/studio-frame';
import { BROWSER_CHROME } from './compose/browser-chrome';
import { BrowserHostProvider, createDefaultBrowserHost, type BrowserHost } from './ports/browser-host';
import { BrowserShell } from './components/browser-shell';

export function BrowserApp({ host }: { host?: BrowserHost }) {
  const [defaultHost] = useState(() => host ?? createDefaultBrowserHost());
  const activeHost = host ?? defaultHost;

  return (
    <FrameChromeProvider chrome={BROWSER_CHROME}>
      <BrowserHostProvider host={activeHost}>
        <BrowserShell />
      </BrowserHostProvider>
    </FrameChromeProvider>
  );
}
