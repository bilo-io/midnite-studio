# Phase 51 — The terminal, made steady

[Phase 30](phase-30-terminal-hardening.md) made the terminal *survive* — a detached broker, sessions
that outlive a reload, honest live/asleep/ended states. It did not make it *steady*. Three symptoms
have accumulated since, and a read of the subsystem found a concrete cause for each rather than a
suspicion: text that looks subtly different from pane to pane and goes soft after a monitor change;
input that stops behaving after a while; and a previous run's sessions that are technically alive
but not actually offered back. This phase fixes the causes, not the symptoms.

**Builds on.** Nothing here is new machinery. The broker, the socket protocol, the scrollback ring
and the replay gate all stay exactly as [Phase 30](phase-30-terminal-hardening.md) built them.
[`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) already
constructs the xterm, already loads `@xterm/addon-fit` and `@xterm/addon-webgl`, already defers
`term.open()` until the element has a box, and already re-fits through `safeFit()`; every theme
below is a change *inside* those seams. [`card-terminal-mounts.ts`](../../../packages/app/src/features/projects/board/card-terminal-mounts.ts)
already implements a mounted-xterm budget — for Kanban cards only — and its own docblock explains
the Chromium WebGL context cap that Theme C generalises. [`broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts)
already owns every socket write Theme F adds a drain path to, and
[`server.ts`](../../../packages/desktop/src/broker/server.ts) already coalesces output on a 16 ms
window — Theme F is the *input* direction, which never got the same attention.

