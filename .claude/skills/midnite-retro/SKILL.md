---
name: midnite-retro
description: Retrospective over a GitHub org, user or repo — confirm the scope, the focus (innovation, features, maintenance, fixes…) and the window (1m/3m/6m/1y) before scanning anything, then list the merged work grouped into themes and close with a succinct summary that says why each innovative item was novel. Read-only.
argument-hint: "[org | owner/repo] [1m | 3m | 6m | 1y]"
allowed-tools: Bash, Read, Write, AskUserQuestion, Agent, Artifact
---

A **read-only** retrospective: what actually shipped across a GitHub org, a user or a single
repo over a chosen window, grouped into themes, then boiled down to a short list that says
*why* each thing mattered.

**Style:** terse. Ask, gather quietly, then lead with the report — don't narrate the `gh` calls.

## 0 · Hard constraints

- **Read-only.** No `gh pr`/`issue` writes, no comments, no labels, no `git push`, no file edits
  in any repo. The only file this skill may write is an optional report page in the scratchpad (§6).
- **Ask before scanning.** Until §2's answers are in, the only calls allowed are the identity
  lookups in §1. No `gh repo list`, no `gh search`, nothing that enumerates an owner's repos.

## 1 · Who is signed in (identity only)

```bash
gh auth status 2>&1 | head -5                 # confirms a login + token scopes
gh api user -q .login                         # LOGIN
gh api user/orgs -q '.[].login'               # ORGS (needs read:org; empty is fine)
gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null   # CWD_REPO, if inside one
```

If `gh` is missing or unauthenticated, stop and tell the user to run `! gh auth login`. If
`user/orgs` comes back empty but the user expects org repos, note that the token may lack
`read:org` (`! gh auth refresh -s read:org`) — private org repos also need `repo`.

## 2 · Ask — one AskUserQuestion call, four questions

Skip any question `$ARGUMENTS` already answers (an `owner` / `owner/repo`, or a `1m`/`3m`/`6m`/`1y`
window).

1. **Scope** — *"Which GitHub org or path should the retro cover?"* Options, max 4: each of the
   first ORGS (up to 2), `LOGIN` (personal repos), and `CWD_REPO` if set. Other = any `owner`,
   `owner/repo`, or a comma-separated list of either.
2. **Focus** (`multiSelect: true`) — *"What should it look out for?"* Options:
   **Innovation / novel work** · **Features** · **Maintenance** (deps, refactors, CI, tests, docs)
   · **Fixes & reliability**. Other = anything else (security, performance, DX, design…) — each
   free-text entry becomes its own category.
3. **Window** — *"What time frame?"* Options: **1 month (Recommended)** · **3 months** ·
   **6 months** · **1 year**.
4. **Whose work** — *"Everyone's, or just yours?"* Options: **Everyone** · **Just me (`LOGIN`)**.
   Other = specific GitHub handles.

Resolve the window to a concrete inclusive `START`/`END` (`YYYY-MM-DD`, macOS `date`):
`END=$(date +%F)`; `START=$(date -v-1m +%F)` / `-v-3m` / `-v-6m` / `-v-1y`.

Echo the resolved scope in one line before gathering — e.g.
*"Retro · acme-org · 2026-06-23 → 2026-09-23 · innovation, features, maintenance · everyone"*.

## 3 · Find the active repos

For each owner in scope (skip for an explicit `owner/repo`):

```bash
gh repo list "$OWNER" --no-archived --limit 300 \
  --json nameWithOwner,pushedAt,isFork,description,primaryLanguage \
  | jq --arg s "$START" '[.[] | select(.pushedAt >= $s and (.isFork|not))]'
```

Forks and archived repos are out. If more than **25** repos are active, keep the 25 with the most
merged PRs in range (one `gh search prs --owner "$OWNER" --merged-at ">=$START" --limit 1000
--json repository` call gives the counts) and say how many were left out.

## 4 · Gather — fan out, return digests

Split the active repos into batches of ~5 and dispatch **one read-only subagent per batch, all in a
single message** so they run concurrently (a single repo needs no subagent). Pass each one `START`,
`END`, the author filter, the focus categories and §5's classification rules. Raw JSON and PR bodies
stay in the subagents; each returns a compact digest.

Per repo, a subagent runs:

```bash
gh pr list --repo "$REPO" --state merged --limit 500 \
  --search "merged:${START}..${END}${AUTHOR:+ author:$AUTHOR}" \
  --json number,title,url,mergedAt,author,labels,additions,deletions,changedFiles,body,files
gh release list --repo "$REPO" --limit 50 --json tagName,name,publishedAt \
  | jq --arg s "$START" '[.[] | select(.publishedAt >= $s)]'
```

- Read only the first ~40 lines of each `body`; `files` is for paths (new top-level dirs, new
  packages, new manifests), never file contents.
