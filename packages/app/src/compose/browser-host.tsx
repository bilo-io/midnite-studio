import type { BrowserHost } from '@midnite/studio-feature-browser/renderer';

import { BrandMark, Wordmark } from '../components/brand';
import { ContextMenu } from '../components/context-menu';
import { usePopoutHeaderActions, usePopoutHeaderLeading } from '../components/detached-window-frame';
import { APP_ICON, ClaudeIcon } from '../components/icons';
import { MidniteIcon } from '../components/icons/midnite-icon';
import { Modal } from '../components/modal';
import { Tooltip } from '../components/tooltip';
import { useDismiss } from '../components/use-dismiss';
import { useOccluder } from '../components/use-occluder';
import { useRemotes, useRepos } from '../services/queries';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the browser feature's host port (Phase 113 Theme L).
 *
 * Every member is the component, hook or value the pane, the launcher, the switcher and the web-apps
 * rail imported directly before they moved into the package, so they look and behave exactly as they
 * did. Nothing they store moved: where the pane sits, the switcher's state, the occluder count and the
 * web apps stay in `ui-store` — `ui` *is* `useUiStore`, which satisfies the port structurally — and the
 * tabs keep their persisted `browser-store` key.
 */
export const STUDIO_BROWSER_HOST: BrowserHost = {
  ui: useUiStore,
  useRepos,
  useRemotes,
  Modal,
  Tooltip,
  ContextMenu,
  useDismiss,
  useOccluder,
  usePopoutHeaderLeading,
  usePopoutHeaderActions,
  MidniteIcon,
  BrandMark,
  Wordmark,
  ClaudeIcon,
  appIcon: APP_ICON,
};
