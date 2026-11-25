// Open a page in the system's in-app browser (Phase 146 J3): SFSafariViewController on iOS, Chrome Custom Tabs on
// Android, so Google and Apple sign-in work and the provider's session persists across launches. Never a WebView, a
// custom user agent or cookie injection. Only `https:` is ever opened (Theme I's `isHttpsUrl`). Theme I's check-URL opener is an inline
// call with no options, so the full-screen, themed opener the providers need lives here.
import * as WebBrowser from 'expo-web-browser';
import type { Theme } from '@bilo-io/ui-native';
import { usePrefs } from '../state/prefs';
import { isHttpsUrl } from '../reviews/format';
import { findProvider, type AgentProvider } from './providers';

export type OpenResult = { ok: true } | { ok: false; message: string };

/** Open an `https:` URL in the in-app browser; anything else, or a browser that cannot be presented, is a failure. */
export async function openInAppBrowser(url: string, colors: Pick<Theme['colors'], 'primary' | 'background'>): Promise<OpenResult> {
  if (!isHttpsUrl(url)) return { ok: false, message: 'Only https links open in the browser' };
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: colors.primary,
      toolbarColor: colors.background,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
      showTitle: true,
    });
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not open the browser' };
  }
}

/** Record the provider as last used, then open its page. */
export async function openProvider(provider: AgentProvider, colors: Pick<Theme['colors'], 'primary' | 'background'>): Promise<OpenResult> {
  usePrefs.getState().setLastProvider(provider.id);
  return openInAppBrowser(provider.url, colors);
}

/** Resolve an `?open=` param to a provider; unknown ids are ignored. */
export function providerFromParam(param: string | undefined): AgentProvider | undefined {
  return findProvider(param);
}