**Scope guardrails.** This phase does not touch the broker's process model, its socket-name
fingerprint, its staleness probe or its scrollback bounds — all four are settled and tested. It
does not add a shell-integration shim, an `OSC`-based activity protocol, or tmux; Phase 30's
Decisions section rejected each with reasons that still hold. It adds **no new IPC channel** where
a DOM API already answers the question (Theme A is deliberately renderer-side). It does not add a
terminal *search*, *serialize* or *unicode11* addon — those are features, and this phase is about
the two addons already loaded behaving correctly. It does not chase the known
[`Viewport.syncScrollArea` unmount throw](../outstanding.md) — that is upstream, dev-server-only,
and stays parked until the next xterm bump.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Text that survives a change of display (M) — ✅ DONE (PR #115, 2026-09-04)

The single clearest cause of "jagged" text. **`devicePixelRatio` is never read anywhere in this
repo** — no `matchMedia` resolution query, no `screen`/`display-metrics-changed` bridge. The WebGL
renderer rasterises a glyph atlas once at the DPR in force when the addon loads; move the window
to a display with a different scale factor, or change scaling on the current one, and every glyph
is drawn from an atlas built for the wrong pixel grid. `safeFit()`
([`terminal-view.tsx:211`](../../../packages/app/src/features/terminal/terminal-view.tsx))
cannot rescue it: it early-returns when `cols`/`rows` are unchanged, and a DPR change at a constant
window size changes neither.

- [x] A `useDevicePixelRatio()` hook in `features/terminal/`, built on the self-re-arming
      `matchMedia(\`(resolution: ${dpr}dppx)\`)` idiom — the listener has to be torn down and
      re-created on every change, because the query itself embeds the old ratio. Return the current
      ratio; the hook is pure DOM and needs no bridge call, which is why this stays renderer-side
      rather than becoming a fourth `mstudio:` channel.
  - Renderer-side is the *correct* boundary here, not merely the cheap one: Chromium already
    updates `window.devicePixelRatio` when a window crosses displays, so main would only be
    forwarding a value the renderer can read directly. An Electron `screen` bridge would add a
    channel that can disagree with the DOM.
- [x] On a DPR change, force a full re-rasterisation in this order: `webgl.clearTextureAtlas()`
      (a real method on `WebglAddon`, and the only way to discard the stale atlas without
      re-instantiating the addon) → `fit()` → `term.refresh(0, term.rows - 1)`.
  - The order is load-bearing. Clearing the atlas after a refresh repaints from the stale atlas
    and then throws it away; fitting before clearing measures cells against the old rasterisation.
  - Landed as a new `webglRef` (parallel to the existing `termRef`/`fitRef`), set when the addon
    loads and cleared both on context loss and on unmount — `clearTextureAtlas()` is called through
    it wrapped in a `try/catch`, since a lost-context dispose can race the DPR effect.
- [x] The same path runs when the addon is **not** loaded (the DOM-renderer fallback) minus the
      atlas call — a DOM-rendered pane also measures its cell against `devicePixelRatio` and also
      needs the refit.
  - `webglRef.current?.clearTextureAtlas()` is the only WebGL-specific line; `safeFit()` +
    `term.refresh(...)` run unconditionally for both renderers.
- [x] Tests: `use-device-pixel-ratio.test.ts` — the listener re-arms with the new ratio on each
      change, tears down exactly once per change, and reports the initial value synchronously.
  - Scoped to the hook itself, per the doc's own test plan — the re-rasterisation wiring inside
    `terminal-view.tsx` needs a live xterm + WebGL context to exercise meaningfully, which is
    outside what a jsdom unit test can construct; that component has no existing test file for
    the same reason.

### B — Explicit cell metrics, and a font the user can set (M) — ✅ DONE (PR #117, 2026-09-04)

The second cause of uneven text, and independent of Theme A. The xterm is constructed with
`fontSize: 12` and **no `lineHeight`, no `letterSpacing`, no `fontWeight`/`fontWeightBold`**
([`terminal-view.tsx:249-259`](../../../packages/app/src/features/terminal/terminal-view.tsx)), so
xterm computes a fractional cell height which the WebGL renderer rounds *per row* — visibly uneven
baselines, worst at small sizes. There is no user-facing font control anywhere:
[`terminal-page.tsx`](../../../packages/app/src/features/settings/settings-pages/terminal-page.tsx)
covers the activity readout and the sidebar side only.

- [x] Set the metrics explicitly at construction: `lineHeight`, `letterSpacing`, `fontWeight` and
      `fontWeightBold`. Every one of these is currently an xterm default arrived at by omission;
      writing them down makes them a decision this repo owns and a thing a test can assert.
  - Landed as a new `terminal-font.ts` module: `terminalFontOptions(settings)` resolves the three
    user-facing fields plus the two fixed ones (`letterSpacing: 0`, `fontWeight: 'normal'`,
    `fontWeightBold: 'bold'`) into a complete options object. The fixed values are xterm's own
    defaults, so this is a no-visual-change write-down, not a rendering change — the actual
    unevenness this theme's intro describes is closer to Theme C's WebGL-context story.
- [x] `Settings ▸ Terminal` gains **font family**, **font size** and **line height**, persisted in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (added to both `partialize` and
      the custom `merge`, like every other persisted key). The family field keeps the existing Nerd
      Font stack as its default and its placeholder — a user overriding it is opting out of glyph
      coverage, and the control should say so rather than silently offering a font with no
      powerline glyphs.
  - **Correction:** no `merge` change was needed. `merge`'s per-key re-spreading only exists for
    *nested* persisted objects (`layout`, `graphColumns`, ...) that a shallow `{...current,
    ...saved}` would otherwise clobber; these three are plain scalars, exactly like
    `workflowDefaultTimeoutS`/`workflowRunHistoryCap` before them, and the existing top-level
    spread already gives a missing key on an old install the current default.
- [x] Changes apply to **already-mounted** terminals without a remount: write `term.options.fontSize`
      etc. on the live instance, then `fit()`. xterm supports live option writes; rebuilding the
      terminal would drop the pane's scrollback and re-fetch up to 1 MiB of snapshot per session
      for a font tweak.
- [x] Tests: a pure `terminalFontOptions(settings)` builder + `terminal-font.test.ts` (defaults, an
      override of each field, and the invariant that the returned object never carries `undefined`
      for a key xterm treats as "use the default" — an explicit value or absence, never both).
  - Also added, beyond the doc's own plan: 11 RTL tests for the new `Settings ▸ Terminal ▸
    Appearance` section (`terminal-page.test.tsx`) — renders the persisted values (an empty
    family falling back to its placeholder), and each of the three controls updates
    `useUiStore` on change. The live-apply wiring inside `terminal-view.tsx` has no test of its
    own, for the same live-xterm-context reason Theme A's `clearTextureAtlas()` wiring doesn't.

### C — One renderer story, not two (M) — ✅ DONE (2026-09-04)

Why two panes can look different **on the same display**. Today `new WebglAddon()` is loaded in a
`try/catch` and wired as `webgl.onContextLoss(() => webgl.dispose())`
([`terminal-view.tsx:369-379`](../../../packages/app/src/features/terminal/terminal-view.tsx)) —
and **nothing ever re-adds it**. Chromium caps live WebGL contexts per process at roughly 16 and
evicts the oldest; a pane that loses its context falls silently and permanently to the DOM
renderer, which rasterises differently. `MAX_CARD_TERMINALS = 4`
([`card-terminal-mounts.ts`](../../../packages/app/src/features/projects/board/card-terminal-mounts.ts))
budgets *Kanban card* terminals only — the main panel's open sessions
([`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx)) and the
FAB loop tabs ([`loop-tab.tsx`](../../../packages/app/src/features/loops/loop-tab.tsx)) are
untracked and spend from the same process-wide ceiling.