- **Repos that push straight to the default branch** (no merged PRs but `pushedAt` in range): fall
  back to `gh api "repos/$REPO/commits?since=${START}T00:00:00Z&per_page=100" --paginate -q
  '.[] | [.sha[0:7], .commit.author.date, .commit.message | split("\n")[0]] | @tsv'` and treat each
  commit subject like a PR title.
- **Dependency-bot PRs** (`dependabot`, `renovate`, `*[bot]`) are counted, never listed one by one —
  they collapse into a single Maintenance line per repo ("41 dependency bumps, 3 majors: …").

**Each subagent returns**, per repo: releases in range, bot-PR counts, and one row per human PR:
`{repo, number, title, url, mergedAt, author, +/-, categories[], group_hint, what (≤15 words),
novelty (null, or ≤25 words of evidence)}`.

## 5 · Classify and group

**Categories** — a PR can carry more than one; only the categories the user picked are reported.

| Category | Signals |
|----------|---------|
| Features | `feat:`/`feat(scope):`, `feature`/`enhancement` labels, new user-facing surface, new endpoint/command/screen |
| Maintenance | `chore`/`build`/`ci`/`refactor`/`test`/`docs`/`deps`, dependency or toolchain upgrades, dead-code removal, migrations |
| Fixes & reliability | `fix:`/`hotfix`, `bug`/`incident` labels, regression tests, retries/timeouts/guards |
| Innovation / novel | see below — **orthogonal**: it is layered on top of another category, never alone |
| Free-text (e.g. security, perf) | the obvious prefixes/labels (`perf:`, `security`, CVE ids) plus the body's own claims |

**Innovation needs evidence, not adjectives.** Mark a PR (or a group) novel only when at least one
of these holds, and record *which* in its `novelty` line:

- **First of its kind here** — a capability, package, service or directory with no precedent in the
  repo/org (new top-level path in `files`, a new app/package manifest).
- **New technique or technology** — a language, framework, model/AI integration, protocol or
  architecture the org has not used before.
- **A different approach to a known problem** — the body contrasts it with the previous way
  (replaces polling with push, parsing with a real grammar, manual with automated…).
- **A measured leap** — a number in the body: 10× faster, −80% bundle, minutes → seconds.
- **Enabling work** — infrastructure other work in the window visibly built on (later PRs reference it).
- **Explicitly exploratory** — spike, prototype, RFC/ADR, experiment flag.

A big feature that follows an established pattern is a Feature, not an innovation. When unsure,
leave `novelty` null — a short honest list beats a padded one.

**Groups** — cluster related PRs into themes by, in order: shared epic/phase/issue references,
conventional-commit scope (`feat(billing): …`), shared labels, overlapping paths, then title
similarity. A group needs ≥2 PRs; singletons stay as standalone items. Name each group by what it
achieved ("Self-serve billing"), not by the scope token.

## 6 · Report — markdown

`# 🔭 Retro — SCOPE · START → END`

One line: `N PRs merged across M repos · K releases · by A authors · B dependency bumps`.

`## 🗂️ What shipped` — one `###` section per selected category, in the order picked. Inside each,
groups first, then standalone items:

```
### ✨ Features
- **Self-serve billing** — acme/api, acme/web · 6 PRs · Jul 2 → Aug 14
  - [acme/api#412](url) Stripe checkout session endpoint
  - [acme/web#88](url) Plan picker + upgrade flow
- [acme/cli#51](url) `acme login --sso`
```

A PR that carries several categories is listed under its primary one only, and tagged `· also:
innovation` where that applies. Categories with nothing in range say `— nothing in range`.

`## 📝 Summary` — the succinct part. **3-7 bullets per selected category**, each one a group or a
standout item, one line each, most significant first:

- **Innovation** — `**<thing>** — why novel: <the evidence from §5, concretely>`
  e.g. *"**Streaming diff engine** — why novel: first use of WASM in the org; replaces a
  server round-trip per keystroke (body: 400 ms → 15 ms)."*
- **Features** — `**<thing>** — <who it's for / what it unlocks>`.
- **Maintenance** — `**<thing>** — <risk retired or cost cut>` (majors bumped, EOL runtimes
  dropped, flaky tests fixed, CI time saved — with numbers when the PRs give them).
- **Fixes & reliability** — `**<thing>** — <user-visible impact / severity>`.
- **Free-text categories** — same shape: the thing, then the detail that matters for that lens.

Close with one **headline** line — e.g. *"A quarter dominated by billing and a WASM diff engine;
maintenance kept pace (Node 22, 3 majors, CI −40%)."*

Then one line offering the report as a shareable page. On a yes, build a self-contained HTML page in
the scratchpad (load the `artifact-design` skill first) and publish it with **Artifact**; otherwise
write nothing.
