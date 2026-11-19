// Shell state (Phase 146 Theme F): which overlay is open, and the per-tab title-bar action slot. Screens built in
// Themes G to J plug into the shell through `useTitleBarAction`; nothing else here is theirs to touch.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ShellApi {
  panelOpen: boolean;
  setPanelOpen(open: boolean): void;
  switcherOpen: boolean;
  setSwitcherOpen(open: boolean): void;
  dialOpen: boolean;
  setDialOpen(open: boolean): void;
  action: ReactNode;
  setAction(node: ReactNode): void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
  const [action, setAction] = useState<ReactNode>(null);
  const api = useMemo(
    () => ({ panelOpen, setPanelOpen, switcherOpen, setSwitcherOpen, dialOpen, setDialOpen, action, setAction }),
    [panelOpen, switcherOpen, dialOpen, action],
  );
  return <ShellContext.Provider value={api}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside ShellProvider');
  return ctx;
}

/**
 * A screen's action in the title bar (left of the avatar), for example the Tasks view switch on a narrow screen.
 * The node is set while the screen is mounted and cleared when it unmounts, so a tab never leaves its action behind.
 * Pass a memoised node: a new element every render re-sets the slot every render.
 */
export function useTitleBarAction(node: ReactNode): void {
  const { setAction } = useShell();
  useEffect(() => {
    setAction(node);
    return () => setAction(null);
  }, [node, setAction]);
}
