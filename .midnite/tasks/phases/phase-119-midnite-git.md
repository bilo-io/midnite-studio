# Phase 119 — Midnite Git: a self-hosted forge and local CI runners

**Planned unattended** (swarm agent, `/midnite-ideate` house style, interactive stages skipped) · 2026-10-22

Everything the suite does around a repository today assumes the forge is someone else's. The forge
feature ([`packages/features/forge`](../../../packages/features/forge)) speaks to GitHub, GitLab,
Bitbucket and Azure DevOps through one `ForgeAdapter`
([`adapter.ts`](../../../packages/features/forge/main/adapter.ts): runs, workflows, pulls, issues,
boards, review comments) chosen by
[`registry.ts`](../../../packages/features/forge/main/registry.ts) from a repo's remotes
([`repo-forge.ts`](../../../packages/features/forge/main/repo-forge.ts),
[`git-config-remotes.ts`](../../../packages/features/forge/main/git-config-remotes.ts)); accounts and
their tokens live in the vault ([`forge-account-vault.ts`](../../../packages/features/forge/main/forge-account-vault.ts));
the set of repositories an account can reach is already enumerated
([`reachable-repos.ts`](../../../packages/features/forge/main/reachable-repos.ts)); and the git engine
can clone, fetch, push and run hooks ([`clone.ts`](../../../packages/git-engine/src/commands/clone.ts),
[`sync.ts`](../../../packages/git-engine/src/commands/sync.ts),
[`hooks.ts`](../../../packages/git-engine/src/commands/hooks.ts)) through the per-repo write queue.
What does not exist is a copy of any of it that the user owns: if GitHub is unreachable, or a
provider breach makes every token suspect, the repositories are still on disk but the issues, pull
requests, reviews, labels, releases and CI are gone with the provider — and nothing can run a
workflow without it.

**Midnite Git** is a new suite app that closes that gap in three tiers, each useful without the
next. **Tier 1, mirror and backup**: every reachable repository as a bare `--mirror` plus its forge
metadata as JSON, fetched on a schedule, verified, restorable — no server involved. **Tier 2, a local
forge**: Forgejo running on the Mac, bound to localhost, imported from the mirrors, with its PRs,
issues and checks shown in the same forge UI Studio already has. **Tier 3, local CI**: runners that
read the repo's existing `.github/workflows/*.yml`, run jobs in sandboxed Linux containers on the
user's own compute, and report back to the local forge and to Studio's status bar.

Builds on [Phase 90](phase-90-multi-forge-integration.md) (the adapter and accounts),
[Phase 113](phase-113-midnite-apps-suite-split.md) (the layer rule, the app kit in
[`docs/APPS.md`](../../../docs/APPS.md), the launcher catalog), [Phase 91](phase-91-security-hardening.md)
C (`GIT_ALLOW_PROTOCOL`, remote validation) and H/I (checksums, audit gates),
[Phase 115](phase-115-privacy-egress-and-at-rest.md) A (egress registry), and the sibling plans
[Phase 118](phase-118-vault-security-hardening.md) (the forge admin token and the export format) and
[Phase 121](phase-121-agents-security.md) (agents running CI-shaped work).

Scope guardrails:
- **Tier 1 needs no server and lands first.** A mirror is `git` and JSON files on disk; it must
  work with no container runtime installed, so a user with nothing but Studio gets the backup.
- **The forge and the runner are separate processes behind HTTP, never linked.** Forgejo and its
  runner are GPL-3.0-or-later (see the research block); this repo carries no licence file and is
  not GPL, so neither binary is bundled into a midnite `.app` or imported as code. Both are pulled
  on first use as OCI images, checksum-verified, and talked to over `127.0.0.1`. Build-vs-embed is
  Decision 1.
- **Localhost only.** The forge binds `127.0.0.1`; there is no LAN or public exposure in this
  phase. Exposing it (Tailscale, a reverse proxy) is a recorded follow-up with its own threat model.
- **The layer rule holds.** `apps/git` composes the frame, the existing `forge` feature and one new
  feature package, `forge-host`. `forge-host` never imports `forge`; they meet through `shared` ids
  (`ForgeKind`, account keys) and the link router, like every other pair.
- **No macOS-native CI jobs in this phase.** `runs-on: macos-*` jobs are reported as "needs a macOS
  runner" and skipped; a macOS VM runner is deferred (Decision 5).
- **Host-level monitoring of the runner processes is Vanguard's** ([Phase 120](phase-120-vanguard.md),
  sibling plan). This phase sandboxes jobs; it does not watch the Mac.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A is independent and lands
