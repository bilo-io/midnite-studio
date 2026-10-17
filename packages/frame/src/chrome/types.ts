import type { ComponentType, CSSProperties, MouseEventHandler, ReactNode, Ref } from 'react';

/*
  Chrome types — Phase 113 Theme C.

  These are the prop shapes of chrome Studio still implements inside
  `packages/app` (`IconButton`, `ConfirmDialog`, `DialogHost`). They moved
  here, verbatim, ahead of the components themselves, so a feature package can
  name them in its `FrameChrome` port (`chrome-port.tsx`) without importing an
  app. `packages/app`'s components import their own prop types from here, so
  the component and the port's promise cannot drift: change a prop here and
  both sides re-typecheck.
*/

/**
 * A component taking `className`, `strokeWidth` and `style` — the shape every
 * `react-icons` set already has, and the app's own hand-held marks along with
 * them.
 *
 * Declared structurally rather than importing react-icons' `IconType` so this
 * file has no opinion about which set it is handed. That was load-bearing
 * through Phase 36's migration off `lucide-react`: the whole renderer swapped
 * families without this type, `IconButton`, `Tooltip` or the context menus
 * being adapted at all.
 *
 * `style` is here for one reason: an agent's `accent` is roster data, which
 * means it is a colour Tailwind has never seen and can only reach an icon
 * inline. It was already being passed that way before this type admitted it —
 * `SessionIcon` styled `ClaudeIcon` directly, which typechecked only because it
 * named the concrete component rather than the registry it now resolves from.
 */
export type IconComponent = ComponentType<{
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}>;

export type IconButtonProps = {
  icon: IconComponent;
  /**
   * The button's accessible name AND its tooltip text.
   *
   * One prop for both on purpose: an icon-only control whose label is optional
   * is an icon-only control that ships without one. Making the tooltip the
   * label means the visible affordance and the screen-reader name cannot drift.
   */
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  /**
   * Why the button is dead — appended to the tooltip, and the reason the
   * control is marked `aria-disabled` rather than `disabled`.
   *
   * A real `disabled` attribute suppresses mouse events entirely in every
   * engine, so a disabled button cannot raise a tooltip: the one state that
   * most needs explaining is the one state that cannot explain itself. With a
   * reason to give, the button stays hoverable and focusable and swallows the
   * click instead.
   */
  disabledReason?: string;
  /**
   * Swaps the icon for the app's sweeping-ring spinner and blocks the click,
   * without collapsing the layout.
   *
   * The icon used to be spun in place instead, and that reads as the wrong
   * thing on most of the glyphs this button is handed. A rotating trash can,
   * chevron or cloud is not a busy indicator — it is the same symbol, wobbling
   * — and on a radially symmetric mark (a circle, a dot) the rotation is
   * invisible outright, so the one state the user needs to see is the one
   * state that doesn't show. Only `LuRefreshCw` ever looked deliberate, and it
   * looked deliberate because it happens to depict rotation. The spinner is a
   * mark that means exactly one thing, at every call site, whatever glyph the
   * button rests on.
   */
  busy?: boolean;
  /** Rendered after the icon — an ahead/behind count, a chevron. */
  children?: ReactNode;
  /**
   * `danger` tints hover destructive; `ghost` is the quiet toolbar default.
   *
   * `brand` is the odd one out: it rests in `--primary` rather than the muted
   * grey and goes to plain foreground under the pointer — the app's own mark
   * behaving the way the mark does, coloured with the UI at rest and white on
   * dark / black on light when you reach for it. `--primary` because that is
   * already this app's word for "the accent": it is what the selected
   * repository's name takes. With an accent chosen the two states are the
   * accent and then the foreground; with the default accentless theme
   * `--primary` IS the full-contrast colour, so they differ only by the hover
   * tint — which is still the mark standing out from its two grey neighbours,
   * and is the behaviour the accent picker exists to change.
   *
   * Deliberately a tone rather than a `className`: both halves are text
   * colours, so passing them in would put `text-primary` and the base
   * `text-muted-foreground` in the same slot and leave the winner to whichever
   * Tailwind emitted last.
   *
   * `git` is `brand`'s sibling for a mark that isn't this app's own: the Git
   * logo's actual colour rather than a theme token, because it identifies
   * *git* specifically and has to stay recognisable as that regardless of
   * which accent the user has picked.
   */
  tone?: 'ghost' | 'danger' | 'brand' | 'git';
  size?: 'sm' | 'md';
  tooltipSide?: 'top' | 'bottom';
  className?: string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
  /**
   * Forwarded onto the `<button>` alongside the `aria-*` pair below.
   *
   * Every call site before Phase 79's Clear-conversation control was reachable
   * from its `label` alone — `getByRole('button', {name})` — so this was never
   * needed. A header whose controls are all icon-only and whose labels are
   * sentences is the case that wants a stable hook instead, and the rest spread
   * already put it on the DOM node; only the type was refusing it.
   */
  'data-testid'?: string;
  /**
   * Forwarded straight to the underlying `<button>` — React 19 needs no
   * `forwardRef` wrapper for this. `Tooltip` clones its child to install its
   * own measuring ref and already merges it with whatever ref the child
   * carried (`assignRef`, `tooltip.tsx`) precisely so a caller here can still
   * get the real node, the way `code-editor.tsx`'s "leaving edit mode returns
   * focus to the Edit button" needs (`file-preview.tsx`'s Edit button is
   * unmounted and remounted across the toggle, not kept in place, so nothing
   * upstream can hold a stable reference to it without this).
   */
  ref?: Ref<HTMLButtonElement>;
};


