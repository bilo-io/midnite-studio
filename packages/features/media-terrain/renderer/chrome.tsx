import { useFrameChrome, type FrameDialogs, type IconButtonProps } from '@midnite/studio-frame';
import { useEffect } from 'react';

import { useTerrainHost, type TerrainChrome, type TerrainModalProps, type TerrainSelectProps } from './host';

/**
 * The frame chrome Terrain draws with (Phase 113 Theme S), reached through the frame's chrome port so the
 * app that composes the feature supplies its own `IconButton` and dialogs. These thin wrappers keep every
 * call site reading the way it did when the components were imported from the app.
 */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

/** The app's confirm/prompt/menu dialogs. A hook, like `useDialogs` always was. */
export function useDialogs(): FrameDialogs {
  return useFrameChrome().useDialogs();
}

/** A bare overlay: Escape closes it, a click on the backdrop closes it. What an app with no Modal of its own gets. */
function PlainModal({ open, onClose, title, role = 'dialog', testId, children }: TerrainModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role={role} aria-modal="true" aria-label={title} data-testid={testId} className="w-[28rem] max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
        {children}
      </div>
    </div>
  );
}

/** A native select with the icon beside it. */
function PlainSelect({ options, value, onChange, icon: Icon, label }: TerrainSelectProps) {
  return (
    <label className="flex h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-xs text-foreground">
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-xs outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const DEFAULT_CHROME: TerrainChrome = { Modal: PlainModal, Select: PlainSelect };

/** The app's chrome member, else the plain one. Stable per host, so it is safe to render as a component. */
export function useTerrainChrome(): TerrainChrome {
  const { chrome } = useTerrainHost();
  return { ...DEFAULT_CHROME, ...chrome };
}
