import { createContext, useContext, type ComponentType, type ReactElement, type ReactNode } from 'react';

import type { IconComponent } from '@midnite/studio-frame';

/**
 * The Database feature's host port — what the connections list, the query tabs and the results grid
 * need from the app that composes them, beyond the frame (Phase 113 Theme O).
 *
 * Every seam is declared with only the props this feature passes, so the views read as they always
 * did while each implementation is the composing app's:
 *
 * - **App state** — the persisted width of the connections list. Studio keeps it in `ui-store` (so
 *   nothing persisted moved); Coder keeps its own small store.
 * - **Chrome over app state** — tooltips and tree sections clamp to the content area and count
 *   occluders in Studio; elsewhere a tooltip is a native `title`.
 * - **The SQL editor** — Monaco in Studio (a lazy worker bundle, the studio palette, the editor
 *   font settings); a plain textarea in an app that has none. The feature never imports an editor.
 */

export type DatabasePaneKey = 'databaseConnectionsWidth';

export type DatabasePaneSize = { size: number; setSize: (value: number) => void; initial: number; min: number; max: number };

export type DatabaseTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
};

export type DatabaseTreeSectionProps = {
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

export type DatabaseQueryEditorProps = {
  sql: string;
  onChange: (sql: string) => void;
  /** `Mod+Enter` — handled locally on the editor, not as a registered command. */
  onRunChord: () => void;
};

export type DatabaseHost = {
  /** A persisted pane size. A hook. */
  usePaneSize: (key: DatabasePaneKey) => DatabasePaneSize;
  Tooltip: ComponentType<DatabaseTooltipProps>;
  TreeSection: ComponentType<DatabaseTreeSectionProps>;
  /** The query tab's SQL editor. Mounted once per tab, keyed on the tab id. */
  QueryEditor: ComponentType<DatabaseQueryEditorProps>;
};

const DatabaseHostContext = createContext<DatabaseHost | null>(null);

export function DatabaseHostProvider({ host, children }: { host: DatabaseHost; children: ReactNode }) {
  return <DatabaseHostContext.Provider value={host}>{children}</DatabaseHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the Database tool would not render. */
export function useDatabaseHost(): DatabaseHost {
  const host = useContext(DatabaseHostContext);
  if (!host) throw new Error('The Database feature must be rendered inside <DatabaseHostProvider>');
  return host;
}
