# Phase 122 — Guard loop upgrade

**Planned unattended** (swarm subagent, via `/midnite-ideate` house style) · 2026-10-22

Guard is the first of the six loops the FAB ships ([`loops.ts`](../../../packages/shared/src/loops.ts),
`DEFAULT_LOOPS[0]`): a Claude run of `/loop /midnite-address-issue` with five modifiers — *Scan for
secrets*, *Audit dependencies*, *Review for vulnerabilities*, *Generate SBOM*, *Report only* — and a
severity gate. Every pass is a model reading a prompt in a pty; the ledger
([`loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts)) records when it started, when it
ended and the composed prompt, and the Guard tab ([`loop-tab.tsx`](../../../packages/app/src/features/loops/loop-tab.tsx),
[`loop-history.tsx`](../../../packages/app/src/features/loops/loop-history.tsx)) shows the runs.
Nothing deterministic happens: without an agent installed Guard does nothing, a pass's findings
live in scrollback, two passes cannot be diffed, and nothing it finds has a button. Meanwhile the
repo's one real vulnerability gate is CI-side and scoped to this repo's own lockfile
([`scripts/audit.mjs`](../../../scripts/audit.mjs) with its expiring
[`audit-suppressions.json`](../../../scripts/audit-suppressions.json), Phase 91 I), and the
machine the agents run on is checked by nobody.

This phase makes Guard a *sweep*: a set of deterministic checks the runtime runs on the loop's
schedule with or without an agent — the lockfiles of every open repo against OSV, the GitHub
Advisory Database and CISA's KEV; installed MCP servers, packages and plugins against a threat feed
that tracks the AI-driven campaigns; the Mac's ports, software, configuration and keys; the sites the
browser visited; the agent trail — each producing findings in the shared ledger with a severity and a
remediation action, and a model pass that triages and fixes on top. The split with Vanguard is fixed
and stated in both docs: **Guard is the recurring sweep that feeds the ledger; Vanguard
([Phase 120](phase-120-vanguard.md)) is the always-on sensor set and the hand that acts.** Guard
never kills, quarantines or pauses anything; Vanguard never calls a feed.

[Phase 121](phase-121-agents-security.md) writes the audit trail Theme F reads and owns the install
checks Theme C's feed informs. [Phase 115](phase-115-privacy-egress-and-at-rest.md) A's egress
registry gates every feed call here. [Phase 117](phase-117-browser-security-hardening.md) owns the browser's
live defenses — Theme E is the offline sweep over what was visited, not a navigation guard.
[Phase 118](phase-118-vault-security-hardening.md) owns the vault; Theme D only reports key files and
dotfiles outside it. [Phase 119](phase-119-midnite-git.md) is where a git-level remediation
(a pinned dependency bump as a PR) would land its UI.

Scope guardrails:
- **Deterministic first, model second.** Every check in Themes B–F is a pure function over inputs
  the runtime fetched, fixture-tested, producing `SecurityFinding`s. The agent pass receives the
  findings as an attachment (tagged untrusted per Phase 121 A — a CVE description is text from the
  internet) and does triage and fixes; it is never the source of a finding's severity.
- **Every feed call is registered and switchable.** `api.osv.dev`, `api.github.com`,
  `services.nvd.nist.gov` (optional), `www.cisa.gov`, the npm/PyPI registries and the
  midnite-apps threat feed each get a Phase 115 A entry, with Settings ▸ Privacy switches, and the
  sweep runs whatever subset is on. Only package coordinates and CVE ids leave the Mac.
- **No whole-disk scans by default.** The system sweep reads the places the threat landscape
  names; a full-disk malware scan is Vanguard's button.
- **Remediation is one click behind the confirm, never automatic.** Guard proposes; the user
  disposes; the model pass with *Report only* off is the one path that changes files, and it opens
  a PR rather than committing to `main`.
- **No new UI surface.** Findings render in the existing Guard tab and in Vanguard's view; the
  loop composer gains options, not pages.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A lands first (the runner,
> the schedule, the ledger write). B, C, D and E are independent checks that need only A. F needs
> A and Phase 121 G. G needs A and any one check. H needs A. Suggested swarm: A, then B+D, then
> C+E, then F+G+H.

> **Threat landscape this phase answers to, read on 2026-10-22.** The feeds: OSV's
> `POST /v1/querybatch` takes package `(name, ecosystem, version)` or `purl` queries and answers
> with vulnerability ids and `modified` only, paginating past 1 000 per query or 3 000 per batch,
> so each id is hydrated by `GET /v1/vulns/{id}` and cached
> ([OSV docs](https://google.github.io/osv.dev/post-v1-querybatch/)). CISA's KEV catalog is a JSON
> feed with a published schema (`known_exploited_vulnerabilities.json`,
> `known_exploited_vulnerabilities_schema.json`, a licence file beside them) whose entries carry
> `dateAdded`, `dueDate` and `knownRansomwareCampaignUse`
> ([CISA](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)). The campaigns a feed of
> our own has to track: the Shai-Hulud npm worm family — September 2025, "2.0" in November 2025
> (796 packages), Mini Shai-Hulud across npm and PyPI in May 2026 (373 package-versions), the
> `keyv` wave of August 2026 (400+ packages)
> ([Microsoft](https://www.microsoft.com/en-us/security/blog/2025/12/09/shai-hulud-2-0-guidance-for-detecting-investigating-and-defending-against-the-supply-chain-attack/),
> [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-shai-hulud-ai-supply-chain-20260517-csa-st/),
> [Sygnia](https://www.sygnia.co/threat-reports-and-advisories/shai-hulud-returns-software-supply-chain-attack-npm-keyv/),
> [StepSecurity on AntV](https://www.stepsecurity.io/blog/shai-hulud-here-we-go-again-mass-npm-supply-chain-attack-hits-the-antv-ecosystem),
> [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)); slopsquatting,
> where ~20% of model-suggested packages do not exist and 43% of the invented names recur
> ([Endor Labs](https://www.endorlabs.com/learn/hallucinated-packages-how-ai-invents-dependencies-attackers-exploit));
> malicious and poisoned MCP servers (CVE-2025-54135/54136, CVE-2025-6514, the GitHub MCP toxic
> flow — [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-security-crisis-20260504-csa-styled/));
> and the macOS ClickFix campaigns delivering AMOS, MacSync and Infiniti Stealer through cloaked
> fake-CAPTCHA sites, 250+ domains in one cluster
> ([Microsoft](https://www.microsoft.com/en-us/security/blog/2026/08/05/macos-clickfix-campaign-learned-hide/),
> [BleepingComputer](https://www.bleepingcomputer.com/news/security/new-macos-clickfix-attack-silently-mounts-dmgs-to-push-infostealer/),
> [Malwarebytes](https://www.malwarebytes.com/blog/threat-intel/2026/03/infiniti-stealer-a-new-macos-infostealer-using-clickfix-and-python-nuitka)).

## Headlines

*Guard stops being a prompt and becomes a sweep: the lockfiles against three advisory sources, the
machine against a checklist, the installed agents' servers and packages against the campaigns of
the year, every finding with a severity and a button — and the model pass does the fixing, not the
finding.* Born from a loop that does nothing when no agent is installed. (28% · 11/40) —
**Planned 2026-10-22.**

**Theme A — The sweep runner.** ✅ `packages/runtime/src/guard/`: checks as pure functions over
fetched inputs, run on the loop's schedule by main with or without an agent, writing into
Phase 120's ledger; the agent pass receives the findings file; the run record gains a findings
summary.

**Theme B — CVEs against the lockfiles and the installed software.** ◐ PARTIAL (PR pending). Landed in
`runtime/src/guard/`: lockfile parsers (`lockfiles/`: pnpm v5/v6/v9, package-lock v1–v3, yarn classic,
requirements.txt, Cargo.lock, go.sum — line parsers, no YAML dependency), an OSV client (`feeds/osv.ts`: batches
of 500, `next_page_token` pagination, per-advisory cache keyed by `modified`) that takes an *injected* fetch because
Phase 115 A's `guardedFetch` is not in the tree yet, CISA KEV (`feeds/kev.ts`), the CVSS v3 severity ladder, and the
`lockfile-cves` check: one finding per (advisory, package, lockfile), KEV raises to `critical`, an unexpired
`audit-suppressions.json` entry yields `info`. The closed action set gains `update-package` / `pin-package`
(listed in `REMEDIATION_PENDING` until Theme G runs them). Still open: GHSA/NVD, installed software (brew,
`/Applications`, `sw_vers`, Electron freshness), yarn berry/poetry/uv/Gemfile/Package.resolved, and wiring the
check and its resolvers into the scheduled sweep.

**Theme C — The threat feed.** ◐ PARTIAL (PR pending). Landed: `ThreatFeedSchema` in `shared/src/threat-feed.ts`
(every entry carries an https `ref`), an Ed25519 detached-signature verifier and cached loader
(`guard/feeds/threat-feed.ts`; the signature covers `canonicalJson`, a tampered byte or a malformed entry rejects the
whole file, and a bad signature is reported rather than papered over with an older copy), `scripts/threat-feed-check.mjs`
for candidate files, an installed-`node_modules` resolver, and the `poisoned-packages` (`critical`, new
`remove-package` action), `mcp-servers` (`critical`, `revoke-mcp-server`) and `slopsquat` (`high` for listed names,
`medium` for one edit from a short built-in popular list) checks. Not done: the feed itself and its publishing
workflow live in `bilo-io/midnite-apps`, so `THREAT_FEED_PUBLIC_KEY_PEM` is empty and no feed is trusted yet; the
plugins/skills re-scan; the installed-package resolver does not yet descend into pnpm's `node_modules/.pnpm`; wiring into the sweep (the `installedPackages` and `mcpServers` inputs have no resolver registered yet). The loader keeps serving the last verified feed when a download fails verification and refuses a validly signed feed with a lower `version` than the cached one.

**Theme D — The Mac itself.** ◻ Listening ports, outdated software, FileVault/firewall/
Gatekeeper/SIP/remote-login state, SSH key modes and passphrases, secrets in dotfiles and `.env`
files, `~/.npmrc`/`~/.netrc` tokens, stale `authorized_keys` — each a finding with a fix.

**Theme E — Sites the browser visited.** ◻ The browser feature's history checked offline against
the ClickFix domain list, HTTP-only origins, known-phishing feeds with usable licences, and sites
whose server headers announce an end-of-life stack; findings link back to the tab.

**Theme F — Suspicious behaviour over the window.** ◻ Phase 121's audit trail and Phase 120's
sensor history correlated across the sweep window: sessions outside the user's hours, a
persistence item during a session, a new outbound host, a lockfile change with no PR.

**Theme G — Findings in the Guard tab, with a button.** ◻ The tab lists the last sweep's findings by
severity with a diff against the previous sweep; each remediation action renders through the shared
enum; "Fix with agent" composes the finding into a Guard run with *Report only* off.

**Theme H — Schedule, cost and disclosure.** ◻ Default daily on wake, each feed behind its
switch, a Privacy row that says what leaves, and a sweep that finishes in under a minute on this
repo.

## Deliverables

### A — The sweep runner [M · ~1d]

- [x] **The check contract.** `packages/runtime/src/guard/check.ts`: `GuardCheck = {id, title,
      category, needs: Input[], run(inputs): SecurityFinding[]}` where inputs are named fetched
      things (`lockfiles`, `osv`, `kev`, `ghsa`, `threatFeed`, `ports`, `brew`, `history`,
      `auditTrail`, …) resolved once per sweep by `guard/inputs.ts`, so a check never fetches and
      every check is a fixture test. Findings use Phase 120 A's `SecurityFindingSchema` with
      `source: 'guard'` and a fingerprint stable across sweeps (`<checkId>:<subject>`). [M]
- [x] **The scheduler, in main.** The Guard loop's `LoopSchedule` (days, window, cadence — the
      fields [`loops.ts`](../../../packages/shared/src/loops.ts) already persists) now also arms a
      main-side timer for the sweep, independent of whether a pty run starts: `guard/scheduler.ts`
      with the next-wake persisted so a relaunch resumes, plus "Sweep now" from the tab. A sweep
      runs whether or not an agent is installed. [M]
- [x] **Writing the ledger.** Each sweep's findings go through the runtime ledger's `record`
      (dedupe by fingerprint bumps `count`/`lastSeen`); findings from the previous sweep not seen in
      this one move to `resolved` with `resolvedBy: 'sweep'`. A `GuardSweepRecord` (`startedAt`,
      `endedAt`, `checksRun`, `inputsSkipped` with the switch that skipped each, counts by severity)
      is appended beside the loop-run ledger. [S]
- [x] **The agent pass gets the file.** When the Guard loop also runs its pty pass, the composed
      prompt (`loopModifierFragment` in `loops.ts`) gains a line pointing at the sweep's findings
      JSON (`<userData>/security/sweeps/<id>.json`), attached with `provenance: untrusted` per
      Phase 121 A, and the modifiers gain *Fix the sweep's findings* beside *Report only*. [S]
- [x] **Tests.** A fixture sweep with two checks and one skipped input; dedupe across two sweeps;
      resolved-by-sweep; the scheduler's next-wake survives a reload. [S]

### B — CVEs against the lockfiles and the installed software [L · 1–2d]

- [~] **Lockfile parsers.** ◐ PARTIAL (PR pending): pnpm v5/v6/v9, package-lock v1–v3, yarn classic, requirements.txt, Cargo.lock and go.sum landed; yarn berry, poetry, uv, Gemfile.lock and Package.resolved remain. — `guard/lockfiles/`: `pnpm-lock.yaml` (v6 and v9), `package-lock.json`
      (v2/v3), `yarn.lock` (classic and berry), `Cargo.lock`, `poetry.lock`, `uv.lock`,
      `requirements.txt` (pinned lines only), `go.sum`, `Gemfile.lock`, `Package.resolved`. Each
      yields `{ecosystem, name, version, direct: boolean, path}` using OSV's ecosystem names. Fixture
      per format from real files in this repo and small hand-made ones. [M]
- [x] **OSV client.** `guard/feeds/osv.ts` over Phase 115 A's `guardedFetch`: `querybatch` in
      chunks of 500 queries, pagination by `next_page_token` per query, hydration of each new id
      through `GET /v1/vulns/{id}` into a `<userData>/security/feeds/osv/<id>.json` cache keyed by
      `modified`, so a daily sweep of a 1 695-entry lockfile re-fetches only what changed. Severity
      from the advisory's CVSS vector when present, else `database_specific.severity`, else
      `medium`. [M]
- [~] **GHSA and KEV.** ◐ PARTIAL: KEV landed (daily `If-Modified-Since`, entry-by-entry validation, cache fallback); GHSA and NVD remain. — `guard/feeds/ghsa.ts`: the GitHub Advisory Database through the forge
      feature's existing GitHub credential (a `delegated: 'gh'` account uses `gh api`), optional,
      adding the GHSA's `withdrawn`, `cvss` and `patched_versions` to OSV's view.
      `guard/feeds/kev.ts`: the JSON feed downloaded once a day with `If-Modified-Since`, validated
      against the published schema; a lockfile or installed-software CVE that is in KEV is raised to
      `critical` with `dueDate` and `knownRansomwareCampaignUse` in the evidence. NVD is a third
      optional source behind its own switch and API key (its public rate limit is small), used only
      to enrich a CVE no other source scores. [M]
- [ ] **Installed software.** `brew outdated --json` and `brew list --versions`, `/Applications`
      bundle `CFBundleShortVersionString`s, `sw_vers`, the suite's own Electron (the
      [`electron-freshness.mjs`](../../../scripts/electron-freshness.mjs) rule, now a check), each
      matched against KEV's `vendorProject`/`product` and against OSV's `GIT`/`Homebrew`-style
      ranges where they exist; an outdated item with no CVE is `low`, with a CVE `high`, in KEV
      `critical`. [M]
- [x] **The finding and its action.** One finding per `(advisory, package)` naming the direct
      dependency that pulls it in (the lockfile's dependency path as evidence), with `update-package
      {name, from, to}` as the action when a fixed version exists and `pin-package` when a fix is
      only on a newer major; `audit-suppressions.json`'s unexpired entries are honoured so the sweep
      and CI agree. [S]
- [x] **Tests.** Every parser against its fixtures; the OSV client against recorded responses
      including a paginated one; KEV schema validation on a fixture; the severity ladder; a
      suppressed advisory yields `info`. [S]

### C — The threat feed [M · ~1d]

- [x] **The feed's shape.** `packages/shared/src/threat-feed.ts`: `ThreatFeedSchema` with
      `version`, `publishedAt`, `poisonedPackages: {ecosystem, name, versions[], campaign, ref}[]`,
      `mcpServers: {nameOrUrl, configHash?, toolsHash?, campaign, ref}[]`,
      `slopsquatNames: {ecosystem, name, ref}[]`, `clickfixDomains: string[]`,
      `commandGrammars: {id, regex, severity, ref}[]`, `yaraRules: {id, sha256, url}[]`, each entry
      with a public reference. Signed: a detached Ed25519 signature over the canonical JSON, the
      public key checked into `shared`, verified before any entry is used. [M]
- [~] **Publishing it.** ◐ PARTIAL: `scripts/threat-feed-check.mjs` and the verifier landed here; the feed, its `.sig` and the publishing workflow in `bilo-io/midnite-apps` (and its seed data) are open, so `THREAT_FEED_PUBLIC_KEY_PEM` is empty and no feed is trusted yet. — `threat-feed.json` and `.sig` live in `bilo-io/midnite-apps` beside
      `catalog.json`, written by a workflow there from a `threats/*.yaml` directory with a review;
      this repo holds the schema, the verifier and a `scripts/threat-feed-check.mjs` that validates
      a candidate file. Seeded with the Shai-Hulud waves' package-versions (from the Microsoft,
      Sygnia, CSA and StepSecurity write-ups), the ClickFix domain lists from the Microsoft and
      Unit 42 reports, and the ClickFix command grammars Phase 120 D uses. [M]
- [~] **Local checks.** ◐ PARTIAL: `poisoned-packages`, `mcp-servers` and `slopsquat` landed; the plugins/skills re-scan (Phase 121 H) and wiring the checks and their resolvers into the scheduled sweep are open. — `guard/checks/poisoned-packages.ts` (every open repo's lockfile and
      `node_modules/*/package.json` against `poisonedPackages`; a hit is `critical` with
      `update-package`/`remove-package` and a link to the campaign write-up),
      `guard/checks/mcp-servers.ts` (Phase 121 C's discovered servers against `mcpServers`;
      `critical`, action `revoke-mcp-server`), `guard/checks/slopsquat.ts` (lockfile names against
      `slopsquatNames` and the edit-distance rule, `high`), plugins and skills (Phase 121 H's scan,
      re-run on the sweep). Nothing about the user's repos is sent anywhere — the feed is pulled
      whole. [M]
- [x] **Tests.** Signature verification refuses a tampered byte; a fixture lockfile with one
      poisoned version; the MCP fingerprint match; the feed-check script on a malformed file. [S]

### D — The Mac itself [L · 1–2d]

- [ ] **Ports.** `lsof -iTCP -sTCP:LISTEN -nP` parsed (the parser shared with Phase 120 E); a
      listener bound to `0.0.0.0`/`::` from a process that is not the suite's own, a known dev
      server (Vite, Next, Storybook, the broker, Ollama on `127.0.0.1`) or a signed Apple
      binary is `medium`, `high` if unsigned, with `kill-process-group` as the action and the
      process's signer in the evidence. [M]
- [ ] **Configuration.** `fdesetup status` (FileVault off: `high`), `socketfilterfw
      --getglobalstate` (firewall off: `medium`), `spctl --status` (Gatekeeper off: `high`),
      `csrutil status` (SIP off: `high`), `systemsetup -getremotelogin` (on: `medium`), screen
      sharing and remote management via `launchctl print system`, `softwareupdate -l` (pending
      security updates: `high`), automatic updates off in
      `/Library/Preferences/com.apple.SoftwareUpdate.plist` (`medium`). Each with a one-line fix the
      user runs (the app never calls `sudo`), as `open-system-settings {pane}` or a copied command. [M]
- [ ] **Keys.** `~/.ssh/*` modes (a private key not 0600: `high`, action `chmod-600`); a private
      key without a passphrase (detected by `ssh-keygen -y -P ''` succeeding on a copy, never
      modifying the key: `medium`); `authorized_keys` entries older than a year or with
      `command=`/`from=` options the user did not set (`info`, listed); `~/.gnupg` modes; the
      vault's own files at 0600 (Phase 91 G) re-asserted. [S]
- [ ] **Secrets outside the vault.** `SECRET_PATTERNS` over `~/.zshrc`, `~/.zprofile`,
      `~/.bashrc`, `~/.profile`, `~/.npmrc`, `~/.netrc`, `~/.pypirc`, `~/.docker/config.json`,
      `~/.aws/credentials`, `~/.config/gh/hosts.yml`, and every open repo's `.env*` files and
      untracked files at the root; each hit `high` with `move-to-vault` (Phase 118's import path)
      and `redact-line` as actions and the pattern kind as evidence — never the value. Opt-in
      deeper pass: `git log -p` over the last 200 commits of each open repo for the same patterns
      (`high`, action `rotate`), behind a composer checkbox because it is slow. [M]
- [ ] **Tests.** Each probe against captured output fixtures (on, off, unavailable); a fixture home
      with a 0644 key, a passphrase-less key, an `.npmrc` token and a clean `.zshrc`; the `sudo`
      ban as a grep test over `guard/`. [S]

### E — Sites the browser visited [M · ~1d]

- [ ] **The input.** The browser feature's history and open tabs through its main half's existing
      store (the feature exposes a read seam; Guard never imports `features/browser` — the
      composer hands `guard/inputs.ts` a `readBrowserHistory()` function, the layer rule's way),
      origins only, for the sweep window. [S]
- [ ] **The checks.** `guard/checks/sites.ts`: an origin on the threat feed's `clickfixDomains`
      (`critical`, with the visit time and the tab if still open); an `http:` origin that served a
      login form (the browser's own sign-in detection in
      [`web-app-sign-ins.ts`](../../../packages/features/browser/main/web-app-sign-ins.ts) already
      knows: `medium`); an origin on a phishing feed with a usable licence — URLhaus (CC0) is in;
      OpenPhish's community feed and Google Safe Browsing are out (licence and API key, see
      Decisions); a response that announced an end-of-life server or framework version in its
      headers, captured by Phase 117's response hook (`low`). [M]
- [ ] **The action.** `open-tab {url}` to look, `close-tab {tabId}`, `forget-origin {origin}` (clears
      the browser's storage for it, through the browser feature's existing clear-data seam). [S]
- [ ] **Tests.** A fixture history with one ClickFix domain, one `http:` login, one clean origin;
      the URLhaus parser on a captured feed. [S]

### F — Suspicious behaviour over the window [S · ≤ 2h]

- [ ] **Correlations.** `guard/checks/behaviour.ts` over Phase 121 G's trail and Phase 120's
      ledger for the sweep window: an agent session active outside the hours the user's sessions
      usually run (learned from the last 30 days; `low`); a persistence or network finding from
      Vanguard whose time falls inside a session (`high`, the two findings linked); a lockfile
      change in a repo with no PR opened from it within the window (`medium`); a run that tripped a
      Phase 121 F limit (`medium`); more than N approvals denied in a session (`medium`). [S]
- [ ] **Tests.** Fixture trails for each correlation; a quiet week yields nothing. [S]

### G — Findings in the Guard tab, with a button [M · ~1d]

- [ ] **The list.** The Guard tab's history pane ([`loop-history.tsx`](../../../packages/app/src/features/loops/loop-history.tsx))
      gains a Findings section above the runs: grouped by severity, each row with its category
      glyph, title, subject, `count`, and a *new since last sweep* mark from the sweep diff; filters
      by category and status; a row expands to the evidence and the actions. Reads
      `CHANNELS.securityFindingsList` with `source: 'guard'`; the same rows appear in Vanguard's
      view, which owns the full ledger. [M]
- [ ] **Actions.** Every action id from Phase 120 H's enum renders through the one component; a
      Guard-specific set is added to the enum here: `update-package`, `pin-package`,
      `remove-package`, `open-system-settings`, `copy-fix-command`, `move-to-vault`,
      `redact-line`, `rotate` (opens the forge or provider page), `open-tab`, `close-tab`,
      `forget-origin`. `update-package` and `remove-package` run through
      [`process-runner.ts`](../../../packages/runtime/src/process-runner.ts) with the repo's
      package manager detected from the lockfile, on a branch, and open a PR via the forge feature
      — never on `main`. Each behind the confirm. [M]
- [ ] **Fix with agent.** A finding's "Fix with agent" composes a Guard run whose prompt is the
      finding (tagged untrusted) plus *Fix the sweep's findings*, scoped to that one fingerprint;
      the run record links back to the finding and the finding's row shows the run. [S]
- [ ] **Tests.** The grouped list from a fixture ledger; the diff mark; `update-package` builds the
      right argv for pnpm, npm, yarn and cargo fixtures; the composed prompt carries the fingerprint. [S]

### H — Schedule, cost and disclosure [S · ≤ 2h]

- [ ] **Defaults.** Guard's schedule default becomes daily, in the user's active window, on the
      first wake after it is due; a sweep with every feed off still runs Themes D, E (local parts)
      and F. `Sweep now` is in the tab and the command palette (`guard.sweep`, chord-free, in
      `COMMANDS`). [S]
- [ ] **Egress entries and switches.** Phase 115 A registry entries for OSV, GitHub (reusing the
      forge's), NVD, CISA, the npm and PyPI registry metadata endpoints and the midnite-apps feed,
      each with *what is sent* (package coordinates; CVE ids; nothing else) and its switch; the
      sweep's `inputsSkipped` names the switch that skipped an input so the tab can say "OSV is
      off". [S]
- [ ] **A budget.** The sweep on this repo (one 1 695-entry lockfile, a dozen open repos'
      histories, a day of trail) completes in under 60 s wall-clock with warm caches and under
      5 minutes cold, measured by a `scripts/perf/guard-sweep.mjs` in the Phase 82 style; a sweep
      never runs while the window is blurred *and* on battery below 20%. [S]
- [ ] **Docs.** `docs/PRIVACY.md` (Phase 115 G) gains the Guard row; `SECURITY.md` names the
      sweep and the feed; the loop's docblock in `loops.ts` is rewritten to say what Guard now is. [S]

## Files this phase touches

| Area | Files |
|---|---|
| Runner and checks | `packages/runtime/src/guard/` (new: `check.ts`, `inputs.ts`, `scheduler.ts`, `lockfiles/`, `feeds/`, `checks/`), [`process-runner.ts`](../../../packages/runtime/src/process-runner.ts) |
| Contracts | `packages/shared/src/threat-feed.ts` (new), `packages/shared/src/security-findings.ts` (Phase 120 A, extended), [`loops.ts`](../../../packages/shared/src/loops.ts), [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) |
| Loop plumbing | [`loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts), [`loop-runs-store.ts`](../../../packages/desktop/src/main/loop-runs-store.ts), [`loop-runs-handlers.ts`](../../../packages/desktop/src/main/ipc/loop-runs-handlers.ts), [`use-loop-session.ts`](../../../packages/app/src/features/loops/use-loop-session.ts) |
| Guard tab | [`loop-tab.tsx`](../../../packages/app/src/features/loops/loop-tab.tsx), [`loop-history.tsx`](../../../packages/app/src/features/loops/loop-history.tsx), [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx), [`loop-icons.ts`](../../../packages/app/src/features/loops/loop-icons.ts) |
| Existing gates reused | [`scripts/audit.mjs`](../../../scripts/audit.mjs), [`audit-suppressions.json`](../../../scripts/audit-suppressions.json), [`electron-freshness.mjs`](../../../scripts/electron-freshness.mjs), [`renovate.json`](../../../renovate.json) |
| Browser seam | [`browser-service.ts`](../../../packages/features/browser/main/browser-service.ts), [`web-app-sign-ins.ts`](../../../packages/features/browser/main/web-app-sign-ins.ts) (read seams only) |
| Feed publishing | `scripts/threat-feed-check.mjs` (new); `threats/*.yaml` and the workflow in `bilo-io/midnite-apps` (paired edit outside this repo) |
| Docs | [`SECURITY.md`](../../../SECURITY.md), `docs/PRIVACY.md` (Phase 115 G), [`docs/security/README.md`](../../../docs/security/README.md) |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme (CI is the gate; no local full run).
- [x] **A:** a fixture sweep writes findings the ledger dedupes on the second run and resolves on
      the third; the scheduler re-arms after a simulated relaunch; the agent prompt carries the
      findings path tagged untrusted.
- [ ] **B:** this repo's `pnpm-lock.yaml` parses to the same package set `pnpm ls --depth Infinity
      --json` reports; a recorded OSV response with pagination hydrates every id once; a KEV hit
      is `critical`; a suppressed advisory is `info`.
- [ ] **C:** a tampered feed is refused; a fixture poisoned version in `node_modules` is `critical`
      with its campaign link; `threat-feed-check.mjs` fails on a missing `ref`.
- [ ] **D:** every probe fixture classifies as the table says; no `sudo` anywhere under `guard/`;
      the passphrase check never writes to the key.
- [ ] **E:** the ClickFix fixture origin is `critical` and links to its tab; a clean history yields
      nothing.
- [ ] **F:** each correlation fires on its fixture and not on the quiet-week fixture.
- [ ] **G:** `update-package` argv per package manager; the composed "Fix with agent" prompt
      carries one fingerprint; the diff mark appears only for new fingerprints.
- [ ] **H:** every feed host is in the egress registry (Phase 115 A's test fails otherwise); the
      perf script's number is in the PR.
- [ ] **Open, for a human:** a packaged-app pass with every feed on — one real sweep over this repo
      and the Mac, the findings read for false positives, one `update-package` taken through to an
      opened PR, and the Privacy page checked for the Guard row.

## Decisions / open questions

1. **Guard feeds the ledger; Vanguard acts.** *Decided (recommended option, unattended), stated
   in both docs.* A scheduled sweep that could also kill a process would be two apps' worth of
   blast radius behind one loop; the split keeps every destructive action in one place with one
   confirm.
2. **Deterministic checks over a model's judgement for severity.** *Decided.* A CVSS vector, a KEV
   entry and a signature match are facts; the model pass is for triage prose and the fix.
3. **OSV first, GHSA and KEV beside it, NVD optional.** *Decided.* OSV is keyless and batched,
   KEV is one daily file, GHSA reuses the forge credential the user already has, and NVD's public
   limit makes it a bad primary.
4. **The threat feed is ours, signed, and pulled whole.** *Decided.* No commercial feed has a
   licence a public repo can carry, and pulling a whole file means no query about the user's
   packages ever leaves. The feed's content is only ever public references.
5. **Phishing feeds: URLhaus in, OpenPhish and Safe Browsing out.** *Decided.* URLhaus is CC0;
   OpenPhish's community feed is non-commercial-only and Safe Browsing needs a Google API key and
   sends URL prefixes to Google. Revisit if the user brings a key.
6. **`sandbox` and `sudo` are never used by a check.** *Decided.* A fix that needs root is a
   command the user copies, with the finding saying why.
7. **Open: should the sweep diff resolve a finding automatically when a package is no longer in
   the lockfile?** Recommendation: yes, `resolvedBy: 'sweep'` — but a Vanguard-sourced finding is
   never resolved by Guard; only its own.
8. **Open: how far back does the history sweep look on first run?** Recommendation: 7 days, then
   the sweep window; a first sweep over a year of history on a machine with the ClickFix domain in
   it should say so once, not daily.
