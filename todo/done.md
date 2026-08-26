# Done — append-only log

<!-- Append one entry per landed phase/PR: date, phase, PR link, one-line summary. -->

## 2026-08-26 — Phase 19 · Theme B — Repository statistics from one history traversal

Landed on `feature/phase-19-stats` (squash-merged — this repository still has no remote, so there
is no PR link). The dashboard Theme D will build needs seven numbers about a repository's history;
this is the layer that produces all of them from **one** `git log --all` pass. On any real
repository the traversal is the entire cost and the arithmetic afterwards is free, so seven
widgets each shelling out would have been seven times slower for exactly the same information.

**The traversal.** `commit-history.ts` walks `--all` (a contributor table that omits everyone
whose work sits on a branch is simply wrong) with `--use-mailmap` always on — the flag has shipped
since git 1.8.2 and dugite bundles the binary, so the "if available" hedge in the plan was
guarding against a git we do not ship. Records are framed by a **sentinel**, not `-z`: with
`--numstat` git interleaves plain file lines between commit records, and `-z` removes the very
newlines that would distinguish a header from a file line. It asks for one commit more than the
cap so "exactly at the cap" and "there is more" stay distinguishable.

**Churn is opt-in**, and that turned out to be the most consequential decision in the slice.
`--numstat` makes git diff every commit against its parent rather than just read commit objects,
which on a large repository dominates everything else put together. A board with no churn widget
on it now pays nothing for one.

Three aggregators, each with a trap the obvious implementation falls into:

- **The calendar buckets in the reader's local timezone.** `%at` is a UTC epoch and a heatmap cell
  is *a day in the life of the person looking at it*. A commit made at 00:30 on the 6th in Berlin
  is 23:30 on the 5th in UTC — bucket it as UTC and the square lights up on a day that person had
  not started yet. The error is small, systematic, and lands precisely on the late-night commits
  people remember making. The zone is an **explicit parameter** rather than an ambient read, which
  is what makes it testable: mutating `process.env.TZ` mid-run is unreliable because V8 caches the
  resolved zone, and it cannot express "these two zones disagree about this instant", which is the
  only assertion worth making. Bucketing happens first and gap-filling second, so the
  daylight-saving case is correct for free — once a commit is a `YYYY-MM-DD` string, a 23-hour day
  is not a thing that can be miscounted.
- **Contributors aggregate by email and display the most recent name.** Keying on the display name
  is the obvious implementation and it splits one person into three entries that each look like a
  stranger, none of whom did enough work to appear near the top. Showing the *first* name seen is
  the other half of the trap: the table goes stale the moment anybody updates their git config.
- **Churn ranks by commits that touched a file, not by lines changed.** A lockfile rewritten once
  inside a 90,000-line diff tops any line-based ranking while telling you nothing; the file thirty
  commits have had to touch is where the work actually is. Binary files stay `null` rather than
  flattening to 0 — `-`/`-` means "not expressible in lines", and summing it as zero would drop a
  40MB asset from the table while claiming it never moved.

**Health counts stale-by-age and already-merged separately**, because they answer different
questions — "nobody has touched this in three months" and "this is already in the default branch,
so deleting it loses nothing" — and a branch can be either, both or neither. Collapsing them would
bury the actionable case inside the merely quiet one. "Merged into" resolves against `HEAD` rather
than guessing at `main`/`master`, and the current branch is excluded so every repository does not
report at least one deletable branch.

**The cache is keyed on a digest of every ref tip, not on HEAD.** The traversal is `--all`, so a
`git fetch` that moves `origin/main` changes the contributor table while HEAD stands perfectly
still — and a HEAD-keyed cache would serve the pre-fetch answer indefinitely. That failure is
invisible: the numbers look entirely plausible, they are just from before. A TTL sits alongside
the digest for the two things refs cannot see, a `git gc` changing the size figure and the passage
of time turning a fresh branch stale. Clock and ref-reader are injected, so the whole module stays
`electron`-free and runs under bare vitest.

`mgit:stats:summary` takes a **`repoId` only**, never a path — main resolves the checkout through
`resolveWorkdir`, the same rule `forge-handlers.ts` and the diagnostics channels follow. The row
cap and the timing budget surface as `truncated` in the envelope rather than quietly shortening a
year, so every widget can say "showing the last N" instead of presenting a fragment as the whole.

One naming collision worth recording: `commands/log.ts` already exported a `parseNumstat`, for the
`-z` form. This one is line-oriented and keeps binary counts as null, so it is
`parseNumstatLines` — two parsers for one flag, because they genuinely read different output.

Verification: `moon run :typecheck :lint :test` green (15 tasks). 70 new git-engine tests over the
parsers and aggregators — including the timezone bucketing in three zones, rename paths in both
git spellings, binary `-`/`-` rows, and the cache's ref-digest and LRU behaviour — plus 8 new
shared schema tests. No screenshots: Theme B is engine-only and renders nothing.

## 2026-08-26 — Phase 18 · Theme E — The diagnostics trust boundary, detector registry and runner

Landed on `feature/phase-18-diagnostics` (squash-merged — this repository still has no remote,
so there is no PR link). This is the first place Midnite Git executes a binary that belongs to
the **repository** rather than to us. Every other subprocess in the app is bundled git, a
binary found on the PATH a login shell builds (`gh`, `claude`), or the user's own shell at
their explicit request. `node_modules/.bin/eslint` is none of those: it arrives with the
checkout, and opening a folder to read its history is not consent to run code out of it. So the
policy is **written down**, in a docblock at the top of `main/diagnostics/index.ts`, the same
treatment the fs jail gets in `channels.ts` — rather than left implicit in a commit message.

**The seven rules.** Opt in per repository, never globally. The grant names the exact command.
Main never takes the renderer's word for what to run. Detection proposes, never invents.
Arguments, not a shell. Never on a timer and never on a file change. Fail soft, always.

**Trust is granted to a repo *and* a command together.** `trust-store.ts` records a
`commandFingerprint` — the NUL-joined `[parser, command, ...args]`, NUL for the same reason the
git parsers are — not a boolean. Editing the configured command therefore withdraws the grant,
because the sentence the user agreed to had the old command in it; a grant that survived an edit
would let a repository escalate by rewriting its own config. That makes `command-changed` a
distinct state from `untrusted`: identical to a state machine, completely different to a person.
First per-repo persisted config in the app — every setting before it was global — so `trust.json`
is a map from repoId to a record with room for more than trust. The userData dir is injected, so
the module carries no `electron` import and tests run against a temp dir.

**The detector registry is ecosystem-open and parser-gated.** The obvious shape — "look for
node_modules/.bin/eslint" — is wrong, because a repository opened in this app is as likely to be
Go with a Makefile, a language-agnostic `moon.yml`, dotnet, python, or C++. So a detector is a
pure function with a stable shape and adding Go is one object plus one parser module. The gate is
the honest half: a candidate naming a parser this build cannot read is **dropped**, so a C++ repo
proposes nothing rather than proposing `make lint` whose every run would come back `parse-failed`
— a feature that looks enabled and reports nothing. Candidates are ranked (flat config outranks
`.eslintrc`, because eslint 9 reads it in preference) and carry the `evidence` that made the
detector fire, so the trust prompt can say *why* a command is offered.

**The eslint parser streams.** One top-level array element at a time, so peak memory is bounded
by the largest single file result rather than by the payload — a checkout mid-refactor can emit
tens of megabytes for a result we reduce to two integers and a few hundred rows. Total about
messages (an unknown severity is dropped, never promoted) but **strict about the array**: output
that does not begin with `[` is `parse-failed`, not an empty success. That distinction is the
point — a command that errored must never be indistinguishable from a clean repository. Counts
are always complete; rows cap at `DIAGNOSTICS_ROW_CAP` (500) with a `withheld` count, and the cap
**favours errors**, because file-order truncation would let ten thousand warnings in one file
bury every error in the repo.

**The runner spawns an argument vector with no shell anywhere**, on a deadline enforced by a
SIGKILL timer (a wedged linter is precisely the process that ignores a polite signal), with
`NO_COLOR=1` and stdin `ignore` so a tool that decides to prompt gets EOF. It **ignores the exit
code** when the report parsed: eslint exits 1 whenever it found a single error, which is the
normal case here, and reading the code would make a repo with problems report nothing at all.

