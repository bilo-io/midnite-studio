# Phase 62 — One Escape, one dismissal

Twenty-four hand-rolled Escape handlers, no two of which agree, and **no notion anywhere in the
renderer of which overlay is on top**. This phase builds that notion once, in about thirty lines,
and moves the eighteen window-scoped handlers onto it.

The app already knows the question is unanswered and says so out loud. From
[`store/palette-store.ts:115`](../../../packages/app/src/store/palette-store.ts):

> *Refuses to open over a modal dialog rather than stacking two overlays that both trap focus and
> both listen for Escape — the whole nesting question, avoided in one check.*

That refusal is the only defence in the codebase, and it is a blunt one: it protects the palette and
nothing else. Everywhere else the overlays simply do not know about each other.

**Three things are true, and each is checkable in a minute.**

1. **`stopPropagation()` is inert here.** `popover.tsx:157` and `palette.tsx:253` call it; nothing
   else does. But both listeners are on `window`, and `stopPropagation` does not stop *sibling*
   listeners on the same target — that needs `stopImmediatePropagation`, and
   `grep -rn "stopImmediatePropagation" packages/app/src` returns **zero hits**. So the two overlays
   that try to be well-behaved are not.
2. **One Escape really does dismiss two things**, by three reachable paths:
   - **Graph selection + context menu.** [`graph-view.tsx:79`](../../../packages/app/src/features/graph/graph-view.tsx)
     mounts a `window` listener whenever `graphSelection` is non-null; right-clicking a row raises a
     `ContextMenu` (`graph-view.tsx:137`) **without clearing the selection**. One Escape closes the
     menu *and* calls `selectCommit(null)`. The user loses their selection for pressing Escape once.
   - **Board card + context menu.** [`board-view.tsx:382`](../../../packages/app/src/features/projects/board/board-view.tsx)
     handles Escape on the board `<div>` and calls `preventDefault()` but **not**
     `stopPropagation()`. `ContextMenu` portals to `<body>` and focuses nothing, so the keydown
     bubbles from the card, through the board, to `window`. Selection cleared and menu closed.
   - **Toast + any dialog.** `ToastHost` is mounted for the app's whole lifetime and
     [`toast-host.tsx:93`](../../../packages/app/src/components/toast-host.tsx) has no notion of
     anything above it, so Escape over a `ConfirmDialog` dismisses the toast *and* cancels the dialog.
3. **Four blocking overlays never register as occluders.** `confirm-dialog`, `prompt-dialog`,
   `palette` and `tooltip` skip the `incrementOccluders`/`decrementOccluders` pair that
   [`popover.tsx:185`](../../../packages/app/src/components/popover.tsx) and `context-menu.tsx`
   perform. [`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts)
   hides the native `WebContentsView` on `occluders > 0` — so a confirm dialog raised over a live
   browser tab is painted **underneath a web page**, with no way to reach it.

The third belongs in this phase rather than a separate one because it has the same cause and the
same cure: *every overlay that consumes Escape is an overlay that occludes*, and the two duties are
one registration. Folding them together is what makes this a thirty-line hook rather than two.

The model is deliberately not novel — [`use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts)
already solved the sibling problem in this codebase, with 11 consumers and a test beside it. This is
that shape, with the one divergence the problem forces: focus trapping is answerable from a single
ref, and "am I topmost" is not.