/**
 * Confirmation for a destructive operation, with its blast radius.
 *
 * The number is the entire point. "Are you sure?" is a question nobody can
 * answer — it asks the user to re-derive what the app already knows. "This will
 * orphan 14 commits, including 'fix the parser'" is a decision.
 *
 * Rendered in-app rather than as a native dialog for the same reason as the
 * context menu: it has to carry the app's own tokens and its own content.
 */
export type BlastRadius = {
  count: number;
  sample: { sha: string; subject: string }[];
};


/**
 * The phrasings `ConfirmDialog` has for a blast radius — one entry of its
 * `BLAST_RADIUS_COPY` each, which `satisfies Record<BlastRadiusKind, …>` so a
 * new kind cannot be named here without copy to render it.
 */
export type BlastRadiusKind = 'commits' | 'files' | 'trash' | 'systemCache' | 'secrets' | 'issue' | 'project' | 'cookies' | 'credentials' | 'vaultAccess';

export type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Absent while still being counted; null when there is nothing to lose. */
  blastRadius?: BlastRadius | null;
  /** Which `BLAST_RADIUS_COPY` entry renders `blastRadius`'s count. Defaults to `'commits'` — every pre-Phase-59 caller is a git op. */
  blastRadiusKind?: BlastRadiusKind;
  /**
   * Consequences that are not measured in commits.
   *
   * `blastRadius` speaks one sentence — "N commits will no longer be reachable"
   * — which is exactly right for a delete or a reset and exactly wrong for
   * "this checkout has 3 uncommitted files" or "the branch is 2 ahead of its
   * upstream". Rather than bend that sentence, a destructive op can hand over
   * its own lines; they render in the same alarming box, so the user reads one
   * warning region either way.
   */
  warnings?: string[];
  /**
   * When present, renders a checkbox with this exact label between the
   * warnings box and the button row, and the Confirm button stays `disabled`
   * until it is checked. The first friction beyond a plain button click in
   * this dialog — reserved for the one operation in the app with true
   * no-undo (emptying the Trash).
   */
  requireAck?: string;
  /**
   * Drop the Cancel button, for a dialog with nothing to cancel.
   *
   * A notice — "this is not built yet" — has one way out, and offering both
   * Cancel and OK asks the reader to choose between two words that mean the
   * same thing here. See `notify` in `dialog-host`.
   */
  hideCancel?: boolean;
  /**
   * Render inside this (positioned) element rather than over the window — the
   * scrim covers only it and the dialog centres in it. See `Modal`'s `container`.
   */
  container?: HTMLElement | null;
  onConfirm: () => void;
  /**
   * A third way out, between Cancel and the primary action — Discard beside
   * Save/Cancel on the unsaved-changes guard, the only caller today. Absent
   * everywhere else, which keeps every existing two-button confirm unchanged.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * The part of `DialogHost`'s `useDialogs()` a feature may reach through the
 * chrome port. A subset on purpose: menus and prompts stay off the port until
 * a feature needs them, so the promise a composer must keep stays small.
 */
/** One row of an {@link FrameDialogs.openMenu} menu — the subset every app's menu supports. */
export type FrameMenuItem = {
  label: string;
  description?: string;
  disabled?: boolean;
  /** A leading glyph, where the app's menu draws one. */
  icon?: IconComponent;
  /** Tints the row destructive. */
  danger?: boolean;
  /** Why a `disabled` row is dead, shown as its tooltip. */
  disabledReason?: string;
  onSelect: () => void;
};

/** A row that opens a nested menu instead of acting (Phase 113 Theme S — the Models explorer's "Move to"). */
export type FrameSubmenuItem = {
  label: string;
  description?: string;
  icon?: IconComponent;
  danger?: boolean;
  submenu: FrameMenuEntry[];
};

/** A menu row, a submenu parent, or a divider between groups (Phase 113 Theme N — the Graphs list's row menu). */
export type FrameMenuEntry = FrameMenuItem | FrameSubmenuItem | { type: 'separator' };

/** A one-field text prompt ("New project" → a name) — the subset of Studio's `PromptRequest` a feature uses. */
export type FramePromptRequest = {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  placeholder?: string;
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
};

export type FrameDialogs = {
  /**
   * A one-field text prompt. Optional like `openMenu`: Studio's host and the
   * suite kit's `createDialogs` provide it; a control that needs it hides
   * without it (Phase 113 Theme Q — media's "New project").
   */
  prompt?: (request: FramePromptRequest) => void;
  /**
   * A small menu at a point. Optional: only an app with a context-menu host
   * (Studio) provides it; a feature falls back to acting directly without it.
   */
  openMenu?: (point: { clientX: number; clientY: number }, items: FrameMenuEntry[]) => void;
  confirm: (request: ConfirmRequest) => void;
  notify: (notice: { title: string; body?: string; okLabel?: string }) => void;
  setBlastRadius: (radius: ConfirmRequest['blastRadius'], warnings?: string[]) => void;
  close: () => void;
};
