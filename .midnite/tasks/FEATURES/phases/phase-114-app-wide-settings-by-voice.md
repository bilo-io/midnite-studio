# Phase 114 — App-wide settings by voice

**Written with the user** (via `/midnite-ideate`) · 2026-10-16

[Phase 109](phase-109-companion-settings-by-voice.md) taught the companion, by voice, by typing and
over MCP, to change **its own** settings: 17 keys with one spec table (`COMPANION_SETTING_SPECS`),
one setter (`applyCompanionSetting`), tiers, guards, spoken read-back and a 60 s undo.
[Phase 112](phase-112-companion-deep-navigation.md) Theme F taught it to **open** any settings
section: select the page, then scroll to, expand and ring an accordion. Between them, "open
Companion settings, Personality" already works. "Turn the minimap off", "set the terminal font
size to 14" and "hide Media from the rail" do not. Every one of the app's other ~105 preferences
has no spec, no setter path and no voice grammar, so the companion can take you to a setting but
cannot change it.

This phase generalises Phase 109's machinery to **every user setting in the app**. It adds one
`SettingSpec` registry covering all 27 settings pages, with feature packages contributing their
own specs, and one `applySetting` setter with storage adapters. A per-control anchor lets a voice
change **reveal the control, then change it**, so you watch it flip. The `setting` intent arm is
generalised, with ambiguity chips and "what's X set to / what does X do". There are
`settings_list/get/set/reset` MCP tools behind a new default-off switch, and generated
command-palette entries.

Scope guardrails:
- **Strict tiers. No secret, passcode or permission can be written by voice or MCP, ever.**
  API keys, forge accounts, the screen-lock passcode and its requirements, every `mcp.json`
  switch, consent flags, `allowForceWithLease`, `forgeWritesEnabled`, `launchAndRunEnabled` and
  `automate*` are `never`. The voice/MCP surface cannot widen its own authority.
- **Renderer-side keys only.** Every key that is settable at all lives in renderer stores
  (`ui-store`, `companion-store`). Main-side settings (`mcp.json`) are `never`, so the setter
  needs no new write IPC.
- **Pages are not migrated wholesale.** Voice and MCP write through `applySetting`; a page control
  moves onto the setter only when its key carries a guard (Decision 3).
- **Phase 109 keeps working unchanged.** `applyCompanionSetting`, the `companion_settings_*` tools,
  profiles, audition and tune keep their contracts and become thin layers over the new setter.
- **Phase 113's layer rule holds.** Spec *shapes* live in `shared` (zod only). A feature package's
  specs ship in its own manifest and never import another feature or an app. The setter is app
  code.
- Phase 81's rules hold for every reveal: main window executes (popouts relay), a locked screen
  refuses, and the unsaved-file guard can block a navigation.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A lands first; B needs A;
> C, E and F need A and B and are independent of each other; D needs B and C.