**Builds on.**
- [`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) —
  `useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void`. One named export, a
  `void` return, a module-level policy const (`FOCUSABLE`), an `active` gate, a sibling
  `use-focus-trap.test.ts`. Copy this shape exactly.
- [`store/ui-store.ts:670`](../../../packages/app/src/store/ui-store.ts) — `occluders: number`,
  `incrementOccluders`, `decrementOccluders`, floored at 0. A *count*, not a stack: it can say
  something is up, never which. The new stack sits beside it and drives it.
- [`tailwind.config.ts:108`](../../../packages/app/tailwind.config.ts) — the z-index scale that
  already decides what paints on top: `z-browser` 45 · `z-menu` 80 · `z-popover` 85 · `z-dialog` 90 ·
  `z-toast` 92 · `z-tooltip` 95. The dismissal layers are named after these, deliberately.
- [`components/toast-host.test.tsx:77`](../../../packages/app/src/components/toast-host.test.tsx) —
  *"Escape dismisses only the topmost toast"*, the one existing test that asserts a stacking rule.
  It is the pattern the new tests generalise, and it must keep passing.
- [`components/context-menu.test.tsx`](../../../packages/app/src/components/context-menu.test.tsx) —
  the occluder bookkeeping assertion (`occluders` 0 → render → 1 → unmount → 0). Every migrated
  blocking overlay gets this same assertion.

**Scope guardrails.**
- **`packages/app` only.** No IPC channel, no `shared` schema, no `desktop` change, no new dependency.
- **Behaviour is preserved, not redesigned.** Every overlay dismisses on exactly the key it does
  today. The only intended behaviour *change* is that one Escape now dismisses one thing.
- **Element-scoped input handlers are not migrated.** `find-bar`, `tab-strip`'s rename,
  `file-tree`'s rename and `comment-composer` handle Escape on a focused `<input>`/`<textarea>` and
  are correct as they are. They get a `stopPropagation()` audit (Theme C) and nothing else.
- **`components/modal.tsx` is not built here.** [Phase 58](phase-58-notes-and-the-menu.md) Theme B
  owns that rendering primitive; this phase owns dismissal. They are complementary — `Modal` becomes
  a *consumer* of `useDismiss`. See Decision 6 for what the second-lander has to do.
- **No new `*-shots.spec.ts`.** [Phase 56](phase-56-e2e-speed-run.md) Theme G is mid-flight
  refactoring all 25 of them onto a shared helper; adding a 26th would collide.
- **`passcode-pad.tsx`'s raw `z-[110]` stays raw.** Bringing the screensaver into the scale is a real
  tidy and an unrelated one.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The stack, and the hook that joins it (M) — ✅ DONE (PR #PENDING, 2026-09-05)

> **Landed note — the hook is `useDismiss`, and outside-click stayed out.** Decision 8's
> recommendation was taken literally: the name is `useDismiss`, not `useEscape`, so adding
> outside-click later is a new field on `DismissOptions` rather than a rename across seventeen
> files. Outside-click itself is **deliberately not in this batch** — `popover` and `context-menu`
> keep their own `pointerdown` listeners, exactly as *Not in this phase* says.

- [x] Add [`packages/app/src/components/use-dismiss.ts`](../../../packages/app/src/components/use-dismiss.ts)
      — **new.** One named export:
      `export function useDismiss(active: boolean, onDismiss: () => void, options?: DismissOptions): void`,
      with `export type DismissOptions = { layer?: DismissLayer; blocking?: boolean }` and
      `export type DismissLayer = 'inline' | 'menu' | 'popover' | 'dialog' | 'toast' | 'tooltip'`.
      Ref-free on purpose: three of the handlers being fixed (`graph-view`, `board-view`,
      `browser-pane`) have no overlay element at all, so a `useFocusTrap`-style ref parameter would
      exclude exactly the cases that need it.
- [x] **One `window` listener for the whole app, not one per overlay.** The module holds
      `const stack: DismissEntry[] = []`; the hook pushes on activate and splices on deactivate. The
      single `keydown` listener is installed when the stack goes from empty to non-empty and removed
      when it empties. This — not `stopPropagation` — is what makes "one Escape, one dismissal" true,
      and it is why the phase does not simply sprinkle `stopImmediatePropagation` around.
- [x] **The delivery rule, stated once and implemented once:** Escape goes to the topmost
      **blocking** entry; if the stack holds no blocking entry, it goes to the topmost **passive**
      one; if the stack is empty, nothing happens and the event is untouched. "Topmost" is
      (highest `layer` in the `DismissLayer` order above, then latest registration).
- [x] `blocking` defaults to `true`. Passive entries are `toast` and `tooltip` and nothing else:
      they paint above a dialog but must not steal its Escape. A user pressing Escape to cancel a
      destructive confirm must cancel it, not dismiss an unrelated toast — that is the whole reason
      the flag exists rather than plain z-order.
- [x] **`blocking` also drives occlusion.** A blocking entry calls
      `useUiStore.getState().incrementOccluders()` on push and `decrementOccluders()` on splice;
      a passive one does neither. One registration, two duties — which is what fixes the four
      overlays in Theme B that occlude nothing today, without a second bookkeeping call at each site.
- [x] The handler calls `event.preventDefault()` and `event.stopImmediatePropagation()` before
      invoking `onDismiss`, so a not-yet-migrated handler on `window` cannot also fire. This is the
      migration safety net: Themes B and C can land incrementally without an intermediate state where
      Escape does *nothing*.
- [x] `onDismiss` is read through a ref inside the hook so a caller passing an inline arrow does not
      re-register the entry on every render. `useFocusTrap`'s `[ref, active]` deps work because both
      are stable; an inline callback is not, and a stack that re-orders itself on every keystroke
      would silently break the topmost rule.
- [x] Add `packages/app/src/components/use-dismiss.test.ts` in the shape of
      [`use-focus-trap.test.ts`](../../../packages/app/src/components/use-focus-trap.test.ts)
      (`renderHook`, no jsdom setup file — this project has **no** `setupFiles` and no
      `@testing-library/jest-dom`, so assertions read `expect(x).not.toBeNull()`): two blocking
      entries, Escape dismisses only the later; a passive entry above a blocking one does not steal
      it; deactivating the top hands delivery to the next; an empty stack leaves the event alone;
      `occluders` returns to 0 after every blocking entry unmounts.
- [x] Add `packages/app/src/components/use-dismiss.test.ts` coverage for the listener lifecycle: a
      spy on `window.addEventListener`/`removeEventListener` sees **exactly one** `keydown`
      registration across three simultaneous overlays, and zero once they all close.

### B — The overlays move onto it (M) — ✅ DONE (PR #PENDING, 2026-09-05)

Eighteen window/document-scoped handlers across seventeen files. Each migration is: delete the
`useEffect` + listener, call `useDismiss`, keep the close function exactly as it is.

- [x] `layer: 'menu'` — [`context-menu.tsx:111`](../../../packages/app/src/components/context-menu.tsx),
      [`theme-toggle.tsx:66`](../../../packages/app/src/components/theme-toggle.tsx),
      [`multi-select-menu.tsx:75`](../../../packages/app/src/components/multi-select-menu.tsx).
      `context-menu.tsx` **drops its own `incrementOccluders` pair** — the hook owns it now — and its
      `mousedown`/`resize` listeners stay where they are; this phase moves Escape and nothing else.
- [x] `layer: 'popover'` — [`popover.tsx:157`](../../../packages/app/src/components/popover.tsx).
      Drops its `stopPropagation()` (now inert and redundant) and its occluder pair. Its
      `pointerdown`-capture and `scroll`-capture listeners are untouched.
- [x] `layer: 'dialog'` — [`confirm-dialog.tsx:72`](../../../packages/app/src/components/confirm-dialog.tsx),
      [`prompt-dialog.tsx:42`](../../../packages/app/src/components/prompt-dialog.tsx),
      [`palette.tsx:253`](../../../packages/app/src/components/palette.tsx),
      [`merge-dialog.tsx:82`](../../../packages/app/src/features/reviews/merge-dialog.tsx),
      [`stash-push-dialog.tsx:36`](../../../packages/app/src/features/status/stash-push-dialog.tsx),
      [`browser-launcher.tsx:58`](../../../packages/app/src/features/browser/browser-launcher.tsx).
      The first three gain occluder registration they never had — that is the Fact-3 fix, and it
      arrives free with the migration rather than as six extra call sites.
- [x] `layer: 'toast'`, `blocking: false` — [`toast-host.tsx:93`](../../../packages/app/src/components/toast-host.tsx).
      Its existing "only the topmost toast" behaviour becomes an *inner* rule: the host registers one
      passive entry and still dismisses `toasts[toasts.length - 1]`.
      **`toast-host.test.tsx:77` must pass unchanged** — it is the regression guard for this item.
- [x] `layer: 'tooltip'`, `blocking: false` — [`tooltip.tsx:118`](../../../packages/app/src/components/tooltip.tsx).
      Passive because a tooltip must never hide the browser pane, and must never eat the Escape a
      user meant for the dialog underneath it.
- [x] `layer: 'inline'` — [`graph-view.tsx:81`](../../../packages/app/src/features/graph/graph-view.tsx)
      (`selectCommit(null)`), [`code-preview.tsx:97`](../../../packages/app/src/features/files/preview/code-preview.tsx)
      (the find bar), [`deck.tsx:48` and `:59`](../../../packages/app/src/features/slides/deck.tsx)
      (help overlay, then exit — registered as two entries so the help overlay closes first, which
      is what the current ordering accidentally achieves and must keep achieving).
      `graph-view` at `inline` is the direct fix for the first double-dismiss path.
- [x] [`browser-pane.tsx:109`](../../../packages/app/src/features/browser/browser-pane.tsx) —
      the `[]`-deps listener that is live for every Escape ever pressed, open or not. It becomes
      `useDismiss(shown, () => setBrowserOpen(false), { layer: 'inline' })`, so it is registered only
      while the pane is actually shown. Its existing comment says the missing `stopPropagation` is
      deliberate; replace that comment rather than leaving it to contradict the new mechanism.
- [x] [`passcode-pad.tsx:250`](../../../packages/app/src/features/screensaver/passcode-pad.tsx) —
      the only `document`-scoped handler. Migrates to `layer: 'dialog'`. Its raw `z-[110]` is left
      alone; this item changes which listener dismisses it, not where it paints.
- [x] Every migrated **blocking** overlay gets the occluder assertion from
      [`context-menu.test.tsx`](../../../packages/app/src/components/context-menu.test.tsx) added to
      its own spec: `occluders` is 0, 1 while mounted, 0 after unmount.
- [x] `grep -rn "key === 'Escape'" packages/app/src` returns only the six element-scoped handlers of
      Theme C and the hook itself. That grep is the acceptance criterion for this theme.

### C — The element-scoped handlers stop leaking (S) — ✅ DONE (PR #PENDING, 2026-09-05)

Six handlers on focused elements. They are correct — Escape on a focused rename input should cancel
the rename — but two of them let the event continue to `window`.

- [x] [`board-view.tsx:258`](../../../packages/app/src/features/projects/board/board-view.tsx) —
      add `event.stopPropagation()` beside its existing `preventDefault()`. This is the second
      double-dismiss path, and it is a one-line fix.
      `board-view.test.tsx:551` ("Escape closes the detail pane and returns focus to the card")
      must still pass.
- [x] [`workflow-canvas.tsx:242`](../../../packages/app/src/features/workflows/canvas/workflow-canvas.tsx) —
      same one-line addition; `workflow-canvas.test.tsx:103` is its guard.
- [x] [`find-bar.tsx:49`](../../../packages/app/src/features/browser/find-bar.tsx),
      [`tab-strip.tsx:305`](../../../packages/app/src/features/browser/tab-strip.tsx),
      [`file-tree.tsx:426`](../../../packages/app/src/features/files/file-tree.tsx),
      [`comment-composer.tsx:60`](../../../packages/app/src/features/reviews/comment-composer.tsx) —
      audit only. `tab-strip`, `file-tree` and `comment-composer` already stop propagation; confirm
      `find-bar` does and add it if not. **Do not migrate any of these to `useDismiss`** — an input's
      Escape belongs to the input.
- [x] Write the rule down in `use-dismiss.ts`'s docstring so the next author does not migrate them
      by mistake: *a handler on a focused input stays on that input and stops there; `useDismiss` is
      for overlays whose dismissal is not a property of what has focus.*
- [x] Extend [`packages/app/e2e/overlay-stacking.spec.ts`](../../../packages/app/e2e/overlay-stacking.spec.ts)
      — which owns this theme's name and currently asserts only z-index paint order — with the two
      real paths: select a graph row, right-click it, press Escape once, assert the menu is gone
      **and the row is still selected**; and the board equivalent. No screenshots, so no new
      `*-shots.spec.ts` and no collision with Phase 56 Theme G. **Written, not executed** — the
      spec is updated on disk; running it needs a build, which this batch did not do.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/app/src/components/use-dismiss.ts`](../../../packages/app/src/components/use-dismiss.ts) | **new** — the stack, the single listener, the delivery rule |