> first. B needs nothing from A but is useless without C's app to show it. C needs B's supervisor
> contract. D needs B (the runner registers with the forge) except D.1 (`act`), which needs only a
> repo. E lands with D, not after. F needs B and C. G needs A, and B for the forge half. H is last.
> Suggested swarm: A + B, then C + D.1, then D + E, then F + G, then H.

> **Research, verified 2026-10-22, that the decisions below rest on.**
>
> **1. Licences.** Forgejo is **GPL-3.0-or-later from v9.0** (August 2024); versions before v9
> are MIT ([Wikipedia](https://en.wikipedia.org/wiki/Forgejo),
> [comparison](https://www.codey.ch/forgejo-vs-gitea/)). The **Forgejo runner** relicensed from
> MIT to **GPL-3.0-or-later on 2025-09-04**
> ([runner PR #773](https://code.forgejo.org/forgejo/runner/pulls/773),
> [pkg.go.dev](https://pkg.go.dev/code.forgejo.org/forgejo/runner/v12)) and is a soft fork of
> `nektos/act`. **Gitea** is MIT with an open-core enterprise edition and requires copyright
> assignment from contributors; Gitea's **`act_runner` is MIT** ([gitea.com](https://gitea.com/gitea/act_runner)).
> **`nektos/act` is MIT** and runs GitHub Actions workflows locally in Docker
> ([GitHub](https://github.com/nektos/act)). Forgejo is governed by Codeberg e.V., a non-profit;
> Gitea by a company ([forgejo.org](https://forgejo.org/compare-to-gitea/)).
>
> **2. Binaries.** Forgejo's download page documents Linux only and the project recommends Docker
> on macOS; a third-party SDK dropped darwin support because no native Forgejo binaries exist for
> it ([forgejo.org/download](https://forgejo.org/download/),
> [Wikipedia](https://en.wikipedia.org/wiki/Forgejo)). Gitea publishes `darwin-arm64` binaries
> ([Gitea docs](https://docs.gitea.com/installation/install-from-binary)). So a native-macOS forge
> means Gitea; a Forgejo forge means a container.
>
> **3. Actions compatibility.** Forgejo's own docs: Forgejo Actions "is designed to be familiar to
> users of GitHub Actions, but it is not designed to be compatible" — YAML workflows, Docker-run
> jobs and reusable workflows are near-identical, the default environment is very different, and
> the known-differences list "may be incomplete"
> ([forgejo.org/docs](https://forgejo.org/docs/next/user/actions/github-actions/)). Theme D treats
> a workflow that runs green on GitHub and red locally as a *compatibility* finding, reported as
> such.
>
> **4. A macOS-native container runtime exists.** Apple's `container` CLI and Containerization
> framework (WWDC 2025; Apple silicon; macOS 26 the supported target) run each OCI container in its
> own lightweight VM on the Virtualization framework, with sub-second start and per-container IPs
> ([InfoQ](https://www.infoq.com/news/2025/06/apple-container-linux),
> [The Register](https://www.theregister.com/2025/06/10/apple_tries_to_contain_itself/)). The
> repository's licence is to be confirmed at build time (Decision 2 assumes Apache-2.0; if it is
> not, Colima/Lima, MIT, is the free fallback either way).
>
> **5. Why the local copy matters now.** The 2025 Shai-Hulud npm worms used stolen GitHub PATs to
> write to ~25,000 repositories and leaked 14,206 secrets through GitHub itself
> ([Check Point](https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/)).
> A provider-side compromise is a case where the *forge* cannot be trusted to hold the only copy of
> the code's history or of who approved what. Theme G's runbook starts from "every token is burnt".

## Headlines

*Your repositories, their history, their conversations and their CI survive the provider — on your
own Mac, in a forge you can read with your own git client, with jobs that run in sandboxes you
own.* Born from a suite that speaks to four forges and owns none. (0% · 0/57) — **Planned
2026-10-22.**

**Theme A — Mirror and backup, no server required.** ◻ Every reachable repo as a bare `--mirror`
under `~/Midnite/Git/mirrors`, forge metadata (issues, PRs, reviews, labels, milestones, releases)
as NDJSON beside it, fetched on a schedule through the existing adapter, verified by `git fsck` and
a manifest, restorable with one command.

**Theme B — The forge, in a container, on localhost.** ◻ A `forge-host` supervisor that detects a
container runtime (Apple `container`, then Colima, then Docker), pulls the pinned Forgejo image by
digest, runs it bound to `127.0.0.1` with its data under `~/Midnite/Git/forge`, holds the admin
token and `SECRET_KEY` in the vault, and imports A's mirrors.

**Theme C — The app and its feature package.** ◻ `apps/git` ("Midnite Git") composing the frame,
`forge` and the new `packages/features/forge-host`; a host dashboard (runtime, forge, runners,
mirrors, storage) plus the forge feature's PR/issue/checks views pointed at the local forge.

**Theme D — Local CI: `act` first, then runners.** ◻ "Run this workflow here" via `act` on any
repo with `.github/workflows`, no forge needed; then a Forgejo runner registered to the local
forge, jobs in ephemeral Linux containers, logs streamed to Studio, macOS jobs reported and
skipped.

**Theme E — Runner sandboxing and the supply-chain floor.** ◻ Ephemeral job containers with no host
mounts beyond the checkout, no runtime socket inside, a default-deny egress allowlist per repo,
per-job tokens scoped to one repo, resource and time caps, redacted logs, quarantined artefacts.

**Theme F — Studio and the forge feature.** ◻ `ForgeKind` gains `forgejo`; a `forgejo/` adapter
(Gitea-compatible `/api/v1`) in the forge feature; a repo with both `origin` and `midnite` remotes
shows both forges' checks; "mirror on push" as a git-engine option; `midnite://open?app=git` deep
links.

**Theme G — Failover, restore and the drill.** ◻ A runbook for "GitHub is down" and "every token
is burnt"; restore a mirror to a new remote with `push --mirror`; best-effort metadata re-creation
with its losses stated; a monthly restore drill that proves the backup opens.

**Theme H — Launcher, release and docs.** ◻ The catalog entry, the app bundle and feed entry, the
egress registry entries for the image registries, container-runtime detection in setup, and
`docs/MIDNITE_GIT.md`.

## Deliverables

### A — Mirror and backup, no server required [L · 1–2d]

- [ ] **The mirror layout.** `~/Midnite/Git/mirrors/<host>/<owner>/<repo>.git` (bare, created
      with `git clone --mirror` via [`clone.ts`](../../../packages/git-engine/src/commands/clone.ts)'s
      `cloneRepo` gaining a `mirror: true` option; refreshed with `git remote update --prune` through the write
      queue) and `<repo>.meta/` beside it: `issues.ndjson`, `pulls.ndjson`, `reviews.ndjson`,
      `comments.ndjson`, `labels.json`, `milestones.json`, `releases.json`, `manifest.json`
      (`{ fetchedAt, headRefs: {ref: sha}, files: {name: sha256}, adapter, account }`). All files
      0600 in 0700 dirs (Phase 115 B helpers); the root is user-configurable.
- [ ] **Metadata through the adapter.** A new optional `exportRepo(forge, sink)` on
      `ForgeAdapter`, with a default implementation that composes the existing `listIssues`,
      `listPulls`, `pullComments`, `pullThreads`, `issueComments`, `listWorkflows` and `listRuns`
      pages; GitHub adds releases and assets (manifest only, binaries optional) via
      [`gh-cli.ts`](../../../packages/features/forge/main/github/gh-cli.ts). Rate-limit aware:
      incremental since `manifest.fetchedAt`, backoff on 403/429, never more than one repo at a
      time per host.
- [ ] **Selection and schedule.** From [`reachable-repos.ts`](../../../packages/features/forge/main/reachable-repos.ts),
      the user picks repos (default: every repo Studio has open, plus any the user adds); the
      interval is hourly / daily / weekly / manual (default daily); a run is a main-side scheduler
      in `forge-host`, not a loop. Every outbound call is already a registered forge host under
      Phase 115 A.
- [ ] **Verification.** After every refresh: `git fsck --no-dangling` on the bare repo, head refs
      compared to the adapter's view of the default branch, the manifest's SHA-256 per metadata
      file recomputed; a mismatch marks the mirror `degraded` with the reason and keeps the
      previous manifest.
- [ ] **Restore.** `restoreMirror(target)`: `git push --mirror <target>` for the refs (works to
      any remote: a fresh GitHub repo, the local forge, a USB disk); metadata restore is
      Theme G's job and is best-effort by nature.
- [ ] **Encrypt the metadata archive, optionally.** A switch that wraps `<repo>.meta/` in
      [Phase 118](phase-118-vault-security-hardening.md) G's export format with a passphrase;
      the bare repo stays plain git on a FileVault disk (Decision 4).
- [ ] *Acceptance:* a fresh profile mirrors this repository and its issues in one run; a second
      run is incremental (network trace shows `since=`); corrupting one object makes the mirror
      `degraded`; `restoreMirror` to a temp bare repo reproduces every ref.

### B — The forge, in a container, on localhost [L · 1–2d]

- [ ] **Runtime detection.** `forge-host/main/runtime-detect.ts`: Apple `container` (`container
      system status`), then Colima (`colima status`), then Docker (`docker info`), each by a
      non-interactive probe through [`process-runner.ts`](../../../packages/runtime/src/process-runner.ts);
      reports `{ kind, version, ok, reason }` and never installs anything itself. Setup shows what
      is missing and how to get it (Theme H).
- [ ] **A supervisor over one `ContainerRuntime` port.** `pull(image@digest)`, `run(spec)`,
      `stop`, `logs`, `exec` as one structural interface with three thin implementations
      (`container`, `colima`/`docker` share the Docker CLI). Images are pinned by digest in a
      checked-in `forge-images.json` (Forgejo, the runner, the job base image), checksum-verified
      on pull, refreshed only by a PR. Pulls go through Phase 115 A's registry
      (`codeberg.org`, `code.forgejo.org`, `docker.io` as `trigger: 'user'`).
- [ ] **Forgejo, configured for one person on one Mac.** `app.ini` generated from a template:
      `HTTP_ADDR = 127.0.0.1`, SSH disabled (git over HTTP on localhost; Decision 3), registration
      closed, `SECRET_KEY`/`INTERNAL_TOKEN`/`JWT_SECRET` generated once and held in the vault under
      a new `forge-host` namespace, data at `~/Midnite/Git/forge/{data,repos,db}` (SQLite),
      `ROOT_URL = http://127.0.0.1:<port>/`. First run creates the admin user and an API token,
      stored as a vault `forge` account `forgejo:127.0.0.1:<port>:<login>` so the forge feature
      finds it the ordinary way.
- [ ] **Lifecycle.** Start on app launch (Settings: always / when the app is open / manual),
      stop with the app, health check on `/api/healthz`, a restart budget, and log lines through
      the one log seam with `redactRecord`. The supervisor's state is a zod-validated
      `ForgeHostStatus` the renderer polls.
- [ ] **Import from the mirrors.** Refs go in from the *host* side: create the repo with
      `POST /api/v1/user/repos` and run A's `restoreMirror` (`git push --mirror`) into it over
      localhost HTTP. Not the migrate API over `file://`: the mirrors root is not mounted into the
      container, and Forgejo refuses local paths and loopback URLs unless `IMPORT_LOCAL_PATHS` and
      `ALLOW_LOCALNETWORKS` are enabled, which the generated `app.ini` deliberately leaves off.
      Metadata comes from the live provider via `POST /api/v1/repos/migrate` when it is reachable;
      when it is not, A's NDJSON is replayed through the Forgejo API (issues, comments, labels, milestones; PRs become issues with a `pr:` label
      and the diff attached — stated as a loss in Theme G).
- [ ] **Upgrades.** Bumping `forge-images.json` runs Forgejo's own migration on next start after
      a backup of `db` (SQLite copy) and refuses a downgrade.
- [ ] *Acceptance:* with Apple `container` present, the app starts Forgejo, creates the admin,
      stores the token, imports one mirror, and `git clone http://127.0.0.1:<port>/<owner>/<repo>`
      works from a terminal; with no runtime, the status says so and Tier 1 still runs.

### C — The app and its feature package [M · ~1d]

- [ ] **`packages/features/forge-host`.** Per [`docs/APPS.md`](../../../docs/APPS.md) "The feature
      template": `manifest.ts` (views `git-host`, `git-mirrors`, `git-runners`; a settings page
      `git`), `main/` (the supervisor, mirrors, scheduler, runtime detection, handlers behind a
      services type), `renderer/` (the dashboard, mirrors list, runners list, host port). It
      imports the frame and `shared` only; the layer test
      ([`layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs)) gains its cases.
- [ ] **`apps/git`.** "Midnite Git": `createFrameChrome()`, the forge feature's standalone views
      ([`renderer/standalone`](../../../packages/features/forge/renderer/standalone)) pointed at the
      local account, `forge-host`'s views, a Vault pairing for the `forge-host` and `forge`
      namespaces, the esbuild main + preload with channels by source path. Listed in
      [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) so Studio hosts
      the same views (the composition test demands it).
- [ ] **The dashboard.** One screen: runtime (kind, version, ok), forge (running, port, version,
      repos, disk), runners (registered, busy, last job), mirrors (count, last run, degraded), and
      storage (bytes per root). Every tile links to its list.
- [ ] **Blast-radius confirms.** Deleting a mirror, stopping the forge mid-job, and removing a
      runner show counts (refs, open jobs, queued jobs) in the standard confirm.
- [ ] *Acceptance:* `moon run git:start` opens the app; the dashboard reflects B's status; the
      layer test passes with the new cases; Studio's rail shows the same views.

### D — Local CI: `act` first, then runners [L · 1–2d]

- [ ] **D.1 — `act` on any repo.** "Run workflow here" on a repo's `.github/workflows/<file>` from
      the forge feature's workflows view: `forge-host` runs `nektos/act` (MIT; pulled as a pinned
      binary by checksum, not bundled — Decision 1 again) against the checkout in a job container
      from the pinned base image, with `-P ubuntu-latest=<base@digest>`, `--pull=false`, the
      repo's secrets *not* injected unless the user picks them from the vault for that run.
      Streams the log into Studio's runs view with `redactRecord`. Works with no forge.
- [ ] **D.2 — A Forgejo runner, registered to the local forge.** The runner image pinned in
      `forge-images.json`, registered with a token from B, labels `ubuntu-latest:docker://<base@digest>`
      only; capacity 1 by default (Settings: 1–4). It runs as its own container with access to the
      runtime's job API, never to the host.
- [ ] **Workflows run on push to the local forge.** A push to `127.0.0.1` (Theme F's `midnite`
      remote) triggers the repo's workflows in Forgejo; runs, logs and checks come back through the
      `forgejo` adapter (Theme F) into the same status bar and runs view as GitHub's.
- [ ] **Compatibility findings.** A job that fails on a step GitHub runs green is reported as
      `compat` with the step name and the Forgejo docs link, not as a red build; the common cases
      (`actions/cache` backend, `GITHUB_TOKEN` scopes, services, the default image's tool set) are
      documented with their workarounds in `docs/MIDNITE_GIT.md`.
- [ ] **macOS jobs.** `runs-on: macos-*` is detected at parse time; the job is listed as
      "needs a macOS runner (deferred)" and skipped without failing the run.
- [ ] *Acceptance:* `act` runs this repo's `gate-node` job locally to green; a push to the local
      forge runs the same workflow through the runner and the status bar shows its check; a
      workflow with a `macos-14` job shows the skip, not a failure.

### E — Runner sandboxing and the supply-chain floor [M · ~1d]

- [ ] **Ephemeral, minimal containers.** Every job gets a fresh container from the pinned base
      image, a `tmpfs` workspace sized by setting, the checkout as the only bind mount (read-write),
      no runtime socket mounted, `--cap-drop=ALL`, no privileged mode, a non-root user, read-only
      root filesystem where the image allows. Verified by a test that inspects the `run` spec the
      supervisor emits.
- [ ] **Egress allowlist per repo.** Default deny with an allowlist (`registry.npmjs.org`,
      `github.com`, the local forge, `proxy.golang.org`, `pypi.org`, …) editable per repo in the
      app, enforced by the runtime's network policy where it exists (Apple `container` per-VM
      networking; Docker via a sidecar proxy) and reported as "not enforceable" otherwise. A job
      that needs a host not on the list fails with the host named — the Shai-Hulud exfiltration
      leg, cut.
- [ ] **Tokens scoped to the job.** Forgejo's per-job token is the only credential a job sees by
      default; it is scoped to the one repo and expires with the job. Vault secrets reach a job only
      by an explicit per-repo mapping the user makes in the app, logged under
      [Phase 118](phase-118-vault-security-hardening.md) D.
- [ ] **Caps.** CPU, memory and wall-clock per job (defaults 2 cores / 4 GB / 60 min), a disk cap
      per workspace, and a queue cap; a job over its cap is killed with the reason in the log.
- [ ] **Logs and artefacts.** Logs pass through `redactRecord` before storage and before
      Studio; artefacts land in `~/Midnite/Git/artifacts/<run>/` with `com.apple.quarantine` set
      and a SHA-256 manifest, the same treatment as
      [Phase 117](phase-117-browser-security-hardening.md) D's downloads.
- [ ] **The supply-chain floor, in the docs.** Lockfile-only installs (`--frozen-lockfile`,
      `npm ci`), a minimum release age for dependencies, pinned actions by SHA (this repo already
      does this — [`ci.yml`](../../../.github/workflows/ci.yml)), and `postinstall` as the
      attack vector — one page the user reads before enabling runners on a repo with secrets.
- [ ] *Acceptance:* the emitted run spec passes the sandbox test; a job `curl`ing an unlisted
      host fails with the host named (Apple `container` and Docker both tested); a job's token
      cannot read a second repo; a 1-minute cap kills a `sleep 120` step.

### F — Studio and the forge feature [M · ~1d]

- [ ] **`forgejo` as a `ForgeKind`.** [`remote.ts`](../../../packages/shared/src/domain/remote.ts)'s
      `ForgeKindSchema` gains `'forgejo'` (also what a Gitea host is detected as — same API);
      detection from a remote URL whose host is `127.0.0.1:<port>` or matches a configured forge
      host. [`forge-account.ts`](../../../packages/shared/src/domain/forge-account.ts) accepts the
      provider; [`setup.ts`](../../../packages/shared/src/setup.ts)'s provider record gains the key.
- [ ] **The adapter.** `packages/features/forge/main/forgejo/` implementing `ForgeAdapter` over
      Forgejo's Gitea-compatible `/api/v1` (runs and logs via `/repos/{o}/{r}/actions/*`, pulls,
      issues, review comments, threads; boards via projects); fixtures in the cross-provider PR
      test ([`pr-fixture-cross-provider.test.ts`](../../../packages/features/forge/main/pr-fixture-cross-provider.test.ts)).
      [`whoami.ts`](../../../packages/features/forge/main/whoami.ts) and
      [`http.ts`](../../../packages/features/forge/main/http.ts) take the new kind.
- [ ] **Two forges, one repo.** A repo with `origin` on GitHub and `midnite` on the local forge
      shows both in the status bar's checks verdict and the PR list, labelled by forge; the poller
      ([`forge-poller.ts`](../../../packages/features/forge/main/forge-poller.ts)) polls the local
      one at a shorter interval since it costs nothing.
- [ ] **"Mirror on push".** A per-repo git-engine option that adds the local forge as a second
      push URL through the write queue, with the `--end-of-options` guard and the Phase 91 C
      remote validation. **Order matters:** once any `remote.origin.pushurl` exists git pushes
      *only* to pushurls, so enabling first copies the fetch URL as a pushurl (`set-url --add
      --push origin <original url>`) and only then adds `http://127.0.0.1:<port>/…`; disabling
      removes both and restores the no-pushurl state, and a test pins the resulting `git config`
      for each transition. The repo stays a plain git repo a user can read without Studio.
- [ ] **Deep links.** `midnite://open?app=git[&view=git-mirrors|git-runners]` through
      [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts); the forge feature's
      "Open in Midnite Git" from a PR or run.
- [ ] *Acceptance:* a PR opened on the local forge appears in Studio's PR list with checks from
      the local runner; "mirror on push" pushes to both and a failed local push does not block
      the GitHub push (or vice versa — reported separately).

### G — Failover, restore and the drill [M · ~1d]

- [ ] **The runbook, as a doc and as a flow.** `docs/MIDNITE_GIT.md` §Failover, mirrored by a
      "Provider incident" flow in the app with three branches: *unreachable* (work against the
      local forge, queue nothing to GitHub, resume when back), *tokens burnt* (revoke every forge
      token in the vault — [Phase 118](phase-118-vault-security-hardening.md) B/D — re-mint, verify
      every mirror's refs against the provider when back), *repository tampered* (diff the
      mirror's refs and the provider's, list divergent refs with the commits on each side, offer a
      per-ref `push --force-with-lease=<ref>:<expect> origin <ref>` through the existing
      force-push gate — the only lease form this repo builds. Never `--mirror` here: it
      force-updates every ref and deletes any the mirror lacks, so it is reserved for restores
      into an *empty* repo, below).
- [ ] **Restore to a new remote.** `restoreMirror` from A to a freshly created repo (GitHub via
      `gh repo create`, GitLab via API, the local forge via B); refs exact.
- [ ] **Metadata re-creation, with its losses stated.** Issues and comments re-created through
      the provider's API lose original authorship, timestamps and numbering; PRs become issues or
      branches with the review text attached; labels and milestones round-trip. The flow shows this
      list before doing anything and writes a `RESTORE.md` into the new repo with the mapping
      (old number → new number).
- [ ] **The drill.** Monthly (Settings: weekly / monthly / off), for every mirror: clone the
      bare repo into a temp dir, `git fsck`, check out the default branch, compare the head to the
      manifest, delete the temp dir, record `{ at, ok, bytes, seconds }`. A failed drill is a
      dashboard banner. Nothing leaves the Mac.
- [ ] *Acceptance:* the drill passes on every mirror of a fresh profile; a mirror with a corrupted
      object fails the drill with the object named; restore to a throwaway GitHub repo reproduces
      every ref and `RESTORE.md` maps every issue.

### H — Launcher, release and docs [S · ≤ 2h after the rest]

- [ ] **Catalog entry.** [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts): `id: 'git'`,
      `name: 'Midnite Git'`, `section: 'suite'`, tagline "Your forge, on your Mac", like "Like
      GitHub and Forgejo, with the runners on your own compute", features `mirrors`, `forge`,
      `runners`, `failover`, home `view('git-host')` once the view exists. `APP_IDS` gains `git`;
      the launcher's catalog test covers it.
- [ ] **Bundle and feed.** `moon run git:dist`, the midnite-apps feed entry
      (`midnite-git/version.json`, `feed/latest-mac.yml`), `install-git.sh` landing in midnite-apps
      first per the installer rule, with the SHA-256 and signature checks Phase 91 H established.
- [ ] **Egress registry.** Entries for the image registries and for `127.0.0.1:<port>` (so the
      registry test does not flag the local forge), each `trigger: 'user'` with `sends` stated.
- [ ] **Setup.** The setup wizard ([Phase 98](phase-98-setup-wizard-overlay.md)) gains a
      "Container runtime" step for the Git app only: detected / how to install Apple `container`
      (macOS 26, Apple silicon) or Colima, with the Tier 1 note that mirrors work without one.
- [ ] **`docs/MIDNITE_GIT.md` and `docs/APPS.md`.** The three tiers, the licence position, the
      ports and files, the compatibility list, the sandbox spec, the runbook, and "App 14:
      Midnite Git" in `APPS.md`'s compositions.

## Files this phase touches

| Area | Files |
|---|---|
| New feature | `packages/features/forge-host/` (new: `manifest.ts`, `main/{supervisor,runtime-detect,mirrors,scheduler,handlers}.ts`, `renderer/{dashboard,mirrors,runners,host}.tsx`), `forge-images.json` (new) |
| New app | `apps/git/` (new: `src/{git-app.tsx,main.tsx,compose/,views/}`, `main/`, `preload/`, `electron-builder.yml`, `moon.yml`), [`composition.ts`](../../../apps/studio/src/composition.ts) |
| Forge feature | [`adapter.ts`](../../../packages/features/forge/main/adapter.ts), [`registry.ts`](../../../packages/features/forge/main/registry.ts), [`repo-forge.ts`](../../../packages/features/forge/main/repo-forge.ts), [`reachable-repos.ts`](../../../packages/features/forge/main/reachable-repos.ts), [`forge-poller.ts`](../../../packages/features/forge/main/forge-poller.ts), [`whoami.ts`](../../../packages/features/forge/main/whoami.ts), [`http.ts`](../../../packages/features/forge/main/http.ts), [`gh-cli.ts`](../../../packages/features/forge/main/github/gh-cli.ts), `forgejo/` (new), [`renderer/standalone`](../../../packages/features/forge/renderer/standalone) |
| Shared | [`remote.ts`](../../../packages/shared/src/domain/remote.ts), [`forge-account.ts`](../../../packages/shared/src/domain/forge-account.ts), [`setup.ts`](../../../packages/shared/src/setup.ts), [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts), Phase 115 A's `EGRESS_HOSTS` registry (`packages/shared/src/egress.ts`, planned) |
| Git engine | [`clone.ts`](../../../packages/git-engine/src/commands/clone.ts), [`sync.ts`](../../../packages/git-engine/src/commands/sync.ts), [`git-config-remotes.ts`](../../../packages/features/forge/main/git-config-remotes.ts), [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts) |
| Runtime | [`process-runner.ts`](../../../packages/runtime/src/process-runner.ts), [`fs-jail.ts`](../../../packages/runtime/src/fs-jail.ts), the vault namespaces in [`vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts) |
| Launcher | [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts), [`apps/launcher/src/main/index.ts`](../../../apps/launcher/src/main/index.ts) |
| Gates | [`layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs), [`ci.yml`](../../../.github/workflows/ci.yml) (`git` in `gate-node`/`NODE_PROJECTS`) |
| Docs | `docs/MIDNITE_GIT.md` (new), [`docs/APPS.md`](../../../docs/APPS.md), [`SECURITY.md`](../../../SECURITY.md) |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme (CI is the gate; no local full run).
      **Nothing in the local loop starts a container** stays true: every supervisor and runner test
      runs against a fake `ContainerRuntime`; the real-runtime passes are the human items below.
- [ ] **A:** fresh mirror, incremental refresh, `degraded` on corruption, exact restore — all
      against a local bare fixture and a recorded adapter.
- [ ] **B:** the generated `app.ini` is pinned by test (localhost, closed registration, no SSH);
      the vault holds the secrets; the supervisor's state machine is table-tested.
- [ ] **C:** layer test cases pass; the composition test lists `forge-host`; the dashboard renders
      every status shape.
- [ ] **D:** `act` invocation args are pinned; the runner registration flow is tested against a
      fake forge; the macOS skip is a unit test over the workflow parser.
- [ ] **E:** the emitted run spec has no privileged flag, no socket mount, `cap-drop=ALL`, a
      non-root user; the allowlist compiles to the runtime's policy shape.
- [ ] **F:** the `forgejo` adapter passes the cross-provider PR fixture; detection maps a
      `127.0.0.1` remote to `forgejo`; "mirror on push" builds the exact argv.
- [ ] **G:** the drill and restore pass on fixtures; the tampered-refs diff lists the right refs.
- [ ] **Open, for a human:** on a Mac with Apple `container`: start the forge, import this repo,
      push a branch to it, watch `gate-node` run on the local runner to green, pull the plug on
      Wi-Fi and open a PR locally, then run the restore drill — with the dashboard screenshot and
      the run log attached to the PR. Repeat the runner half on Colima.

## Decisions / open questions

1. **Embed Forgejo as a separate containerised process; do not build a forge.** *Resolved
   (recommended).* Building a forge (PRs, reviews, issues, Actions) is years of work the suite does
   not need to own; Forgejo gives it for the cost of a container. The GPL is respected by the
   process boundary: no GPL code is bundled into a midnite `.app`, imported, or modified — the
   image is pulled by digest from the project's registry and talked to over HTTP, and the doc
   says so. If a modification were ever needed it would be published under the GPL as the licence
   requires. Gitea (MIT, native darwin binary, no container needed) is the recorded alternative if
   a container runtime proves too high a bar for users; the `forgejo` adapter works against both.
2. **Container runtime: Apple `container` first, Colima second, Docker third.** *Resolved
   (recommended).* Apple's tool gives per-container VMs on the Virtualization framework with
   nothing to license (licence to confirm at build time), which is the isolation Theme E wants;
   Colima/Lima is MIT and runs on macOS 14+; Docker Desktop needs a paid licence for larger
   companies and is listed last. The supervisor port hides the choice from everything above it.
3. **Git over HTTP on localhost, no SSH.** *Resolved (recommended).* An SSH daemon in the
   container is a second listener and a second key to manage for no gain on `127.0.0.1`; HTTP
   with the vault-held token is one credential the forge feature already handles. Exposing the
   forge beyond the Mac is the point at which SSH and TLS return — recorded as the follow-up.
4. **Mirrors stay plain git; only the metadata archive can be encrypted.** *Resolved
   (recommended).* A bare repo a user can `git clone` with no app is the whole value of Tier 1
   in an incident; FileVault is the at-rest protection, as Phase 115 names it. The metadata holds
   private conversation and gets the optional passphrase wrap.
5. **macOS-native CI jobs are deferred.** *Resolved (recommended).* They need a macOS VM (Tart
   or raw Virtualization.framework) with its own licence and image story. This repo's own
   platform jobs are the obvious customer; revisit once Linux jobs run reliably.
6. **Tier 1 before Tier 2, always.** *Resolved.* A user who installs nothing else gets the
   backup; the forge and runners are additive.
7. **Open: where the runner's egress policy is enforced on Docker.** Apple `container` gives
   per-VM networking; Docker needs a sidecar proxy or a user-defined network with iptables inside
   Colima's VM. Recommendation: ship the proxy sidecar (one container, pinned) and mark Docker
   Desktop "egress policy: advisory" until tested.
8. **Open: should Midnite Git also mirror the *other* forges' repos (GitLab, Bitbucket, Azure)?**
   The adapter makes Tier 1 provider-agnostic for free; Forgejo's migrator handles GitLab and
   Gitea natively, GitHub best. Recommendation: Tier 1 for all four from day one; Tier 2 import
   for GitHub and GitLab first.
9. **Open: the runner on repos with vault-mapped secrets.** Recommendation: a repo with any
   secret mapped requires the egress allowlist to be non-default (the user has looked at it) and
   shows the supply-chain page once. Settle when E is built.
