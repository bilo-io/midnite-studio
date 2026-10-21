import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import { layerRank, registerDismiss, type DismissLayer } from './use-dismiss';

/**
 * Every way a menu, popover or picker gets dismissed, implemented once.
 *
 * Before this, each gradient-border surface wired its own subset: the context
 * menu listened for `mousedown` (which never arrives when something on the
 * page calls `preventDefault` on `pointerdown` first — a canvas, a drag
 * handle, xterm), the quick-access menu listened for nothing at all, and a
 * menu opened by a button had no idea which button that was, so the
 * `pointerdown` that dismissed it and the `click` that followed reopened it
 * straight away. The fix lives here so the rules cannot drift between them:
 *
 * - **Escape** closes the innermost open surface and returns focus to its
 *   trigger. Delivered through `useDismiss`'s stack, so it still loses to a
 *   dialog above it and still leaves the terminal alone when nothing is open.
 * - **A `pointerdown` outside the whole tree** closes the whole tree. The
 *   trigger counts as inside, so its own click can toggle the surface shut.
 * - **Focus moving outside the tree** closes it: a `focusin` anywhere else,
 *   Tab (`tab: 'close'` for a menu, `'edges'` for a panel of controls), and —
 *   with `windowBlur` — the window itself losing focus.
 *
 * **The tree.** A surface rendered inside another's `DismissableScope` is its
 * child, wherever the DOM puts it: a portalled submenu is still "inside" its
 * menu, and a click in either counts as inside for both. That is why
 * containment is a walk over the registered surfaces rather than
 * `parent.contains(target)`. A surface opened from *outside* React's tree of
 * another (a `DialogHost` menu launched from a popover's content) adopts the
 * open surface its trigger — or, failing one, the focused element — sits in.
 */

export type DismissReason = 'escape' | 'outside' | 'focus-out' | 'window-blur' | 'tab' | 'select';

/** Anything that can say which element opened a surface. */
export type TriggerSource =
  RefObject<Element | null> | Element | null | undefined | (() => Element | null | undefined);

export type DismissableOptions = {
  open: boolean;
  /**
   * Called once per dismissal. Return `false` to veto — the context menu uses
   * this so its first Escape clears a filter query instead of closing.
   */
  onDismiss: (reason: DismissReason) => boolean | void;
  /** The surface's own element. Portalled or not, it is what "inside" means. */
  surfaceRef: RefObject<HTMLElement | null>;
  /** What opened it: counts as inside, and gets focus back on Escape/Tab. */
  trigger?: TriggerSource;
  /** `useDismiss` layer. A child never ranks below its parent. Default `'menu'`. */
  layer?: DismissLayer;
  /** Whether Escape is this hook's to handle. `false` for a focused input's own popup. */
  escape?: boolean;
  /**
   * `'close'` — any Tab leaves (a `role="menu"`: arrows move, Tab exits).
   * `'edges'` — Tab past the last control or Shift+Tab before the first
   * leaves (a panel of form controls, which Tab has to walk). `'none'` — Tab
   * is somebody else's (a combobox that accepts on Tab).
   */
  tab?: 'close' | 'edges' | 'none';
  /** Close when the window loses focus — right for a context menu. */
  windowBlur?: boolean;
  /**
   * Whether this surface hides the native browser view. Defaults to `true`
   * for a root and `false` for a child, whose root already does.
   */
  occludes?: boolean;
};

export type DismissableNode = {
  parent: DismissableNode | null;
  /**
   * `true` when the parent was adopted (no `DismissableScope` — see the file
   * header) rather than declared. An adopted child still keeps its parent
   * open, but closes on a click anywhere outside its *own* subtree, parent
   * included: a `DialogHost` menu launched from a popover is a separate
   * menu, not a submenu of it, and clicking elsewhere in the popover is
   * clicking away from it.
   */
  adopted: boolean;
  children: Set<DismissableNode>;
  options: DismissableOptions;
  /** Dismiss this node's whole tree, deepest first — "a leaf was chosen". */
  closeAll: () => void;
};