| `packages/app/src/components/use-dismiss.test.ts` | **new** — ordering, passive/blocking, listener lifecycle, occluder balance |
| [`packages/app/src/components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) | (**unchanged**) — the shape being copied; load-bearing, do not merge the two hooks |
| [`packages/app/src/components/popover.tsx`](../../../packages/app/src/components/popover.tsx) | Escape → hook; drop `stopPropagation` + occluder pair |
| [`packages/app/src/components/context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) | Escape → hook; drop occluder pair |
| [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) · [`prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) · [`palette.tsx`](../../../packages/app/src/components/palette.tsx) | Escape → hook; **gain** occluder registration |
| [`packages/app/src/components/toast-host.tsx`](../../../packages/app/src/components/toast-host.tsx) · [`tooltip.tsx`](../../../packages/app/src/components/tooltip.tsx) | Escape → hook, passive |
| [`packages/app/src/components/theme-toggle.tsx`](../../../packages/app/src/components/theme-toggle.tsx) · [`multi-select-menu.tsx`](../../../packages/app/src/components/multi-select-menu.tsx) | Escape → hook, `menu` |
| [`packages/app/src/features/reviews/merge-dialog.tsx`](../../../packages/app/src/features/reviews/merge-dialog.tsx) · [`status/stash-push-dialog.tsx`](../../../packages/app/src/features/status/stash-push-dialog.tsx) · [`browser/browser-launcher.tsx`](../../../packages/app/src/features/browser/browser-launcher.tsx) | Escape → hook, `dialog` |
| [`packages/app/src/features/graph/graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx) · [`files/preview/code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx) · [`slides/deck.tsx`](../../../packages/app/src/features/slides/deck.tsx) · [`browser/browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) | Escape → hook, `inline` |
| [`packages/app/src/features/screensaver/passcode-pad.tsx`](../../../packages/app/src/features/screensaver/passcode-pad.tsx) | the one `document` listener → hook |
| [`packages/app/src/features/projects/board/board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx) · [`workflows/canvas/workflow-canvas.tsx`](../../../packages/app/src/features/workflows/canvas/workflow-canvas.tsx) | add `stopPropagation()` — one line each |
| [`packages/app/src/features/browser/find-bar.tsx`](../../../packages/app/src/features/browser/find-bar.tsx) · [`browser/tab-strip.tsx`](../../../packages/app/src/features/browser/tab-strip.tsx) · [`files/file-tree.tsx`](../../../packages/app/src/features/files/file-tree.tsx) · [`reviews/comment-composer.tsx`](../../../packages/app/src/features/reviews/comment-composer.tsx) | audit only — no migration |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | (**unchanged**) — `occluders` keeps its exact API; the hook is its only new caller |
| [`packages/app/src/store/palette-store.ts`](../../../packages/app/src/store/palette-store.ts) | (**unchanged**) — its refusal-to-stack check stays; see Decision 5 |
| [`packages/app/e2e/overlay-stacking.spec.ts`](../../../packages/app/e2e/overlay-stacking.spec.ts) | the two double-dismiss paths, asserted |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `pnpm e2e` green with no new `KNOWN_RED` entry.
      **Half done:** typecheck, lint and the unit suites are green (`packages/app` 2358/2358). The
      e2e half was **not executed** in this batch — it needs a build — so this item stays open.
- [x] `grep -rn "key === 'Escape'" packages/app/src` matches only `use-dismiss.ts` and the six
      element-scoped handlers named in Theme C.
- [x] `grep -rn "addEventListener('keydown'" packages/app/src/components` shows one `window`
      registration — in `use-dismiss.ts`. **One qualification:** `palette.tsx:279` still registers a
      `window` keydown, but only for `ArrowUp`/`ArrowDown`/`Enter` — the palette's own navigation,
      not a dismissal. Every *dismissal* listener is the hook's single one.
- [x] With three overlays open at once, `window.addEventListener` has been called for `keydown`
      exactly once.
- [ ] **The three paths, each fixed and each asserted:** graph selection survives closing a context
      menu; a board card stays selected when its context menu closes; a visible toast survives
      cancelling a confirm dialog.
- [x] `toast-host.test.tsx:77` and `board-view.test.tsx:551` pass **unchanged** — the two existing
      tests that encode behaviour this phase must not alter.
- [x] Every blocking overlay leaves `useUiStore.getState().occluders` at 0 after unmount, asserted
      per component spec.
- [ ] With the browser pane open on a live page, raising a confirm dialog **hides the
      `WebContentsView`** and cancelling it restores the page — the Fact-3 bug, tested rather than
      trusted.
- [ ] **Open, for a human:** press Escape in twenty places. The rule to feel is that it always
      dismisses the thing you were looking at, and exactly one of them.

---

## Not in this phase

- **`components/modal.tsx`.** [Phase 58](phase-58-notes-and-the-menu.md) Theme B owns it.
- **Focus restoration as a general policy.** `popover` restores focus to its trigger; `context-menu`
  manages focus not at all (`grep -n "focus\|tabIndex\|autoFocus" context-menu.tsx` → zero hits);
  `confirm-dialog` traps but does not restore. That is a real inconsistency, it is adjacent to this
  one, and it is a different hook.
- **Bringing `passcode-pad`'s `z-[110]` into the Tailwind scale.** An unrelated tidy.
- **Outside-click dismissal.** `popover` and `context-menu` each hand-roll a `pointerdown` listener
  too. Same shape of problem, and worth the same treatment — but Escape is the one with a live bug,
  and doing both at once doubles the blast radius of a refactor that touches seventeen files.

---

## Decisions / open questions

1. **Resolved — a module-level stack, not a `ui-store` slice.** Dismissal order is not application
   state anything renders; putting it in the store would re-render every `useUiStore` subscriber on
   every hover that opens a tooltip. The stack lives in the module, and the *only* thing it pushes
   into the store is the `occluders` count that already exists.

2. **Resolved — one listener, not `stopImmediatePropagation` at every site.** The alternative fix is
   to add `stopImmediatePropagation()` to all twenty-four handlers and leave them independent. It is
   fewer lines and it is worse: it makes dismissal order depend on React mount order, which no author
   controls or can read, and it leaves the four missing occluder registrations unfixed. One listener
   that knows the stack is the version you can reason about.

3. **Resolved — `blocking` is one flag with two consequences.** A blocking overlay consumes Escape
   and occludes the browser view; a passive one does neither. Two separate flags were considered and
   rejected: every overlay in the app that should consume Escape should also hide a native web view
   painted over the top of it, and a codebase with two flags is a codebase where one of them is
   eventually set wrong.

4. **Resolved — toasts and tooltips are passive even though they paint highest.** `z-toast` (92) and
   `z-tooltip` (95) sit above `z-dialog` (90), so pure z-order would have Escape dismiss a toast
   instead of cancelling a destructive confirm. That is the wrong answer for the user, so paint order
   and dismissal order deliberately differ for exactly these two, and the `blocking` flag is where
   that difference is written down rather than inferred.

5. **Resolved — `palette-store`'s refusal to open over a dialog stays.** It is now belt-and-braces
   rather than the only defence, and removing it in the same phase that changes how dismissal works
   would make a regression in either mechanism hard to attribute. Revisit once the stack has lived a
   release.

6. **Resolved — the seam with [Phase 58](phase-58-notes-and-the-menu.md).** P58 Theme B builds
   `components/modal.tsx` (backdrop, centring, `variant="gradient"`, `motionMs()`); P61 builds
   dismissal. **Whichever lands second wires them together**: if P61 lands first, `Modal` calls
   `useDismiss(open, onClose, { layer: 'dialog' })` and drops its own Escape clause and its own
   occluder pair; if P58 lands first, Theme B's `modal.tsx` is simply one more migration in P61's
   Theme B list. Both docs say this; neither blocks the other. Note that P58 Theme B also migrates
   `prompt-dialog.tsx`, which appears in this phase's Theme B — a conflict of one file, not of design.

7. **Open — does `deck.tsx` really need two entries?** Registering the help overlay and the deck exit
   separately reproduces today's ordering exactly, at the cost of one component holding two
   registrations. *Recommendation:* keep the two entries. Collapsing them into one handler with an
   internal `if (helpOpen)` is fewer lines but re-hides the ordering inside a conditional, which is
   the thing this phase exists to stop doing.

8. **Open — should `useDismiss` also own outside-click?** `popover` and `context-menu` both hand-roll
   `pointerdown` listeners with the same topmost problem in waiting. *Recommendation:* not in this
   phase — see *Not in this phase*. But name the hook `useDismiss` rather than `useEscape` so the
   later addition is a new option on an existing hook rather than a rename across seventeen files.
