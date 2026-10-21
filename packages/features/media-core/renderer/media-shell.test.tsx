// vitest/jsdom: roles, labels and which body mounts — no browser capability is needed.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LuFileText, LuImage, LuMapPin } from 'react-icons/lu';
import { afterEach, describe, expect, it } from 'vitest';

import { createFrameChrome, FrameChromeProvider, useMediaKit, type MediaTabDescriptor } from '@midnite/studio-frame';

import { MediaHostProvider } from './host';
import { mediaKit } from './kit';
import { MediaShell } from './media-shell';
import { createStandaloneMediaHost } from './standalone-host';

afterEach(cleanup);

function KitProbe() {
  const kit = useMediaKit();
  return <p>kit {kit === mediaKit ? 'installed' : 'missing'}</p>;
}

const DOCS: MediaTabDescriptor = { id: 'doc', label: 'Docs', icon: LuFileText, Component: KitProbe };
const IMAGES: MediaTabDescriptor = { id: 'image', label: 'Images', icon: LuImage, Component: () => <p>images body</p> };
const MAPS: MediaTabDescriptor = { id: 'map', label: 'Maps', icon: LuMapPin, Component: () => <p>maps body</p> };

function mount(ui: ReactElement, initialTab?: MediaTabDescriptor['id']) {
  const host = createStandaloneMediaHost({ repoId: null, storage: undefined, ...(initialTab ? { initialTab } : {}) });
  const { chrome } = createFrameChrome();
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={chrome}>
        <MediaHostProvider host={host}>{ui}</MediaHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

describe('MediaShell — the tab registry', () => {
  it('draws exactly the registered tabs, in registration order', () => {
    mount(<MediaShell tabs={[IMAGES, DOCS]} />, 'image');
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual(['Images', 'Docs']);
    expect(screen.getByText('images body')).toBeTruthy();
  });

  it('falls back to the first tab when the stored one is not registered', () => {
    mount(<MediaShell tabs={[DOCS, IMAGES]} />, 'map');
    expect(screen.getByRole('tab', { name: 'Docs' }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches on click and with the arrow keys, over its own tabs only', () => {
    mount(<MediaShell tabs={[DOCS, IMAGES, MAPS]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Maps' }));
    expect(screen.getByText('maps body')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Docs' }).getAttribute('aria-selected')).toBe('true');
  });

  it('installs the media kit for the tab it renders', () => {
    mount(<MediaShell tabs={[DOCS]} />);
    expect(screen.getByText('kit installed')).toBeTruthy();
  });

  it('refuses a tab registered twice', () => {
    expect(() => mount(<MediaShell tabs={[DOCS, DOCS]} />)).toThrow(/registered twice/);
  });
});
