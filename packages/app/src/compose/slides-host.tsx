import { useTheme } from '@bilo-io/ui/theme';
import type { SlidesHost } from '@midnite/studio-feature-slides/renderer';
import type { Highlighter } from 'shiki';

import { useDismiss } from '../components/use-dismiss';
import { useFocusTrap } from '../components/use-focus-trap';
import { useOccluder } from '../components/use-occluder';
import { ExternalLink } from '../features/markdown/external-link';

/**
 * Studio's side of the Slides feature's host port (Phase 113 Theme Q).
 *
 * The deck joins Studio's overlay machinery exactly as it did when it lived here: two entries on the
 * dismissal stack (Escape closes the help overlay first, then the deck), the shared focus trap, the
 * occluder registry that hides the browser pane, the guarded external-link opener, and the one shiki
 * instance. Installed by `StudioProviders`, because `SlidesModal` is mounted at the app's root.
 *
 * shiki is imported on the first highlighted block (`import()` below), not here: this module is in the
 * entry chunk, and the highlighter's engine was always part of the lazy deck chunk.
 */
async function highlight(code: string, lang: string | null, dark: boolean): Promise<string> {
  const { getHighlighter, resolveHighlightTheme } = await import('../lib/highlighter');
  const highlighter = await getHighlighter();
  let language = lang;
  if (language && !highlighter.getLoadedLanguages().includes(language)) {
    try {
      await highlighter.loadLanguage(language as Parameters<Highlighter['loadLanguage']>[0]);
    } catch {
      language = null;
    }
  }
  const theme = await resolveHighlightTheme(highlighter, dark);
  return highlighter.codeToHtml(code, { lang: language ?? 'text', theme });
}

export const STUDIO_SLIDES_HOST = {
  useDismiss: (active, onClose) => useDismiss(active, onClose, { layer: 'dialog' }),
  useFocusTrap,
  useOccluder,
  ExternalLink,
  highlight,
  useIsDark: () => useTheme().resolved === 'dark',
} satisfies SlidesHost;
