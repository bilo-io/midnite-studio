# Phase 134 — Councils synthesizer presets

Planned 2026-11-13 by an unattended agent · grounded against the tree as of `fcde795bf`.

Phase 133 made a council a thread, but every council still synthesizes one way (brainstorm), the synthesizer is a
single picker at the bottom of the config pane, members are always-open cards, and a new council has no say in how
many voices it gets. This phase puts the synthesizer first: its own container above the members, a synthesis type
(Brainstorm, Debate, Promote / Demote, Review / Red team, or Custom) with a recommendation for the current prompt and
editable instructions that reach the synthesis prompt. A preset brings its own members, revealed in a cascade; members
become accordions whose agent/model picker and trash stay in the header; a slider sets 2 to 6 members (3 on the free
tier, behind a `councils.pro` flag with an upgrade prompt); "Generate with AI" writes a Custom council's instructions
and members from the installed CLIs; and the new-council modal shows each member's provider mark.

> **Builds on.**
> - **Councils threads and synthesis** (Phase 133): the provider/model picker and agent marks (Theme B), the
>   fastest-installed-CLI recommend path `recommendCouncil` / `askOnce` (Theme E), and `buildSynthesisPrompt`
>   ([`council-prompts.ts`](../../../packages/features/councils/main/council-prompts.ts)).
> - **Suite preferences** (Phase 123 Theme L): one `suite-prefs.json` group per concern, read and written by a frame
>   store over `suitePrefsStorage`, so a flag flipped in Studio reaches Agents too.
> - **Motion** (Settings ▸ Appearance ▸ Motion: System, Full or Reduced): `.animate-fade-in-up` and its
>   reduced-motion guards in `styles.css`.
>
> **Scope guardrails.** No billing, licence check or account tier: `councils.pro` is a local flag, off by default,
> with a testing toggle. No anonymised or shuffled debate mechanics (members stay attributed). No streaming. macOS only,
> `react-icons` only, every new test a vitest unless it names the browser capability it needs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Synthesis types, presets and prompts.** ✅ A council carries `synthesisType` and optional
`synthInstructions` (`councils.json` v2; a v1 file migrates to Brainstorm); four presets in `shared/council-presets.ts`
with instructions and 2–3 members; a run snapshots the instructions and `buildSynthesisPrompt` uses them; a keyword
heuristic recommends a type. Debate's two roles were sharpened after the gate's first run, where both members argued
the same side: Affirmative takes the first option, Negative the second and is told not to concede.

**Theme B — The synthesizer container.** ✅ `council-synthesizer-card.tsx` sits above the members in a subtle
`gradient-border`: picker, type dropdown, the recommendation with "Use", instructions with "Reset to preset". A preset
brings its members in a CSS cascade (`animate-fade-in-up`, 90 ms apart). Switching to Custom keeps the instructions
already shown, so there is something to edit.

**Theme C — Member accordions.** ✅ Collapsed by default. The toggle is chevron + name; the provider/model picker
sits on the header's second line and the trash beside the toggle, both outside it, so they work while collapsed. The
trash disables at two members. The e2e check was folded into the existing `councils.spec.ts` rather than a new spec.

**Theme D — Member count and the `councils.pro` flag.** ✅ `FEATURE_FLAGS` in shared, a `featureFlags` suite-prefs
group and `useFeatureFlag` in the frame; a 2–6 slider with 4–6 shaded and locked unless the flag is on; past the cap
"Upgrade to Pro" opens and "See pricing" goes to `MIDNITE_PRICING_URL` through `openExternal`; Settings ▸ Agent has a
collapsed "Feature flags (testing)" section. No billing or licence check, as scoped.

**Theme E — Generate with AI.** ✅ `council:generate` asks the fastest installed CLI for instructions and members,
validates with zod, replaces unavailable providers, drops unknown models and clamps to the count. The panel ignores a
result that lands after the user switched councils (self-review fix). Gate: 8 s on the built app.

**Theme F — Provider icons in the new-council modal.** ✅ Every recommended member and the synthesizer use the
provider/model picker with its mark; a recommendation carries an optional `model`; recommend asks for at most the cap.