- [x] Re-acquire on restore: listen for `webglcontextrestored` on the canvas and re-add a fresh
      `WebglAddon`, rather than treating the first loss as terminal. A restored context with no
      addon is the worst of both — the GPU resource is back and unused.
  - **Correction:** `@xterm/addon-webgl` already listens for `webglcontextlost`/`webglcontextrestored`
    on its own canvas internally, with a ~3s grace window before it ever fires our `onContextLoss` —
    confirmed by reading the addon's own bundled source rather than assumed. So by the time our
    handler runs, the addon has already tried and failed to recover in place; its own canvas is
    torn down with it. What `terminal-view.tsx` does instead: on `onContextLoss`, if the
    process-wide budget still grants this session a slot, immediately construct and load a *fresh*
    `WebglAddon` (one retry, not a loop) rather than falling to the DOM renderer permanently — the
    same "don't treat the first loss as terminal" outcome, reached through a new context rather
    than a restored one, since the addon doesn't expose its internal canvas for us to re-listen on.
- [x] Generalise the budget into a process-wide mounted-xterm registry that **every** mount site
      reports to — panel, card and FAB tab — replacing the card-only counter. This is the
      "process-wide WebGL context budget" that [Phase 41 Theme E](phase-41-agentic-kanban.md) and
      [Phase 50](phase-50-kanban-projects-followthrough.md) each declined *because neither phase
      mounted new terminals*. This one does not either — but it is the phase whose subject is why
      the ceiling matters, so it is where the declining stops.
  - Over budget, the **least-recently-visible** pane drops to the DOM renderer deliberately, and
    the newly-revealed pane gets the context. Deliberate and predictable beats Chromium's own
    eviction order, which is arrival order and therefore punishes the pane you have been staring at.
  - Landed as `xterm-budget.ts`: every `TerminalView` reports `(session.id, active)` — `active` is
    already each mount site's own "the user can see this one" signal (panel: the selected session;
    card: gated by the caller's `IntersectionObserver` one level up; FAB tab: the selected tab), so
    no call-site change was needed beyond the view itself. `MAX_WEBGL_CONTEXTS = 12`, twelve of
    Chromium's own roughly-16-per-process ceiling, leaving headroom for whatever else in the
    process holds a context that this registry has no visibility into.
  - `card-terminal-mounts.ts`'s `MAX_CARD_TERMINALS` retired outright, not left alongside the new
    registry: its whole reason to exist was rationing the same WebGL contexts, by refusing to mount
    a 5th card terminal at all. The new registry rations the identical resource with a strictly
    better failure mode — a pane over budget still mounts and degrades to the DOM renderer — so
    keeping both would have meant two mechanisms solving one problem. `CardTerminal` now mounts
    whenever `visible`, with no cap of its own.