const Scope = createContext<DismissableNode | null>(null);

/** Makes every `useDismissable` rendered inside it a child of `node`. */
export function DismissableScope({
  node,
  children,
}: {
  node: DismissableNode;
  children?: ReactNode;
}) {
  return createElement(Scope.Provider, { value: node }, children);
}

const openNodes = new Set<DismissableNode>();

function resolveTrigger(source: TriggerSource): Element | null {
  if (!source) return null;
  if (typeof source === 'function') return source() ?? null;
  if (source instanceof Element) return source;
  return source.current ?? null;
}

function rootOf(node: DismissableNode): DismissableNode {
  let current = node;
  while (current.parent) current = current.parent;
  return current;
}

function depthOf(node: DismissableNode): number {
  let depth = 0;
  for (let current = node.parent; current; current = current.parent) depth += 1;
  return depth;
}

function effectiveLayer(node: DismissableNode): DismissLayer {
  const own = node.options.layer ?? 'menu';
  if (!node.parent) return own;
  const inherited = effectiveLayer(node.parent);
  return layerRank(inherited) > layerRank(own) ? inherited : own;
}

/** The subtree, children before their parent — the order a chain closes in. */
function postorder(node: DismissableNode, into: DismissableNode[] = []): DismissableNode[] {
  for (const child of node.children) postorder(child, into);
  into.push(node);
  return into;
}

function surfaceOf(node: DismissableNode): HTMLElement | null {
  return node.options.surfaceRef.current;
}

/** The one containment check: any surface, or any trigger, in `root`'s subtree. */
function treeContains(root: DismissableNode, target: Node): boolean {
  for (const node of postorder(root)) {
    if (surfaceOf(node)?.contains(target)) return true;
    if (resolveTrigger(node.options.trigger)?.contains(target)) return true;
  }
  return false;
}

/** Whether `target` is inside any open menu tree at all. */
export function isInsideOpenMenuTree(target: Node): boolean {
  for (const root of openRoots()) if (treeContains(root, target)) return true;
  return false;
}

/**
 * Whether keyboard focus currently sits inside an open menu tree (a surface
 * or its trigger).
 *
 * For code that moves focus of its own accord — the terminal's
 * focus-follows-selection effect, which fires whenever a session turns
 * `ready`. That is asynchronous, so it can land after the user has already
 * opened a menu, and a `focusin` outside the tree reads as focus leaving: the
 * menu they just opened closes under them. Checking this first leaves focus
 * where the user put it.
 */
export function focusIsInOpenMenuTree(): boolean {
  if (openNodes.size === 0 || typeof document === 'undefined') return false;
  const active = document.activeElement;
  return active !== null && active !== document.body && isInsideOpenMenuTree(active);
}

function openRoots(): DismissableNode[] {
  const roots = new Set<DismissableNode>();
  for (const node of openNodes) roots.add(rootOf(node));
  return [...roots];
}

/** The deepest open node whose own surface holds `target`. */
function deepestHolding(target: Node): DismissableNode | null {
  let best: DismissableNode | null = null;
  let bestDepth = -1;
  for (const node of openNodes) {
    if (!surfaceOf(node)?.contains(target)) continue;
    const depth = depthOf(node);
    if (depth > bestDepth) {
      best = node;
      bestDepth = depth;
    }
  }
  return best;
}

function focusTrigger(node: DismissableNode): boolean {
  const trigger = resolveTrigger(node.options.trigger);
  if (!(trigger instanceof HTMLElement) || !trigger.isConnected) return false;
  trigger.focus({ preventScroll: true });
  return true;
}

function dismissNode(node: DismissableNode, reason: DismissReason): boolean {
  if (!openNodes.has(node)) return false;
  return node.options.onDismiss(reason) !== false;
}

function dismissTree(root: DismissableNode, reason: DismissReason): void {
  for (const node of postorder(root)) dismissNode(node, reason);
}

// ── The shared listeners — installed while anything is open ───────────────