Landed in [#1229](https://github.com/bilo-io/midnite-studio/pull/1229).

## Build order

1. **A** first: the schema, presets and prompt every other theme reads.
2. **D** next (the flag and the cap the slider and Generate both read), then **C** and **B** (the panel rewrite).
3. **E** and **F** last: they reuse the panel's member editing and the recommend path.

## Deliverables

### A — Synthesis types, presets and prompts (M)

- [x] `COUNCIL_SYNTHESIS_TYPES = ['brainstorm', 'debate', 'promote-demote', 'review', 'custom']` in
  [`council.ts`](../../../packages/shared/src/council.ts); `CouncilSchema.synthesisType` (default `'brainstorm'`) and
  `synthInstructions` (optional, ≤ 4,000 chars). `CouncilFormatSchema` widens to the same enum, so an old run's
  `'brainstorm'` still parses; a run snapshots `synthInstructions` at start.
- [x] `COUNCIL_SYNTHESIS_PRESETS` (new `council-presets.ts` in shared): per preset a label, a one-line summary, the
  synthesizer's instructions and 2–3 members (name + perspective):
  - Brainstorm: members diverge; the synthesizer clusters and ranks.
  - Debate: members take opposing positions; the synthesizer judges.
  - Promote / Demote: one argues for, one against; the synthesizer weighs them into a recommendation.
  - Review / Red team: risk, security and UX critics; the synthesizer lists must-fix items.
- [x] `recommendSynthesisType(topic)` (pure, shared): keyword heuristic returning `{ type, reason }`; Brainstorm when
  nothing matches.
- [x] `councils.json` goes to version 2: a v1 file migrates each council to `synthesisType: 'brainstorm'`.
- [x] `buildSynthesisPrompt` takes the instructions (the preset's when none are stored); `buildMemberPrompt` names the
  council's kind. `council:create` and `council:update-members` carry `synthesisType` and `synthInstructions`.
- [x] Tests: `council-presets.test.ts` (every preset well formed, heuristic cases), `council-prompts.test.ts`
  (instructions reach the prompt), `councils-store.test.ts` (v1 → v2), `council-runner.test.ts` (snapshot).

### B — The synthesizer container (M)

- [x] A `SynthesizerCard` sits above the members in the config pane, in `gradient-border` (the brand ramp at its
  subtle alpha; no new colours): provider/model picker, synthesis-type dropdown, recommendation, instructions.
- [x] The recommendation reads the composer's draft, else the open thread's first prompt, else the council's
  description, and offers "Use" when it differs from the current type.
- [x] The instructions textarea is prefilled from the preset, editable, with "Reset to preset" once edited; for Custom
  it is empty with a placeholder.
- [x] Choosing a preset replaces the members with its own (keeping each slot's provider and model where one exists),
  and the new members reveal in a cascade: staggered fade and slide, no animation under reduced motion.
- [x] Tests: `council-config-panel.test.tsx` (preset applies members and instructions, recommendation "Use", reset).

### C — Member accordions (M)

- [x] Each member is an accordion, collapsed by default: header = drag handle, a toggle button (chevron and name)
  with `aria-expanded` and `aria-controls`, the trash beside it, and the picker on the header's second line, both
  outside the toggle (as built: long model labels squeezed the name when all three shared one line).
- [x] The body holds the name input and the perspective textarea.
- [x] Clicking the picker or trash never toggles; keyboard toggles with Enter/Space on the button; Alt+↑/↓ still
  reorders.
- [x] Tests: vitest (collapsed by default, toggle, header controls do not toggle) and one e2e
  (folded into `councils.spec.ts`, needs real layout and pointer hit-testing: the header picker and trash are
  clickable while collapsed).

### D — Member count and the `councils.pro` flag (M)

- [x] `FEATURE_FLAGS` in a new `shared/src/feature-flags.ts` (`councils.pro`, off by default) and a `featureFlags`
  suite-prefs group; `useFeatureFlagsStore` / `useFeatureFlag` in the frame over `suitePrefsStorage`.
- [x] `COUNCIL_MIN_MEMBERS = 2`, `COUNCIL_FREE_MEMBERS = 3`, `COUNCIL_PRO_MEMBERS = 6`; `councilMemberCap(pro)`.
- [x] A labelled slider (2–6) in the members header; the 4–6 range shows locked without pro. Moving past the cap (drag,
  keys or a click on the locked range) opens "Upgrade to Pro", linking to `MIDNITE_PRICING_URL`
  (`${MIDNITE_SITE_ORIGIN}/pricing/`) through the host's `openExternal`.
- [x] Changing the count adds members (cascade reveal, the preset's next perspective when it has one) or removes from
  the end.
- [x] Settings ▸ Agent gains a collapsed "Feature flags (testing)" section with the `councils.pro` switch.
- [x] Tests: `feature-flags.test.ts`, `feature-flags-store.test.ts`, and in the panel test the cap, the upgrade
  prompt and the pro range.

### E — Generate with AI (M)

- [x] `council:generate { name, topic?, count, providers: [{ provider, models }] }` in main: asks the fastest
  installed CLI (the recommend order) for `{ instructions, members: [{ name, role, provider, model }] }`, validates it
  with zod, replaces an unavailable provider with the one that answered, drops a model not in that provider's list,
  clamps to `count`, and returns the `GitOpResult` envelope.
- [x] The Custom synthesizer shows "Generate with AI"; the result fills the instructions and the members (cascade).
- [x] Tests: `council-recommend.test.ts` (generate parse, availability replacement, model drop, clamp, fall-through).

### F — Provider icons in the new-council modal (S)

- [x] Each recommended member and the synthesizer use the provider/model picker (mark in the trigger and options);
  a recommendation carries an optional `model`; recommend asks for at most the member cap.
- [x] Tests: the modal test checks the picker per member.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| [`packages/shared/src/council.ts`](../../../packages/shared/src/council.ts) | A D E F | types, instructions, caps, generate schema |
| `packages/shared/src/council-presets.ts` | A | net-new: presets and the type heuristic |
| `packages/shared/src/feature-flags.ts` | D | net-new: flag table, pricing URL |
| [`packages/shared/src/suite-prefs.ts`](../../../packages/shared/src/suite-prefs.ts) | D | `featureFlags` group |
| [`packages/shared/src/ipc/`](../../../packages/shared/src/ipc/) | A E | create/update fields, `council:generate` |
| `packages/frame/src/prefs/feature-flags-store.ts` | D | net-new |
| [`packages/features/councils/main/`](../../../packages/features/councils/main/) | A E | store v2, prompts, runner, generate |
| [`packages/features/councils/renderer/`](../../../packages/features/councils/renderer/) | B–F | synthesizer card, accordions, slider, upgrade prompt, modal |
| [`packages/app/src/compose/councils-host.tsx`](../../../packages/app/src/compose/councils-host.tsx) | D | `openExternal` |
| [`packages/modules/agents/renderer/compose/agents-hosts.tsx`](../../../packages/modules/agents/renderer/compose/agents-hosts.tsx) | D | `openExternal` |
| `packages/app/src/features/settings/settings-pages/agent-page.tsx` | D | testing toggle |

## Verification

- [x] Targeted checks green: `tsc --noEmit` per touched package, eslint on changed files, vitest on touched suites,
  `scripts/layer-boundaries.test.mjs`, `tracker-check`, `e2e-budget` (the workspace-wide gate is not run here).
- [x] **Gate — the built app, a throwaway `--user-data-dir`, no mocks.** Pick Debate and watch its members cascade in;
  collapse and expand a member and use its header picker and trash while collapsed; run one turn on Antigravity
  `gemini-3.8-flash-low` members with a Claude `haiku-4-5` synthesizer; Generate with AI for Custom; with pro off push
  the slider to 4 and see the upgrade prompt; with pro on use 5 members. Shots under `/tmp/midnite-shots-p134/`.

## Not in this phase

- **Real Pro entitlement.** No account, licence or payment check; the flag is local.
- **Main-side member cap.** The cap is a UI gate; main accepts up to the schema's 6.
- **Debate mechanics** (anonymised answers, rebuttal rounds). Members answer once per turn, attributed.
- **A model-backed type recommendation.** The heuristic is enough to suggest; Generate covers the model path.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Resolved — the presets and the free cap are the ones agreed with the user**: Brainstorm, Debate, Promote / Demote,
   Review / Red team plus Custom; free tier 3 members, pro 6, `councils.pro` off by default.
2. **Resolved — the flag lives in `shared` (`FEATURE_FLAGS`) and persists as a suite-prefs group** through a frame store,
   the way appearance and monitor prefs do, so features read it without a host port and every suite app sees one value.
3. **Resolved — the pricing link is `${MIDNITE_SITE_ORIGIN}/pricing/`**, the shared site-origin constant the Privacy page
   already uses and a route the website serves; no repo URL.
4. **Resolved — the type recommendation is a keyword heuristic**, instant and free; Generate with AI is the model path.
5. **Resolved — a preset keeps each slot's provider and model**, so picking Debate after setting up fast models does not
   reset them; extra slots take the last member's provider and model (as built).
6. **Resolved — every preset brings 2–3 members**, so each fits the free tier; the slider adds more.
7. **Resolved — a council over the cap (a 4-member council from before) keeps its members**; the slider can lower it but
   not raise it without pro.
8. **Resolved — Generate validates in main against the catalogue** (`modelsForAgent`) and the installed providers the
   renderer sends; anything else is replaced or dropped, never refused outright.
9. **Resolved — the cascade is CSS** (`animate-fade-in-up` with a per-member delay), so the existing reduced-motion
   guards cover it with no script.