> **Findings, verified against the current tree, that this phase is built on.**
>
> **1. Only the companion has a spec table.** `CompanionSettingSpec<K>`
> ([`companion.ts`](../../../packages/shared/src/companion.ts) ~`:4004`) carries `key`, `label`,
> `aliases`, `value` (bool / enum with `spoken` / number with min-max-step / text / list), `tier`,
> `directValues?`, `guards?`, `readBack(next)` and `example`. It is total over `CompanionSettingKey`
> by a type assertion. Every other page's labels, help text and defaults live inline in its JSX and
> in `ui-store`'s initial state.
>
> **2. The preferences are already classified.**
> [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) (Phase 63) splits every
> `PersistedUi` key into ~105 `PREFERENCE_KEYS` and ~45 `SESSION_STATE_KEYS` exhaustively, plus 14
> `KNOWN_ORPHANS` with no control (five `editor*` keys among them). `ui-store` persists at
> version 34. Many preferences are maps or lists: `navVisibility`, `agentBackends`,
> `sectionFilters`, `*ByProject`.
>
> **3. Sections are anchored; controls are not.**
> [`settings-sections.ts`](../../../packages/frame/src/settings/settings-sections.ts) lists ~90
> sections over the 27 `SettingsPageId`s, and `SettingsAccordion` stamps `data-settings-section`.
> No control carries an anchor, so a reveal can ring a section but not the switch inside it.
>
> **4. Feature packages already own settings pages.** `defineFeatureManifest`
> ([`feature-manifest.ts`](../../../packages/shared/src/domain/feature-manifest.ts)) has
> `settingsPages`. The optimizer declares `trashSafety` and `optimizer`, and monitor has its own
> page. Their keys still live in the shared `ui-store`.
>
> **5. The palette knows pages, not settings.**
> [`providers.ts`](../../../packages/app/src/services/palette/providers.ts) indexes only
> `settings:${page.id}`.
>
> **6. MCP's companion tools are the template.** `companion_settings_get/set`
> ([`companion-tools.ts`](../../../packages/desktop/src/main/mcp/companion-tools.ts),
> [`companion-mcp.ts`](../../../packages/shared/src/companion-mcp.ts)) start with
> `requireSwitch()`. They reach the renderer through `requestUiAction` arms answered by
> [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts), and a
> confirm-tier change prompts in the app for up to 30 s. `mcp.json` is at version 10
> ([`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)).

## Headlines

*Make every setting in the app something the companion can show you and change, under the same
tiers, guards, read-back and undo that Phase 109 gave its own.* Phase 109 proved the machinery on
one page and Phase 112 can already open any section, so the gap is coverage: a registry, a general
setter, a per-control anchor and the grammar on top. Planned 2026-10-16.

**Theme A — One registry.** ◻ A `SettingSpec` in `shared`, one spec file per settings page, a
`settingSpecs` field on feature manifests, a type assertion that every `PREFERENCE_KEY` has a spec
or a named exemption, chosen sub-key specs for maps (`navVisibility.<view>`), and the Strict tier
table.

**Theme B — One setter.** ◻ `applySetting`/`applySettings`/`previewSetting`/`undoLastSetting` with
storage adapters for `ui-store` and `companion-store`, a lock refusal, tiers for voice and MCP,
guards for every source and one 60 s undo slot. `applyCompanionSetting` becomes a wrapper; only
guarded keys' page controls migrate.

**Theme C — Reveal the control, then change it.** ◻ A `data-setting-key` stamp on every spec'd
control and a `settingControl` reveal that opens the page and accordion and rings the control
before a voice or MCP change applies. "Quietly" skips it, and a test keeps the stamps and the
registry in step.

**Theme D — Voice grammar over every setting.** ◻ The `setting` intent arm and vocabulary are
generated from the registry. Two settings with the same name get a choice chip, and the page on
screen wins the tie. Adds "what's X set to?", "what does X do?" and "what's in here?" for the
section on screen, plus router prompt and "Try: …" hints.

**Theme E — `settings_*` on `midnite`.** ◻ `settings_list`, `settings_get`, `settings_set` and
`settings_reset` behind a new default-off `allowSettings` switch (`mcp.json` v11). Confirm-tier
changes are asked in the app, and `companion_settings_*` is unchanged.

**Theme F — Palette entries from the registry.** ◻ Generated "Set …" / "Toggle …" palette
entries that take a value inline and write through the setter as `palette`.

## Deliverables

### A — One registry (L)

- [ ] New `packages/shared/src/settings/setting-spec.ts`: `SettingSpec<K>` generalises
      `CompanionSettingSpec`. It keeps `key`, `label`, `aliases`, `value`, `tier`, `directValues?`,
      `guards?`, `readBack(next)` and `example`, and adds `page: SettingsPageId`, `section?`
      (a `settingsSectionId` slug), `help` (one sentence, the page's own help text), `default` and
      `storage: 'ui' | 'companion'`. `SettingSource` = `'voice' | 'mcp' | 'page' | 'palette'`.
      `CompanionSettingSpec` becomes an alias of `SettingSpec` narrowed to companion keys, so
      Phase 109's call sites do not move.
  - *Acceptance:* `setting-spec.test.ts` parses one fixture per value kind and rejects an unknown
    page, an unknown section slug and a number spec whose default is outside its range.
- [ ] Sub-key specs: a spec's `key` may be a `path` such as `navVisibility.media` or
      `agentBackends.claude`, with `value` describing the leaf. Only paths the doc names are
      written: one per rail view in `navVisibility`, plus any others A's audit finds natural to
      say aloud. Every other map or list key is listed as `pageOnly` with a reason.
- [ ] One spec file per page under `packages/shared/src/settings/pages/` (for example
      `appearance.ts` and `terminal.ts`), joined into `SETTING_SPECS` by an index. The companion
      page's file re-exports `COMPANION_SETTING_SPECS` unchanged. Labels and help text are lifted
      from the page JSX, not rewritten.
- [ ] `FeatureManifest` gains `settingSpecs?: readonly SettingSpec[]`. The optimizer (`trashSafety`,
      `optimizer`) and monitor manifests move their pages' specs there, and `apps/studio`'s
      composition merges them into the live registry. A feature never imports another feature's
      specs.
  - *Acceptance:* `scripts/layer-boundaries.test.mjs` still passes. A composition test asserts the
    merged registry has no duplicate key.
- [ ] Coverage assertion: every `PREFERENCE_KEYS` entry is a spec, a sub-key parent with
      `pageOnly` siblings, or listed in `SETTING_EXEMPT` with a reason (for example the
      `forgeAccounts` vault mirror). A key added to `PREFERENCE_KEYS` without one fails
      `persisted-keys.test.ts`. The five orphaned `editor*` keys get specs flagged
      `noControl: true`, so they are voice-settable but have nothing to reveal.
- [ ] The Strict tier table, written into the specs and asserted by `setting-tiers.test.ts`
      against an explicit list:
      `never`: LLM API keys (in the vault since Phase 113 Theme J), `forgeAccounts`, `forgeActiveAccountId`, `forgeSyncGhAuthSwitch`,
      `passcode`, `requirePasscode`, `passcodeOnlyWhenLocked`, `inactivityTimeoutS`, every
      `mcp.json` switch, `allowTrashEmpty`, `trashEmptyConsentGiven`, `allowSystemCacheClean`,
      `systemCacheConsentGiven`, `allowForceWithLease`, `forgeWritesEnabled`, `launchAndRunEnabled`,
      `automateEnabledByProject`, `automateCapByProject`, and Phase 109's existing `never` keys.
      `confirm`: `updateChannel`, `updatesAutoCheck`, `locateByIpEnabled`, `skillExecutionMode`,
      `agentBackends.*`, `optimizerEnabled`, `disabledEcosystems`. `direct`: everything else.

### B — One setter (L)

- [ ] New `packages/app/src/features/settings/setting-apply.ts`: `applySetting(change, source)`,
      `applySettings(changes, source)` (one undo step), `previewSetting` and `undoLastSetting`,
      with the same refusals as Phase 109 (`locked`, `never`, `confirm`, `guard`, `invalid`) plus
      `unknown` for a key not in the registry. Tiers bind `voice`, `mcp` and `palette`; guards
      bind every source.
- [ ] Storage adapters: `ui` writes `useUiStore`; `companion` writes the companion slice, which
      keeps Phase 109's `broadcast-sync.ts` behaviour. A sub-key write merges the leaf into its
      map and never replaces the map.
- [ ] One undo slot (60 s) shared across every setting. Phase 109's
      `undoLastCompanionSetting` reads the same slot, so "undo that" means the last change
      whatever the key.
- [ ] `applyCompanionSetting`/`applyCompanionSettings` become wrappers over the new setter;
      `settings-apply.test.ts` passes unchanged.
- [ ] Guarded page controls write through `applySetting(…, 'page')`; unguarded controls keep
      writing the store directly.
  - *Acceptance:* `setting-apply.test.ts` covers one key per tier and storage, a sub-key merge,
    a lock refusal, an unknown key, a cross-key undo and a `palette` confirm.

### C — Reveal the control, then change it (M)

- [ ] A `settingKey` prop on the shared settings controls in
      [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) and
      the frame's [`settings-section.tsx`](../../../packages/frame/src/settings/settings-section.tsx)
      rows stamps `data-setting-key="<key or path>"`. Pages pass it where a spec exists.
- [ ] `ResourceRef`'s `setting` arm gains an optional `key`. The `setting` revealer in
      [`revealers/tools.ts`](../../../packages/app/src/features/companion/reveal/revealers/tools.ts)
      selects the page, opens the spec's section, scrolls to the control and rings it with the
      same reduced-motion-aware pulse.
- [ ] Voice and MCP changes reveal first, then apply once the ring starts (bounded wait, then apply
      anyway). "Quietly" / "in the background", a control already on screen, a `noControl` spec
      and a locked or unsaved-guarded navigation all skip the reveal; the change still applies
      where allowed.
- [ ] `settings-controls.test.ts`, alongside `settings-sections.test.ts`, renders every page and
      asserts each spec with a control has exactly one `data-setting-key` and each stamp names a
      spec.

### D — Voice grammar over every setting (M→L)

- [ ] `parseIntent`'s `setting` arm takes any `SETTING_INTENT_KEYS` (non-`never` specs). The
      phrase list comes from each spec's `label` and `aliases`: set, turn on/off, toggle,
      up/down/step and "use <enum value>". Phase 109's hand-written companion phrases keep
      precedence. A `never` key by name gives `pageOnlySetting` ("That one's page-only — want me
      to open it?").
- [ ] Ambiguity: a phrase that matches several specs ("font size") posts a `choice` chip through
      Phase 112's choice slot. The spec on the page currently on screen wins outright, and the
      most recently changed spec is listed first.
- [ ] Reads: "what's the terminal font size?" speaks the current value through `readBack`, and
      "what does Auto fetch do?" speaks `help` and offers "Want me to change it?". "What's in here?"
      on an open settings page reads out the section that was last revealed (or the one at the top
      of the screen), naming each control and its value.
- [ ] `CompanionVocabulary.settings` comes from the registry, and
      [`ask.ts`](../../../packages/desktop/src/main/companion/ask.ts) lists the settable keys (label,
      kind, range) in the route prompt within a byte budget, page on screen first. Each settings
      page shows a "Try: …" hint built from its specs' `example`.
  - *Acceptance:* fixtures in `companion.test.ts` cover a bool, an enum, a number step, a sub-key
    ("hide Media from the rail"), a page-only refusal, an ambiguous chip and each read form.

### E — `settings_*` on `midnite` (M)

- [ ] `settings_list` (key, label, page, section, tier, value kind, settable, current value),
      `settings_get`, `settings_set` and `settings_reset` (to `default`). Their schemas live in a new
      `shared/src/settings-mcp.ts`, the handlers in a new `desktop/src/main/mcp/settings-tools.ts`,
      and they reach the renderer through new `settingsList`/`settingApply` arms on
      `CompanionUiActionSchema`, answered by `ui-requests.ts` with `source: 'mcp'`.
- [ ] A new default-off **Settings ▸ MCP ▸ Let agents change app settings** switch
      (`allowSettings`, `mcp.json` v10 → v11) refuses all four, reads included. It is
      independent of `allowCompanionSettings`, so an existing grant does not widen.
- [ ] Confirm-tier `settings_set` reuses Phase 109's in-app confirm (`pendingAction` chip or
      `confirm-dialog.tsx`, 30 s in the renderer, 35 s in main). `never`-tier specs come back
      `settable: false` with a note, and secret values are never returned, only `hasValue`.
- [ ] Every agent change reveals the control (Theme C), takes the undo slot and gets "Your agent
      changed …" read-back plus a toast.

### F — Palette entries from the registry (S→M)

- [ ] A settings provider in [`providers.ts`](../../../packages/app/src/services/palette/providers.ts)
      lists one entry per non-`never` spec: "Toggle <label>" for bools, and "Set <label>…" for enums
      and numbers, which opens an inline value step. They are grouped by page and searchable by
      aliases.
- [ ] Choosing one reveals the control (Theme C) and writes through `applySetting(…, 'palette')`.
      Confirm-tier entries ask inline. `never`-tier keys are not listed; the page entry still is.

## Files this phase touches

| Area | Files |
|---|---|
| Contract | `shared/src/settings/` (new: `setting-spec.ts`, `pages/*.ts`, index), `shared/src/settings-mcp.ts` (new), [`shared/src/companion.ts`](../../../packages/shared/src/companion.ts), [`shared/src/domain/feature-manifest.ts`](../../../packages/shared/src/domain/feature-manifest.ts), [`shared/src/domain/resource-ref.ts`](../../../packages/shared/src/domain/resource-ref.ts), [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) |
| Setter | `app/src/features/settings/setting-apply.ts` (new), [`companion/settings-apply.ts`](../../../packages/app/src/features/companion/settings-apply.ts), [`companion/settings-announce.ts`](../../../packages/app/src/features/companion/settings-announce.ts), [`store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) |
| Pages + reveal | [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages/), [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx), [`frame/src/settings/`](../../../packages/frame/src/settings/), [`reveal/revealers/tools.ts`](../../../packages/app/src/features/companion/reveal/revealers/tools.ts), [`features/optimizer/manifest.ts`](../../../packages/features/optimizer/manifest.ts), monitor manifest, `apps/studio/src/composition.ts` |
| Grammar | [`companion/handoff.ts`](../../../packages/app/src/features/companion/handoff.ts), [`reveal/choice.ts`](../../../packages/app/src/features/companion/reveal/choice.ts), [`main/companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts) |
| MCP | `desktop/src/main/mcp/settings-tools.ts` (new), [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx), [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts) |
| Palette | [`services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green; no new `no-restricted-imports` exceptions;
      `layer-boundaries.test.mjs` passes.
- [ ] The coverage assertion holds: every `PREFERENCE_KEYS` entry has a spec, a `pageOnly` entry or
      a named exemption, and `setting-tiers.test.ts` pins the Strict table.
- [ ] Phase 109's suites (`settings-apply`, `settings-announce`, profiles, audition, tune) pass
      without edits to their assertions.
- [ ] Voice pass (packaged app, conversation mode): "open Companion settings, Personality",
      "turn the minimap off", "set the terminal font size to 14", "hide Media from the rail",
      "what does Auto fetch do?", "what's in here?", "undo that". Each reveals the right control,
      rings it, applies, and reads back.
- [ ] "Font size" on the Terminal page changes the terminal's font size without asking, and from
      the Graph view it posts a chip.
- [ ] Refusal pass: "allow force-push", "set my passcode", "turn on agent UI control" are all
      refused as page-only and offer to open the page; nothing is written.
- [ ] MCP pass from a real agent session: with the switch off all four tools are refused, naming
      it; with it on, `settings_list` → `settings_set` on a direct key applies with a toast and a
      ring, a confirm key prompts in the app, and a `never` key is refused.
- [ ] Palette pass: "Toggle minimap" and "Set terminal font size…" work, and no `never`-tier key
      is listed.
- [ ] A locked screen refuses every source; a popout companion relays to the main window.

## Not in this phase

- **Writing secrets in any form**: API keys, forge tokens, the passcode. They stay on their pages
  and in the vault.
- **Main-side settings over voice/MCP**: every `mcp.json` switch stays human-only.
- **Migrating every page's writes onto the setter.** Only guarded keys move (Decision 3); a full
  migration is an `outstanding.md` follow-up if page-side undo is ever wanted.
- **Generic map/list paths**: a `path` spec is written per sub-key, never inferred.
- **App-wide presets** (Phase 109 profiles for the whole app) and a guided **settings tour**
  ("next section, go through it with me"). Both build on this registry and are deferred.
- Linux and Windows, as everywhere.

## Decisions / open questions

1. **Direction: every setting, not a tour or a point-and-say layer.** *Settled by the user.* The
   registry, setter, reveal and grammar are the base the others would need anyway.
2. **Reveal, then change.** *Settled by the user:* every voice/MCP change opens and rings the
   control first, with "quietly" as the opt-out.
3. **Page writes.** *Settled: only guarded keys migrate.* Rejected: migrating all ~14k lines of
   pages for consistency. The cost is that undo covers voice, MCP and palette changes, not page
   edits.
4. **Compound keys.** *Settled: scalars plus named sub-keys*, the rest `pageOnly`. Rejected:
   scalars only (loses "hide X from the rail"), generic paths (unbounded ambiguity).
5. **Tiers.** *Settled: Strict*, as written in Theme A. Anything that gates the voice/MCP surface
   itself, holds a secret, or records a consent is `never`.
6. **MCP switch.** *Settled: a new `allowSettings`.* Rejected: broadening `allowCompanionSettings`,
   which would silently widen existing grants.
7. **Surfaces.** *Settled: voice/typed, MCP and the palette.*
8. **Where the registry lives.** *Recommendation:* shapes and Studio-owned page specs in `shared`
   (zod and data only, as Phase 109 did); feature-owned pages' specs in their manifests, merged
   by the composition. Open if a launcher-side app ever needs the registry without `shared`'s
   barrel.
9. **Same-name settings.** *Recommendation:* the page on screen wins outright; otherwise a choice
   chip, most-recently-changed first. Rejected: always asking (not hands-free), and silently
   picking by frecency (the wrong setting flips).
10. **Orphaned `editor*` keys.** *Recommendation:* spec them `noControl: true` so "turn word wrap
    on" works with nothing to reveal. Open: whether to give them a page section here instead,
    which would retire them from `KNOWN_ORPHANS`.
11. **Router prompt size.** *Recommendation:* send the on-screen page's specs in full and the rest
    as label-only within a byte budget. Measure `ask.ts` prompt size before and after.
12. **Order.** *Recommendation:* A, then B, then C, E and F in parallel, then D. A is the long
    pole (27 spec files); split it into one PR for the shapes and the coverage assertion and one
    or two for the page files.