`diag-handlers.ts` is the enforcement point: `run` refuses without a live grant, and `trust` only
records commands main itself proposed — re-derived from detection, compared by fingerprint. Self
review moved that check into `isProposedCommand` as a pure function, because it was the most
security-relevant line in the diff and living inside an electron-importing handler made it
untestable; six cases now cover the ways a renderer could try to widen a grant.

Contract: `mgit:diag:{trust-status,trust,untrust,detect,run}`, each taking a **`repoId` only** —
the working directory comes from `resolveWorkdir` and the command from main's own store. Reason
codes `no-command | untrusted | not-installed | timed-out | parse-failed`, all fail-soft; nothing
throws across the boundary. The renderer caches results via react-query with `staleTime: Infinity`
and no automatic refetch — main stays stateless, because a lint result read from disk at boot
describes a working tree that has since changed, and would be stated with the same confidence as
a fresh one.

Verified end to end against this repository's own eslint: the detector found `eslint.config.mjs`
plus the local binary, the runner streamed, and the parser returned three real errors with
repo-relative paths. 53 new tests (trust-store 14, detect 16, parse-eslint 19, runner 10),
`moon run :typecheck :lint :test` green at 961 across four packages.

**Known limitation, deliberate:** the channels take a `repoId`, and `resolveWorkdir(repoId)` with
no worktree argument resolves the **main** worktree. A linked worktree selected in the sidebar
will therefore be linted in the main checkout. This is what the phase doc specifies; widening it
to an optional, `git worktree list`-validated `worktreePath` is a small follow-up rather than a
redesign, and is noted for Theme F to raise.

## 2026-08-26 — Phase 16 · manual verification — Phase 16 complete

The two real-app passes the phase had been holding open were run by the user and both pass:
browsing this repository (ignored entries dimmed, `node_modules` costing nothing until expanded,
`.ts` highlighting, `README.md` rendering with a working source toggle, a png/mp4/pdf displaying
in-pane, the >1.5 MB and binary fallback cards, and nothing anywhere offering to edit); and the
Agent page (the `~/.claude` tree, the real installed version, Update streaming to completion, and
Uninstall pasting into the terminal **without** executing). Phase 16 is now 36/36 and ✅ DONE —
its five themes had already landed on 2026-08-26.

## 2026-08-26 — Phase 18 · Themes A + B + C + D — The footer's right half becomes a live system monitor

Landed on `feature/phase-18-monitor` (squash-merged — this repository still has no remote, so
there is no PR link). The footer bar had looked the same since Phase 9: 24px of `border-t
bg-card/50` holding a terminal toggle, a branch name, ahead/behind arrows and a changed count —
every one of them a left-aligned flex child under a single `gap-3`, with no `ml-auto` anywhere,
so the entire right half was empty. It now carries CPU, RAM, GPU and disk as a coloured dot, a
percentage and a sparkline, opening into a flyout of area-chart timelines. E and F (the
diagnostics segment and its trust boundary) are untouched.

**Theme A — four probes in main, each a pure parser behind a thin `execFile`.**

- `cpu.ts` — `os.cpus()` reports **cumulative counters since boot**, so a single read says nothing
  about now; usage only exists as `1 - idleDelta/totalDelta` between two snapshots. The first call
  returns `undefined` rather than a fabricated zero, and a counter that went backwards (a sleep,
  a changed core set) is `undefined` too — a difference that is not a rate.
- `memory.ts` — **not `os.freemem()`**, which on macOS counts the file cache as free and reads
  99% used on an idle 32 GB machine. Activity Monitor's own sum instead:
  `max(anonymous - purgeable, 0) + wired + compressed`, over `/usr/bin/vm_stat`. The page size is
  read from the `page size of (\d+) bytes` header rather than assumed — Apple Silicon uses 16 KiB
  pages, so a hardcoded 4096 under-reports by exactly 4×. Any parse failure degrades to
  `os.freemem()` rather than reporting nothing.
- `gpu.ts` — `/usr/sbin/ioreg -c IOAccelerator` matched for `"Device Utilization %"`, the same
  counter Activity Monitor graphs, and deliberately **not** `powermetrics`, which needs sudo. Takes
  the busiest accelerator rather than the first in registry order. **Self-disables after three
  consecutive failures and logs once**; a single good read clears the streak, so a transient spawn
  failure under load does not retire the probe for the session.
- `disk.ts` — `fs.statfs` capacity, **not throughput**. `bavail` not `bfree`, and denominated
  against `used + available` rather than the raw volume size, so the gauge agrees with the
  percentage printed beside it.

`metrics-service.ts` keeps **one** interval however many `start`s arrive (each cadence change is a
fresh one), `unref()`s it so main can still exit, collapses concurrent probes onto a single
in-flight promise (`ioreg` under load outlasts a 2s tick, and without the guard they stack), and
reads disk once every ten ticks rather than every tick. Sampling stops outright on blur, hide and
minimize. No probe module imports `electron`, so all of it runs under bare vitest.

**Theme B — the contract.** `MetricSample` has **every metric optional**, which is the whole
design: a GPU whose counter cannot be read is *omitted from the payload*, so "not readable here"
and "0%" stay different answers all the way to the chart. A flat zero line is a lie about a
working GPU. Cadence crosses IPC as a **re-sent `start`** rather than its own verb — one channel,
no extra schema, and main clamps the interval rather than trusting it (the floor exists because a
renderer bug asking for 10ms would fork-bomb the machine with `ioreg` spawns).

**Theme C — the store and the drawing.** Points are `{value, at}`, not bare numbers, and the
window is evicted **by time** (five real minutes) rather than by count — a fixed sample count
would silently become 2.5× longer in wall-clock terms whenever the flyout closed. The first
sample seeds a **flat pair** so a new series draws a straight line at its true value instead of
ramping up from an implicit zero, which reads as a load spike that never happened at exactly the
moment someone looked. `metric-path.ts` has no y-scaling pass at all — the 0–100 domain is fixed
by the contract, so two screenshots a minute apart are comparable — and spaces points by index,
with `cadenceBreaks()` finding where the interval changed so the chart marks it with a dashed
rule instead of drawing a 5s gap as though it were a 2s one. Colours are raw HSL triples per the
`lane-colors.ts` policy (metric colours are *data*, with no semantic role; the diagnostics counts
in Theme F are the opposite case and will take tokens), with muted and fill variants derived
rather than hand-tuned twice. Charts are hand-rolled despite `@bilo-io/ui` shipping an unused
`AreaChart`, consistent with the app hand-rolling its tab strip, tooltip and theme toggle.

**Theme D — the cluster and the app's first popover.** `components/popover.tsx` is genuinely new:
`tooltip.tsx` is hover-triggered and `pointer-events-none` so it cannot host a chart, and
`context-menu.tsx` is item-list shaped. It reuses their portal-and-clamp mechanics and adds
click-toggle, a focus trap, outside-click and capture-phase-scroll dismiss, and focus returned to
the trigger on close — extracted as a shared primitive because Theme F's diagnostics flyout and
Phase 17's checks-verdict indicator both want exactly this. The cluster takes **slots** rather
than a fixed list of four metrics, so those arrive as children rather than as a restructuring of
whatever got there first. A metric that is null renders **no readout at all** — no dot, no dash,
no zero. Disk gets a gauge instead of a fourth timeline, because a capacity line is flat for hours
and drawing it as one would imply movement that is not there.

**A latent e2e bug this uncovered.** `mock-bridge.ts` reported `windowChrome.frameless: false`,
which is not what ships on macOS. `AppFrame` only sets `--titlebar-h` when it draws the chrome
itself, and `app.tsx` sizes its content box `calc(100vh - var(--titlebar-h, 0px))` — so with a
framed window the box claimed the full viewport height starting 40px down, and **every spec had
been running against an app whose footer sat entirely below the fold**. Nothing failed, because
`toBeVisible()` asks for a non-empty box rather than one inside the viewport; it only surfaced
when a spec first tried to *click* something down there.

