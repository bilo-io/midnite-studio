import { createElement, forwardRef, type FormEventHandler, type HTMLAttributes, type ReactNode } from 'react';

/**
 * The two-region layout every Media detail (right-hand) panel uses: a `MediaPanelBody` that scrolls
 * when the settings do not fit, and an optional `MediaPanelFooter` — the prompt composer — pinned
 * below it.
 *
 * `media-layout.tsx`'s detail pane is `overflow-hidden` (for the rainbow border), so a panel that
 * does not scroll itself is simply clipped on a short window. The body is
 * `min-h-0 flex-1 overflow-y-auto`; the footer is `shrink-0`, so it stays at the panel bottom
 * whatever the content height. A header (a title row, a tier switch) is just a `shrink-0` sibling
 * placed before the body.
 *
 *   <MediaPanelLayout>
 *     <MediaPanelBody className="flex flex-col gap-3 p-3">…settings…</MediaPanelBody>
 *     <MediaPanelFooter className="border-t border-border/50 p-3">…composer…</MediaPanelFooter>
 *   </MediaPanelLayout>
 *
 * `as` lets a panel that is a `<form>` (submit handling, drag/drop) keep being one.
 */
export const MEDIA_PANEL_ROOT = 'flex h-full min-h-0 flex-col';
// `[&>*]:shrink-0`: in a flex-col body a child with its own overflow would otherwise be squashed instead of the body scrolling.
export const MEDIA_PANEL_BODY = 'min-h-0 flex-1 overflow-y-auto [&>*]:shrink-0';
export const MEDIA_PANEL_FOOTER = 'shrink-0';

type RootProps = Omit<HTMLAttributes<HTMLElement>, 'onSubmit'> & {
  as?: 'div' | 'form' | 'section';
  onSubmit?: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
};

export const MediaPanelLayout = forwardRef<HTMLElement, RootProps>(function MediaPanelLayout(
  { as = 'div', className = '', children, ...rest },
  ref,
) {
  return createElement(
    as,
    { ref, 'data-media-panel': '', className: `${MEDIA_PANEL_ROOT} ${className}`.trim(), ...rest },
    children,
  );
});

export function MediaPanelBody({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-media-panel-body="" className={`${MEDIA_PANEL_BODY} ${className}`.trim()} {...rest} />;
}

export function MediaPanelFooter({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div data-media-panel-footer="" className={`${MEDIA_PANEL_FOOTER} ${className}`.trim()} {...rest} />;
}
