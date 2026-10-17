import {
  useFrameChrome,
  useMediaKit,
  type FrameDialogs,
  type IconButtonProps,
  type MediaPaneTogglesProps,
  type MediaTooltipProps,
} from '@midnite/studio-frame';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

import {
  useModelHost,
  type ModelIconSelectOption,
  type ModelIconSelectProps,
  type ModelModalProps,
  type ModelTreeSectionProps,
} from './host';

/**
 * The chrome Models draws with (Phase 113 Theme S), resolved through the frame's chrome port, the media kit
 * or the Model host on each render, so the app that composes the feature supplies its own `IconButton`,
 * tooltip, dialogs, modal, tree section and icon select. These thin wrappers keep every call site reading the
 * way it did when the components were imported from the app. The host objects are stable, so the component
 * each wrapper resolves to keeps its identity across renders and nothing remounts.
 */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

/** The app's confirm/prompt/menu dialogs. A hook, like `useDialogs` always was. */
export function useDialogs(): FrameDialogs {
  return useFrameChrome().useDialogs();
}

/** The app's tooltip, through the media kit (the strip and the export toolbar wear the same one). */
export function Tooltip(props: MediaTooltipProps) {
  const { Tooltip: Impl } = useMediaKit();
  return <Impl {...props} />;
}

/** The floating side-pane toggles, through the media kit (Models draws them inside its canvas). */
export function MediaPaneToggles(props: MediaPaneTogglesProps) {
  const { MediaPaneToggles: Impl } = useMediaKit();
  return <Impl {...props} />;
}

export type IconSelectOption = ModelIconSelectOption;

/** The compact icon dropdown: the host's, else a native select with the same options. */
export function IconSelect(props: ModelIconSelectProps) {
  const { IconSelect: Impl } = useModelHost();
  if (Impl) return <Impl {...props} />;
  return <PlainIconSelect {...props} />;
}

function PlainIconSelect({ options, value, onChange, icon: Icon, label, description }: ModelIconSelectProps) {
  return (
    <label title={description ?? label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled ?? false}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The explorer's collapsible group header: the host's, else a plain one. */
export function TreeSection(props: ModelTreeSectionProps) {
  const { TreeSection: Impl } = useModelHost();
  if (Impl) return <Impl {...props} />;
  return <PlainTreeSection {...props} />;
}

function PlainTreeSection({ title, count, collapsible = false, open = true, onToggle, hideWhenEmpty = true, depth = 0, children }: ModelTreeSectionProps) {
  const id = useId();
  if (hideWhenEmpty && count === 0) return null;
  return (
    <section>
      <button
        type="button"
        aria-expanded={collapsible ? open : undefined}
        aria-controls={id}
        onClick={onToggle}
        style={{ paddingLeft: depth * 12 + 4 }}
        className="flex h-7 w-full items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent"
      >
        {collapsible ? open ? <LuChevronDown aria-hidden className="h-3 w-3" /> : <LuChevronRight aria-hidden className="h-3 w-3" /> : null}
        <span className="truncate">{title}</span>
        {count !== undefined ? <span className="tabular-nums text-muted-foreground/70">{count}</span> : null}
      </button>
      <div id={id} hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}

/** The SF3D licence dialog: the host's, else a plain overlay with Escape to close. */
export function Modal(props: ModelModalProps) {
  const { Modal: Impl } = useModelHost();
  if (Impl) return <Impl {...props} />;
  return <PlainModal {...props} />;
}

const MODAL_WIDTH = { sm: 'max-w-[420px]', md: 'max-w-[640px]', lg: 'max-w-[900px]' } as const;

function PlainModal({ open, onClose, title, size = 'md', testId, children }: ModelModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className={`max-h-full w-full ${MODAL_WIDTH[size]} overflow-auto rounded-lg border border-border bg-card shadow-lg outline-none`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
