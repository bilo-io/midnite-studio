# Phase 68 — Where focus goes when the dialog closes

Eleven overlays trap focus. **Three restore it, each a different way. Eight drop it on the floor** —
and when focus is dropped it lands on `<body>`, which means the next Tab starts from the top of the
document and a screen-reader user loses their place entirely.

[Phase 62](phase-62-one-escape-one-dismissal.md) named this and declined it, correctly:

> *Focus restoration as a general policy. `popover` restores focus to its trigger; `context-menu`
> manages focus not at all; `confirm-dialog` traps but does not restore. That is a real
> inconsistency, it is adjacent to this one, and it is a different hook.*

This is that hook. The phase is small because the primitive already exists and has eleven consumers —
the work is finishing it, not introducing it.

**The thesis, and the reason this cannot be fixed one dialog at a time.** The newest modal in the app
is [`agent/setup-dialog.tsx`](../../../packages/app/src/features/agent/setup-dialog.tsx) (2026-09-03),
and its docblock at `:21` says what it did: *"Reuses the app's existing dialog shell (`ConfirmDialog`'s
own overlay/focus …"*. [`stash-push-dialog.tsx`](../../../packages/app/src/features/status/stash-push-dialog.tsx)
and [`council-create-dialog.tsx`](../../../packages/app/src/features/councils/council-create-dialog.tsx)
are the **same skeleton, byte for byte**:

```
const containerRef = useRef<HTMLDivElement>(null);
useFocusTrap(containerRef, true);
<div className="fixed inset-0 …" role="dialog" aria-modal="true" aria-label={title}>
  <div ref={containerRef} tabIndex={-1} …>
```

All three copied `ConfirmDialog`. **`ConfirmDialog` does not restore focus.** So the defect is not in
eight files — it is in the one file everybody copies, and it will keep propagating until the shell
itself carries the behaviour. That is why Theme A puts restoration *inside `useFocusTrap`* rather than
beside it: the next author gets it by writing the line they were going to write anyway.

**Five things are true, and each is one grep.**

1. **The trap's cleanup does nothing about focus.**
   [`use-focus-trap.ts:63`](../../../packages/app/src/components/use-focus-trap.ts) is the whole
   deactivation path: `return () => container.removeEventListener('keydown', onKeyDown);`. Sixty-five
   lines, two tests, and **neither test unmounts the hook** — there is no coverage of deactivation at
   all.
2. **The one general implementation has three bugs.**
   [`palette.tsx:126-136`](../../../packages/app/src/components/palette.tsx) captures
   `document.activeElement` and calls `restoreTo?.focus()` in cleanup.
   - **No liveness check.** `document.contains` / `isConnected` → **0 hits in `packages/app/src`**. If
     the trigger was a virtualized row, a re-rendered list item, or anything inside a component that
     unmounted while the palette was open, `.focus()` on a detached node is a silent no-op. The
     palette *navigates views* — this is the normal case, not the edge case.
   - **`<body>` unhandled.** Opening the palette with `Mod+k` after clicking non-focusable chrome
     makes `previouslyFocused.current === document.body`, and `document.body.focus()` does nothing.
   - **No `preventScroll`.** Every other focus call in the repo passes it — `use-focus-trap.ts:35`
     and `:60`, `popover.tsx:98`, `browser-launcher.tsx:53` — and
     [`e2e/panel-glow.spec.ts:16`](../../../packages/app/e2e/panel-glow.spec.ts) documents the exact
     regression it prevents.
3. **Three implementations, three mechanisms.** `popover.tsx:97-99` focuses a `triggerRef`;
   `palette.tsx` focuses a captured `activeElement`; `browser-pane.tsx:121-135` does
   `document.querySelector('[data-testid="browser-toggle"]')?.focus()` — a **test id used as
   production wiring**, and without `preventScroll`.
4. **Test coverage exactly matches implementation, so nothing would catch a regression in the other
   eight.** Three e2e tests assert restore-on-close — `palette.spec.ts:82-92`,
   `footer-monitor.spec.ts:126`, `browser-pane.spec.ts:247` — and they cover precisely the three
   components that restore. `toHaveFocus` → **0 hits repo-wide**.
5. **Nothing hides the background from assistive technology.** No `aria-hidden` on a root container,
   no `inert` on `#root`, no `<dialog>`/`showModal`, no body scroll lock — `aria-modal="true"` is the
   only signal, and for a non-`<dialog>` element it is unreliable. The app has exactly **one** real
   `inert` attribute, at [`fab-panel.tsx:210`](../../../packages/app/src/components/fab-panel.tsx).

