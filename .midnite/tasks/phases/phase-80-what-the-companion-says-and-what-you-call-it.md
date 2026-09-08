# Phase 80 — What the companion says, and what you call it

**Written directly** (no human in the loop — see Decisions) · 2026-09-09 · from a direct user
request relayed through the coordinating session, run unattended per that session's own
instructions (no `AskUserQuestion`; every call the user would normally make is recorded below).

The companion has spoken since [Phase 79](phase-79-the-companion-that-answers-back.md) landed:
`speechSynthesis` reads a formatted turn aloud through
[`markdownToSpeech`](../../../packages/shared/src/companion.ts) and
[`say`/`sayMarkdown`](../../../packages/app/src/features/companion/concierge.ts). Three complaints
came back from actually listening to it. It reads content that was only ever meant to be read —
SHAs, paths, URLs, version strings, branch refs. It reads too much of it, in one fixed sentence
shape every time. And it only ever answers to one name, which today does not exist as a setting at
all — the companion has no address a user can change. This phase plans all three; it builds
nothing.

> **5 findings, verified against the current tree, that this phase is built on.**
>
> **1. `markdownToSpeech` strips markup, not machine-facing content.** It is the one pass between a
> written turn and the words `speechSynthesis` says
> ([`companion.ts:1219-1252`](../../../packages/shared/src/companion.ts)), and its own tests prove
> the gap: `markdownToSpeech('## **Landed** since \`Tuesday\`')` returns `'Landed since Tuesday.'`
> ([`companion.test.ts:1013`](../../../packages/shared/src/companion.test.ts)) and
> `markdownToSpeech('**midnite-studio** — on \`main\`')` returns `'midnite-studio — on main.'`
> ([`companion.test.ts:1025`](../../../packages/shared/src/companion.test.ts)). Backticks are
> stripped; whatever they were wrapping is spoken verbatim. `refSuffix`
> ([`companion.ts:1098-1102`](../../../packages/shared/src/companion.ts)) is the concrete producer —
> it appends `` (`{ref}`) `` to a digest row whenever the title doesn't already say the ref, and
> `ref` is an 8-character commit SHA (`digest.ts:200` slices `cursor.sha.slice(0, 8)`). Every landed
> commit not already named in its own title gets its SHA read aloud.
> **2. There is already a category-and-count summariser, and it has no variation at all.**
> [`summariseDigest`](../../../packages/shared/src/companion.ts) (`companion.ts:450-479`) already
> does the shape of aggregation Theme B needs — `countByKind` (`companion.ts:421-435`) buckets by
> `kind` (`'commit' | 'pr' | 'phase'`, the digest item's *source*, not its *kind of change*) and
> `digestSection`/`COMPANION_DIGEST_NAME_CAP = 5` (`companion.ts:390`, `:1120-1123`) names up to five
> and collapses the rest to "and N more". But every sentence it produces is one fixed template —
> `` `${capitalise(when)}, ${countByKind(...)} landed — ${joinTitles(...)}.` `` — called the same way
> every time, with **no injected RNG at all**. This phase extends an existing function rather than
> writing a new one.
> **3. An injectable-RNG convention already runs through this exact file.** `pickPhrase(bank, recent,
> rng: () => number = Math.random)` (`companion.ts:214-228`), `nextFillerDelayMs(rng = Math.random)`
> (`companion.ts:839-843`) and `ConciergeDeps.rng?: () => number` (`concierge.ts:77`, threaded into
> `phrase()` at `concierge.ts:130`) are the same pattern three times over: a default-parameter
> `rng`, never a captured global, so every test injects a deterministic function. There is no
> separate seeded-RNG utility module — the convention *is* "accept an injectable `rng`, default
> `Math.random`" — and Theme B's testability plan is to be the fourth instance of it, not a fifth
> pattern.
> **4. The engine choice was settled once, narrowly, and never revisited.** Phase 79 justified
> `speechSynthesis` as "free" because Chromium's `SpeechRecognition` doesn't work in Electron but
> `speechSynthesis` does (`phase-79-the-companion-that-answers-back.md` lines 48-52) — no alternative
> engine was evaluated, and `defaultSpeakerDeps` (`speaker.ts:102-123`) wires `window.speechSynthesis`
> directly with no seam for a second implementation beyond the `SpeakerDeps` injection point itself.
> `channels.ts:851-856` states outright: *"Speech out needs no channel at all —
> `speechSynthesis` is a renderer API."* That sentence stops being true the moment the engine is not
> a renderer API, which is exactly what Theme C proposes.
> **5. There is no "companion name" setting to migrate — this is new scope, not a widen.** Grepping
> `packages/shared/src`, `packages/app/src/features/companion` and `packages/app/src/store/ui-store.ts`
> for `wakeWord`, `companionName`, `callSign`, `alias` and `addressName` returns nothing. Phase 79
> named "no wake words" as an explicit non-goal. The one thing that looks adjacent —
> `companionHonorific` (`ui-store.ts:1279-1280`, persisted at `ui-store.ts:2248`) — is what the
> companion calls *the user* (`interpolatePhrase`'s `{name}`, `companion.ts:139,241`), not what the
> user calls the companion. The only existing "name" is the hardcoded label `'Companion'`
> (`ui-store.ts:243`, `runtime.ts:159`). Theme D is a from-scratch setting, and its "migration" is
> therefore a version bump with nothing to carry forward — recorded honestly in Decisions rather
> than invented.

**Builds on.** [Phase 79](phase-79-the-companion-that-answers-back.md) end to end: the concierge
flow (`concierge.ts`), the phrase/RNG convention (`companion.ts`), the digest grounding channels
(`channels.ts:824-849`), and the Settings ▸ Companion page
([`companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx)).
Theme C also leans on this repo's one existing native-module precedent, `node-pty`
(`packages/desktop/package.json:20`, `scripts/fix-node-pty.cjs`, `docs/INITIAL_PLAN.md:27,147`) —
main-process-only, single Electron ABI, a postinstall permission fix for a prebuilt binary.

**Scope guardrails.** No new renderer dependency for Theme C — `packages/app`'s JS budget is already
over its own number (`phase-79` line 80-81: *"Phase 77 — total JS is 35.4 MB against a 15.95 MB
budget"*), so any TTS runtime lands in `packages/desktop` only, per `CLAUDE.md`'s package boundaries
(`packages/app` reaches main only through `window.midniteStudio`; only `packages/desktop` imports
`electron` or a native module). Themes A and B touch only `packages/shared` and the two existing
companion files that already own this text — no new file layout, no new IPC channel. Theme D adds
exactly one new persisted setting and one settings-page control; no wake-word *detection*, no
always-listening microphone — that STT-trigger idea is explicitly out of scope (see below).

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Sequencing.** A before B: B's aggregated sentences flow through the same spoken-form sanitizer A
adds, and building B against an already-safe pipeline avoids re-testing sanitization twice. C is
independent of A/B and D, and by far the largest lift (new dependency, native module, IPC channel) —
land it whenever effort allows, but it consumes exactly what A/B produce (`chunkForSpeech`'s output
string), so building it last means testing a new engine against an already-fixed transform. D is
fully independent of A/B/C and can land in any order.

## Deliverables

### A — A spoken-form transform that never says a SHA (S) — ✅ DONE (PR #294, 2026-09-09)

The gap Finding 1 names: `markdownToSpeech` strips markdown syntax but not the machine-facing
tokens inside it. This theme adds one more pure pass, sitting between `markdownToSpeech`'s output
and `splitForSpeech`'s input, so the on-screen markdown is byte-for-byte unchanged and only the
spoken projection is redacted.

- [x] Add `sanitizeForSpeech(text: string): string` to `packages/shared/src/companion.ts`, placed
  immediately after `markdownToSpeech` (`companion.ts:1219-1252`) since it operates on that
  function's output, not the raw markdown (markdown's own backtick/link syntax has already been
  removed by then, so this pass matches plain text, not markdown).
  - *Acceptance:* a 7-40 character hex run bounded by word breaks (a commit SHA, short or long)
    becomes a fixed placeholder word ("a commit") unless it is already followed by a title that
    makes it redundant — reuse `refSuffix`'s own test (`item.title.includes(ref)`) as the model:
    don't double-announce what the sentence already named.
  - *Acceptance:* an absolute or relative file path (`/`- or `\`-delimited, at least one path
    separator, a recognisable extension or a `packages/…`-shaped prefix) collapses to its basename,
    or to "a file" when even the basename is unhelpful spoken aloud (e.g. `index.ts`).
  - *Acceptance:* an `http(s)://` URL — including the bare autolink form `markdownToSpeech` already
    preserves via `.replace(/<((?:https?|mailto):[^>]+)>/g, '$1')` (`companion.ts:1226`) — becomes
    "a link" or the link's own already-extracted markdown *text* (from `!?\[([^\]]*)\]\([^)]*\)`
    at `companion.ts:1223`) when one exists, never the URL string itself.
  - *Acceptance:* a semver-shaped token (`v?\d+\.\d+\.\d+`) becomes "a new version" (or is dropped
    entirely when it's the whole clause, e.g. a bare version-bump line).
  - *Acceptance:* a branch/ref name — the thing `companion.test.ts:1025` proves leaks today — is
    left alone when it's a common word already meaningful spoken (`main`, `master`) but redacted to
    "a branch" for anything punctuation-heavy (`feature/companion-plan`, `release/v0.3.1`).
  - *Acceptance:* running `sanitizeForSpeech` twice is idempotent (`sanitizeForSpeech(sanitizeForSpeech(x)) === sanitizeForSpeech(x)`)
    — it must never partially re-redact its own placeholder words.
- [x] Call it from `sayMarkdown` (`concierge.ts:123-125`): `say(deps, markdown, 'companion',
  sanitizeForSpeech(markdownToSpeech(markdown)))`, the one call site every companion utterance
  already funnels through — no other caller of `markdownToSpeech` exists to update.
- [x] Unit tests in `packages/shared/src/companion.test.ts` (new `describe('sanitizeForSpeech')`
  block beside the existing `describe('markdownToSpeech')` at `companion.test.ts:1005`): one case
  per acceptance bullet above, plus a full-digest-row fixture (`- Fix the thing (\`a1b2c3d\`)` →
  markdownToSpeech → sanitizeForSpeech) proving the SHA never reaches the final string.
- [x] A settings-page regression test in `companion-voice-page.test.tsx` asserting the "Say hello"
  preview (`companion-page.tsx:92-95`) is unaffected — that phrase bank never contains a SHA/path/URL,
  so this is a non-regression check, not new coverage of the transform itself.

**Landed** — see [`done.md`](../done.md) (2026-09-09) for the narrative. The SHA-redundancy and
hex-precision heuristics this theme needed beyond the doc's own wording (a bare `title.includes`
check has no structured title to read here, and "7-40 character hex run" alone over-matches plain
words/counts) are recorded as unattended decisions in [PR #294](https://github.com/bilo-io/midnite-studio/pull/294)'s
description rather than invented silently.

### B — Aggregated, randomised digest phrasing (M) — ✅ DONE (PR #296, 2026-09-09)

Finding 2/3: extend `summariseDigest` rather than replace it, adding category buckets and template
variety on top of the count-and-name shape it already has.

- [x] Add a category layer *above* `countByKind`'s source-kind buckets, reusing
  [`parseConventionalCommit`](../../../packages/shared/src/version.ts) (`version.ts:174-189`) and
  `KNOWN_COMMIT_TYPES` (`version.ts:145-156`) rather than writing a second commit-message parser —
  `CompanionDigestItem.title` for `kind: 'commit'` items is `cursor.subject`
  (`packages/desktop/src/main/companion/digest.ts:200`), a conventional-commit subject by this
  repo's own house style, and `kind: 'pr'` titles (`digest.ts:216,233`) follow the same convention
  in practice (visible in this repo's own `git log`). Map `type === 'chore' && scope === 'deps'` to
  a `"dependency update"` bucket distinct from generic `chore`; map `fix` → `"fix"`, `feat` →
  `"feature"`, everything else falls back to `countByKind`'s existing source-kind label so nothing
  silently disappears when a title doesn't parse as conventional.
  - *Acceptance:* the user's own example reproduces — a digest of 4 `chore(deps): …` commits and 3
    `fix: …` commits summarises as "4 dependency updates, 3 fixes" with one representative title
    from each bucket ("including updating `{x}` in `{y}`" — `{y}` from the commit's own `scope`
    when the type isn't `deps`, since `deps`'s scope is already spent naming the bucket).
- [x] Add an injectable `rng: () => number = Math.random` parameter to `summariseDigest`, following
  the exact pattern at `pickPhrase` (`companion.ts:214`) and `ConciergeDeps.rng`
  (`concierge.ts:77`) — not a new pattern, the fourth instance of the same one.
- [x] A small set (4-6) of interchangeable sentence templates per section ("landed" / "in progress"),
  each a pure string-template function taking the same aggregated data `summariseDigest` already
  computes (`countByKind`'s parts, `joinTitles`'s representative names, `sinceLabel`'s `when`), and
  `pickPhrase`-style connectives ("including", "among them", "notably") chosen by the injected
  `rng`, never a fixed string concatenation.
- [x] A template-grammar check (a vitest, not a lint rule — this repo's `eslint.config.mjs` has no
  precedent for asserting *string content*, only import shape) that renders every template at
  count 0, 1, 2 and 5+ and asserts the output has no double space, no dangling connective, and
  correct pluralisation via the existing `plural(count, word)` helper (`companion.ts:409`) — this
  is the "1 fixes" failure mode named in the brief, caught mechanically rather than by eyeballing
  fixtures.
- [x] `companion.test.ts`'s existing `describe('summariseDigest')` block (`companion.test.ts:265`)
  gains: category-bucket assertions, an `rng` injection test proving two calls with different
  seeded sequences produce different (but both grammatical) sentences, and one call with a rng
  stubbed to a fixed sequence for byte-exact snapshot-style assertions (the deterministic-test
  requirement from the brief).

**Landed** — see [`done.md`](../done.md) (2026-09-09) for the narrative. [PR #296](https://github.com/bilo-io/midnite-studio/pull/296)'s
description records the unattended calls beyond the doc's own wording: the representative clause
uses "updating `x`"/"updating `x` in `y`" literally rather than a per-category verb, the
representative-specifics clause only fires past `COMPANION_DIGEST_NAME_CAP` (below it, every title
is still named via the unchanged `joinTitles`), `plural()`'s pluraliser itself was fixed rather than
adding a bespoke map for the two new category words, and one pre-existing test's exact wording
(`'still in flight'`) was loosened to the substring every new template shares (`'in flight'`).

### C — Replace `speechSynthesis` with a local, free, low-RAM voice (L)

Finding 4/5: `speechSynthesis` sounds robotic and was never evaluated against an alternative. This
theme lands **`sherpa-onnx-node`** running a Piper VITS voice, entirely in `packages/desktop`, with
one new IPC channel carrying synthesized audio to the renderer. See the TTS comparison below for
the full evaluation; only the recommendation is planned as build work here.

- [ ] Add `sherpa-onnx-node` (Apache-2.0) as a `packages/desktop`-only dependency, alongside its
  platform optional dependency (`sherpa-onnx-darwin-arm64` for this repo's primary target). No
  registry-auth concern — it's a public npm package, not `@bilo-io/*` scoped
  (`docs/INITIAL_PLAN.md:22`'s GitHub Packages token requirement doesn't apply). Follow the
  `node-pty` precedent exactly (`docs/INITIAL_PLAN.md:27,147`): main-process-only import, one
  Electron ABI, and a postinstall permission-fix script analogous to
  [`scripts/fix-node-pty.cjs`](../../../scripts/fix-node-pty.cjs) if the prebuilt binary needs one
  (verify during implementation; sherpa-onnx-node's darwin-arm64 binary may already ship
  correctly-permissioned).
- [ ] Ship one voice model (a Piper `en_US-*-medium` voice, ~30-75 MB) bundled or downloaded on
  first use into `app.getPath('userData')` — never into the app bundle or repo, matching the
  `kokoro-js`/`transformers.js` cache-location caution the TTS research surfaced. Verify the
  specific voice's own model card licence before shipping it (Piper's engine licence changed
  upstream — see Decisions #4) — not every voice in `rhasspy/piper-voices` carries the same terms
  as the repo's top-level MIT.
- [ ] A new invoke channel, `companionTtsSynthesize: 'mstudio:companion:tts-synthesize'`, added to
  `packages/shared/src/ipc/channels.ts` beside the existing companion voice block
  (`channels.ts:851-875`) — text in, a `Uint8Array` of PCM/WAV audio out, following the exact
  wire-shape precedent `companionTranscribe` already sets (`channels.ts:864`: *"The audio is a
  `Uint8Array`, structured-cloned exactly as `pty:data`... base64 would cost a third more wire"*).
  Update the doc comment at `channels.ts:851-856` — "speech out needs no channel at all" stops
  being true the moment the engine isn't a renderer API.
- [ ] A `packages/desktop/src/main/companion/tts.ts` owner: holds the loaded sherpa-onnx-node
  session (loaded once, lazily, on first synthesis request — mirroring `AudioContext`'s own
  lazy-creation precedent at `audio/context.ts:9-14`), and answers the new channel.
- [ ] On the renderer side, `speaker.ts`'s `SpeakerDeps` (`speaker.ts:68-81`) gains a second
  implementation of the same shape `defaultSpeakerDeps` (`speaker.ts:102-123`) provides today: play
  the returned `Uint8Array` through the companion's existing `AudioContext`/`master` gain node
  (`audio/context.ts:29-31`, "every source connects here, never to `ctx.destination` directly") via
  `decodeAudioData` + an `AudioBufferSourceNode`, rather than `SpeechSynthesisUtterance`. This
  reuses the volume/gain wiring `setCompanionVolume` (`companion-page.tsx` import) already has
  instead of duplicating it.
  - *Acceptance:* `companionVolume` (`ui-store.ts:1321`) audibly affects the new engine's output
    exactly as it does `speechSynthesis` today, with no separate volume control.
- [ ] A Settings ▸ Companion ▸ Voice fallback: if the local engine fails to load (missing binary,
  unsupported platform), fail soft to `speechSynthesis` — the same "lazy fail-soft require degrades
  to unavailable, not a crash" posture `docs/INITIAL_PLAN.md:147` already prescribes for `node-pty`.
  Never leave the companion mute because a native module didn't load.
- [ ] Perf: measure resident RAM with the model loaded, using this repo's own
  [`scripts/perf/`](../../../scripts/perf/) conventions (`CLAUDE.md`'s "Perf claims come with a
  number" rule) — the packaged-app-equivalent build, not dev mode.

### D — The companion answers to more than one name (S)

Finding 5: greenfield, not a migration — recorded as such rather than invented.

- [ ] Add `companionNames: string[]` to `ui-store.ts`'s persisted `UiState` slice, beside the other
  `companion*` fields (`ui-store.ts:1263-1333` for the type block, `:2246-2253` for the persisted
  partialize list), defaulting to `['Companion']` — the one name that already exists today as the
  hardcoded label (`ui-store.ts:243`), so a fresh install's behavior does not change.
- [ ] Bump `version: 14` → `15` (`ui-store.ts:2164`) and add a `version < 15` arm to the `migrate`
  function (`ui-store.ts:2297` onward, following the exact shape of the `version < 2` /
  `version < 3` arms already there) that sets `companionNames = ['Companion']` for every existing
  installation — there is no old scalar to read forward (Finding 5), so migration here means "give
  every pre-15 user the same default a fresh install gets," not a value transplant.
- [ ] A schema in `packages/shared` — `CompanionNamesSchema = z.array(z.string().trim().min(1)).min(1)`
  — validated wherever the array is written (the settings page's own add/remove handlers, not a new
  IPC boundary since this stays a renderer-only zustand-persisted setting like `companionHonorific`
  already is).
- [ ] A pure matcher in `packages/shared/src/companion.ts`, beside `parseIntent`
  (`companion.ts:1453`) since it's the same "read text the user typed or said" concern:
  `matchesCompanionName(text: string, names: readonly string[]): boolean` — case-insensitive,
  trimmed, matches any of the names as a whole-word/whole-utterance test (not a substring — "Moses"
  should not match a name "Mo"). Rejects being asked to add an empty string or a case-insensitive
  duplicate at the call site, not inside the matcher itself (the matcher only reads the array; the
  settings page owns validation on write).
  - *Acceptance:* unit tests in `companion.test.ts` beside `describe('parseIntent...')` blocks
    (`companion.test.ts:570` onward) covering case-insensitivity, trimming, multiple aliases, and
    the non-substring guarantee.
- [ ] Settings ▸ Companion, Personality section (`companion-page.tsx:286-317`, beside
  `companionHonorific`'s field): a bespoke pill-list control, since
  [`@bilo-io/ui`](../../../node_modules/@bilo-io/ui) ships no tag/token/chip input (its full export
  list — `Accordion`, `Button`, `Card`, `Collapse`, `ContextRing`, `Input`, `Select`,
  `StyledSelect`, `Switch`, `Tabs`, `Textarea`, and the reading/chart/gauge components — has no
  match; confirmed against `dist/index.d.ts`). Compose it from primitives that already exist rather
  than starting from nothing: `TextField`'s input styling (`field.tsx:90-119`, `TEXT_INPUT_CLASSNAME`)
  for the entry field, and `IconButton` (`icon-button.tsx:122`, which already takes an accessible
  `label` prop) with `LuX` from `react-icons/lu` for each pill's remove control — never
  `lucide-react`, per `CLAUDE.md`. Visually, follow the rounded-pill convention this app already has
  at `FilterPill` (`packages/app/src/features/optimizer/components/filter-pill.tsx:31-40`:
  `rounded-full border px-2.5 py-0.5`), styled at rest rather than as a toggle.
  - *Acceptance:* typing a name and pressing Enter commits it as a pill and clears the field,
    validated through `CompanionNamesSchema` before it's added (rejecting empty/duplicate with an
    inline message, not a silent no-op).
  - *Acceptance:* pressing Backspace in an empty entry field deletes the most-recently-added pill —
    the standard token-input affordance.
  - *Acceptance:* each pill's remove control is an `IconButton` with `label={`Remove "${name}"`}` —
    a screen reader announces which name a given × removes, not a bare "remove" repeated per pill.
  - *Acceptance:* deleting the last remaining pill is **blocked**, not silently backfilled — see
    Decisions #6 for why blocking beat falling back to a default.
  - *Acceptance:* the control renders correctly in both themes (no hardcoded pill background/border
    color — reuse the app's existing `border`/`bg-muted`-style tokens, the same ones `FilterPill`
    already draws from).

## Files this phase touches

| Package | Path | Themes |
|---|---|---|
| shared | [`companion.ts`](../../../packages/shared/src/companion.ts) | A, B, D |
| shared | [`companion.test.ts`](../../../packages/shared/src/companion.test.ts) | A, B, D |
| shared | [`version.ts`](../../../packages/shared/src/version.ts) | B (read-only reuse, unchanged) |
| shared | [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | C |
| app | [`companion/concierge.ts`](../../../packages/app/src/features/companion/concierge.ts) | A |
| app | [`companion/speaker.ts`](../../../packages/app/src/features/companion/speaker.ts) | C |
| app | [`companion/audio/context.ts`](../../../packages/app/src/features/companion/audio/context.ts) | C |
| app | [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | D |
| app | [`settings-pages/companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx) | C, D |
| app | [`settings-pages/companion-voice-page.test.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-voice-page.test.tsx) | A, C, D |
| app | [`components/form/field.tsx`](../../../packages/app/src/components/form/field.tsx) | D (reused, unchanged) |
| app | [`components/icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx) | D (reused, unchanged) |
| desktop | `main/companion/tts.ts` (new) | C |
| desktop | `main/companion/digest.ts` | B (read-only reuse, unchanged) |
| desktop | `package.json` (`sherpa-onnx-node` dependency) | C |

**Unchanged and load-bearing:** `packages/app/package.json` — no new renderer dependency; the TTS
runtime is desktop-only per the bundle-budget guardrail above.

## Verification

- [ ] Unit: `sanitizeForSpeech` — every acceptance bullet in Theme A, plus the idempotence property.
- [x] Unit: `summariseDigest`'s category buckets, `rng` injection, and the template-grammar sweep
  (counts 0/1/2/5+) from Theme B.
- [ ] Unit: `matchesCompanionName` — case-insensitivity, trimming, multi-alias, non-substring.
- [ ] RTL: `companion-voice-page.test.tsx` — the pill editor's Enter-to-commit, Backspace-to-delete,
  last-pill-blocked, and per-pill accessible-name assertions from Theme D.
- [ ] RTL: Settings ▸ Companion still renders and the "Say hello" preview still plays with Theme A's
  transform in the pipeline (non-regression).
- [ ] `moon run :typecheck :lint :test` green, including the desktop-package `sherpa-onnx-node`
  addition passing eslint's `no-restricted-imports` boundary check (no `packages/app` import of it).
- [ ] Perf: `moon run app:build desktop:bundle` then `scripts/perf/bundle-report.mjs` — confirm zero
  renderer bundle growth from Theme C (the dependency is desktop-only).
- [ ] **Open, for a human:** listen to a real digest with 4+ dependency-update commits and confirm
  the spoken summary matches the user's own example shape ("there have been 4 dependency updates,
  3 fixes, including updating {x} in {y}") — no assertion can judge whether a sentence *sounds*
  natural.
- [ ] **Open, for a human:** A/B the new local voice against `speechSynthesis` on a packaged macOS
  arm64 build and confirm it is audibly more natural — the whole premise of Theme C.
- [ ] **Open, for a human:** confirm the local voice's first-utterance latency (model load + first
  synth) is not a regression against `speechSynthesis`'s effectively-instant start, per Theme C's
  perf measurement.

## Not in this phase

- **Wake-word *detection* (always-listening microphone).** Theme D's names are matched against
  typed or already-transcribed text (the existing push-to-talk/hands-free STT flow from Phase 79
  Theme F), not a new continuous-listening trigger — that is a materially different feature
  (privacy posture, always-on audio capture) Phase 79 already named out of scope and this phase
  does not revisit.
- **Per-name personas or voices.** One voice, one personality, still — multiple names change what
  *invokes* the companion, not what it sounds like or how it behaves once invoked.
- **A generalised template-linting eslint rule.** Theme B's grammar check is a vitest over the
  template set, not a static-analysis rule; this repo's `eslint.config.mjs` has no precedent for
  asserting string content and this phase doesn't start one.
- **Streaming/incremental TTS playback.** Theme C synthesizes a full utterance (already chunked by
  `chunkForSpeech`) before playback, matching `speechSynthesis`'s own per-utterance granularity
  today — true streaming synthesis is a further optimization, not required for "more natural."
- **Swapping the STT (speech-*in*) provider.** Out of scope entirely; this phase is voice-*out* and
  addressing, not the Whisper/Deepgram seam Phase 79 Theme F already built.
- **Localizing the new templates or names to non-English.** `sinceLabel`, `countByKind`, and every
  existing phrase bank are English-only today; Theme B's templates follow that precedent rather
  than introducing i18n as a side effect.

## TTS candidate comparison

| Candidate | Code licence | Model-weights licence | Package size | Resident RAM | Model size (cached) | Renderer or main? | Latency to first audio | Offline | macOS arm64 |
|---|---|---|---|---|---|---|---|---|---|
| **`sherpa-onnx-node` + Piper voice (recommended)** | Apache-2.0 | Inherits the loaded voice — most `rhasspy/piper-voices` are MIT/CC-BY-4.0, **verify the specific voice**; the *engine* itself carries no model of its own | Bindings ~61 KB + a per-platform native binary (`sherpa-onnx-darwin-arm64`) | Reasoned from a VITS model this size: comfortably under 200 MB | ~20-75 MB per voice | **Main/child process** — native Node addon, same category as `node-pty` | ~141 ms time-to-first-audio (measured, streaming-VITS-via-sherpa-onnx benchmark) | Fully offline after one voice download | Official prebuilt binary |
| `kokoro-js` (Kokoro-82M, runner-up) | Apache-2.0 | **Apache-2.0** — the cleanest weights licence found, trained on permissive/synthetic-only audio | ~30.4 MB unpacked (bundles `@huggingface/transformers`) | Reasoned: ~150-300 MB at q8 quantization | 86-326 MB depending on quantization tier (q8f16 ≈ 86 MB) | **Either** — WASM/WebGPU in renderer, or `onnxruntime-node` in main | ~100-300 ms synth once loaded (M1/M2 CPU benchmarks); model/session load adds 0.5-2 s on first use | Fully offline after download | WASM everywhere; native darwin-arm64 prebuilds for `onnxruntime-node` |
| `@lobehub/tts` | MIT (code) | **No local model at all** — its only fee-free backend (`EdgeSpeechTTS`) is an unofficial, reverse-engineered Microsoft endpoint: requires network, not a published/supported API, can be cut off without notice | 125 KB package, but pulls `openai`/`antd`/`react` as real dependency weight | N/A — no local model | N/A | N/A | N/A | **Not offline-capable on its free path** | N/A |
| Piper (native binary, direct) | Upstream `rhasspy/piper` (MIT) is **archived**; the maintained fork `OHF-Voice/piper1-gpl` is **GPL-3.0** (embeds GPL `espeak-ng`) | Same as above — per-voice, mostly MIT/CC-BY-4.0 | No official npm package; unofficial WASM wrappers (`piper-wasm`, `piper-plus`, both MIT) exist | Comfortably under 200 MB (Pi 4 was its original design target) | ~20-75 MB per voice | Native binary via `child_process` (main), or WASM (renderer) via the unofficial wrappers | Not independently benchmarked here; design target is real-time-or-faster on far weaker hardware than this app's target | Fully offline | Historically shipped macOS binaries; not confirmed for the new GPL fork specifically |
| Coqui TTS / XTTS v2 | MPL-2.0 (code, community-maintained fork post-shutdown) | **CPML — explicitly non-commercial**, and Coqui Inc. is defunct so no commercial licence can even be purchased | — | Multi-hundred-MB to >1 GB checkpoints — the heaviest candidate | Same | Main (Python-oriented; no clean Node story) | — | Offline once downloaded | — |

**Recommendation: `sherpa-onnx-node` running a Piper VITS voice, in `packages/desktop`'s main
process.** It is the lightest RAM footprint of every viable candidate, has an official darwin-arm64
native binary, the best-measured latency (141 ms time-to-first-audio), and — because sherpa-onnx is
an independent Apache-2.0 *runtime* that merely loads Piper-format ONNX voices rather than linking
Piper's own now-GPL code — it sidesteps that licence change entirely. **Runner-up: `kokoro-js`**,
whose voice quality is generally rated more natural and whose licence story is the cleanest of
anything researched (Apache-2.0 code *and* weights), but which costs roughly 1-3× the RAM and disk
of a Piper voice for that quality gain. Both share the same integration shape (native/ORT process,
same channel design), so Decisions #4 below leaves the door open to swapping the loaded model later
without redesigning the plumbing. **Disqualified:** `@lobehub/tts` (no genuine local/offline path —
its one free backend is an unofficial, network-dependent third-party endpoint, not a "free forever"
guarantee); Coqui/XTTS v2 (flagship weights are non-commercial-only and the vendor is defunct, on
top of being the heaviest option by far).

## Decisions / open questions

All ten calls below were made unattended, per the coordinating session's explicit instruction to
resolve every interactive choice itself rather than pause for one. Each records the reasoning so a
human reviewing this doc can override any of them before Theme work starts.

1. **Where does the spoken-form transform live — `shared` or renderer?** *Settled: `shared`, as a
   pure function beside `markdownToSpeech`.* It needs no DOM/renderer API, `markdownToSpeech`
   already sets the precedent of "this is a pure transform, unit-tested in `shared`" for exactly
   this kind of text-to-speech projection, and keeping it there means `companion.test.ts` covers it
   with the same fixture style as everything else in the file.
2. **Redact vs. abbreviate machine-facing tokens?** *Recommendation: redact to a category word
   ("a commit", "a file", "a link"), not abbreviate.* A shortened SHA or a truncated path is still
   an unpronounceable string a synthesiser will spell out letter-by-letter; the goal is a sentence
   that sounds like a sentence, which a category noun does and an abbreviation doesn't.
3. **Should Theme B's category buckets replace `countByKind`'s source-kind grouping, or sit above
   it?** *Recommendation: sit above it, `countByKind` unchanged.* `countByKind`'s commit/PR/phase
   distinction still matters for the "in progress" section (a PR review request reads differently
   from an open phase), so the new conventional-commit-type layer is additive scope for the
   "landed" section specifically, where the user's own example lives.
4. **Kokoro vs. Piper-via-sherpa-onnx — pick one now or leave both live?** *Recommendation: build
   the integration once, against sherpa-onnx-node's loader, and treat the *model* as swappable
   configuration.* Both are ONNX voices sherpa-onnx-node can load through the same API, so this
   isn't an either/or architecture decision, just a model-file choice that can change without
   touching Theme C's IPC channel or renderer playback code.
5. **New IPC channel name.** *Settled: `mstudio:companion:tts-synthesize`, invoke, added beside the
   existing companion voice block in `channels.ts`.* Matches the `mstudio:companion:<verb>` naming
   convention every other companion channel already uses.
6. **Deleting the companion's last name — block, or fall back to a default?** *Settled: block.* A
   companion with zero addresses is a state nothing in this codebase can render sensibly (every
   caller of `matchesCompanionName` would need a null-case), and a silent fallback to `'Companion'`
   after the user explicitly deleted it would surprise them more than a disabled remove button on
   the last pill does. The UI disables (not hides) the × on a single remaining pill, with a tooltip
   explaining why — the same "explained disable" pattern `IconButton`'s own `disabledReason` prop
   already supports (`icon-button.tsx`'s `explained` branch).
7. **Reuse `TextField` for the pill entry field, or build a raw `<input>`?** *Recommendation: a raw
   `<input>` sharing `TextField`'s styling constant, not `TextField` itself.* `TextField`
   (`field.tsx:90-119`) has no `onKeyDown` prop, and this control's Enter/Backspace handling is
   specific enough (commit-and-clear, delete-last-on-empty) that threading a new prop through a
   shared primitive for one caller is worse than a five-line local input.
8. **Whole-word vs. substring matching for `matchesCompanionName`?** *Settled: whole-utterance/whole-word*, per the brief's own "Moses shouldn't match Mo" implication — a substring
   match would make short names unusable.
9. **Does Theme D need a new IPC channel?** *Settled: no.* `companionNames` stays a
   zustand-persisted renderer setting exactly like `companionHonorific` already is — nothing about
   it needs main-process involvement, unlike Theme C's model, which genuinely can't run in the
   renderer at acceptable RAM.
10. **Sizing.** *Settled as written above* (A: S, B: M, C: L, D: S) based on each theme's real
    surface area — C is the only one touching a new dependency, a native module, and an IPC
    channel simultaneously, which is a different order of work from a pure-function addition.