/**
 * Close every tree `target` is outside of; inside one, still close any
 * adopted subtree it is outside of (see `DismissableNode.adopted`).
 */
function dismissAwayFrom(target: Node, reason: DismissReason): void {
  for (const root of openRoots()) {
    if (!treeContains(root, target)) {
      dismissTree(root, reason);
      continue;
    }
    for (const node of postorder(root)) {
      if (node.adopted && openNodes.has(node) && !treeContains(node, target)) {
        dismissTree(node, reason);
      }
    }
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node) dismissAwayFrom(event.target, 'outside');
}

/**
 * `focusin` rather than `focusout`: it names where focus *went*, and it does
 * not fire when focus merely falls to `<body>` (an element unmounting), which
 * is not the user moving anywhere.
 */
function onFocusIn(event: FocusEvent): void {
  if (event.target instanceof Node) dismissAwayFrom(event.target, 'focus-out');
}

function onWindowBlur(event: FocusEvent): void {
  // Only the window's own blur counts, not an element's. Tested as "not a
  // node" rather than `=== window`: under jsdom the dispatched target is the
  // implementation's window object, not the global the test sees.
  if (event.target instanceof Node) return;
  for (const root of openRoots()) {
    if (postorder(root).some((node) => node.options.windowBlur)) dismissTree(root, 'window-blur');
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Capture phase on `document`, so it runs ahead of `useFocusTrap`'s listener
 * on the surface itself — the trap would otherwise wrap focus back round
 * before this could see it leave.
 */
function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  const node = deepestHolding(target);
  if (!node) return;
  const mode = node.options.tab ?? 'close';
  if (mode === 'none') return;

  if (mode === 'edges') {
    const surface = surfaceOf(node);
    const focusable = surface ? [...surface.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const atEdge = event.shiftKey
      ? !first || target === first || target === surface
      : !last || target === last;
    if (!atEdge) return;
  }

  const root = rootOf(node);
  event.stopImmediatePropagation();
  // Focus the trigger *before* the default action runs: a forward Tab then
  // carries on from it to the next control, exactly as if the menu had never
  // been in the way. Shift+Tab stops on the trigger itself.
  const moved = focusTrigger(root);
  if (!moved || event.shiftKey) event.preventDefault();
  dismissTree(root, 'tab');
}

let listening = false;

function syncListeners(): void {
  const want = openNodes.size > 0;
  if (want === listening) return;
  listening = want;
  if (want) {
    window.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur);
  } else {
    window.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onWindowBlur);
  }
  // Title-bar drag regions swallow clicks before the page sees them, so a
  // click on empty title bar could never count as "outside". `styles.css`
  // lifts `-webkit-app-region: drag` while this attribute is set.
  if (want) document.documentElement.setAttribute('data-dismissable-open', '');
  else document.documentElement.removeAttribute('data-dismissable-open');
}

// ── The hook ──────────────────────────────────────────────────────────────

/**
 * Register a menu, popover or picker for every dismissal rule above, for as
 * long as `open`. Returns the node to hand to `DismissableScope` so surfaces
 * rendered inside it (submenus) join this one's tree.
 *
 * **Call it before `useFocusTrap`.** Effect cleanups run in declaration
 * order, and the trap's cleanup moves focus back outside the surface; with
 * the trap first, that `focusin` lands while these listeners are still armed
 * and reads as focus leaving — which StrictMode's mount/unmount/mount turns
 * into a menu that closes the moment it opens.
 */