**Builds on.**
- [`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) — 65 lines,
  `useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void`. Focuses the *container*
  (not the first child) on activation, guarded by `if (!container.contains(document.activeElement))`
  so a child's `autoFocus` wins — which is why every consumer sets `tabIndex={-1}` on the container.
- [`components/popover.tsx:97-99`](../../../packages/app/src/components/popover.tsx) — the one
  *correct* restoration in the repo, and the behaviour Theme A generalises.
- [`@bilo-io/ui`'s `Collapse`](../../../packages/app/src/components/tree-section.tsx) — sets
  `inert: !open` on its clipped region, with a docblock stating the reason: *"without it, controls
  inside a closed accordion stay in the tab order and readable by screen readers even though they're
  visually hidden."* Prior art for Theme D — and note it lives **outside this repo**, so it can be
  cited but not extended.

**Scope guardrails.**
- **`packages/app` only.** No IPC, no `shared` schema, no new dependency.
- **The trap's Tab-wrapping behaviour does not change.** This phase adds a deactivation path; the
  activation path and the wrap logic stay exactly as they are.
- **No `<dialog>` migration.** Native `showModal()` would give focus restoration, background inerting
  and Escape for free, and it would also re-open every one of the twelve overlays' positioning,
  stacking and animation decisions. A different phase, and a much bigger one. See Decision 5.
- **`role`/`aria-label` conventions are not renegotiated.** `aria-label` on the dialog is the
  near-universal pattern (`aria-labelledby` appears once, at `first-run-modal.tsx:28`); this phase
  adds the two missing dialogs to the existing convention rather than changing it.
- **No keyboard *opening* of context menus.** Theme C makes an open menu operable; `Shift+F10` and
  the Menu key need a call-site change at every `onContextMenu` and are their own slice.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The trap learns to give focus back (M)

- [ ] Extend [`use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) to capture
      on activation and restore on deactivation. **Signature unchanged** —
      `useFocusTrap(ref, active): void` — so all eleven call sites keep compiling untouched. That is
      the point: the fix arrives at the sites that never asked for it.
- [ ] Capture `document.activeElement` **when `active` flips to true**, not on first render. Today
      `palette.tsx`'s `useRef` initializer re-evaluates every render and discards the result; a hook
      whose `active` is a state flag (`popover`, `browser-pane`, `slides-modal`, `first-run-modal`)
      must capture at the transition or it captures something from mount time.
- [ ] **Restore only to a live, focusable element.** Guard with `restoreTo.isConnected` — a check that
      appears **nowhere** in `packages/app/src` today — and fall back through: the captured element if
      connected → the trigger's nearest connected ancestor if it can hold focus → otherwise leave
      focus alone rather than forcing it to `<body>`.
- [ ] **Never restore to `<body>`.** If the captured element is `document.body`, capture nothing —
      restoring to `<body>` is indistinguishable from doing nothing, and pretending otherwise hides
      the bug.
- [ ] Pass `{ preventScroll: true }`, matching every other focus call in the repo and the regression
      [`e2e/panel-glow.spec.ts:16`](../../../packages/app/e2e/panel-glow.spec.ts) already guards.
- [ ] **Do not restore if focus has already moved somewhere deliberate.** If, at deactivation time,
      `document.activeElement` is neither inside the trapped container nor `<body>`, something else
      has claimed focus — a toast action, a newly opened second overlay — and stealing it back is
      worse than doing nothing. This is the clause that makes the hook safe to apply to all eleven at
      once.
- [ ] Add `:not([inert])` to the `FOCUSABLE` selector (`use-focus-trap.ts:3-4`). `Collapse` marks its
      collapsed region `inert`, so a trapped dialog containing a closed accordion currently Tab-wraps
      through buttons the user cannot see. One selector clause, and the only change to the activation
      path in this phase.
- [ ] Extend `use-focus-trap.test.ts` — it has **two** cases and neither unmounts. Add: restores to
      the previously-focused element on deactivate; does **not** restore to a detached node; does not
      restore to `<body>`; does not steal focus that moved elsewhere; `active: false` traps nothing;
      an `inert` child is skipped in the Tab cycle.

### B — The eight that never gave it back (S)

