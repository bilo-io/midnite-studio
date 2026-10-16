import type { FinanceHost } from '@midnite/studio-feature-finance/renderer';

import { EmptyState } from '../components/empty-state';
import { Modal } from '../components/modal';
import { Popover } from '../components/popover';
import { Tooltip } from '../components/tooltip';
import { ExternalLink } from '../features/markdown/external-link';
import { useTitleTypewriter } from '../features/slides/use-title-typewriter';
import { openInMidnite, openLinkFromEvent } from '../services/open-in-midnite';

/**
 * Studio's side of the finance feature's host port (Phase 113 Theme P).
 *
 * Every member is the component or function the Finance widgets imported
 * directly before they moved into the package, so the dashboard, the status-bar
 * segment and the trade dialogs look and behave exactly as they did. Nothing
 * Finance persists moved either: `midnite.finance` and the dashboard's own
 * `finance-ui` store keep their keys.
 */
export const STUDIO_FINANCE_HOST = {
  Modal,
  Popover,
  Tooltip,
  EmptyState,
  ExternalLink,
  openLinkFromEvent: (url, event) => openLinkFromEvent(url, event),
  openLink: (url, target) => openInMidnite(url, { target }),
  useTypewriter: (text) => useTitleTypewriter(text, false).typed,
} satisfies FinanceHost;