Twelve Playwright specs (including the phase's screenshots) plus 42 unit tests in desktop and 35
in app. `moon run :typecheck :lint :test` green.

**Left open:** the three human passes the phase doc names — cross-checking CPU/RAM/GPU against
Activity Monitor on Apple Silicon, and an hour's idle battery cost confirming the blur pause
really stops the `ioreg` spawns. Also noted while here: `graph-themes.spec.ts` has twelve
pre-existing failures on `main`, unrelated to this phase — its `chooseTheme` helper still reaches
for `getByRole('link', {name: 'Settings'})`, which Phase 16 turned into a bottom-pinned rail
button. Fixing that locator alone makes it worse (twenty failures), because the suite also has
cross-test flake underneath, so it is left for whoever owns Phase 14's specs.


## 2026-08-26 — Phase 12 · Themes A + B — Commit inspector: rendered message, live references, real header

Landed on `feature/phase-12-inspector` (squash-merged — this repository still has no remote, so
there is no PR link). Phase 5 shipped the commit detail pane as an explicit stub: `%B` dumped
into a `whitespace-pre-wrap` div, a flat file list, and a `<pre>` of `git show --stat` repeating
the very numbers the list beside it already showed. This makes it the thing you actually read a
commit in.

**Theme A** renders the message as markdown (`react-markdown` + `remark-gfm`, deliberately **no**
`rehype-raw` — raw HTML in a commit message stays inert text, which removes the sanitisation
problem rather than solving it) and then linkifies references in the resulting text nodes. Two
passes in that order, because at the hast stage a code span is a real `code` element: "don't
linkify inside a fence" becomes an ancestor test rather than a lookaround in a regex. The matcher
is a pure `segment(text): Segment[]` with no React and no hast in it, and the plugin beside it
knows nothing about the grammar.

Three matcher decisions are load-bearing and each has a test:

- **URL wins the alternation.** `https://github.com/o/r/commit/7c521fed00d` contains a valid
  abbreviated sha and an issue-shaped fragment; with SHA first it shreds into three links, one of
  which navigates the inspector somewhere unrelated.
- **An abbreviation must contain both a digit and a hex letter.** `deadbeef`, `facade`, `decade`
  and `defaced` are pure hex and pure English; `12345678` is a record count. About 3.7% of genuine
  7-character shas are pure digits and 0.14% pure letters, and that is still the right trade — a
  missed link renders as the text the author typed, while a false one is a control that navigates
  to an unrelated commit, or to nothing.
- **`#\d{1,7}` needs its trailing `(?!\d)`.** Without it the quantifier takes the first seven
  digits of `#12345678` and links `#1234567`, orphaning the `8` — a link to a real but entirely
  unrelated issue, which is worse than no link.

`#123` resolves through Theme E's `pickForgeRemote`; a repo with no forge remote renders it as
plain text rather than inventing a URL that 404s. Trailers (`Co-Authored-By:` and friends) are
split off the message tail by a pure `splitTrailers` implementing git's rules more strictly than
git does — every line in the block must be a trailer or a continuation, because the cost of being
loose is a real final paragraph restyled as metadata and detached from the message it belongs to.
Trailer values are linkified WITHOUT a markdown pass: `<s@example.com>` is an address in angle
brackets, which markdown reads as a tag and swallows.

**Theme B** rebuilds the panel: the full sha with a copy button, author and committer identities
(the committer row only when the name **or** the email differs — a squash-merge keeps the address
and changes the name), relative dates with the absolute in a tooltip, parents as clickable short
shas labelled `parent 1` / `parent 2` on a merge, a tree ⇄ list toggle persisted in the ui-store,
and a draggable split between the file list and the diff. The tree is built by a pure
`buildFileTree` that collapses single-child directory chains on the way *up* (`packages/desktop/src/main`
is one row, and whether it collapses is only knowable once its children are final) and rolls
subtree totals into every directory row, so collapsing does not hide the number you collapsed in
order to compare. The list view sorts by change size descending — a 4000-line lockfile churn and
a two-line fix are indistinguishable in a path-sorted tree.

Three contract changes came with it:

- **`CommitDetailResponse` gains `parents`, `subject`, `author` and `committer`, and loses
  `stat`** — and with `stat` goes one of the three `git show` invocations per selection. One
  NUL-separated `--pretty=format:` record now carries everything, with `%B` deliberately last so
  surplus tokens rejoin into the body rather than truncating it.
- **`readCommitDetail` returns null** for a sha this repo does not have, instead of the
  empty-but-well-formed record it used to, which conflated "that repo is closed" with "no such
  commit" and rendered both as a commit with no message, no author and no files.
- **A new `mgit:repo:rev-parse` channel** resolves an abbreviation *before* it becomes a
  selection. A 7-char sha reaches `git show` fine, but the selection is also what the graph
  highlights and what the diff key is built from, and neither works with an abbreviation.

Clipboard goes through a new `mgit:clipboard:write-text` channel rather than
`navigator.clipboard`: the packaged app loads the renderer from `file://`, which is not
guaranteed to be a secure context, and the Async Clipboard API is gated on one — so the web API
is the one path that would work under the dev server and fail silently in the shipped dmg. The
button's checkmark is shown only on a confirmed write.

Beyond the plan, reviewing the diff turned up four real defects, each now pinned by a test:

- **Opacity is about ancestry, not parentage.** `unist-util-visit` hands a visitor only the
  immediate parent, so `a > strong > text` — what a markdown link with a bold label produces —
  passed the `code`/`pre`/`a` check and was linkified inside the anchor. The result is a control
  nested in a link: one click fires both, so `[**deadbeef1**](https://evil.example)` in a commit
  message would select a commit *and* open the URL. Replaced with an explicit walk carrying an
  inherited flag, which also dropped the dependency.
- **Resetting selection in an effect is one render too late.** The render that first observed a
  new sha still held the previous commit's path and issued a real `git diff` for it — cached under
  `staleTime: Infinity`. The same shape, and the same fix, as `useContextReset` in
  `use-file-diff.ts`. (Theme D hit this exact bug once already.)
- **Absolute pixel bounds cannot know how tall the window is.** A 720px file list in a short
  window collapsed both the message above and the diff below to nothing — and, being persisted,
  stayed collapsed across restarts with only a zero-height handle left to drag back.
- **react-markdown keys its element map by component identity.** `components={{ button:
  shaButton(onSelectSha) }}` built inline remounts every sha button on every render, dropping
  keyboard focus to `<body>`.

`CommitDetailRequest.sha` is now hex-validated like `RevParseRequest` and `git show` takes
`--end-of-options`: `git show` accepts diff options, and `--output=<file>` alone is an arbitrary
file write. No caller could reach it — the linkifier's output is hex by construction — but one
of the two rev-taking channels being guarded and the other not is an asymmetry one refactor away
from mattering.

Phase 16's markdown preview picked up the shared prose classes and live links on the way past:
its links were inert only because `shell:open-external` did not exist when it was written, and
Theme E had already landed by the time it did.

70 new tests (22 matcher, 10 plugin, 14 file tree, 12 trailers, 7 detail record, plus git-engine
integration for merges, root commits, unknown shas and tag peeling) and 18 new Playwright specs;
51 e2e green. `moon run :typecheck :lint :test` green.

Not in this slice: Themes C (ref badges as controls) and F (graph row polish) remain open.

## 2026-08-26 — Phase 16 · Themes A–E — Folder explorer, preview pane, settings pages

The app grows real pages, in one branch (`feature/phase-16-explorer-settings`, squash-merged —
no remote/PR yet). A new **Folder** view above Graph browses the active checkout as a lazy tree
(dotfiles shown, gitignored entries dimmed via one batched NUL-delimited `check-ignore` per
listing, `node_modules` costing nothing until opened) with a strictly read-only preview pane:
shiki-highlighted code (github-dark/light synced to the app theme, grammars lazy-loaded
per-extension, a 200 KB highlight cap so a minified bundle can't freeze the render thread),
markdown rendered through `react-markdown`+`remark-gfm` with a source ⇄ rendered toggle and
deliberately inert links, and images/video/audio/PDF streaming straight off a new jailed
`mgit-file://` protocol — media bytes never cross IPC.

Underneath: the first arbitrary-fs IPC in the app, `mgit:fs:list-dir` / `mgit:fs:read-file`,
scoped requests only (`repo` via `resolveWorkdir`, `claude-home` for `~/.claude`) with a
two-stage path jail — pure `joinWithin` (traversal/absolute/NUL) plus `realpath` confinement
(symlink escapes) — that fails closed everywhere, crafted percent-encoding included. No write
channel exists; "can't edit yet" is the contract, not the UI.

Settings moved to the **bottom of the nav rail** (the shell's `footer` slot) and split into four
pages behind an inner sidebar — Appearance and Graph moved one-to-one, **Terminal** hosts the
sidebar-side toggle and the agent roster, and **Agent** peeks into `~/.claude` (tree + preview),
probes `claude --version` through a login shell (`-lic`, banner-proof parsing, best-effort
npm/brew/native detection) and offers the hybrid actions: **Update** runs in main with output
streamed over `agent:claude-update-data`; **Uninstall** opens the terminal with the
method-matched command pasted and *no newline* — Enter is the confirmation, consumed once so a
revived session never re-types it.

25 new tests (jail table-tests, NUL round-trip `check-ignore` integration, claude parsers,
language map, ui-store persistence) plus 7 new Playwright specs; 45 e2e green. Still open in the
phase doc: the two real-app manual verification passes (media/PDF in the packaged renderer).

Nothing in the repo modelled a git remote: no domain type, and no command ever read
`.git/config`. Theme A's `#123` links need one, and so does every "open this on the forge" verb
that follows it. `Remote {name, fetchUrl, pushUrl, forge}` now ships from main with the URL
already normalised, alongside `pickForgeRemote` (origin first, then the first remote that
resolves to a known forge) and the GitHub/GitLab project and issue URL builders.

- [x] `shared/src/domain/remote.ts` — `Remote` + a derived `forge {host, owner, repo, kind}`
- [x] `git-engine/src/commands/remotes.ts` — `listRemotes` via `git config -z --get-regexp`
- [x] URL normaliser, pure + unit-tested: scp-like, `ssh://`, `https://`, `git://`, self-hosted
      GitLab subgroups; unknown hosts degrade to `kind: 'unknown'` and do not linkify
- [x] Issue-URL builder — GitHub `/issues/{n}`, GitLab `/-/issues/{n}`
- [x] Channels `mgit:remotes:list` and `mgit:shell:open-external`, the latter protocol-restricted
- [x] `remotes` + `shell` on the bridge and the preload `Pick<>`; `ipc.test.ts` extended

Beyond the checklist: a `useRemotes` hook keyed under `keys.repo` and one visible consumer, so
the slice is exercised rather than dormant until Theme A — each Remotes group in the sidebar
gains a link to its project page, absent (not disabled) for a remote that has none.

429 tests green plus 44 Playwright specs.

What this shook out:

- **`git remote -v` is the wrong command.** Its output is whitespace-delimited with a
  parenthesised suffix, a URL may legally contain a space, and it has no `-z`. `git config -z
  --get-regexp` frames records as `key\nvalue\0`, which is the NUL-delimited form the rest of
  the engine already assumes. It also reads `pushurl` in the same pass — git's own rule is that
  it falls back to `url`, and resolving that once in the engine beats every reader remembering
  it.
- **`new URL()` silently mangles the scp-like syntax.** `git@github.com:o/r.git` parses as
  protocol `git@github.com:` with the whole path opaque, so the host disappears — and that is
  the exact form git prints for a GitHub SSH remote. It is matched ahead of `URL`, not after.
- **A remote name may contain dots.** `remote.my.fork.url` split on `.` yields the name `my`.
- **`github.com.evil.example` classified as GitHub.** It carries the leading `github.` label the
  self-hosted heuristic keys on, so the suffix check never saw it — and the test that claimed to
  cover this only asserted the easier `notgithub.com` shape. A host embedding the canonical
  domain as a prefix is now excluded explicitly, and a trailing FQDN dot is stripped first.
- **`decodeURIComponent` throws on a malformed percent-escape**, and `%` is legal in a
  repository name. The throw escaped `listRemotes` and rejected the whole IPC call, so one
  oddly-named repo would have cost every remote in that repository its link.
- **A schema refine is not a security boundary on its own.** `shell.openExternal` hands a scheme
  to the OS's registered handler, so an unfiltered `file://` opens Finder on an arbitrary path.
  The allow-list is enforced in the schema AND re-checked on the line that makes the call — and
  main opens the *normalised* href, because the URL parser strips leading control characters, so
  `\njavascript:` and `javascript:` validate identically and only one of them is the string the
  OS would otherwise have received.

## 2026-08-25 — Phase 12 · Theme D — Real diff rendering

`readFileDiff` and the new `readCommitFileDiff` return a parsed `FileDiff` — hunks, per-line
old/new numbers, word-level intraline ranges — instead of patch text, so the renderer paints
geometry rather than tokenising on the render thread. New `mgit:commit:file-diff` channel (kept
separate from `mgit:file:diff`, where `staged` is meaningless against a sha), a hunk parser in
git-engine, and one `<DiffView>` serving both the status panel and the commit inspector: rows
virtualised, low-alpha row tint with the saturated colour on a 2px gutter bar, both line-number
columns behind a persisted toggle, context expansion as a refetch at a wider `-U`, and an honest
"N more lines not shown" past the cap. The inspector's `git show --stat` block is gone — it
repeated the file list's own numbers as preformatted text; that space now shows the diff.

372 tests green (`moon run :typecheck :lint :test`) plus 8 Playwright specs under
`moon run app:e2e` — the repo's first renderer-level test harness, driving the real app against a
mocked `window.midniteGit`.

What this shook out — mostly a family of cases where the pane rendered something plausible that
was not the file in front of you, which is the failure a diff viewer can least afford because
nothing about it looks wrong. Each is now covered by a regression test:

- **A pathspec is applied before rename detection**, so `git diff -M -- new-name` sees only the
  addition and reports a brand-new file with every line green. Both diff requests gained an
  `oldPath`; it comes from `StatusEntry.origPath` in the status panel, and in the inspector from
  the rename token `parseNumstat` had been reading and discarding.
- **`git show` prints no diff at all for a merge commit** — a merge has no single pre-image, so
  git declines to guess. `-m --first-parent` is what makes a merge's files inspectable.
- **A diff body line can be indistinguishable from a file header.** A deleted `-- comment` reads
  `--- comment` in the patch; parsing headers anywhere but before the first hunk dropped the line
  from the diff entirely, under-counted the deletion, clobbered `oldPath`, and shifted every
  following old-side line number by one. Found in self-review, not by the original tests.
- **`git diff` on an unmerged path emits a combined diff** (`@@@ -1,3 -1,3 +1,7 @@@`, one marker
  column per parent), which an `^@@ -`-anchored parser skips whole — so mid-merge the one file
  you most need to see said "No changes to show for this file." The parser reads N-parent headers
  now and flags `combined`, and the view states that the old numbers are the first parent's.
- **A pathspec is glob-matched**, so `pages/[id].tsx` is a character class that matches
  `pages/i.tsx` — the pane rendered a *different file's* content under the requested name.
  `--literal-pathspecs` fixes it, and it is a MAIN git option: as a subcommand flag it exits 255,
  which reads downstream as an empty diff rather than as an error.
- **"Empty output and not staged" does not mean "untracked."** A tracked file with nothing
  unstaged looks identical, and the `/dev/null` fallback painted it entirely green. Settled with
  `ls-files --error-unmatch`.
- **A query key outside the invalidation prefix is never refreshed.** The diff key sat at
  `['diff', …]` rather than under `keys.status`, and with the client's `staleTime: Infinity` the
  pane held its first-loaded hunks for the life of the process — through edits, stages, discards.
- **State reset in an effect lands one render late.** The context reset ran after the render that
  had already issued its query, so the click after "show the whole file" fetched the *next* file
  in full — precisely what the reset exists to prevent. It adjusts during render now.
- **The Vite dev port is contended across worktrees.** Playwright's `reuseExistingServer` attached
  to whichever server reached 5173 first, running the suite against another checkout's source
  while looking entirely healthy. The e2e config owns its own port.

Deferred to `outstanding.md`: syntax highlighting inside diff lines, side-by-side mode.

## 2026-08-25 — Phase 0 · Scaffold

proto/moon/pnpm workspace skeleton with four packages (`shared`, `git-engine`, `app`,
`desktop`), eslint 9 flat config carrying the dependency-boundary rules as per-package
`no-restricted-imports` groups, and `@bilo-io/ui@0.1.0` + `@bilo-io/shell@0.1.0` installed from
GitHub Packages (registry auth proven). `moon run :typecheck :lint :test :build` green; single
`react@19.2.8` in the store. Boundary rules negative-tested (probe files importing `electron`
from `app/src` and `git-engine/src` both fail lint).

## 2026-08-25 — Phase 1 · Shared contracts + git-engine exec/parsers

`shared` now carries the whole wire contract (domain zod schemas, `mgit:*` channel constants, IPC
payload schemas, the `MidniteGitBridge` type, the CommandId registry + default keymap), and
`git-engine` reads a real repository: dugite exec with env hygiene, the per-repo write queue, four
NUL-delimited parsers, and `log`/`status`/`refs`/`worktrees` commands including an incremental
`streamLog`. 93 tests green — 47 parser unit tests against fixture strings plus 21 integration
tests that build throwaway repos with real git (renames, conflicts, detached HEAD, unborn repo,
linked worktrees, upstream ahead/behind). `scripts/smoke.ts` parses ~/Dev/midnite — 4 worktrees,
200 refs, 2000 commits in 156ms.

## 2026-08-25 — Phase 2 · Lane layout engine

`LaneLayoutSession.push(commits) → GraphRow[]`: a single forward pass over `--topo-order` output
assigning straight branch lanes with left-first lane recycling, and sha-derived colours so a
branch keeps its colour across refreshes. Streaming-safe — batched layout is byte-identical to a
one-shot pass. 28 unit tests (linear, single merge, octopus, criss-cross, orphan roots, multiple
children, truncated history, degenerate input) plus structural invariants and an inline snapshot.
`smoke.ts` renders the lanes as ASCII next to `git log --graph` and they match row for row on
~/Dev/midnite.

## 2026-08-25 — Phase 3 · Electron shell boots

Frameless macOS window rendering the Vite app inside `@bilo-io/shell`'s `AppFrame`, with a working
`TitleBar` bound to a typed `windowChrome` bridge, the login-shell PATH fix, a native menu that
dispatches CommandIds, and the design tokens driving light/dark. Verified with three in-app
screenshots: dark, light (tokens flip), and fullscreen (traffic-light clearance collapses from
112px to 20px, proving `onFullscreenChange` round-trips). Tailwind's library content globs
verified by asserting 21 shell-only utility classes are present in the generated CSS.

## 2026-08-25 — Phase 4 · Repo open/list + worktree sidebar

A repo registry in main that resolves any path inside a repository — root, subdirectory, or linked
worktree — to one entry, so opening a worktree nests it under its owner instead of adding a
duplicate top-level repo. Paths (only paths) persist to `userData/repos.json`; everything else is
re-read from git at open time. VS Code-style sidebar with nested worktrees, native folder picker,
and worktree removal that never passes `--force`. Verified against `~/Dev/midnite` and its real
worktrees, including a restart. 40 new tests.

## 2026-08-25 — Phase 5 · Commit graph, read-only

Streaming log service in main (parse + lane-layout incrementally, 500-row batches, cancellation
by `requestId`) feeding a virtualized SVG-per-row graph: coloured lanes with merge curves, ref
badges joined by sha with ahead/behind, subject/author/date columns, and a commit detail pane.
On `~/Dev/midnite` (2,376 commits) 56 DOM rows are live, scrolling holds a median 8.3ms frame,
and switching repos mid-stream carries zero rows across.

## 2026-08-25 — Phase 6 · Status / stage / commit / sync

Stage, unstage, discard, commit, fetch, pull and push in the engine — all through the write queue,
all with explicit paths, and none of them with a force-push escape hatch — plus a VS Code-style
changes panel: ahead/behind chips with Fetch/Pull/Publish, staged and unstaged lists (a partially
staged file correctly appears in both), a commit box, and a unified-diff text pane. Verified by
committing through the UI on a scratch repo and checking `git log`. 130 engine tests green,
including a push/fetch/pull round trip and a conflicting pull against a real bare remote.

## 2026-08-25 — Phase 7 · Graph interactions

Checkout, branch create/rename/delete, tag create and reset in the engine, each with git's
refusals translated into a sentence that says what to do; renderer-drawn context menus on commit
rows and ref badges; double-click a badge to check it out; and a confirmation dialog that shows
the real blast radius. The count excludes commits any other ref still holds — the naive
`to..from` range overstated it, which is how safety dialogs become noise. 157 engine tests green.

## 2026-08-25 — Phase 8 · Drag-drop ops + conflicts

merge/rebase/cherry-pick plus a sequencer that detects in-progress state and exposes abort and
continue, all returning conflicts as the `GitOpResult` conflict arm rather than throwing.
@dnd-kit gestures on the graph: drag a branch badge onto another to get a merge/rebase choice,
drag a commit onto a branch to cherry-pick. An always-visible conflict banner lists the unmerged
files, disables Continue until they are resolved, and never disables Abort. 173 engine tests.

Also fixed a build-graph bug found here: `desktop:typecheck` could pass against a stale
`git-engine` API because moon hashed only the task's own inputs.

## 2026-08-25 — Phase 9 · Integrated terminal + keybindings

node-pty in the main process (lazy, fail-soft, login shell, cwd = the selected worktree) behind an
xterm panel that defers `open()` until its container is measurable; a CommandId dispatcher shared
by the key handler and the native menu, with an xterm escape allow-list derived from the keymap's
`global` scope; and a footer bar with the toggle, branch, ahead/behind and change count. Verified
with real OS-level key events: `Ctrl+\`` opens from cold and closes again with the terminal
focused, and `git status --short` inside the shell agrees with the footer.

## 2026-08-25 — Phase 10 · Watcher / live refresh

`fs.watch` on the narrow set of git paths plus the working tree, classified into
refs/head/index/worktree, debounced at 200ms, with own-write suppression driven by the write
queue so the app's own commits don't loop back as external changes. The renderer maps each kind
to the narrowest correct refresh. Verified live: committing from the integrated terminal adds the
row to the graph, and `git checkout -b` outside the app makes the badge appear.

The mapping had a real bug worth remembering: `refs` events were treated as badge-only, which
meant a commit — the commonest ref event there is — never appeared in the graph.

## 2026-08-25 — Phase 11 · Packaging + docs

macOS arm64 dmg + zip via electron-builder, with main and preload bundled by esbuild so
electron-builder never has to walk pnpm's workspace symlinks; dugite's bundled git and node-pty
unpacked from the asar; an afterPack hook that restores +x on 197 executables, prunes dangling
symlinks and ad-hoc signs; `install-local` using `ditto`. CI runs the gate on every PR and
packages on main. README rewritten around what the app does and the decisions behind it.

Verified on the installed app launched with a bare `env -i` PATH: the graph renders (bundled git
works from `app.asar.unpacked`) and the terminal runs the user's real zsh (node-pty plus the
login-shell PATH fix).

## 2026-08-25 — Final end-to-end verification

Against the installed `/Applications/midnite-git.app`, launched with `env -i` and
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` (what a Finder launch actually gets), opening the real
`~/Dev/midnite`:

- 2 repositories, 3 linked worktrees nested under their owner
- 2,376 commits streamed, lanes and ref badges rendered
- Full-graph scroll (61,776px): median frame **8.3ms**, 1 frame over 16.7ms in 120
- Integrated terminal runs the user's own zsh in the selected worktree
- A commit made in that terminal appears in the graph without a refresh

Screenshot: [`docs/screenshots/midnite-git.png`](../docs/screenshots/midnite-git.png).

## 2026-08-25 — Brand assets from the midnite app

The crescent mark and the Quick Kiss wordmark face are now the midnite app's own files rather than
placeholders: `resources/icon.icns` + `icon.png` become the macOS app icon, `logo.PNG` is the
in-app mark, and `quick-kiss.ttf` sets the wordmark. Same product family, same logo — an
approximation reads worse than none.

Worth knowing: the mark is an **opaque** disc (a black crescent on a white ground, transparent
only outside the circle). A CSS mask reads only the alpha channel, so masking it flattens it to a
featureless dot — it has to be an `<img>`, in the rounded-coin-with-a-hairline-ring treatment
midnite itself uses, which is also what makes one asset work on both themes.

## 2026-08-25 — Phase 13 · UI polish

Resizable panels (sidebar, terminal, commit detail, changes list) with geometry persisted in
`midnite-git.ui`; a full per-repo ref tree (Branches · Remotes · Tags · Worktrees) replacing the
worktree-only sidebar, with `FolderGit2` distinguishing a checkout from a branch; a lockable nav
rail; the theme toggle and an icon-only fetch/pull/push cluster moved into the title bar (with a
framed-window fallback, since `<TitleBar>` renders nothing off darwin); graph column headers with
resizable Author/Date/SHA driven by CSS custom properties so the memoised rows never re-render
during a drag; and a multi-select branch filter that re-runs the log stream server-side —
`LogOptions.revisions` already existed in the engine, only `log-service` hard-coded `--all`. Every
Unicode glyph is now a lucide icon, and motion is a two-keyframe vocabulary disarmed by
`applyMotion` under `prefers-reduced-motion`. Three CommandIds (`sync.fetch/pull/push`) that had
been declared with chords and menu items since Phase 9 finally have handlers. 304 tests green.
**Not verified visually** — Electron cannot reach the macOS window server from the agent's shell,
so the manual smoke and the screenshot are outstanding.


## 2026-08-25 — Sidebar: flush delimiters, collapsible sections, and a smoke run that works

Two fixes to the Phase 13 sidebar, plus the visual verification that phase had left open.

Each repo `<section>` carried `py-0.5` *and* `mt-0.5 … pt-1.5`, which put ~6px under the
delimiter against ~4px above it, so a selected repo's highlight floated clear of the rule above
it. The rule now carries no padding of its own — the repo row and the tree below it already have
theirs. Every subsection folds independently (Local · Remotes · Tags · Worktrees), state held as
the set of *closed* keys so a section defaults open, and `TreeSection` swapped its boolean
`indent` for a `depth` so each nesting level's heading indents left of its own rows. "Branches"
became **Local**: the section under it is branches too, and the old heading left the reader to
work out which was which.

Worth knowing: `moon run desktop:start` was never blocked by the macOS window server, which is
what Phase 13 recorded. It exits ~700ms with no output because `app.requestSingleInstanceLock()`
hands the launch to the packaged app in /Applications and quits — silently, by design. The lock
is keyed on `userData`, so `electron . --user-data-dir=<tmp>` runs a dev instance alongside the
installed one. With that plus `MGIT_OPEN_REPOS` and the `MGIT_CAPTURE` harness already in
`main/capture.ts`, the sidebar was screenshotted expanded and folded without touching the
user's running app — closing Phase 13's last two verification items.
## 2026-08-25 — Phase 14 · Graph themes, avatars, author filter

Four selectable graph styles (`git-graph` with solid nodes and arrowheads, `git-extensions`,
`sourcetree`, `gitkraken`) driven by a `GraphTheme` descriptor — git-engine untouched, since
lane assignment is already a pure function of history and a style only decides how lanes are
drawn. Gravatar avatars inside every commit node, hashed with SHA-256 via `crypto.subtle`
(no MD5 dependency), deduped by email so twelve authors across 50 000 commits is twelve
requests, with generated initials as both the first-paint and the failure state. The avatar
retires the Author column; name/email/date moved to a tooltip on the bubble. Ref chips moved
into a dedicated BRANCH / TAG column. An author filter that dims rather than removes —
`git log --author` omits commits without rewriting `%P`, which would leave the lane engine
holding a lane open per filtered-out parent. And Settings finally exists: a style picker that
draws the same synthetic history four ways, plus the shell's appearance runtime (seven
appliers and a 500-line stylesheet shipped since Phase 0 and never called). Playwright covers
it against a stubbed Gravatar. 422 unit tests + 10 e2e green. **Outstanding:** the ref-chip drag gesture
(Phase 8's merge/rebase) has no test and needs a human in the real app.

## 2026-08-25 — Phase 14 verification: the ref-chip drag gesture, under a real pointer

Closes the one item Phase 14 landed without: whether Phase 8's drag gestures survived the ref
chips moving into the BRANCH / TAG column. They did — `useRefDnd` is wired from `graph-row.tsx`,
so the wiring travelled with the chips — but nothing in the markup says so, which is why the
item was left for a human. `e2e/ref-drag.spec.ts` now drives merge, rebase and cherry-pick with
a real pointer through the Playwright mock bridge, and the mock's `ops` proxy records its calls
so each assertion lands on the *operation*, not just on a menu label: choosing "Merge X into Y"
has to reach `ops.merge({source: X})`. The guard cases come with it — a tag is neither a drag
source nor a drop target, a branch dropped on itself is a no-op, and a drop onto a branch that
is not checked out shows both items disabled with the reason attached. 8 tests, plus
`docs/screenshots/phase-14/drop-menu.png`.

Two things bit while writing it, both worth knowing before touching a dnd-kit test again.
**dnd-kit eats the click that trails a drag for 50ms** — `AbstractPointerSensor` adds a
document-level capture listener that `stopPropagation()`s `click` on activation and only tears
it down on a 50ms timeout. A human never meets it; a synthetic click lands inside the window
and dies before React's delegated listener sees it, so the menu item looks stone dead while a
DOM-level `.click()` on the same button works perfectly. **And `rectIntersection` collides the
DragOverlay's rect, not the dragged element's** — the overlay pill is sized by the text it
carries, so the first version of this spec dropped a commit on `main` and was offered a
cherry-pick onto `feature/drag-me` one row above. The fixture keeps ref-less rows around every
drop target now; that spacing is load-bearing.

445 unit tests + 26 e2e green.

## 2026-08-25 — Sidebar: per-repo sync, primary-checkout switching, status dots

The repository headers grew the sync control that only the title bar had: `↑n ↓n` plus
fetch / pull / push per repo, acting on **that** repo's primary checkout whether or not it is the
selected one. Which needed two generalisations rather than a copy — `useRepoStatus(target)` and
`useTargetedGitOp(target, …)`, with `useStatus`/`useGitOp` now the selected-checkout case of each —
and one extraction: `<SyncControls>` and `<AheadBehind>` are shared with the title bar, so the two
places cannot disagree about when Push is live.

When a button is live and when it is not is now a pure function, `syncAffordances(branch)`, and
every disabled state carries a reason. That forced a fix in `IconButton`: a real `disabled`
attribute suppresses mouse events in every engine, so the one state most in need of explaining was
the only one that could not raise a tooltip. With a `disabledReason` it switches to `aria-disabled`,
stays hoverable and swallows the click. The same rules feed the header's ellipsis menu, which
replaces the bare ✕ — Fetch/Pull/Push, a *Switch primary checkout to ▸* submenu, Copy path, and
Close, reachable from the ⋮ or a right-click anywhere on the row.

Switching the primary checkout also lands on the branch rows themselves, on right-click and as a
hover button, with git's own refusal spelled out (`Checked out in <path> — a branch can only be
checked out once`). The sidebar's menus stay non-destructive on purpose: delete and rename remain
on the graph's ref badges behind Phase 7's blast-radius gating. Remote rows offer *Create local
branch from origin/x…* instead of a checkout, because `git checkout origin/x` lands on a detached
HEAD, which is never what clicking a remote branch means.

The checked-out marker is now a `<BranchDot>`: the same dot, with a radial-gradient halo that
breathes (`halo-breathe`, the app's only ambient loop — scale/opacity only, so it stays off the
main thread, and reduced motion freezes it on its final frame) and a red/amber/green level from
`branchHealth()`. Only signals the app can justify get a colour — a paused merge or a conflict is
red, uncommitted changes are amber, a gone upstream is amber — and a clean tree deliberately
reports `unknown` and stays neutral white, because "you have not edited anything" is not a verdict
on the code and a sidebar of green dots would drown a real one. `ChecksVerdict` is the seam a test
run or a GitHub pipeline plugs into (todo/outstanding.md → Branch checks); nothing supplies one
yet, so every branch git has nothing to say about shows no dot at all rather than a green lie.
Worst-signal-wins, which is why the worktree rows carry their own dot for the checkout they name.

Fitting all that on a 256px row cost the header's branch chip while the repo is expanded — the
Local list two rows below names the same branch and marks it live — and the fresh-profile default
sidebar width went to 288. Verified in the app via `--user-data-dir` + `MGIT_OPEN_REPOS`: names
intact, `↑0 ↓0` with both counts dimmed, Pull/Push at `aria-disabled` + `opacity .4` with
`pointer-events: auto`, the submenu listing exactly the branches free to check out, and amber dots
on both dirty checkouts. `moon run :typecheck :lint :test` green, with 16 new unit tests across
`sync-availability` and `branch-health`. **Outstanding:** the light theme's amber was not screenshotted, and no
screenshot can show a pulse.

## 2026-08-25 — Graph: a fifth style, colour-matched ref chips, a usable theme menu

Three follow-ups to Phase 14, one of them a plain bug.

**`classic` — the pre-avatar graph, back as a style.** Phase 14 replaced 26px rows, 14px lanes and
a 3.5px dot with an avatar in every node, and retired the Author column because the face named the
author. That was a change of default, but it read as a change of options: there was no way back to
the denser table. `classic` is the old module constants verbatim — bezier lanes at 1.75px, hollow
merges, no faces — with the Author column returned. Which is why `GraphTheme` grew `node:
'avatar' | 'dot'` rather than a `showAvatars` flag: the column and the node are the same decision
seen twice, so `showsAuthorColumn(theme)` derives from the node and the two incoherent pairings —
a face beside a redundant Author column, a dot graph with the author nowhere — are unrepresentable.
`nodeExtent` branches with it (avatar + ring, or dot + half its stroke), so the lane-spacing
invariants still hold for a style whose `avatarSize` is 0.

**Ref chips take their lane's colour.** A branch name in the BRANCH / TAG column and a coloured
node in the GRAPH column are the same object shown twice, and nothing connected them: every chip
was one of four semantic tints (`primary`, `muted`, `success`) regardless of which branch it named.
They are now the hue of the lane their commit sits on, at two strengths — the checked-out ref
filled solid and semibold, everything else a 14% wash at 0.78 opacity — because a column of
equally-loud chips answers "which branches exist" while the question being asked is "where am I".
Kind moved onto the icon (check / cloud / tag / branch), since kind and identity are independent
facts and spending colour on kind costs the identity colour is there to carry. The chips publish
`--lane-h/s/l` and the stylesheet composes tint, border and ink from them, because the label's
lightness has to flip with the app theme and only the stylesheet knows which one is on.

A **leader line** now runs from the chip to its node, in two halves: a flex-`1` rule to the
column's edge (the chips ahead of it are of unknown width, which is what `flex` solves and a fixed
viewBox cannot) and an SVG line starting at `-ROW_GAP`, crossing the row's gap into the gutter. It
is drawn before the lanes so the verticals stay unbroken — a horizontal rule laid over them chops
history into segments. Commits carrying more refs than the column holds now end in a GitKraken-style
`+N` chip with the rest in its tooltip, instead of a name clipped mid-word.

**The theme menu opened off-screen.** `<ThemeToggle>` from `@bilo-io/ui` anchors its menu
`bottom-0 left-full` — a flyout to the right of the trigger, growing upward. Correct for the
sidenav rail it was written for; in this app the trigger is in the window's top-right corner, so
all four options rendered past the right edge and above the top one: present in the DOM,
unreachable by pointer. The library takes no placement prop, so the app has its own toggle now,
built on the library's `useTheme` and positioned the way `<Tooltip>` and `<ContextMenu>` already
are — measured against the trigger, right-aligned, clamped to the window, and portalled to `<body>`
so no transform or backdrop-filter up the title bar can reinterpret its coordinates.

157 unit tests + 31 Playwright green (`moon run :typecheck :lint :test`, `moon run app:e2e`), with
new coverage for the node/column pairing, the lane-colour helpers, the two chip strengths, the
connector's negative origin, and the theme menu landing inside the viewport.

## 2026-08-25 — Graph: the table lines up, the gutter resizes, the rail lands

Three defects and one addition, all in the graph table's geometry.

**The gutter sat four pixels high.** Its SVG defaulted to `display: inline`, so it
participated in a line box and carried a descender's worth of phantom height beneath it. The row's
`items-center` split that evenly and lifted the whole graphic, leaving every ref chip pointing at a
node slightly below it and every leader line meeting its lane off-centre. `block` on the SVG and
`flex` on the two spans wrapping it. Asserted per style, because the offset came from the row's
font metrics rather than from anything one style could be blamed for.

**The header sat nine pixels right of the rows it labelled**, per resize handle preceding it. A
handle is 5px wide with −2px margins, which is 1px of net width — but it is also an extra item in a
`gap-2` flex row, so it costs a whole additional gap. The rows have no handles, so the two laid out
on different grids and the drift compounded: Graph +9, Commit message +7, Date −9. `ResizeHandle`
now takes the row's `gap` and pulls itself in by half its own width plus that gap, so inserting one
moves neither neighbour. Every column origin now matches the rows to the pixel.

**The gutter is a resizable column.** Dragging it in closes the lanes up and slides the indented
commits left; `Home` takes it to its floor, `End` and a double-click back to the natural fit. Both
bounds are geometry rather than constants, so they are computed per render and handed to
`useGraphColumns`: `max` is `lanes * laneWidth`, and `min` is where the lanes have closed to half a
node — which for a single-lane history is exactly one node wide.

That floor is deliberate. Nodes that merely TOUCH would cap compression at three percent for the
avatar styles, since GitKraken's 30px lane already holds a 29px node; at half a node they overlap
the way a stacked avatar list does, each keeping a visible crescent. To let them, `laneOffset` pins
the outermost lanes a node-radius from the gutter's edges instead of half a lane — identical at a
style's own spacing, so nothing that was never dragged moves, and it turns "lane 0 stays inside the
gutter" from an invariant every new style must be checked against into a structural fact.
`laneWidthForGutter` inverts `gutterWidth` exactly across both regimes, so the handle and the
painted edge stay on the same pixel instead of the graph lagging the pointer.

Lane spacing is the one piece of geometry the row takes as a prop rather than as a custom property,
and it does bust the row's memo on every pointermove of a gutter drag. SVG coordinates are
attributes, not styles, so no variable can reach them; the drag re-renders the ~30 rows the
virtualizer has mounted, not the 50 000 behind them.

**The lane rail.** GitKraken stands a bar in the branch's colour between the graph and the subject,
so the message you are reading is tied to the branch it landed on without your eye travelling back
to the node. Full row height, so a run of commits on one branch reads as one rail rather than a
column of ticks. Only the styles whose node is an avatar: a face says who, not where, while
`classic` already draws the whole lane in that colour a few pixels away.

Along the way the e2e suite stopped asserting on `svg circle`, which had been quietly matching the
hole in a ref chip's tag icon as well as the commit nodes — three tests appeared to cover the
gutter's geometry while measuring an icon. The lane graphic carries `data-graph-gutter` now, and
the assertions that matter — nodes inside their column, the squeeze losing none of them — actually
look at it.

198 unit tests + 38 Playwright green (`moon run :typecheck :lint :test`, `moon run app:e2e`).

## 2026-08-26 — Phase 15 · Verification — and the three defects it found

The point of a verification pass is the things it turns up, and this one turned up three, none of
which the existing suite could have seen.

**Two ptys per terminal.** `start()` guarded on `store.ptyIds[session.id]`, which is only written
once `pty.create` has *resolved*. Two calls in the same tick therefore both saw it empty and both
spawned a shell; the second `bindPty` overwrote the first, orphaning a live process nothing held an
id for — never killed, never listed, invisible except in `ps`. StrictMode's double-invoked mount
effect made it happen for **every terminal opened under the dev server**, which is how the app is
run day to day. The guard now covers the await: `starting` is set synchronously before it, so the
second call bails on the state rather than on a field that does not exist yet.

**Restored sessions revived themselves.** `takeReplay` consumed the transcript on first read, on
the reasoning that a remount would otherwise double it. But a remount builds a *new* xterm with an
empty screen, so replaying into it is right every time — and consuming it meant the second mount
found nothing, came up blank, and, since the auto-start condition was `if (!replay)`, read "no
replay" as "brand new session" and started a shell. Precisely the promise the phase makes
("reopening the app with a dozen of them is free"), broken. Now `peekReplay` reads without
consuming, `bindPty` retires the transcript once a live shell owns the screen, and auto-start keys
on `state === 'idle'` — a restored session hydrates as `exited`, which is the actual question
being asked. The transcript was always a poor proxy for it: a session saved before it printed
anything would have been revived on sight.

**`TerminalSessionSchema` never enforced its own comment.** `agentId` was documented as "set when
`kind === 'agent'`" and required by neither direction, and both halves degrade *silently*: an agent
with no id restores as a row the roster cannot resolve, losing its accent and its Claude mark and
reviving as a bare login shell while still labelled an agent; a shell carrying an id paints that
mark on a terminal running no agent. Both reachable from `terminals.json`, a file that outlives any
one build. `agentIdMatchesKind` now refines the session record and `PtyCreateRequest` alike.

**The tests.** `ipc.test.ts` had no pty coverage at all — which is how `PtyCreateRequest` grew four
fields across this phase without a single assertion. It is now a table (schema, a payload that must
parse, payloads that must not, each labelled with the rule it tests) closed by a guard asserting
every `pty:*`/`terminal:*` channel has a row. That guard's first act was to find `pty:data`, left
unvalidated on purpose — one message per chunk of shell output, and putting zod on the path of each
keystroke's echo buys nothing for a payload whose only consumer is xterm. It is a named exemption
with its reason, so the guard still fires for the next one.

The e2e mock stopped being a stub and became a **fake pty that talks back**: a coloured prompt,
echoed keystrokes with backspace, a short canned transcript, and silence after `kill` — escape
sequences included deliberately, because the real pty sends them and a mock that omitted them would
quietly stop testing that they survive the trip. Sessions are seeded through `terminalSessions`, so
a spec reaches the restored-and-dimmed state without quitting an app it never launched.

Assertions moved to the bridge rather than the screen. xterm paints through the WebGL addon, so a
terminal's contents are canvas pixels that no DOM query can read — and what crossed the bridge is
the more precise thing anyway. "The shell survived hiding the panel" is asserted as *no `kill` was
sent and no second `create` followed*, which is the Phase 9 unmount-kills-the-shell contract being
overturned, stated in the terms it was written in. "Restored sessions come back dimmed" is asserted
as *no pty was created*, which is what dimmed means.

Nine specs: open on Ctrl+` and close again with xterm focused, a second terminal getting its own
pane and pty, the Claude row's accent coming from the roster rather than a default, the session list
docking either side and surviving a reload, maximize and restore, restore-dimmed-then-revive,
hide-without-killing, and drag reorder with a real pointer past dnd-kit's 6px activation constraint
— the only thing that would catch a misrouted `DndContext`.

One item is left open on purpose: quitting and relaunching the packaged app to confirm `ps` shows no
surviving shells. A browser cannot quit Electron or read the process table, and faking it would be
the one assertion in the list that proved nothing.

562 unit tests + 47 Playwright green.

---

## Phase 17 — the repositories sidebar as a workbench (2026-08-26)

Five gaps closed on one branch: change counts, a Changes-view filter, menus on everything,
whole-checkout diffs, and the app's first forge integration.

The counts needed **no new IPC at all**, which was the surprise. `status.get` has taken an
optional `worktreePath` since Phase 6, `resolveWorkdir` validates it against
`git worktree list`, and `getStatus` resolves `.git` through `rev-parse --git-dir` so it
already worked inside a linked worktree. The sidebar simply never asked. `useWorktreeStatuses`
asks — one `useQueries` entry per checkout, on **exactly** `keys.status(repoId, path)`, so a
row's pill and the Changes panel that later selects that checkout are one cached `git status`
rather than two, and the Phase 10 watcher invalidates both without knowing the hook exists.

`isPlaceholderData` turned out to be load-bearing twice over. The placeholder is an *empty*
status, so trusting it would report every checkout clean while its query was in flight — and
Theme B's filter would then have hidden a dirty worktree on the strength of a number that had
not arrived. `byPath` therefore holds only checkouts that have actually answered, and the
filter refuses to hide anything while `isLoading`.

The old `isMain`-only guard on `worktreeHealth` was right and is preserved. Its comment said a
linked worktree gets no dot rather than the primary's dirt attributed to it; `liveStatus()`
keeps that invariant and the data caught up to it.

**Destructive verbs moved into the sidebar**, reversing a documented Phase 4 decision. The old
docblock argued that delete and rename belonged only to the graph's ref badges, because a
second set of destructive affordances would be somewhere for the two to disagree. That did not
survive contact with the tree — the sidebar is where branches and worktrees are actually
managed, and sending someone to the graph to delete a branch they are looking at is the
indirection a git client exists to remove. The docblock was rewritten rather than left
contradicting the code, and the disagreement risk is answered by one shared confirm shape.

Branch delete passes `--force` unconditionally, which looks alarming and is the honest choice:
git's `-d` refuses on unmerged commits with no way to see what they are, so a UI built on it
can only relay a refusal. The blast radius dialog *names the commits*, which is strictly better
information — so the decision moves to the person, in front of the numbers.

Worktree removal is two-step. The first attempt never forces; only after git has actually
objected does a second, separately-confirmed dialog offer to override it, so "force" is always
a reply to a specific objection rather than a checkbox nobody read.

Two rows in one tree can both be called `main` — a branch and the worktree it lives in. Their
action buttons had identical accessible names, which a Playwright strict-mode violation caught
and which a screen reader user would have hit the same way. Labels now name the kind.

`inline` mode on `DiffView` drops the **virtualizer**, not just the chrome: inside an accordion
the scroller is the page, so a virtualizer would render three rows and stop. `DIFF_LINE_CAP`
already bounds a single file, which is what makes plain flow affordable. Each accordion's query
lives in its *body*, so a checkout with 200 changed files costs 200 rows and zero `git diff`
calls until something is expanded; expand-all is capped and **says** what it withheld.

Tabs live in their own store rather than a `ui-store` slice. Everything in that store is a
persistence candidate; a tab names a repo, a checkout or a run, any of which can be gone by
next launch — so keeping them apart means nobody has to remember to exclude them from
`partialize`. `NewWorkbenchTab` distributes its `Omit`: a naive `Omit` over the union keeps
only shared keys and would have erased the very fields tab identity is derived from.

**The forge integration goes through the user's own `gh`.** No PAT, no keychain decision, no
token that silently expires — `gh` already holds a credential and knows about enterprise hosts.
`shellQuote()` is the load-bearing piece and not defensive politeness: `runInShell` takes a
single command string, and owner/repo are parsed out of whatever URL is sitting in
`.git/config`. It is tested against `$(…)`, backticks, `;`, `&&`, `|`, a newline, and the
embedded `'` that is the only character single-quoting cannot contain. Owner/repo are resolved
**in main** from the config rather than sent by the renderer, so the only thing crossing the
boundary is a `repoId`.

Two `gh` details cost a debugging round each and are now encoded: an interactive login shell
convinces `gh` it has a tty, so `GH_PAGER=cat` is required or the call hangs until the timeout;
and `gh auth status` exits 1 if *any* configured host has a bad token, which must not sign the
user out of the host that works.

This finally closes **"Branch checks (the RAG dot's real source)"** from `outstanding.md`, by
the exact route that entry predicted. `checksVerdict()` matches on **sha**, never branch name —
a green tick sourced from the previous tip is the precise failure that teaches people to
distrust the dot — takes the newest run per workflow so a re-run supersedes what it replaced,
and reports an all-skipped set as `unknown` rather than green. The rate-limit worry that
parked it is answered by never fetching for the dot at all: the sidebar reads the Actions query
with `enabled: false`, so a branch is coloured only when the user has already opened that
repo's Actions section.

Two verification items are left open for a human, both because this session could not perform
them rather than because they were skipped. Electron will not attach to the macOS window server
from a non-interactive shell — it exits silently with no output while other Electron apps on
the same machine run fine — so the packaged-app screenshot pass in both themes did not run. And
the `gh`-availability matrix (present-and-authed, absent, authed-but-offline) needs a machine
whose state can be changed between runs.

Note for whoever picks this up: `e2e/graph-themes.spec.ts` has 12 failures **on `main`** —
verified in a clean worktree at `0b810c2`, identical count and file. It looks like a Phase 16
leftover: the spec reaches for Settings via `getByRole('link')`, but Settings became a footer
`button` when the nav rail regrouped. Untouched here; it is not this phase's to fix.

724 unit tests + 56 Playwright green (11 of them new).

## 2026-08-26 — Sidebar: rows stop changing height, and folded summaries line up

Three polish fixes to the repositories sidebar, each about the same disease: layout that
depended on what a row happened to contain.

`TreeSection` headings sized themselves with `py-1`, and the trailing ellipsis action is an
`h-6` IconButton — so Local, Remotes and Worktrees (which carry one) sat ~7px taller than Tags,
Actions and Reviews (which do not), and the section rhythm stuttered from repo to repo. The
heading now pins `h-7`; an optional control cannot change it. Repo rows got the same treatment
(`h-8`): the sync cluster only renders once `git status` comes back, so a padded row grew a few
pixels the moment status loaded and every repo below it shifted down.

On a folded repo, the branch + change-count summary used to trail the name, starting at a
different x on every row because names differ in length. It is now pushed to the trailing edge
(`ml-auto`), so folded rows read as a column — the summary lines up down the panel, directly
left of the sync control it explains. And the panel header's filter and "open a repository"
buttons became one trailing cluster instead of two controls spread by `justify-between`, which
had read as a third column of the title row.

Two new Playwright tests pin both fixes: one asserts the four heading kinds share a single
bounding-box height, the other that a folded row's change-count pill sits in the trailing half,
left of the sync button. All 14 repos-workbench e2e tests green; unit gate green.
