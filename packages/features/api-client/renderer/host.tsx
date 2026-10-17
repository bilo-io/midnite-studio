import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { IconComponent } from '@midnite/studio-frame';

import { configureApiClientStore } from './api-client-store';

/**
 * The API client feature's host port — what the request builder, the collection tree and the
 * environment editor need from the app that composes them, beyond the frame (Phase 113 Theme O).
 *
 * Every seam is declared with only the props this feature passes, so the views read as they always
 * did while each implementation is the composing app's:
 *
 * - **App state** — the selected repository, the two persisted pane sizes and the active
 *   environment of each repository. Studio keeps them in `ui-store` (so nothing persisted moved);
 *   Coder keeps its own small store.
 * - **Chrome over app state** — popovers and tree sections clamp to the content area and count
 *   occluders in Studio; dismissal goes through its layered Escape stack.
 * - **The code editor** — Monaco in Studio (a lazy worker bundle, the studio palette); a plain
 *   textarea in an app that has none. The feature never imports an editor.
 *
 * Every member is required: the feature has no optional parts, only a plain and a rich way to
 * draw each one.
 */

export type ApiClientPaneKey = 'apiTreeWidth' | 'apiBuilderHeight';

export type ApiClientPaneSize = { size: number; setSize: (value: number) => void; initial: number; min: number; max: number };

export type ApiClientPopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

export type ApiClientTreeSectionProps = {
  title: string;
  count?: number;
  icon?: ReactNode;
  meta?: ReactNode;
  action?: { label: string; onClick: () => void; icon?: IconComponent };
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  hideWhenEmpty?: boolean;
  depth?: 0 | 1 | 2 | 3;
  tone?: 'primary';
  tinted?: boolean;
  children: ReactNode;
};

/**
 * The part of a mounted code editor the Body tab reaches for: whether a formatter exists for the
 * current language, and running it. Monaco's `IStandaloneCodeEditor` satisfies it as is.
 */
export type ApiClientEditorHandle = {
  getAction(id: string): { run(): unknown } | null | undefined;
};

export type ApiClientCodeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  language: string;
  height?: string | number;
  readOnly?: boolean;
  /** Hands the mounted editor up — the Body tab's Beautify button is the one caller. */
  onEditorMount?: (editor: ApiClientEditorHandle) => void;
  /**
   * A TypeScript declaration the editor should know about, for autocomplete and red squiggles —
   * the `pm.*` surface on the script fields. An editor with no language service ignores it.
   */
  ambientLib?: { content: string; fileName: string };
};

export type ApiClientHost = {
  /** The repository the app has selected. A hook. */
  useActiveRepo: () => { repoId: string | null };
  /** A persisted pane size. A hook. */
  usePaneSize: (key: ApiClientPaneKey) => ApiClientPaneSize;
  /** One repository's active environment, and the way to change it. A hook; re-renders on change. */
  useActiveEnvironment: (repoId: string | null) => { environmentId: string | null; select: (repoId: string, environmentId: string | null) => void };
  /**
   * The same read without React — what the send and run actions use at the moment they fire.
   * The provider installs it for the store (`configureApiClientStore`).
   */
  getActiveEnvironmentId: (repoId: string) => string | null;
  /** Escape closes this while it is open, in the dialog layer of the app's dismissal order. A hook. */
  useDismiss: (open: boolean, onDismiss: () => void) => void;
  Popover: ComponentType<ApiClientPopoverProps>;
  TreeSection: ComponentType<ApiClientTreeSectionProps>;
  CodeField: ComponentType<ApiClientCodeFieldProps>;
};

const ApiClientHostContext = createContext<ApiClientHost | null>(null);

export function ApiClientHostProvider({ host, children }: { host: ApiClientHost; children: ReactNode }) {
  // The store reads the active environment outside React; give it the host's accessor. Idempotent.
  configureApiClientStore({ getActiveEnvironmentId: host.getActiveEnvironmentId });
  return <ApiClientHostContext.Provider value={host}>{children}</ApiClientHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the API client would not render. */
export function useApiClientHost(): ApiClientHost {
  const host = useContext(ApiClientHostContext);
  if (!host) throw new Error('The API client feature must be rendered inside <ApiClientHostProvider>');
  return host;
}