export function useDismissable(options: DismissableOptions): DismissableNode {
  const scopeParent = useContext(Scope);
  const nodeRef = useRef<DismissableNode | null>(null);
  if (!nodeRef.current) {
    const node: DismissableNode = {
      parent: null,
      adopted: false,
      children: new Set(),
      options,
      closeAll: () => dismissTree(rootOf(node), 'select'),
    };
    nodeRef.current = node;
  }
  const node = nodeRef.current;
  // Latest options, read at event time, so inline callbacks never re-register.
  node.options = options;

  const { open } = options;
  const escape = options.escape ?? true;

  // What had focus as this opened, captured during render: by the time this
  // component's effects run, its children's have already moved focus inside
  // it (a menu focuses its first row), so the effect would only see itself.
  const openerRef = useRef<Element | null>(null);
  const wasOpenRef = useRef(false);
  if (open !== wasOpenRef.current) {
    wasOpenRef.current = open;
    if (open) openerRef.current = typeof document === 'undefined' ? null : document.activeElement;
  }

  useEffect(() => {
    if (!open) return;

    let parent = scopeParent;
    if (!parent) {
      // No React parent: adopt the open surface this one was opened from.
      const from = resolveTrigger(node.options.trigger) ?? openerRef.current;
      parent = from ? deepestHolding(from) : null;
      if (parent === node) parent = null;
      node.adopted = parent !== null;
    }
    node.parent = parent;
    parent?.children.add(node);
    openNodes.add(node);
    syncListeners();

    const occludes = node.options.occludes ?? parent === null;
    const unregister = escape
      ? registerDismiss({
          layer: () => effectiveLayer(node),
          depth: () => depthOf(node),
          blocking: true,
          occludes,
          dismiss: () => {
            if (dismissNode(node, 'escape')) focusTrigger(node);
          },
        })
      : null;

    return () => {
      unregister?.();
      openNodes.delete(node);
      node.parent?.children.delete(node);
      node.parent = null;
      node.adopted = false;
      syncListeners();
    };
  }, [open, escape, scopeParent, node]);

  return node;
}

// ── Trigger inference, for `DialogHost.openMenu` ──────────────────────────

let lastInput: { kind: 'pointer'; target: Element; button: number } | { kind: 'key' } | null = null;
let trackers = 0;

const onTrackPointer = (event: PointerEvent) => {
  if (event.target instanceof Element) {
    // `?? 0`: jsdom has no `PointerEvent`, so a synthetic one carries no
    // `button` at all; every real browser sets it.
    lastInput = { kind: 'pointer', target: event.target, button: event.button ?? 0 };
  }
};
const onTrackKey = () => {
  lastInput = { kind: 'key' };
};

/**
 * Remember the last input so `inferTrigger` can name the control behind an
 * `openMenu` call that only passed coordinates. Ref-counted: one pair of
 * passive listeners however many hosts are mounted.
 */
export function trackTriggerInput(): () => void {
  trackers += 1;
  if (trackers === 1) {
    window.addEventListener('pointerdown', onTrackPointer, { capture: true, passive: true });
    window.addEventListener('keydown', onTrackKey, { capture: true, passive: true });
  }
  return () => {
    trackers -= 1;
    if (trackers === 0) {
      window.removeEventListener('pointerdown', onTrackPointer, { capture: true });
      window.removeEventListener('keydown', onTrackKey, { capture: true });
      lastInput = null;
    }
  };
}

const INTERACTIVE = 'button, a[href], [role="button"], [role="menuitem"], [tabindex]';

/**
 * The control a menu was opened from, or `null` for a right-click — a
 * context menu has a place, not a trigger, and right-clicking the same row
 * again should move it rather than toggle it shut.
 *
 * Most `openMenu` callers pass the React event itself, whose `currentTarget`
 * is exact. The rest pass bare `{clientX, clientY}` computed from a rect, so
 * they fall back to the input that led here: the pointer's target for a
 * primary-button press, the focused element for a keypress.
 */
export function inferTrigger(event: object): Element | null {
  const { currentTarget, type } = event as { currentTarget?: unknown; type?: unknown };
  if (type === 'contextmenu') return null;
  if (currentTarget instanceof Element) return currentTarget;
  if (lastInput?.kind === 'pointer') {
    if (lastInput.button !== 0) return null;
    return lastInput.target.closest(INTERACTIVE) ?? lastInput.target;
  }
  if (lastInput?.kind === 'key') {
    const active = document.activeElement;
    return active && active !== document.body ? active : null;
  }
  return null;
}