- [x] `Settings ▸ Terminal` shows, per live session, which renderer it is actually using. The bug
      was invisible for as long as it was because nothing ever said "this pane is on the DOM
      renderer" — the same argument [Phase 30 Theme G](phase-30-terminal-hardening.md) made for a
      detector that can be wrong out loud.
  - A new "Renderer" accordion, `rendererRows` pure function mirroring `activityRows`'s own shape —
    every *live* session (not just agent rows, since a plain shell's pane can fall to the DOM
    renderer exactly as an agent's can), reading `xterm-budget.ts`'s own `renderers` map.
- [x] Tests: `xterm-budget.test.ts` — mounts from three different surfaces count against one
      ceiling; the least-recently-visible pane is the one demoted; a demoted pane that becomes
      visible again reclaims a context; unmounting frees the slot exactly once; and a real-budget
      (12) eviction/reclaim pass. The wiring inside `terminal-view.tsx` itself has no test file of
      its own, for the same live-xterm-context reason Theme A's DPR wiring doesn't.

### D — A resize that costs one fit, not one per frame (S) — ✅ DONE (PR #118, 2026-09-04)

There is **no debouncing on the fit path at all**: `new ResizeObserver(() => … safeFit())`
([`terminal-view.tsx:490-494`](../../../packages/app/src/features/terminal/terminal-view.tsx))
calls `fit()` synchronously on every observer callback. The `lastSentRef` guard dedupes the *IPC
resize* but not the `fit()` measurement or the reflow it triggers, so a drag-resize runs a full
xterm re-measure per frame and, whenever cols/rows actually change, one `SIGWINCH` per frame at the
shell.

- [x] Coalesce the observer into a single `requestAnimationFrame` callback — at most one `fit()`
      per frame, cancelled and re-scheduled on each observation, flushed on unmount.
  - **Correction:** landed as *cancelled*, not flushed, on unmount. Running a queued fit during
    teardown would measure a container about to be torn down for no benefit — `cancel()` runs
    before `termRef.current`/`fitRef.current` are cleared in the same cleanup, so no dangling rAF
    callback can fire against a disposed terminal either way. "Flushed" in the draft reads as
    "resolved deterministically, not leaked", which `cancel()` satisfies.
- [x] This is [Phase 30's own resolved rule](phase-30-terminal-hardening.md#decisions--open-questions)
      ("fit once at the end of a tween") applied to the case it did not cover. That decision was
      made for the panel's open/close tween; a user dragging the window edge produces the identical
      per-frame storm and never got the same treatment.
- [x] Keep `lastSentRef`. The rAF coalescer reduces *measurement* work; the dedupe is what still
      stops an unchanged cols/rows from sending a pointless `pty.resize`, and the two guards are
      not redundant.
  - Untouched: `createFitCoalescer` only wraps *when* `safeFit()` runs, never its body — `safeFit`
    still owns `lastSentRef`'s own dedupe internally, same as every other caller (Themes A/B, the
    `fitSignal` effect).
- [x] Tests: `fit-coalescer.test.ts` — N observations inside one frame produce one fit; a scheduled
      fit is cancelled by unmount; a fit still runs for the final size after a burst.
  - Built against an injected fake `requestAnimationFrame`/`cancelAnimationFrame` (manually
    stepped, `raf`/`cancelRaf` are optional constructor params defaulting to the real globals) —
    the real ones fire on the browser's own clock, which a test cannot step deterministically.

### E — Keystrokes that are never silently dropped (M) — ✅ DONE (PR #119, 2026-09-04)

The most likely "buggy input after a while". `term.onData` reads `stateRef.current`, which is
assigned during render — so between `pty.create` resolving and the next React render the state
still reads `'starting'`, and the handler
([`terminal-view.tsx:462`](../../../packages/app/src/features/terminal/terminal-view.tsx))
**returns without queueing**. Every character typed in that window is gone. `sendInput` has the
same shape: with no `ptyIdRef.current` it no-ops
([`use-terminal-ipc.ts:167`](../../../packages/app/src/features/terminal/use-terminal-ipc.ts)),
again with no queue.

- [x] A bounded FIFO for pre-ready input, flushed in arrival order the moment the session binds a
      `ptyId`. Bounded, not unbounded: a session that never binds must not accumulate a
      hostage buffer.
  - Cap it at a few KiB. On overflow, drop the **oldest** and mark the pane — silently dropping the
    newest would make the user's most recent keystroke the one that vanishes, which is the failure
    they would actually notice.
  - Landed as `input-queue.ts`'s `createInputQueue(capBytes)`, 4 KiB. **Correction/scope trim:**
    "mark the pane" was not built — the practical overflow case is typing several KiB inside the
    handful of milliseconds a real `pty.create` takes, which does not happen outside deliberately
    adversarial test input, and a new pane-level warning affordance for it would be new UI surface
    disproportionate to the fix. The drop-oldest behavior itself is asserted by test.
  - **Correction:** the doc's overflow unit is bytes, but `onData` delivers whole decoded strings,
    not raw bytes — dropping *chunks* (each a whole `onData` delivery), not trimming mid-string, is
    what the implementation does, since slicing a chunk to hit an exact byte count risks cutting a
    multi-byte UTF-8 character in half.
- [x] The flush writes through the same `sendInput` path as live typing, so ordering between queued
      and live bytes cannot diverge; the queue is drained fully before the first live byte is sent.
  - A `useEffect` keyed on `connectionState` flushes synchronously the render `'open'` is first
    observed — before `onData` can call `sendInputRef.current` for a live byte, since that call is
    itself gated on `stateRef.current === 'open'`, set from the very same `connectionState`.
- [x] Route `Cmd+Enter`'s `\x1b\r` ([`terminal-view.tsx:332`](../../../packages/app/src/features/terminal/terminal-view.tsx))
      through the same gate. It currently calls `sendInputRef.current` directly and bypasses the
      readiness check entirely — which is a *different* bug wearing the same clothes: it does not
      drop the bytes, it sends them into a session that may not exist.
- [x] Tests: `input-queue.test.ts` — bytes typed before ready arrive in order after bind; the cap
      drops oldest-first; a session that ends without binding discards the queue rather than
      leaking it; a live byte never overtakes a queued one.
  - The last item is verified structurally rather than as its own test: `flush()` empties the
    queue and returns everything buffered atomically (asserted by "is empty after a flush"), and
    the wiring's own ordering guarantee — flush runs in the `connectionState` effect strictly
    before `onData` can ever call `sendInput` for a live byte — is a property of the effect
    ordering itself, not something a pure queue test can exercise without mounting a real
    `TerminalView` and a real xterm, which is outside what this theme's test plan scoped to.

### F — Backpressure that exists (M) — ✅ DONE (2026-09-04)

There is **none, at any hop**. `socket.write()`'s return value is ignored on both sides
([`broker-client.ts:666`](../../../packages/desktop/src/main/broker-client.ts),
[`server.ts:240`](../../../packages/desktop/src/broker/server.ts)); there is no `'drain'` handler,
no `highWaterMark`, no `cork`/`uncork`, and no `pause()`/`resume()` on the pty or the socket. A
`pty.write` that fails is swallowed with an empty catch
([`server.ts:379-382`](../../../packages/desktop/src/broker/server.ts)) — a write into a pty that
exited between frames disappears with no error reaching the renderer. Input that fails the zod
parse is dropped with no `else`
([`pty-handlers.ts:35`](../../../packages/desktop/src/main/ipc/pty-handlers.ts)).

- [x] Honour the `false` return from `socket.write()` on both hops: queue subsequent frames and
      resume on `'drain'`, with the queue bounded and its overflow reported rather than absorbed.
  - Landed as a new shared `broker/socket-write-queue.ts` (`createQueuedSocketWriter`), used at
    both cited hops: `broker-client.ts`'s `writePty` (per-`Peer`, 8 MiB cap, input frames) and
    `server.ts`'s `broadcastControl` (per-client, 512 KiB cap — control traffic is small and
    infrequent). `false` from `write()` means "this chunk was accepted, wait before writing more,"
    not "retry it" — the queue shifts a chunk the instant `write()` returns, `ok` or not, and only
    *stops* attempting further writes until `'drain'`. Overflow drops the *oldest* queued chunk,
    matching Theme E's `input-queue.ts` precedent, reported via `log(...)` rather than absorbed.
    `queuePtyOutput`/`flushPtyOutput`'s own 16 ms output coalescer is untouched, per the next item.
