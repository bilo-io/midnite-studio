import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptySiteVerdict, type MidniteStudioBridge, type SiteVerdict } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { useBrowserStore } from '@midnite/studio-feature-browser/renderer/store';
import { useUiStore } from '../../store/ui-store';
import { BrowserPane } from '@midnite/studio-feature-browser/renderer/testing';
import { StudioProviders } from '../studio-providers';

/** jsdom has no `ResizeObserver`; `useBrowserBounds` only needs it to exist. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

let eventHandlers: ((event: unknown) => void)[] = [];
let setVisibleMock = vi.fn();
let setSiteSafetyMock = vi.fn();
let proceedSiteMock = vi.fn();

function pushBrowserEvent(event: unknown) {
  for (const handler of [...eventHandlers]) handler(event);
}

beforeEach(() => {
  eventHandlers = [];
  setVisibleMock = vi.fn();
  setSiteSafetyMock = vi.fn();
  proceedSiteMock = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: {
      setVisible: setVisibleMock,
      setBounds: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn(),
      navigate: vi.fn(),
      setKeepAwake: vi.fn(),
      setDiscardMs: vi.fn(),
      setSiteSafety: setSiteSafetyMock,
      proceedSite: proceedSiteMock,
      back: vi.fn(),
      reload: vi.fn(),
      setTrackerException: vi.fn(),
      onEvent: vi.fn((handler: (event: unknown) => void) => {
        eventHandlers.push(handler);
        return () => {
          eventHandlers = eventHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['browser'],
  };
  useBrowserStore.setState({ tabs: [], activeTabId: null });
  useUiStore.setState({ browserOpen: true, browserLayout: 'full', occluders: 0 });
});

afterEach(cleanup);

/**
 * The tab strip reads the repo list for its preview-deploy chips, and its
 * per-tab menu asks `useDialogs` for a confirm — both are the app's own
 * ambient providers rather than anything these tests exercise.
 */
function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <StudioProviders>{children}</StudioProviders>
      </DialogHost>
    </QueryClientProvider>
  );
}

const renderPane = () => render(<BrowserPane shown />, { wrapper });

const pane = () => screen.getByRole('dialog', { name: 'Browser' });

describe('BrowserPane layouts', () => {
  it('full screen stretches left over the nav rail, and stops above the footer', () => {
    renderPane();

    // `--nav-offset` is `@bilo-io/shell`'s own padding on `<main>` for the
    // fixed rail; pulling the left edge back by it is what puts the pane at
    // the window edge instead of the content edge. Read off the variable
    // rather than a literal so a locked-open 16rem rail is covered as
    // exactly as a collapsed 3.5rem one.
    expect(pane().getAttribute('style')).toContain('calc(-1 * var(--nav-offset, 0px))');
    // `inset-y-0`, not `inset-0`: the pane is bounded by the content row, and
    // the status bar is a sibling of that row — which is what leaves the
    // footer uncovered without the pane having to know how tall it is.
    expect(pane().className).toContain('inset-y-0');
    expect(pane().className).toContain('z-browser');
    expect(pane().className).not.toContain('inset-0');
  });

  it('side by side is not positioned at all — it fills the column app.tsx gives it', () => {
    useUiStore.setState({ browserLayout: 'left' });
    renderPane();

    expect(pane().className).toContain('relative');
    expect(pane().className).not.toContain('absolute');
    expect(pane().getAttribute('style')).not.toContain('--nav-offset');
  });

  it('the toolbar picker marks the current layout and switches without closing', () => {
    renderPane();

    expect(screen.getByTestId('browser-layout-pick-full').getAttribute('aria-pressed')).toBe(
      'true',
    );
    screen.getByTestId('browser-layout-pick-right').click();

    expect(useUiStore.getState()).toMatchObject({ browserOpen: true, browserLayout: 'right' });
  });
});

/** A page tab, active from the first render — the shape every chrome test below needs. */
function seedActivePageTab(url = 'https://example.com/page') {
  useBrowserStore.setState({
    tabs: [
      {
        id: 'tab-1',
        kind: 'page',
        url,
        title: '',
        loading: false,
        canGoBack: false,
        canGoForward: false,
      },
    ],
    activeTabId: 'tab-1',
  });
}