- [ ] Verify each of the eight inherits correct behaviour with **no code change** —
      [`confirm-dialog.tsx:68`](../../../packages/app/src/components/confirm-dialog.tsx),
      [`prompt-dialog.tsx:37`](../../../packages/app/src/components/prompt-dialog.tsx),
      [`setup-dialog.tsx:64`](../../../packages/app/src/features/agent/setup-dialog.tsx),
      [`stash-push-dialog.tsx:31`](../../../packages/app/src/features/status/stash-push-dialog.tsx),
      [`council-create-dialog.tsx:21`](../../../packages/app/src/features/councils/council-create-dialog.tsx),
      [`first-run-modal.tsx:11`](../../../packages/app/src/features/onboarding/first-run-modal.tsx),
      [`slides-modal.tsx:24`](../../../packages/app/src/features/slides/slides-modal.tsx),
      [`browser-launcher.tsx:47`](../../../packages/app/src/features/browser/browser-launcher.tsx).
      Eight components fixed by one hook is the acceptance criterion; if any needs a change, the hook
      is wrong.
- [ ] **Delete `palette.tsx`'s bespoke block** (`:126-136`) — the `previouslyFocused` ref and the
      restoring `useEffect` cleanup. Keep `inputRef.current?.focus()`, which is forward focus and
      still the palette's own business. `palette.spec.ts:82-92` must pass unchanged; it is the
      regression guard for this deletion.
- [ ] **Delete `browser-pane.tsx:121-135`'s `querySelector('[data-testid=…]')` restoration.** A test
      id is not production wiring, and the hook now covers it. Its guard — *don't restore if the pane
      is re-opening* — is subsumed by Theme A's "focus already moved deliberately" clause; confirm
      that with `browser-pane.spec.ts:247` rather than by reading.
- [ ] **Keep `popover.tsx:97-99`'s `triggerRef.current?.focus()`.** It restores to a *known* trigger
      rather than a captured `activeElement`, which is strictly better for a popover whose trigger is
      guaranteed to still exist — and the hook's "already moved" clause makes the two coexist without
      fighting. Record why in a comment so it is not "tidied" away as duplication.
- [ ] Add the missing `aria-label` to [`merge-dialog.tsx:98-99`](../../../packages/app/src/features/reviews/merge-dialog.tsx),
      the one `role="dialog" aria-modal="true"` in the app with no accessible name.

### C — The context menu says "menu" and means it (M)

`grep -c "focus\|tabIndex\|autoFocus"` on
[`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) → **0**. But it declares
`role="menu"` (`:144`, `:261`) and `role="menuitem"` (`:321`) — so it advertises the ARIA menu
contract and implements none of the keyboard half. A screen reader announces "menu", the user presses
Down, and nothing happens.

- [ ] Move focus into the menu on open — first enabled item — and register it with the trap so Tab
      cannot walk out. Today the menu is portalled to the **end of `<body>`**, so reaching its first
      item by keyboard means tabbing through the entire rest of the document.
- [ ] Arrow-key navigation with a roving `tabIndex`: `ArrowDown`/`ArrowUp` move and wrap, `Home`/`End`
      jump, disabled items are skipped. This is the contract `role="menuitem"` already promises.
- [ ] `ArrowRight` opens a submenu and focuses its first item; `ArrowLeft` closes it and returns focus
      to the parent row. **Submenus open on hover only today** (`:261`), which makes them unreachable
      without a mouse.
- [ ] `Escape` closes the submenu first, then the menu — and it must route through the layer
      [Phase 62](phase-62-one-escape-one-dismissal.md) builds if that has landed, or stay as the
      existing `:107-108` handler if it has not. See Decision 4.
- [ ] Restore focus to the element that was focused when the menu opened, via Theme A's hook — which
      for a right-click is usually the row that was clicked.
- [ ] `context-menu.test.tsx` gains keyboard coverage: open → first item focused; Down wraps; a
      disabled item is skipped; ArrowRight enters a submenu; Escape returns focus to the trigger.

### D — The two modals that were never modals (S)

- [ ] [`onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx) —
      **zero `role`, zero `aria-`, zero focus code**, and it is a fullscreen modal shown to a
      first-time user. Add `role="dialog"`, `aria-modal="true"`, `aria-label`, a `tabIndex={-1}`
      container and `useFocusTrap`, matching the `setup-dialog.tsx` skeleton exactly.
- [ ] [`rebase-modal.tsx`](../../../packages/app/src/features/rebase/rebase-modal.tsx) — same
      treatment. It is a bottom sheet (`fixed inset-x-0 bottom-0`) over a destructive operation, with
      no role and no trap.
- [ ] [`help-overlay.tsx`](../../../packages/app/src/features/slides/help-overlay.tsx) — has
      `role="dialog"` and `autoFocus` but **no trap**, so Tab walks straight out of the help overlay
      into the deck behind it. One `useFocusTrap` line.