- [x] A failed `pty.write` becomes an outcome the renderer can see, not an empty catch. It does not
      need a new channel — the session already has an exit/error path — but it must stop being
      indistinguishable from success.
  - **Correction/scope trim:** landed as a logged catch (`log('[broker] pty.write failed …')`) at
    both call sites (`frame.type === 0x01`'s live-input path and the `pendingInput` auto-send path),
    not a synthetic exit broadcast. `pty.write` throwing means the pty is already dead in the
    overwhelming case, and node-pty's own `onExit` — which already broadcasts `t: 'exit'` — fires
    independently of write failures, so the renderer's existing exit path reaches it on its own;
    inventing a second exit signal here would race the real one for no benefit. What was missing
    was observability of the failure itself, not a new user-facing signal.
- [x] A rejected-by-zod input logs through the one existing log seam instead of vanishing. A
      malformed payload is a bug somewhere; silence is what let it stay one.
  - `pty-handlers.ts`'s `ptyInput` handler logs via `defaultLogger` on a failed `safeParse`.
- [x] Note explicitly that this is the **input** direction. The broker's 16 ms output coalescer
      ([`server.ts:190-236`](../../../packages/desktop/src/broker/server.ts)) and its ordering
      invariants are correct, tested by `output-coalescing.test.ts`, and are not touched here.
- [x] Tests: extend `broker/server.test.ts` and `main/broker-client.test.ts` — a write against a
      saturated socket queues rather than disappearing, `'drain'` releases it in order, the bounded
      queue reports overflow, and a multi-megabyte paste arrives byte-complete and in order.
  - The four backpressure behaviors themselves are covered deterministically in a new
    `socket-write-queue.test.ts` (a scriptable fake socket, since the real backpressure case is not
    reliably reproducible over a real Unix socket in a test); `main/broker-client.test.ts` gained a
    real end-to-end test sending a multi-megabyte paste as thousands of small `writePty` calls
    through a real broker and asserting the fake pty received it byte-complete and in order.

### G — Reattach that actually hands the session back (M)

Sessions **do** survive a relaunch: `probeLegacyBrokers()`
([`broker-client.ts:532`](../../../packages/desktop/src/main/broker-client.ts)) finds the previous
run's socket, adopts it as a `legacy` peer, and `hydrate()`
([`terminal-store.ts:323`](../../../packages/app/src/features/terminal/terminal-store.ts)) merges
the list. But `sessionPhase()` maps `legacy` → `asleep`
([`terminal-store.ts:38-42`](../../../packages/app/src/features/terminal/terminal-store.ts)), so a
running shell from the last run is presented as dormant rather than offered back as a live pane —
and the "Reattached N sessions" note
([`reattached-note.tsx`](../../../packages/app/src/features/status-bar/reattached-note.tsx)) tells
you it happened without giving you anywhere to click.

- [ ] A legacy-peer session opens as a **real live pane** — snapshot, replay gate, live data, live
      input — rather than rendering as `asleep`. It is a running process on a reachable socket;
      `asleep` was an honest label for "we have not attached", not for "it is not running".
  - Keep the moon glyph in [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx)
    as a *provenance* mark ("from a previous run") rather than a *state* mark. The distinction is
    real and worth keeping visible: a legacy peer's broker is on an older build and will not accept
    a `create`.
- [ ] The reattached note becomes actionable — clicking it reveals the reattached sessions, using
      the existing [`reveal-session.ts`](../../../packages/app/src/features/terminal/reveal-session.ts)
      path rather than a second navigation mechanism.
- [ ] **Delete the dead `attach` message** from [`protocol.ts`](../../../packages/desktop/src/broker/protocol.ts).
      It is declared on the wire and has **no `case` in `handleControlMessage`**, so it falls to
      `default:` and answers `{ok:false, code:'protocol'}` — a documented capability the server has
      never implemented. Reattach is genuinely "hold a socket open and `list`", which works; the
      fix is to stop the protocol claiming otherwise.
  - *Recommended over implementing it.* A real `attach` handshake would buy nothing a `list` plus
    `pty.snapshot` does not already deliver, and would add a per-pty state machine to a server
    whose current simplicity is what makes its ordering invariants provable.
- [ ] Tests: `terminal-store.test.ts` gains legacy-opens-live cases; `broker-client.test.ts`'s
      legacy adoption cases extend to the open path; a protocol test asserts `attach` is gone from
      the union rather than answering an error.

## Files this phase touches

| Area | Path |
|---|---|
| Renderer, terminal view | [`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) — DPR effect (A), font options (B), WebGL restore + budget (C), rAF fit (D), input gate (E) |
| Renderer, new modules | `features/terminal/use-device-pixel-ratio.ts` (A), `terminal-font.ts` (B), `xterm-budget.ts` (C), `fit-coalescer.ts` (D), `input-queue.ts` (E) — each with its own test |
| Renderer, budget (replaced) | [`card-terminal-mounts.ts`](../../../packages/app/src/features/projects/board/card-terminal-mounts.ts) — the card-only counter becomes a consumer of the shared registry (C) |
| Renderer, other mount sites | [`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx), [`loop-tab.tsx`](../../../packages/app/src/features/loops/loop-tab.tsx) — register with the budget (C) |
| Renderer, IPC hook | [`use-terminal-ipc.ts`](../../../packages/app/src/features/terminal/use-terminal-ipc.ts) — `sendInput` queues instead of no-oping (E) |
| Renderer, store | [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) — `sessionPhase` stops folding `legacy` into `asleep` (G) |
| Renderer, session list | [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx) — moon glyph becomes provenance, not state (G) |
| Renderer, status bar | [`reattached-note.tsx`](../../../packages/app/src/features/status-bar/reattached-note.tsx) — clickable, via `reveal-session.ts` (G) |
| Renderer, settings | [`terminal-page.tsx`](../../../packages/app/src/features/settings/settings-pages/terminal-page.tsx) — font controls (B), renderer readout (C) |
| Renderer, ui store | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — font settings in `partialize` **and** `merge` (B) |
| Main, broker client | [`broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts) — drain-aware `writePty` (F), legacy open path (G) |
| Main, ipc | [`pty-handlers.ts`](../../../packages/desktop/src/main/ipc/pty-handlers.ts) — a rejected payload logs (F) |
| Broker | [`server.ts`](../../../packages/desktop/src/broker/server.ts) — drain on the input write, surfaced `pty.write` failure (F); [`protocol.ts`](../../../packages/desktop/src/broker/protocol.ts) — `attach` removed (G) |
| Tests | `use-device-pixel-ratio.test.ts`, `terminal-font.test.ts`, `xterm-budget.test.ts`, `fit-coalescer.test.ts`, `input-queue.test.ts` (new); `broker/server.test.ts`, `main/broker-client.test.ts`, `broker/protocol.test.ts`, `terminal-store.test.ts` (extended) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Moving the window between a Retina and a non-Retina display leaves text as crisp as it
      started, with no remount and no lost scrollback — **a human pass**, since it needs two real
      displays. The unit test covers the hook's re-arming; only an eye covers the atlas.
- [ ] Four terminals open at once — panel, a Kanban card and a FAB loop tab among them — all render
      identically, and `Settings ▸ Terminal` reports the same renderer for each until the budget is
      genuinely exceeded, at which point it names which pane was demoted and why.
- [ ] Dragging the window edge across a range that changes cols/rows produces one fit per frame at
      most (asserted by `fit-coalescer.test.ts`) and no visible stutter in the pane — a human pass
      for the second half.
- [ ] Typing immediately into a brand-new pane — before the shell prompt paints — loses nothing:
      every character appears once, in order, when the shell comes up. (`input-queue.test.ts` for
      the ordering; a human pass for the real race, which is what makes it a race.)
- [ ] Pasting several megabytes into a shell delivers byte-complete and in order, and neither hop
      grows an unbounded queue. (`broker/server.test.ts`; a human pass against a real shell.)
- [ ] Quitting the app with live sessions and relaunching offers those sessions back as **live
      panes** that accept input immediately, not as dormant rows — and the reattached note is
      clickable through to them. A human pass, for the same reason
      [Phase 30's e2e docblock](../../../packages/app/e2e/terminal.spec.ts) gives: the mock bridge
      has no real relaunch.
- [ ] `attach` no longer appears in the broker protocol union, and no caller references it.

## Not in this phase

- **A terminal search, serialize or unicode11 addon.** Features, not steadiness. The phase's subject
  is the two addons already loaded behaving correctly.
- **A user-configurable ANSI 16-colour palette.** The themes are 4-colour today
  ([`terminal-view.tsx:59-71`](../../../packages/app/src/features/terminal/terminal-view.tsx)) and
  ANSI colours come from xterm's defaults. Worth doing; a theming slice, not a robustness one.
- **`minimumContrastRatio`.** Deliberately left at its default rather than set in Theme B: raising
  it recolours a TUI's own palette choices, which is a product decision about legibility-versus-
  fidelity, not a metric like `lineHeight`.
- **Reducing the terminal panel's mount churn.** [`app.tsx:1301`](../../../packages/app/src/app.tsx)
  unmounts every `TerminalView` when the panel slides shut, so reopening rebuilds each xterm and
  re-fetches up to 1 MiB of snapshot per session. Real, measurable, and a *performance* slice with
  a number attached — [`scripts/perf/`](../../../scripts/perf/) is where it would be argued.
- **The `Viewport.syncScrollArea` unmount throw.** Upstream, StrictMode-only, dev-server-only, and
  already recorded in [`outstanding.md`](../outstanding.md) as "revisit on the next xterm bump".
- **The broker's process model, socket fingerprint, staleness probe or scrollback bounds.** All
  four are settled, tested and correct.
- **Windows / Linux.** macOS-first, like every phase before it.

## Decisions / open questions

- **Settled — DPR is watched in the renderer, not bridged from main.** Chromium already updates
  `window.devicePixelRatio` when a window crosses displays. A `display-metrics-changed` bridge
  would add a channel whose value can disagree with the DOM's, for no information the DOM lacks.
- **Settled — `clearTextureAtlas()`, not addon re-instantiation, on a DPR change.** Re-adding the
  addon burns a WebGL context acquisition (the very resource Theme C is rationing) to achieve what
  one method call does.
- **Settled — over budget, the least-recently-visible pane is demoted.** Chromium's own eviction is
  arrival order, which reliably evicts the pane you have been using longest — exactly backwards.
- **Settled — the pre-ready input queue drops oldest-first on overflow.** Dropping the newest makes
  the most recent keystroke the casualty, which is the one the user is watching for.
- **Settled — `attach` is deleted rather than implemented.** `list` + `pty.snapshot` already is the
  reattach path; a per-pty handshake would add a state machine to the one server whose ordering
  invariants are currently provable.
- **Open — should the font settings be global or per-session?** *Recommendation:* global. A
  per-session font is a niche want, and per-session would need a key on the session record, which
  is broker-side state for a purely presentational choice.
- **Open — does the renderer readout in Theme C belong in `Settings ▸ Terminal`, or on the session
  row itself as a third glyph?** *Recommendation:* Settings. The session row already carries an
  activity dot and a provenance moon; a third mark for a condition that is normally uniform across
  every pane would spend the row's remaining legibility on the uncommon case.
- **Open — should Theme F's bounded input queue surface overflow as a toast, or only in the log?**
  *Recommendation:* the log, for now. Overflow should be unreachable once the drain path exists;
  a toast for an unreachable condition is a toast nobody will ever calibrate. Revisit if the log
  ever shows one.