describe('a failed navigation (Theme G)', () => {
  it('renders the error page and hides the native view for its duration', async () => {
    seedActivePageTab();
    renderPane();
    setVisibleMock.mockClear();

    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -105, description: 'net::ERR_NAME_NOT_RESOLVED', validatedUrl: 'https://bad.example' },
    });

    expect(await screen.findByTestId('browser-error-page')).toBeDefined();
    expect(screen.getByText('net::ERR_NAME_NOT_RESOLVED')).toBeDefined();
    await waitFor(() =>
      expect(setVisibleMock).toHaveBeenLastCalledWith({ tabId: 'tab-1', visible: false }),
    );
  });

  it('gives the blocked-scheme code (-30) its own copy rather than a bare number', async () => {
    seedActivePageTab();
    renderPane();

    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -30, description: 'Blocked navigation to file: scheme', validatedUrl: 'file:///etc/passwd' },
    });

    expect(
      await screen.findByText('Midnite Studio only opens http and https pages here'),
    ).toBeDefined();
  });

  it('clears on the next did-start-loading', async () => {
    seedActivePageTab();
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -105, description: 'net::ERR_NAME_NOT_RESOLVED', validatedUrl: 'https://bad.example' },
    });
    await screen.findByTestId('browser-error-page');

    pushBrowserEvent({ kind: 'loading', tabId: 'tab-1', loading: true });

    await waitFor(() => expect(screen.queryByTestId('browser-error-page')).toBeNull());
  });
});

describe('address bar behaviour (Theme G)', () => {
  const addressInput = () => screen.getByLabelText('Address') as HTMLInputElement;

  it('focus shows the full URL, selected', () => {
    seedActivePageTab('https://example.com/deep/path');
    renderPane();

    fireEvent.focus(addressInput());

    expect(addressInput().value).toBe('https://example.com/deep/path');
    expect(addressInput().selectionStart).toBe(0);
    expect(addressInput().selectionEnd).toBe('https://example.com/deep/path'.length);
  });

  it('blur with no edit shows the trimmed host + pathname', () => {
    seedActivePageTab('https://example.com/');
    renderPane();

    fireEvent.focus(addressInput());
    fireEvent.blur(addressInput());

    expect(addressInput().value).toBe('example.com');
  });

  it('typing previews the resolved destination', () => {
    seedActivePageTab();
    renderPane();

    fireEvent.focus(addressInput());
    fireEvent.change(addressInput(), { target: { value: 'midnite' } });

    expect(screen.getByText('https://www.google.com/search?q=midnite')).toBeDefined();
  });

  it('Escape restores the URL and blurs, without closing the pane', () => {
    seedActivePageTab('https://example.com/page');
    renderPane();

    fireEvent.focus(addressInput());
    fireEvent.change(addressInput(), { target: { value: 'something else entirely' } });
    fireEvent.keyDown(addressInput(), { key: 'Escape' });

    expect(addressInput().value).toBe('example.com/page');
    expect(pane()).toBeDefined();
    expect(useUiStore.getState().browserOpen).toBe(true);
  });

  it('renders fixed address bar wrapped in synchronized gradient border and glow', () => {
    seedActivePageTab();
    renderPane();

    const wrapper = addressInput().closest('.browser-search-sync');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('gradient-border')).toBe(true);
    expect(wrapper?.classList.contains('gradient-border--glow')).toBe(true);
    expect(wrapper?.classList.contains('browser-search-sync')).toBe(true);
  });

  it('auto-focuses the fixed address bar on a new tab', async () => {
    useBrowserStore.setState({
      activeTabId: 'new-1',
      tabs: [{ id: 'new-1', kind: 'newtab', url: '', title: 'New tab', loading: false, canGoBack: false, canGoForward: false }],
    });
    renderPane();

    await waitFor(() => {
      expect(document.activeElement).toBe(addressInput());
    });
  });
});