- [ ] [`multi-select-menu.tsx`](../../../packages/app/src/components/multi-select-menu.tsx) — declares
      `role="listbox"`/`role="option"` and autofocuses its search input, but has no trap and no
      restore. Add both; the listbox arrow-key contract is **out of scope** here and noted below.
- [ ] Audit the remaining role-less overlays and record the verdict rather than silently skipping
      them: `fab-panel.tsx`, `screensaver.tsx`, `lock-screen.tsx` (has `role="dialog"` but no
      `aria-modal` and no trap), `graph-row.tsx:525`'s overflow popover. For each, either fix it or
      write one sentence saying why it is not a modal.

---

## Files this phase touches

| File | What |
|---|---|
| [`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) | capture + restore, `isConnected`, no-`<body>`, `preventScroll`, the already-moved clause, `:not([inert])`. **Signature unchanged** (A) |
| `components/use-focus-trap.test.ts` | six new cases; today it has two and neither unmounts (A) |
| [`components/palette.tsx`](../../../packages/app/src/components/palette.tsx) | delete `:126-136`'s bespoke restoration; keep the input focus (B) |
| [`features/browser/browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) | delete the `data-testid` `querySelector` restoration at `:121-135` (B) |
| [`components/popover.tsx`](../../../packages/app/src/components/popover.tsx) | (**unchanged**) — its `triggerRef` restore is better than the generic one; add the comment saying so (B) |
| `confirm-dialog` · `prompt-dialog` · `setup-dialog` · `stash-push-dialog` · `council-create-dialog` · `first-run-modal` · `slides-modal` · `browser-launcher` | (**unchanged**) — all eight fixed by the hook. That they need no edit is the acceptance criterion (B) |
| [`features/reviews/merge-dialog.tsx`](../../../packages/app/src/features/reviews/merge-dialog.tsx) | the one missing `aria-label` (B) |
| [`components/context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx) | roving focus, arrows, Home/End, submenu entry/exit — the contract `role="menu"` already claims (C) |
| `components/context-menu.test.tsx` | keyboard coverage (C) |
| [`features/onboarding/onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx) · [`features/rebase/rebase-modal.tsx`](../../../packages/app/src/features/rebase/rebase-modal.tsx) | role + aria-modal + label + trap; neither has any today (D) |
| [`features/slides/help-overlay.tsx`](../../../packages/app/src/features/slides/help-overlay.tsx) · [`components/multi-select-menu.tsx`](../../../packages/app/src/components/multi-select-menu.tsx) | the missing trap (D) |
| [`components/fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) | (**unchanged**) — the app's only real `inert`, cited as prior art (D) |
| `packages/app/e2e/focus-return.spec.ts` | **new** — the restore-on-close assertion for the eight that had none |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `pnpm e2e` green with no new `KNOWN_RED` entry.
- [ ] **The three existing restore tests pass unchanged** — `palette.spec.ts:82-92`,
      `footer-monitor.spec.ts:126`, `browser-pane.spec.ts:247`. They are the regression guard for
      deleting two bespoke implementations, and they must not be edited to accommodate the change.
- [ ] **Eight components fixed with no edit to any of them.** `git diff --stat` for Theme B shows
      `palette.tsx`, `browser-pane.tsx`, `merge-dialog.tsx` and nothing else. If a dialog needed
      changing, the hook is wrong.
- [ ] Open and close each of the eleven overlays from a known trigger and assert focus returns to it —
      the new `focus-return.spec.ts`, one case per overlay, using Playwright's `toBeFocused()` (the
      repo's e2e convention; `toHaveFocus` is unused).
- [ ] **The detached-trigger case, which the existing palette test cannot reach**: open the palette
      from a virtualized graph row, navigate to a different view, close it — focus does **not** land
      on `<body>`, and nothing throws.
- [ ] Opening the palette with `Mod+k` while `document.activeElement` is `<body>` and closing it
      leaves focus unchanged rather than "restoring" to `<body>`.
- [ ] A dialog opened *from another dialog* returns focus to the first dialog, not to the original
      page trigger — the stacking case the "already moved" clause exists for.
- [ ] A trapped dialog containing a **closed `Collapse`** does not Tab into the collapsed region — the
      `:not([inert])` clause, asserted rather than assumed.
- [ ] Focus restoration never scrolls the page — the `preventScroll` regression `panel-glow.spec.ts`
      already documents.
- [ ] A context menu is fully operable from the keyboard once open: first item focused, arrows wrap,
      disabled items skipped, submenu entered with ArrowRight, Escape returns focus to the row.
- [ ] `onboarding-modal` and `rebase-modal` each report `role="dialog"` with an accessible name, and
      Tab cannot leave either.
- [ ] `grep -rn "querySelector.*data-testid" packages/app/src` returns nothing — no test id is load-bearing
      in production code.
- [ ] **Open, for a human:** unplug the mouse. Open a repo, right-click a commit, run something from
      the menu, answer the confirm, and come back. If your place in the graph is where you left it at
      every step, the phase worked.

---

## Not in this phase

- **Migrating to native `<dialog>` / `showModal()`.** It would give restoration, background inerting
  and Escape for free, and re-open positioning, stacking, animation and portal decisions across
  twelve components. Decision 5.
- **Hiding background content from assistive technology.** Nothing does today — no `aria-hidden` on a
  root, no `inert` on `#root`, no scroll lock — and `aria-modal="true"` is the only signal. Real, and
  a bigger change than this phase: it needs one owner of "what is the app root", which does not exist
  yet. Recorded so the gap is known rather than assumed handled.
- **Opening a context menu from the keyboard** (`Shift+F10`, the Menu key). Needs a change at every
  `onContextMenu` call site; Theme C makes an *open* menu usable, which is the half that is currently
  broken for someone already using the keyboard.
- **The listbox arrow-key contract for `multi-select-menu.tsx`.** It gets a trap here; making
  `role="option"` navigable is the same shape of work as Theme C and belongs with it or after it.
- **`aria-labelledby` everywhere.** `aria-label` is the app's convention with one exception; changing
  that is a sweep with no user-visible gain.

---

## Decisions / open questions

1. **Resolved — restoration goes *inside* `useFocusTrap`, not in a companion hook.** A
   `useFocusReturn` beside it would be cleaner in isolation and would fix nothing, because the eight
   broken overlays are broken precisely by *not* having called the extra thing. The newest overlay in
   the app copied `ConfirmDialog` verbatim (`setup-dialog.tsx:21` says so), and two others are the
   same skeleton — so the only fix that survives the next copy-paste is one that arrives with the line
   the author already writes. The signature does not change, which is what makes it a one-file diff
   with eleven beneficiaries.

2. **Resolved — `popover.tsx` keeps its own restoration.** It focuses a known `triggerRef` rather than
   a captured `activeElement`, which is strictly more reliable when the trigger is guaranteed to
   outlive the overlay. The hook's "focus already moved deliberately" clause means the two do not
   fight. Deleting it for symmetry would trade a better mechanism for a uniform one.

3. **Resolved — never restore to `<body>`, and never restore over a deliberate move.** Both are
   "do nothing" outcomes, and both matter: restoring to `<body>` is a no-op dressed as a fix, and
   stealing focus back from a second overlay is an active regression. The second clause is what makes
   it safe to switch all eleven on at once rather than migrating them one at a time.

4. **Open — the seam with [Phase 62](phase-62-one-escape-one-dismissal.md).** P62 builds a LIFO
   dismissal stack and migrates `context-menu.tsx`'s Escape handler onto it; Theme C also touches that
   handler, for the submenu-then-menu ordering. *Recommendation:* **whichever lands second owns the
   ordering**, and Theme C writes its Escape logic as a plain handler that P62's migration can lift
   unchanged. The two phases share one file and no design: P62 decides *which overlay* gets the
   Escape, Theme C decides *what a menu does* with the one it gets.

5. **Open — is native `<dialog>` the right end state?** `showModal()` gives focus restoration,
   top-layer stacking and background inerting for free, and would delete most of this phase plus most
   of Phase 62. *Recommendation:* **not now, and record it as the direction.** Twelve overlays with
   bespoke positioning and animation is a large migration to run against a codebase that also has a
   dismissal-stack phase and a Monaco phase in flight — but every phase that hand-rolls more of what
   the platform now provides makes that migration more expensive. Worth revisiting once 62 has landed
   and the overlay set has stopped moving.

6. **Open — should `FOCUSABLE` also exclude `[aria-hidden="true"]` and zero-size elements?**
   `:not([inert])` is a clear win. Visibility filtering is not: `getComputedStyle` per element per
   keypress is real cost in a menu with fifty rows, and the trap re-queries live on every Tab.
   *Recommendation:* ship `:not([inert])` only, and revisit if a real overlay is found Tab-cycling
   into something invisible. The one known case — a closed `Collapse` — is exactly the `inert` case.