describe('site verdicts (Phase 117 Theme C)', () => {
  const badge = () => screen.getByTestId('browser-site-badge');
  const verdict = (url: string, patch: Partial<SiteVerdict> = {}): SiteVerdict => ({ ...emptySiteVerdict(url), ...patch });
  const blurAddress = () => fireEvent.blur(screen.getByLabelText('Address'));

  beforeEach(() => {
    useUiStore.setState({ browserAllowSiteProceed: false, browserReputationFeeds: { urlhaus: false, openphish: false } });
  });

  it('pushes the site-safety switches to main on mount and on every change', async () => {
    renderPane();
    await waitFor(() =>
      expect(setSiteSafetyMock).toHaveBeenLastCalledWith({ allowProceed: false, feeds: { urlhaus: false, openphish: false } }),
    );
    useUiStore.getState().setBrowserReputationFeed('urlhaus', true);
    await waitFor(() =>
      expect(setSiteSafetyMock).toHaveBeenLastCalledWith({ allowProceed: false, feeds: { urlhaus: true, openphish: false } }),
    );
  });

  it('reads plain http as "Not secure" before main reports, and https as ok', () => {
    seedActivePageTab('http://example.com/');
    renderPane();
    blurAddress();
    expect(badge().getAttribute('data-level')).toBe('caution');
    expect(badge().textContent).toContain('Not secure');
  });

  it('treats a loopback dev server as ok, not "Not secure"', () => {
    seedActivePageTab('http://localhost:5173/');
    renderPane();
    blurAddress();
    expect(badge().getAttribute('data-level')).toBe('ok');
  });

  it('an http image under https flips the badge to caution, and the popover lists it (acceptance)', async () => {
    seedActivePageTab('https://example.com/');
    renderPane();
    blurAddress();
    expect(badge().getAttribute('data-level')).toBe('ok');

    pushBrowserEvent({
      kind: 'verdict',
      tabId: 'tab-1',
      verdict: verdict('https://example.com/', { mixedContent: true, mixedContentUrls: ['http://cdn.example/a.png'] }),
    });

    await waitFor(() => expect(badge().getAttribute('data-level')).toBe('caution'));
    fireEvent.click(badge());
    const popover = screen.getByTestId('browser-site-popover');
    expect(popover.textContent).toContain('Loads an insecure resource (mixed content)');
    expect(popover.textContent).toContain('No reputation data');
  });

  it('shows a lookalike in punycode with its line (acceptance)', async () => {
    seedActivePageTab('https://xn--pple-43d.com/');
    renderPane();
    blurAddress();
    pushBrowserEvent({
      kind: 'verdict',
      tabId: 'tab-1',
      verdict: verdict('https://xn--pple-43d.com/', {
        lookalike: { kind: 'idn-mixed-script', displayHost: 'xn--pple-43d.com', against: 'apple.com' },
      }),
    });
    await waitFor(() => expect(badge().textContent).toContain('Lookalike'));
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('xn--pple-43d.com');
    fireEvent.click(badge());
    expect(screen.getByTestId('browser-site-popover').textContent).toContain('looks like apple.com');
  });

  it('lists a vulnerable library with its CVEs and counts blocked trackers (acceptance)', async () => {
    seedActivePageTab('https://example.com/');
    renderPane();
    blurAddress();
    pushBrowserEvent({
      kind: 'verdict',
      tabId: 'tab-1',
      verdict: verdict('https://example.com/', {
        vulnerableLibs: [{ library: 'jquery', version: '1.12.4', cve: ['CVE-2020-11022', 'CVE-2019-11358'], url: 'https://code.jquery.com/jquery-1.12.4.min.js' }],
        trackersBlocked: 3,
        trackerHosts: ['t.example'],
      }),
    });
    await waitFor(() => expect(screen.getByTestId('browser-site-badge-trackers').textContent).toBe('3'));
    fireEvent.click(badge());
    const popover = screen.getByTestId('browser-site-popover');
    expect(popover.textContent).toContain('jquery 1.12.4 has known vulnerabilities: CVE-2020-11022, CVE-2019-11358');
    expect(popover.textContent).toContain('3 tracker requests blocked');

    // Theme E's per-site exception lives in this one popover now (TrackerBadge is gone).
    fireEvent.click(screen.getByRole('button', { name: 'Allow trackers on example.com' }));
    const bridgeBrowser = (window as unknown as { midniteStudio: MidniteStudioBridge }).midniteStudio.browser;
    expect(bridgeBrowser.setTrackerException).toHaveBeenCalledWith({ host: 'example.com', allow: true });
    expect(bridgeBrowser.reload).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });

  it('raises the one badge to "Possible phishing" for a password page Theme F judged a phish', async () => {
    seedActivePageTab('https://github-login.app/');
    renderPane();
    blurAddress();
    pushBrowserEvent({
      kind: 'verdict',
      tabId: 'tab-1',
      verdict: verdict('https://github-login.app/', {
        credentialRisk: { level: 'danger', reasons: [{ rule: 'sign-in-elsewhere', detail: 'github.com' }] },
      }),
    });
    await waitFor(() => expect(badge().textContent).toContain('Possible phishing'));
    expect(badge().getAttribute('data-level')).toBe('danger');
    expect(screen.getAllByTestId('browser-site-badge')).toHaveLength(1);
    fireEvent.click(badge());
    expect(screen.getByTestId('browser-site-popover').textContent).toContain('Looks like a github.com sign-in page, but is not on github.com');
  });

  it('ignores a verdict for another origin than the page the tab shows', async () => {
    seedActivePageTab('https://example.com/');
    renderPane();
    blurAddress();
    pushBrowserEvent({ kind: 'verdict', tabId: 'tab-1', verdict: verdict('https://expired.badssl.com/', { tls: 'error' }) });
    await waitFor(() => expect(useBrowserStore.getState().tabs[0]?.verdict?.tls).toBe('error'));
    expect(badge().getAttribute('data-level')).toBe('ok');
  });

  it('renders the certificate interstitial with no way past while the switch is off (acceptance)', async () => {
    seedActivePageTab();
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -201, description: 'net::ERR_CERT_DATE_INVALID', validatedUrl: 'https://expired.badssl.com/', reason: 'certificate' },
    });

    const page = await screen.findByTestId('browser-interstitial');
    expect(page.getAttribute('data-reason')).toBe('certificate');
    expect(page.textContent).toContain('This connection is not private');
    expect(screen.queryByTestId('browser-interstitial-proceed')).toBeNull();
    expect(page.textContent).toContain('Settings ▸ Browser ▸ Site safety');
  });

  it('a refused first load reads danger on the badge, from the interstitial\'s own error', async () => {
    seedActivePageTab('https://expired.badssl.com/');
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -201, description: 'net::ERR_CERT_DATE_INVALID', validatedUrl: 'https://expired.badssl.com/', reason: 'certificate' },
    });
    await screen.findByTestId('browser-interstitial');
    blurAddress();
    await waitFor(() => expect(badge().getAttribute('data-level')).toBe('danger'));
  });

  it('offers "Proceed for this session" once Settings allows it, and asks main for exactly that URL', async () => {
    useUiStore.setState({ browserAllowSiteProceed: true });
    seedActivePageTab();
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -201, description: 'net::ERR_CERT_DATE_INVALID', validatedUrl: 'https://expired.badssl.com/', reason: 'certificate' },
    });

    fireEvent.click(await screen.findByTestId('browser-interstitial-proceed'));
    expect(proceedSiteMock).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://expired.badssl.com/' });
  });

  it('renders the known-bad interstitial with the feed and the match', async () => {
    seedActivePageTab();
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: {
        code: -20,
        description: 'Listed as phishing by OpenPhish',
        validatedUrl: 'https://login-paypa1.example/signin',
        reason: 'known-bad',
        knownBad: { feed: 'openphish', category: 'phishing', match: 'login-paypa1.example' },
      },
    });

    const page = await screen.findByTestId('browser-interstitial');
    expect(page.textContent).toContain('This site is reported as dangerous');
    expect(page.textContent).toContain('OpenPhish lists login-paypa1.example as a phishing site');

    // The link was refused on a page that stayed loaded: the way out drops the warning, it does
    // not step history back off that page.
    const back = screen.getByTestId('browser-interstitial-back');
    expect(back.textContent).toBe('Back to safety');
    fireEvent.click(back);
    await waitFor(() => expect(screen.queryByTestId('browser-interstitial')).toBeNull());
    const bridgeBrowser = (window as unknown as { midniteStudio: MidniteStudioBridge }).midniteStudio.browser;
    expect(bridgeBrowser.back).not.toHaveBeenCalled();
  });

  it('a refused first load offers "Go back" through history instead', async () => {
    seedActivePageTab('https://login-paypa1.example/signin');
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: {
        code: -20,
        description: 'Listed as phishing by OpenPhish',
        validatedUrl: 'https://login-paypa1.example/signin',
        reason: 'known-bad',
        knownBad: { feed: 'openphish', category: 'phishing', match: 'login-paypa1.example' },
      },
    });
    const back = await screen.findByTestId('browser-interstitial-back');
    expect(back.textContent).toBe('Go back');
    expect((back as HTMLButtonElement).disabled).toBe(true);
  });
});
