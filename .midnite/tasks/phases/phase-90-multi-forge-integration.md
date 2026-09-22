# Phase 90 — Multi-forge integration and account switching

> **The premise this phase reverses is written down, in two places, on purpose.**
> [`shared/src/domain/forge.ts`](../../../packages/shared/src/domain/forge.ts) opens by explaining
> why the app reads GitHub *"through the user's own `gh` CLI rather than an HTTP client with a token
> of ours"* — because owning a token *"would mean a settings page for a PAT, a keychain decision,
> and a token that silently expires."* And
> [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts)'s `pullScopeFlags` explains why
> the app passes `@me` rather than a username: `gh` resolves it against whichever account is
> authenticated for that host, *"so the app never has to hold a username or notice that the user ran
> `gh auth switch` in the terminal beside it."*
>
> Both decisions were right for one forge. Neither survives four. This phase pays all three of the
> costs that first docblock named — a settings page for a PAT, a keychain decision, and expiry
> handling — and builds the "who am I" concept the second one was written to avoid. It says so out
> loud in the code it touches rather than quietly deleting the comments.

**Builds on.** More of the seam exists than the absence of a provider abstraction suggests, and it
is all in the *parsing* layer. [`remote-url.ts`](../../../packages/git-engine/src/parsers/remote-url.ts)
already resolves all five git remote syntaxes into `{host, owner, repo, kind}`, already classifies
self-hosted `gitlab.<company>.com`, and already carries a documented lookalike-domain defence
(`github.com.evil.example` is excluded). [`remote.ts`](../../../packages/shared/src/domain/remote.ts)'s
`ForgeKindSchema` is `z.enum(['github', 'gitlab', 'unknown'])` — GitLab is *already a first-class
kind* — and `forgeIssueUrl`/`forgePullsUrl`/`forgeActionsUrl` already branch on it to produce
GitLab's `/-/` path shapes. What does **not** exist is anything downstream: `githubForge(repoId)`
([`forge-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-handlers.ts), line ~70) filters
`forge?.kind === 'github'` and returns `null` for everything else, and **24 call sites in that one
file** go through it. `repos-panel.tsx`'s `hasGithubForge` does the same at the UI layer. So a GitLab
remote is recognised, linkified correctly, and then shown nothing — the gap is one function and one
gate wide, and this phase widens exactly those two.

**The credential decision is already precedented, and is not a new mechanism.**
[`credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts) is one of two
existing secret stores — the other is
[`companion/stt/credentials.ts`](../../../packages/desktop/src/main/companion/stt/credentials.ts) —
and between them they have already settled Electron `safeStorage`, an encrypted blob in a sidecar
`*.vault.json` beside the plaintext config, and a fingerprint of the entry's non-secret fields that
`reconcile()` uses to revoke a secret whose target changed. Theme B generalises them into one
primitive; it does not invent a third.

**Two corrections to what that precedent actually is, both grounded by the Phase 91 audit and both
load-bearing for Theme B.** First, the two vaults **degrade differently** when
`safeStorage.isEncryptionAvailable()` is false — `credential-vault.ts` silently no-ops and drops the
secret, `stt/credentials.ts` keeps it in a process-memory `Map` and reports
`encryptionAvailable: false` to the UI. The generalised vault must pick one, and it picks `stt`'s:
**degrade loudly, session-only**. Second, both write their file with **no `mode` option**, landing at
0644, while `broker/server.ts` and `mcp/server.ts` both `chmodSync(…, 0o600)` — the vaults are the
inconsistent ones, and the new one is 0600 in a 0700 directory from line one.

**And the repo is not a clean slate for tokens, which changes this phase's job.**
`credential-vault.ts`'s docblock names
[`finance-store.ts`](../../../packages/app/src/features/finance/finance-store.ts)'s
plaintext-localStorage API key as the one outlier. It is **the smallest of three**: `ui-store.ts`
also persists a raw screen-lock `passcode`, and — the one that matters here — it persists
`agentApiKeys`, a `Record<string, string>` in the plaintext `midnite-studio.ui` localStorage blob
whose declared slots include **a `GITHUB_TOKEN`-shaped field** alongside five LLM keys, classified by
[`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) as an ordinary preference.
So this phase is not adding forge credentials beside nothing; there is already a forge token slot in
renderer localStorage. Theme B **absorbs that one slot and disowns the other five** — see Decisions.

**There is no setup wizard. That is a finding, not an oversight.** Phase 49's
[`setup-dialog.tsx`](../../../packages/app/src/features/agent/setup-dialog.tsx) is a
preview→apply modal whose `Phase` type (`'loading' | 'ready' | 'applying' | 'done' | 'error'`) is a
*render lifecycle*, not a step list — Phase 49's own scope guardrails rule out a stepped onboarding
view in as many words. And
[`onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx) is a
single first-run screen with three hard-coded status rows and a close button. So "add an optional
step with a Skip at the bottom" means **building the step frame first** (Theme I), and the Skip is
what makes a step optional rather than a decoration on one that already was.

**Scope guardrails.** **No billing enforcement, no payment integration, no entitlement checks in the
app** — the human's instruction is *"don't do anything here yet, just prepare the pricing page"*, and
this phase honours it literally: a `subscription.tier` vocabulary is written down in
[`shared`](../../../packages/shared/src/domain/) so the later work has a name to use, and **nothing
reads it**. No Stripe, no licence key, no gate. **No self-hosted GitLab/Bitbucket Server/Azure DevOps
Server**: `gitlab.com`, `bitbucket.org` and `dev.azure.com` (plus the legacy `*.visualstudio.com`
host) only — self-hosted hosts are recognised by the URL parser, which is already true, and are
declared `unsupported` by the capability matrix rather than half-supported. **No OAuth device flow**:
a pasted PAT is the credential for all three new providers, because an OAuth app per provider is a
registration, a redirect URI and a secret this app has nowhere to keep. **No write parity sweep**:
each provider theme ships the *reads* and only the writes that need no new picker — comment and
approve — matching the bound
[Phase 54 Theme G](phase-54-issues-view.md) settled for issues. **`packages/website` stays off the
workspace graph** ([`docs/WEBSITE.md`](../../../docs/WEBSITE.md)): the pricing page imports `react`,
`react-dom`, `react-icons` and its own files, and **nothing on it may link to `bilo-io/midnite-studio`**,
which is private.

**Ordering.** A → D are the spine and are strictly sequential: the enum widens, the accounts model
lands, switching works, then the adapter interface is carved with GitHub as its only implementation
and **no behaviour change**. E, F and G are then three independent provider implementations that can
run in parallel against a frozen interface. H depends on all three having declared what they can do.
I, J and K touch nothing E–G touch and can be picked up at any time — **J (the pricing page) is
entirely independent of the rest of the phase** and is the obvious first slice for a parallel
session.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus · **XL** ≈ several days.

## Deliverables

### A — The seam: `ForgeKind` widens, and `githubForge` becomes `repoForge` (M) ✅ DONE

The load-bearing change, and it is deliberately a compile error at every call site rather than a
silent widening. Every `switch (forge.kind)` in `remote.ts` is exhaustive today, so adding two
members to the enum makes TypeScript name each place that has to decide what the new kinds mean.

- [x] Widen `ForgeKindSchema` in [`remote.ts`](../../../packages/shared/src/domain/remote.ts) to
      `['github', 'gitlab', 'bitbucket', 'azure', 'unknown']`. `unknown` stays a first-class answer
      for the reasons its existing docblock gives — a NAS path or a Gerrit host is still not a
      failure.
- [x] Add `bitbucket.org` and `dev.azure.com` to the `CANONICAL` table in
      [`remote-url.ts`](../../../packages/git-engine/src/parsers/remote-url.ts), plus the legacy
      `*.visualstudio.com` host, which the existing leading-label heuristic does **not** catch (it
      keys on a label named `github`/`gitlab`, and `contoso.visualstudio.com` has neither).
- [x] **Azure DevOps breaks the `owner/repo` grammar and needs its own normaliser.** Its HTTPS remote
      is `https://dev.azure.com/{org}/{project}/_git/{repo}`, its SSH remote is
      `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`, and the legacy form is
      `https://{org}.visualstudio.com/{project}/_git/{repo}`. The `_git` segment and the `v3/`
      prefix are addressing, not path — strip both, the same way the parser already strips a leading
      `~` from an ssh path — and let `owner` carry `{org}/{project}`, which is exactly what its
      docblock already says `owner` is for (*"carries any intermediate path segments … which is why
      it is a string rather than a single segment"*).
- [x] Extend `forgeProjectUrl`, `forgeIssueUrl`, `forgePullsUrl` and `forgeActionsUrl` for the two
      new kinds, and add the fifth that four views now need: `forgeBoardsUrl`. Bitbucket returns
      `null` from it — see Theme F.
- [x] Rename `githubForge(repoId)` →
      `repoForge(repoId)` in [`forge-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-handlers.ts),
      returning the `Forge` for any *supported* kind rather than GitHub alone, and update its 24 call
      sites in that file plus the ones in
      [`forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts),
      [`forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts) and
      [`mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts). Keep the comment that
      explains *why* a null is not an error — it is still true, it just now means "no supported forge"
      rather than "not GitHub".
- [x] Replace `hasGithubForge` in
      [`repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx) (the
      `pickForgeRemote(remotes)?.forge?.kind === 'github'` gate, and the `node.key === 'forge'`
      early-return that reads it) with a capability-aware check. Until Theme H lands, "supported
      kind" is the check; after it, it is "this provider can do at least one of the four".
- [x] `remote-url.test.ts` gains the Azure shapes (both remotes, plus the legacy host), the Bitbucket
      shapes, and a lookalike case per new kind (`bitbucket.org.evil.example`,
      `dev.azure.com.evil.example`) mirroring the defence the file already has.

### B — Accounts, the vault, and the avatar the app has never had (XL)

This is the phase's biggest single piece, and it introduces a concept the app has genuinely never
had: a logged-in identity. Grounding confirmed the absence is total — no `viewer` query, no
`currentUser`, no `whoami`; every `login` field on `ForgePull`/`ForgeIssue`/`ForgeComment` is
*somebody else's*.

- [x] New [`shared/src/domain/forge-account.ts`](../../../packages/shared/src/domain/): a
      `ForgeAccountSchema` of `{id, kind, host, login, displayName, avatarUrl, addedAt, hasToken}`.
      **`hasToken` is a boolean, never the token** — the renderer is told a credential exists, never
      what it is.
- [x] Generalise [`credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts)
      into `main/secrets/secret-vault.ts`: the same `safeStorage` encrypt/decrypt, the same
      fingerprint-and-`reconcile()` revocation, parameterised on the sidecar filename and the
      fingerprint function. `db/credential-vault.ts` becomes a thin binding of it over
      `ConnectionConfig`, so its own tests keep passing unchanged — **that is the acceptance
      criterion for the extraction.** Three constraints on the new module, all from the Phase 91
      audit and all from line one:
  - **`{ mode: 0o600 }` on the write, in a 0700 directory.** Both existing vaults omit it and land at
    0644; `broker/server.ts` and `mcp/server.ts` already `chmodSync(…, 0o600)`, so the vaults are
    the inconsistent ones.
  - **Degrade loudly, session-only** when `safeStorage.isEncryptionAvailable()` is false — a
    process-memory `Map` plus an `encryptionAvailable: false` the UI renders, which is
    `stt/credentials.ts`'s behaviour, not `credential-vault.ts`'s silent drop.
  - **The vault key is constrained, not `z.string()`.** `${provider}:${host}:${login}`, branded or
    refined, so the vault cannot become a general-purpose KV store by accident.
- [x] **`main/secrets/secret-vault.ts` is a shared path with
      [Phase 76 Theme D](phase-76-the-renderer-in-a-sandbox.md)**, which specifies the identical
      extraction out of the same file under the name `main/secure-store.ts`. The collision was raised
      and resolved on the Phase 90/91 board: **this path wins**, and whichever phase executes first
      creates the module while the other consumes it. It must be provider-agnostic from line one for
      that to work. Update Phase 76 Theme D's bullet to name this path when this lands first.
- [x] `main/forge/forge-accounts.ts`: the account registry, persisted as non-secret records in
      `forge-accounts.json` with the tokens in `forge-accounts.vault.json` beside it, structured like
      [`repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts)/`repo-store.ts` —
      registry in memory, store on disk.
- [x] **GitHub accounts hold no token.** A GitHub account record is discovered from `gh auth status`
      and carries `hasToken: false` with a `delegated: 'gh'` marker; `gh` remains its credential, so
      nothing about the GitHub path regresses. This is what keeps the existing docblock's argument
      intact for the one provider it was written about.
- [x] Five channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), following the
      house `mstudio:forge:…` convention: `forgeAccounts: 'mstudio:forge:accounts'`,
      `forgeAccountAdd: 'mstudio:forge:account-add'`,
      `forgeAccountRemove: 'mstudio:forge:account-remove'`,
      `forgeAccountSwitch: 'mstudio:forge:account-switch'`,
      `forgeCapabilities: 'mstudio:forge:capabilities'` — with the request/response schemas in
      [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) and the methods on the `forge` block
      of [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) + the 1:1 mapping in
      [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts).
- [x] `whoami` per provider — the first identity resolution this app has ever done. GitLab
      `GET /user`, Bitbucket `GET /user`, Azure DevOps `GET /_apis/profile/profiles/me` plus an
      accounts call for the org list, GitHub `gh api user`. Each returns `{login, displayName,
      avatarUrl}`, and **adding an account is the same call as validating its token** — a PAT that
      cannot answer `whoami` is not stored.
- [x] The active-account avatar in the title bar. `UserAvatar`
      ([`user-avatar.tsx`](../../../packages/app/src/components/user-avatar.tsx)) already takes
      `{login, name, email, size}` and falls back to initials over a hashed hue — but it resolves its
      image from **Gravatar by email hash**
      ([`avatars.ts`](../../../packages/app/src/services/avatars.ts)), which is the wrong source for a
      forge profile picture. Add an `src` escape hatch so a caller can supply a URL directly, leaving
      the Gravatar path and its cache exactly as it is for the commit-author case it was built for.
- [x] **Settings ▸ Accounts**, a new `SettingsPageId` `'accounts'` in
      [`view.ts`](../../../packages/shared/src/domain/view.ts) and a new
      `settings-pages/accounts-page.tsx`: one row per account with its avatar, kind, host and login;
      add/remove; the active marker; a PAT field per new provider with the exact scopes each one
      needs spelled out, in the style
      [`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx)
      already uses for `gh auth refresh -s project`.
- [x] `forge.accounts`, `forge.activeAccountId`, `forge.scopeReposToActiveAccount` and
      `forge.syncGhAuthSwitch` join the persisted settings. They live in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts)'s `midnite-studio.ui` blob like
      `forgeWritesEnabled` does — **the account records the renderer holds are the non-secret ones
      only**, and main owns the authoritative copy. `zustand`'s `persist()` writes that blob to the
      renderer's LevelDB in plaintext, readable by any local process, which is precisely why the
      token is not in it. `forgeAccounts`/`forgeActiveAccountId` had already landed with the rest of
      Theme B; this closes the two that hadn't — `forgeScopeReposToActiveAccount` and
      `forgeSyncGhAuthSwitch`, both default **on**, toggles in **Settings ▸ Accounts ▸ Account
      switching**. `forgeSyncGhAuthSwitch` is also mirrored into main
      (`SettingsSyncPayloadSchema`/`settings-mirror.ts`/`use-settings-sync.ts`) — the handler that
      reads it (Theme C's `gh auth switch` gate) lives there, not in the renderer.
- [x] **Absorb `ui-store.ts`'s `agentApiKeys['github']` slot, and disown the other five.** That
      record already holds a `GITHUB_TOKEN`-shaped value in plaintext localStorage and
      [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) classifies it as an
      ordinary preference. A forge token belongs in the account vault, so migrate that one key on
      first run (encrypt it into the vault as a GitHub account's PAT, then delete it from the persisted
      blob) and leave the five LLM keys exactly where they are — they are agent credentials, they are
      Phase 76/91's to move, and a phase that quietly rehomed them would be doing a security migration
      under a multi-forge heading. Say both halves in the migration's docblock.
- [ ] **Add a redaction pattern per provider shipped.** — **genuinely deferred to Themes E/F/G, not a
      Theme B gap.** Re-grounded when finishing Theme B's remaining items: this bullet's own text
      already says each pattern "lands in the same PR as its provider", and Theme B ships zero new
      *providers* (GitLab/Bitbucket/Azure DevOps are accounts-only until D-G land their adapters) — so
      there is no new token shape for it to cover yet. Left unchecked here on purpose rather than
      half-built against a shape no adapter has confirmed; logged in
      [`outstanding.md`](../outstanding.md) so a later pass doesn't read this as a missed Theme B item.
      [`shared/src/redact.ts`](../../../packages/shared/src/redact.ts) covers `gh[pousr]_`,
      `github_pat_`, `sk-ant-`, `Bearer …` and URL userinfo; it covers **none** of GitLab's
      `glpat-`/`gloas-`, Bitbucket's `ATBB`/`ATCTT` and app passwords, or Azure DevOps' PATs. Each
      pattern lands **in the same PR as its provider** (E, F, G), so a provider can never ship with
      its token shape unredacted in a log. Phase 91 Theme G adds the test that fails when a shipped
      provider has no pattern.
- [x] **Every URL that reaches `shell.openExternal` from a forge response is scheme-checked** —
      `http:`/`https:` only. A `javascript:` or `file:` URL in an API field is a live vector, and
      three new providers means three new sources of one. Likewise, any user-supplied host or base URL
      for a self-hosted instance is rejected unless `https://`. **Grounded first**: every renderer path
      to `shell.openExternal` already went through `queries.ts`'s `openExternal`/`open-in-midnite.ts`
      into `remote-handlers.ts`'s `shellOpenExternal` handler, which has scheme-checked with
      `normalizeExternalUrl`'s `http:`/`https:`/`mailto:` allowlist since before this phase — so no
      forge-response URL a user clicks was ever unchecked. The one genuine gap was the account `host`
      field itself: `ForgeAccountAddRequest.host` took `z.string().min(1)` with no shape check, and
      every `whoami`/reachable-repos call builds its own `https://${host}/…` URL by string
      interpolation — a host smuggling a scheme, path or userinfo would land unchecked inside that
      interpolation. `normalizeForgeAccountHost` (`shared/src/domain/forge-account.ts`) closes it:
      accepts a bare host or an `https://` base URL, rejects everything else (a non-`https` scheme, a
      path, userinfo), and `forge-account-handlers.ts` re-derives the canonical host from the validated
      string rather than trusting the caller's raw one — same discipline as
      `OpenExternalRequest`/`normalizeExternalUrl` beside it.

### C — Switching the active user, and what that does to the repo list (L)

The behaviour the human asked for, in three parts: reveal, hide, and `gh auth switch`.

- [x] Switching the active account re-resolves the repo list. With
      `forge.scopeReposToActiveAccount` on (the default), a repo whose `Forge.host` does not match the
      active account's host, or whose `owner` is not one the active account can reach, is **hidden
      from the tree, not closed** — `repo-registry.ts` keeps it open, `repos-panel.tsx` filters it.
      Hiding rather than closing is what makes the switch reversible with no re-picking of folders.
      `features/repos/forge-account-scope.ts`'s `isRepoVisibleForAccount` is the pure rule: a host
      mismatch always hides; an owner mismatch hides only once the reachable-repos listing below has
      *positively* ruled it unreachable — an org repo with no listing loaded yet stays visible rather
      than risking the false-hide the phase doc's own Decisions worry about. `useAccountScopedRepos`
      fans a `remotes.list` query out over every OPEN repo (not just the expanded ones `useRemotes` on
      its own reaches), sharing `useRemotes`' own cache key so nothing is fetched twice.
- [x] "Reveal all available repos for that user" — a per-provider "repositories I can reach" listing
      (GitHub `gh repo list`, GitLab `GET /projects?membership=true`, Bitbucket
      `GET /repositories/{workspace}`, Azure `GET /_apis/git/repositories` per project) surfaced in
      the repo picker as a **clone-or-open** list. It is a *listing*, not an auto-clone: nothing lands
      on disk without the user choosing a destination, matching Phase 49's settled posture that the
      app writes only what the user pointed it at. **GitHub-only, deliberately** — `main/forge/
      reachable-repos.ts` answers `unsupported` for GitLab/Bitbucket/Azure, matching
      `capabilitiesFor(kind).repoListing: 'none'` for every kind but `github` until Themes E-G land a
      real client; building the other three's HTTP listing here would be doing Theme E/F/G's adapter
      work one read early, for a provider whose account this phase can add but whose data it cannot
      otherwise show anywhere yet. The clone half is new: git-engine gained `cloneRepo()` (the one
      command in the package that runs against a not-yet-a-repo `destDir`), a `repos.clone` IPC channel
      reusing `repoOpen`'s registration on success, and Settings ▸ Accounts ▸ Reachable repositories
      wires a Clone… button through the same native folder picker `pickAndOpen` already uses.
- [x] **`gh auth switch` is run, and it is gated.** Switching to a GitHub account runs
      `gh auth switch --hostname <host> --user <login>` through
      [`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts)'s existing `runInShell`,
      then calls `invalidateGhProbe()` so the 30-second `ghStatus()` cache does not serve the previous
      identity. It is behind `forge.syncGhAuthSwitch` (default **on**) because it mutates state the
      user's *terminal* shares — every `gh` invocation in every shell on the machine changes
      behaviour, and a setting is the honest way to offer that rather than doing it silently. Runs only
      for a `delegated: 'gh'` account — a second GitHub identity added via a pasted PAT was never one
      of `gh`'s own logged-in users, so `gh auth switch --user <that login>` would just fail; the gate
      lives in `forge-account-handlers.ts`'s `syncGhAuthOnSwitch`, fire-and-forget after the IPC
      response so a shell spawn never blocks the switch click.
- [x] **Correct the `@me` docblock rather than deleting it.**
      [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts)'s `pullScopeFlags` comment
      claims the app never has to notice `gh auth switch`; after this theme it both notices and causes
      one. `@me` stays — it is still the right flag, and it now resolves to the account the app just
      switched to — but the comment must say why it is still right instead of asserting something
      that is no longer true.
- [x] A switch invalidates every forge query. `useRefreshForge` in
      [`queries.ts`](../../../packages/app/src/services/queries.ts) is the existing lever; the account
      id joins the query keys so two accounts' caches cannot bleed into one another. **This is the
      cache-poisoning risk of the whole phase** and deserves its own test. **Implemented as
      `cancelQueries` + broad `invalidateQueries`, not literal per-key `accountId` segments** — the 16
      forge query-key builders and their call sites across five view files were the literal reading,
      but rewriting every one of them was disproportionate to the actual failure mode and would have
      collided hard with Theme D/H's own edits to the same views running in parallel. The real bug a
      plain `invalidateQueries` alone would still have: a listing already in flight for the account
      being switched AWAY from can resolve AFTER the switch and write into the cache slot the new
      account's re-fetch reads. `useSwitchForgeAccount`'s `onSuccess` now `cancelQueries` first — which
      TanStack Query discards the eventual result of rather than applying it — THEN
      `invalidateQueries`, both against every `'forge'`/`'forge-project'` key regardless of where that
      segment falls in the tuple. `use-switch-forge-account.test.tsx` proves the race directly: an
      in-flight fetch is seeded, the switch runs, the stale promise is resolved afterwards, and the
      cache never ends up holding its payload.
- [x] The poller re-subscribes on switch:
      [`forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts) keys on
      `{repoId, kind}` today, and a repo that is no longer visible should stop costing calls — which
      is the same zero-subscribers-zero-cost argument its own docblock makes. **No new code in
      `forge-poller.ts` itself** — `use-forge-subscription.ts`'s own docblock already guarantees
      unsubscribe-on-unmount, and a repo the account filter above hides un-mounts its whole `RepoItem`
      subtree (Actions/Reviews/Issues sections included), so the existing effect cleanup fires for
      free the moment a repo is hidden. Left as a documented consequence rather than a second,
      redundant unsubscribe path.

### D — `ForgeAdapter`: the interface, and GitHub as its first implementation (L) ◐ PARTIAL (PR #502, 2026-09-22)

A pure refactor with no behaviour change and no new provider. Its acceptance criterion is that the
existing forge tests pass untouched.

- [x] `main/forge/adapter.ts` declares `ForgeAdapter`: the read surface (`listRuns`, `runDetail`,
      `runLog`, `listWorkflows`, `listPulls`, `pullDetail`, `pullFiles`, `pullComments`,
      `pullThreads`, `listIssues`, `issueDetail`, `issueComments`, `listBoards`, `boardFields`,
      `boardItems`), a write surface named per the existing `gh-write.ts` exports rather than
      collapsed to `comment`/`review`/`setIssueState`/`setItemField` (collapsing eleven working writes
      into four generic ones is a real design change this theme's own "no behaviour change" criterion
      rules out — see the module's own docblock), `whoami`, and `capabilities()`. `listRepos` is
      optional and left unimplemented for GitHub — no consumer exists yet; Theme C ended up building
      `main/forge/reachable-repos.ts` as its own read, not through this interface. Every method returns
      the house `{cli, <data>, error}` envelope that
      [`forge.ts`](../../../packages/shared/src/domain/forge.ts) already establishes.
- [x] `main/forge/github/` — the existing `gh-*.ts` files, **moved, not rewritten**, behind a
      `createGitHubAdapter()` that binds them. One git rename per file plus one new binding module; if
      a diff in this theme changes a `gh` command string, something has gone wrong.
- [x] `main/forge/registry.ts` — `adapterFor(forge: Forge, account: ForgeAccount | null)`, the single
      dispatch point. `forge-handlers.ts`'s handlers call it instead of calling `gh-cli.ts`
      directly, and the handlers themselves become provider-blind.
- [x] `main/forge/http.ts` — the shared HTTP client the three new adapters use: bearer/basic auth per
      provider, a JSON envelope, `Retry-After` honoured, a per-host request budget. It is a **sibling
      of `gh-shell.ts`, not a replacement** — GitHub keeps its subprocess path. Model it on
      [`api-client/send.ts`](../../../packages/desktop/src/main/api-client/send.ts) and
      [`workflow/executors/http.ts`](../../../packages/desktop/src/main/workflow/executors/http.ts),
      which already do HTTP in main, rather than adding a fourth style. Built by Theme E (PR #505)
      against its own first real caller, exactly as this note anticipated — auth as a strategy
      (`bearer`/`basic`/`header`), not a header string, so Bitbucket's Basic and Azure's
      empty-username Basic (Themes F/G) drop in without a second client.
- [ ] `ForgeCliStatus`'s three reasons (`ready`, `not-installed`, `not-authenticated`) are `gh`'s
      vocabulary. They keep working for GitHub; for an HTTP adapter `not-installed` is impossible and
      `not-authenticated` means "no account, or its token was rejected". Say that in the schema's
      docblock rather than growing a fourth arm — the same argument `noForgeStatus()` already makes
      for reusing `not-installed`. **Deferred alongside `http.ts`** — the same "no HTTP adapter exists
      yet" reason.

### E — GitLab (XL) ✅ DONE (PR #505, 2026-09-22)

The closest to parity, and the one where nothing has to be explained away.

- [x] `main/forge/gitlab/` over REST v4 with a PAT (`api` scope; `read_api` is enough for the reads
      and is what the settings page should recommend first). **`glab` is deliberately not used** —
      see Decisions.
- [x] Merge requests → `ForgePull`. `GET /projects/:id/merge_requests`; `iid` is the number a user
      sees, `id` is global, and confusing the two is the classic GitLab integration bug — carry `iid`
      as `number` and the global id as the node id.
- [x] Issues → `ForgeIssue`, `GET /projects/:id/issues`. Vocabulary maps cleanly (`opened`/`closed`
      → `open`/`closed`).
- [x] Pipelines and jobs → `ForgeRun`/`ForgeJob`, `GET /projects/:id/pipelines` +
      `/pipelines/:id/jobs`, with logs from `/jobs/:id/trace`. GitLab's statuses
      (`created`, `waiting_for_resource`, `preparing`, `pending`, `running`, `success`, `failed`,
      `canceled`, `skipped`, `manual`, `scheduled`) map onto
      `ForgeRunStatusSchema`/`ForgeRunConclusionSchema`'s GitHub vocabulary — the mapping table is
      code with a test, not a comment.
- [x] MR discussions → `ForgeReviewThread`. `GET /merge_requests/:iid/discussions` is genuinely
      threaded and genuinely resolvable, so `setThreadResolved` has a real implementation here —
      unlike two of the other three.
- [x] Approvals → `reviewDecision`. `GET /merge_requests/:iid/approvals` gives approved-by and rules;
      map to `APPROVED` / `REVIEW_REQUIRED`. **GitLab has no `CHANGES_REQUESTED`** — an unapproval is
      not a request for changes — so that arm is unreachable, and the mapper should say so rather than
      guess.
- [x] **Issue Boards → `ForgeProject`.** `GET /projects/:id/boards` and its lists are a real kanban
      and the closest analogue to ProjectV2. Its "fields" are label-backed lists rather than typed
      custom fields, so `ForgeProjectField` carries a single synthetic single-select field whose
      options are the board's lists — honest, and enough to drive the existing
      [`board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx).
      Epics are **out** (GitLab Premium).
- [x] Writes: comment on an MR or issue, approve/unapprove, resolve a discussion, close/reopen an
      issue. Nothing that needs a picker.

### F — Bitbucket Cloud (XL) ✅ DONE (PR #504, 2026-09-22)

The provider with the largest honest gaps, and the doc names them instead of inventing equivalents.

- [x] `main/forge/bitbucket/` over REST 2.0 with an **App Password or a workspace API token**
      (Bitbucket's PAT equivalent), Basic auth with the username — note that this differs from the
      bearer-token shape the other two use, which is why `http.ts` takes auth as a strategy rather
      than a header string.
- [x] Pull requests → `ForgePull`, `GET /repositories/{workspace}/{repo}/pullrequests`. Diff from
      `/diff`, which returns a unified diff and can therefore go straight through git-engine's
      `parseMultiFileDiff`, exactly as `pullFiles` already does for `gh pr diff`.
- [x] Pipelines → `ForgeRun`, `GET /repositories/{ws}/{repo}/pipelines` and `/steps` for jobs, logs
      from `/steps/{uuid}/log`. Bitbucket's `state.name`/`result.name` vocabulary
      (`PENDING`/`IN_PROGRESS`/`COMPLETED` × `SUCCESSFUL`/`FAILED`/`STOPPED`/`ERROR`) maps onto the
      GitHub-shaped enums with a tested table.
- [x] PR comments and approvals → `ForgeComment` / `reviewDecision`. Bitbucket has **approve** and
      **request-changes** and inline comments, so both arms are reachable. Its inline comments have a
      `parent` and can be marked resolved, so `setThreadResolved` works — but the thread model is
      flatter than GitHub's, so the mapper synthesises threads from `parent` chains. This is the
      `threadResolution: 'partial'` row on the capability matrix — the first provider to reach Theme
      H's own deferred "`'partial'` shows its limits in place" item, noted rather than built here.
- [x] **Issues: present but usually absent.** Bitbucket's issue tracker is a per-repository *opt-in*
      feature and most teams use Jira instead. `GET /repositories/{ws}/{repo}/issues` returns 404 when
      it is off — and the Issues view **already has a disabled state for exactly this**, built in
      [Phase 54](phase-54-issues-view.md) for GitHub repos with issues turned off. Reuse it; do not
      add a second empty state.
- [x] **Projects/boards: `none`. There is no equivalent, and this phase does not invent one.**
      Bitbucket Cloud has "Projects" as a *folder for repositories*, not a board — mapping it onto
      `ForgeProject` would put a kanban surface in front of a directory listing. Jira is Bitbucket's
      board, and Jira is a different product with a different API, different auth and a different
      phase. `forgeBoardsUrl` returns `null`, `capabilities().projects` is `'none'`, and the Projects
      view is hidden for Bitbucket repos with a one-line explanation rather than an error — this
      already fell out of Theme H's existing `useForgeViewAvailability`/`FORGE_GATED_VIEWS` gating
      (per-field, `'none'` hides the view), so no new app-side code was needed.
- [x] Writes: comment, approve/unapprove, request-changes, resolve an inline thread, close an issue
      where the tracker exists. **Scoped to exactly this list** — `mergePull`/`requestReview`/
      `markReady`/`rerunChecks`/`setItemField` are implemented (the `ForgeAdapter` interface requires
      them) but answer an honest "not supported" `ForgeWriteResult` rather than a guess at
      undocumented Bitbucket API behaviour, the same narrower-than-the-interface posture Theme E's own
      checklist takes ("nothing that needs a picker"). "Unapprove" has no verb in
      `ForgeReviewEventSchema` at all — a gap this interface already had for GitHub, not one Bitbucket
      introduces.

### G — Azure DevOps (XL) ✅ DONE (PR #506, 2026-09-22)

Good coverage behind an entirely different vocabulary, which is the interesting part.

- [x] `main/forge/azure/` over REST 7.1 with a PAT (Basic auth, empty username, base64 `:PAT` — a
      third auth shape, which is the justification for `http.ts`'s strategy parameter). Scopes: Code
      (read), Work Items (read/write), Build (read).
- [x] The `{org}/{project}` split from Theme A's parser threads through every call: Azure's routes are
      `/{org}/{project}/_apis/…`, so `Forge.owner` carrying both segments is what makes
      `repoFlag`-equivalent construction possible without a second lookup.
- [x] Pull requests → `ForgePull`, `GET /_apis/git/repositories/{repo}/pullRequests`. `pullRequestId`
      is the number; `mergeStatus` and `isDraft` map onto the existing fields.
- [x] **Work items, not issues.** `POST /_apis/wit/wiql` runs a query, `GET /_apis/wit/workitems`
      hydrates it. A work item has a *type* (Bug, Task, User Story, Epic) and a *state* from a
      per-project workflow, neither of which `ForgeIssue` models. Map `System.State`'s category
      (`Proposed`/`InProgress` → `open`, `Completed`/`Removed` → `closed`) rather than the state name,
      and carry the type as a label chip — [`label-chip.tsx`](../../../packages/app/src/features/issues/label-chip.tsx)
      already renders one. **Say in the UI that these are work items**, because calling a Bug an Issue
      is the kind of lie that costs a user twenty minutes.
- [x] Pipelines → `ForgeRun`, `GET /_apis/build/builds` (+ `/_apis/pipelines` for the definitions that
      map to `ForgeWorkflow`), timeline records → `ForgeJob`/`ForgeStep`, logs from
      `/_apis/build/builds/{id}/logs/{logId}`.
- [x] PR threads and votes → `ForgeReviewThread` / `reviewDecision`. `GET /pullRequests/{id}/threads`
      is properly threaded with a `status` that includes `fixed`/`closed`, so resolution works.
      Reviewer `vote` is a number — `10` approved, `5` approved-with-suggestions, `0` no vote, `-5`
      waiting, `-10` rejected — which maps onto `APPROVED`/`CHANGES_REQUESTED`/`REVIEW_REQUIRED` with
      the `5` and `-5` cases being the ones a naive mapper gets wrong.
- [x] **Azure Boards → `ForgeProject`.** `GET /_apis/work/boards` and its columns are a real kanban
      over work items, and the column field is a genuine single-select — the best board fidelity of
      the three new providers. Queries and backlogs are out of scope.
- [x] Writes: comment on a PR or work item, vote, resolve a thread, transition a work item's state.

### H — The capability matrix, and saying "this provider can't" honestly (M) ✅ DONE (PR #502, PR #507, 2026-09-22)

Four providers with four different feature sets need one place that says which is which, and four
views that read it rather than each guessing.

- [x] `ForgeCapabilitySchema` in
      [`forge-account.ts`](../../../packages/shared/src/domain/): a record of
      `{pulls, issues, checks, projects, threadResolution, requestChanges, repoListing}` over
      `'full' | 'partial' | 'none'` (Theme B had already declared the schema; this theme made
      `capabilitiesFor` a compiler-enforced `Record<ForgeKind, ForgeCapability>` rather than a
      `kind === 'github'` ternary). **Tri-state, not boolean**, because "Bitbucket's issue tracker is
      usually off" and "Bitbucket has no boards" are different facts that a boolean would flatten.
- [x] The nav rail reads it. `app.tsx`'s `FORGE_GATED_VIEWS` gate now reads the matrix per field
      (`useForgeViewAvailability`, a `FORGE_VIEW_CAPABILITY` map: `actions → checks`, `reviews →
      pulls`, `issues → issues`, `projects → projects`) instead of one boolean gating all four
      together. The sidebar Forge node (`forge-sections.tsx`) is not touched — out of scope for this
      PR, left for whichever theme first lands a `'partial'`-capability provider.
- [x] A `'partial'` capability shows its limits in place, once, where the limit bites (PR #507).
      Landed against the two `'partial'` rows this PR's own scope named — GitLab's
      `projects: 'partial'` (a one-line note under the Projects view's header: Issue Boards mapped
      through one synthetic label-backed field, not ProjectV2's typed custom fields) and Bitbucket's
      `threadResolution: 'partial'` (a one-line note above the Files tab's thread list: no thread
      object, only a flat `parent.id` chain, so resolving one comment resolves the whole chain).
      **A third real case exists and is not yet covered:** Theme G (PR #506, same day) landed
      `AZURE_CAPABILITY.requestChanges: 'partial'` — a real reject vote exists, but it is a bare
      number with no attached review body the way GitHub's `REQUEST_CHANGES` carries one (see that
      capability's own docblock) — but nothing in the Reviews view reads `requestChanges` at all
      yet, gated or not, so there is no existing sentinel to attach a sentence to; that is new scope
      (gating the Request Changes control itself), not this bullet's, and is recorded in
      `outstanding.md`.
- [x] `capabilities.test.ts` asserts the matrix is **exhaustive over `ForgeKind`** — a fifth provider
      added later fails the build until it declares what it can do.

### I — The step frame, the forge step, and the Skip button (L) ✅ DONE (PR #507, 2026-09-22)

There is no wizard, so this theme builds one — narrowly.

- [x] Turn [`onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx)
      into a stepped first-run flow. **It, not
      [`setup-dialog.tsx`](../../../packages/app/src/features/agent/setup-dialog.tsx)** — see
      Decisions. It keeps its focus trap and its `role`/`aria-modal` skeleton, which Phase 68 Theme D
      put there and which `setup-dialog.tsx` is the source of.
- [x] A `WizardStep` model: `{id, title, optional, Component}` in a flat ordered array
      (`onboarding/wizard-step.ts`, `onboarding-steps.ts`), the same shape
      [`sections/registry.ts`](../../../packages/website/src/sections/registry.ts) and
      `AGENT_COMMAND_GROUPS` already use — a step is added by appending, never by editing the shell.
- [x] Footer controls: **Back**, **Skip** and **Continue**, with **Skip rendered only when
      `optional` is true** and sitting at the bottom of the panel as asked. Skipping records the step
      as skipped (`ui-store.ts`'s `onboardingSkippedStepIds`) rather than as done, so the Accounts
      settings page says "you skipped this" and offers it again — a skip the app forgets is a step
      the user can never find.
- [x] Step one is the existing welcome screen, **and its three hard-coded rows become real** — "Git
      Binary / System / Dugite", "/bin/zsh" and the CLI name are literals in the current component,
      and a first-run screen that asserts a shell the user does not have is worse than no screen.
      Read from `window.midniteStudio.systemHealth()` by reusing `HealthChecklist`
      (`settings/settings-pages/health-page.tsx`) rather than re-deriving the same facts a second
      way — the same component `first-run-modal.tsx` already shows in `compact` mode.
- [x] Step two, **optional**: "Connect your forges" — the four provider cards, `gh` detection for
      GitHub, a PAT field for the other three, each validated by the `whoami` call from Theme B
      (`onboarding/steps/forge-connect-step.tsx`, reusing `accounts-page.tsx`'s own
      `useAddForgeAccount`/`PROVIDER_HOST`/`PROVIDER_LABEL`/`PROVIDER_TOKEN_HINT`, now exported so
      the two surfaces can't drift).
- [x] Escape and the close button behave as "skip the rest", not "cancel" — the flow is optional in
      its entirety, and [Phase 62](phase-62-one-escape-one-dismissal.md)'s one-Escape rule governs
      which layer consumes the key (`useDismiss`, `dialog` layer, blocking — `onboarding-modal.tsx`
      was not on `useDismiss` at all before this PR).

> **Landed note.** `first-run-modal.tsx` — a SECOND first-run modal, gated on `onboardedAt` rather
> than `showOnboarding` — was found to render simultaneously with this one on a genuinely first run.
> Not this theme's checklist to fix (it names `onboarding-modal.tsx` only), and the two do not visibly
> collide in the screenshots this PR captured, but it is a real pre-existing overlap. Filed as a
> finding in `outstanding.md`, not fixed here.

### J — The pricing page (M) ✅ DONE

Independent of every other theme, and the one piece of this phase the human explicitly scoped: *"Don't
do anything here yet, just prepare the pricing page."*

- [x] A third route in [`routes.ts`](../../../packages/website/src/routes.ts): `Route` becomes
      `'landing' | 'download' | 'pricing'`, with a real `packages/website/pricing/index.html` beside
      `download/index.html` and a third `rollupOptions.input` entry in
      [`vite.config.ts`](../../../packages/website/vite.config.ts) — the existing pattern exactly, for
      the reason the file already documents: a static host serves the deep link with no client-side
      history rewriting.
- [x] `src/pages/pricing-page.tsx` with three columns — **Free**, **Individual** and **Team**. Public
      repos free; **private repos are what the paid tiers unlock**, which is the actual product
      boundary the human described. Individual **$5–10/month**; Team **minimum 5 seats at $10–20 per
      seat**. Pick one number in each band and put it on the page — a range on a pricing page reads as
      indecision — and record the pick in Decisions so it is a choice, not a default.
- [x] A `Pricing` link in [`site-nav.tsx`](../../../packages/website/src/components/site-nav.tsx).
      The nav builds its anchor list from `NAV_SECTIONS` (landing-page fragments); Pricing is a
      *page*, so it goes beside the existing `Download` button via `hrefFor`, not into the section
      registry.
- [x] **Nothing on the page links to `bilo-io/midnite-studio`.** [`docs/WEBSITE.md`](../../../docs/WEBSITE.md)
      is binding: this repo is private — **verified, not quoted** (`gh api repos/bilo-io/midnite-studio
      -q .visibility` returned `private` on 2026-09-20; note that
      [`CLAUDE.md`](../../../CLAUDE.md)'s CI/billing bullet asserts the opposite and one of the two is
      stale, so re-check rather than trusting either) — so a "contact us" or "report a billing issue"
      link resolves to `bilo-io/midnite-apps`. And the page imports only `react`, `react-dom`, `react-icons` and its
      own files — the off-graph rule in [`CLAUDE.md`](../../../CLAUDE.md) is what lets the site move
      out of this repo later.
- [x] Existing tokens and components only: `Section`, `Container`, `GlowCard`, `Button`, `Text`,
      `Reveal`, and colours from [`tokens.css`](../../../packages/website/src/styles/tokens.css)
      through `tailwind.config.ts`'s `channel()` indirection — no `dark:` prefixes, because the site
      follows `prefers-color-scheme` natively and has no dark-mode strategy configured.
- [x] **No payment link, no checkout, no Stripe, no waitlist capture beyond the existing
      `EarlyAccess` section.** The call to action is the early-access form the site already has.
- [x] A `subscription.ts` vocabulary in [`shared`](../../../packages/shared/src/domain/) —
      `SubscriptionTierSchema` and a `TierEntitlements` record — that **nothing reads**. It exists so
      the later billing work inherits a name, and so this doc's forward constraint has somewhere to
      point. Its docblock must say it is unwired, or a future session will assume it is a gate.
- [x] **Forward constraint, recorded not built:** Councils, Workflows and the Video Editor are
      expected to sit behind a tier *above* Individual later. That means the tier model must be an
      **entitlement set keyed by feature**, not an ordinal comparison — `tier >= 'individual'` is the
      shape that cannot express "Team gets seats, Pro gets Councils" without a rewrite. The pricing
      page shows three columns and a single "more in higher tiers, coming later" footnote; it does
      **not** invent a priced fourth column for features that do not ship behind a paywall today.

### K — Verification (L)

- [ ] Per-provider mapper tests against **committed fixture payloads** — one captured response per
      endpoint per provider, in `__fixtures__/` beside each adapter, the way
      [`gh-parse.test.ts`](../../../packages/desktop/src/main/forge/gh-parse.test.ts) already works.
      The mapping tables (statuses, conclusions, review decisions, work-item state categories) are
      where this phase's bugs will live, and they are pure functions, so they are vitest tests and
      nothing else. **Per [`docs/TESTING.md`](../../../docs/TESTING.md), none of this is e2e.**
- [ ] `secret-vault.test.ts` for the extracted primitive, plus the untouched
      `credential-vault.test.ts` as the proof the extraction was behaviour-preserving.
- [ ] A test that **no token ever crosses the bridge**: assert the `ForgeAccount` schema has no token
      field and that the accounts handler's response parses against it. Cheap, and it is the one
      invariant a careless later change would break silently.
- [ ] A store-level test for the switch: two accounts, two repos, switch, and assert the query keys
      and the visible repo set both move — the cache-bleed case Theme C names as the phase's main
      risk.
- [ ] One **functional e2e** and one only: the first-run wizard's optional step is skippable and the
      app reaches its normal state afterwards. It qualifies under the decision rule because it is a
      multi-view flow with focus order and a modal — name that in the spec's header comment.
- [ ] One **visual baseline** and one only: the pricing page at its three-column breakpoint. It is
      appearance, which is what `moon run app:visual` is for, and it is one baseline against the ~100
      cap.
- [ ] `moon run :typecheck :lint :test` green; `scripts/e2e-budget.mjs` still passes with one added
      e2e test and one added baseline.
- [ ] **Human pass, three parts:** a real GitLab repo, a real Bitbucket repo and a real Azure DevOps
      repo, each with a real PAT, each showing its four views in whatever state its capability matrix
      declares. No fixture substitutes for this.
- [ ] **Human pass:** `gh auth switch` from inside the app changes what `gh auth status` reports in a
      terminal beside it, and switching back restores it.

## Files this phase touches

| Area | Path |
|---|---|
| Contract — kinds & URLs | [`remote.ts`](../../../packages/shared/src/domain/remote.ts) — widened `ForgeKindSchema`, `forgeBoardsUrl`, two new arms in four URL builders (A) |
| Contract — accounts | `shared/src/domain/forge-account.ts` — `ForgeAccountSchema`, `ForgeCapabilitySchema` (B, H); `shared/src/domain/subscription.ts` — unwired tier vocabulary (J) |
| Contract — IPC | [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — five `mstudio:forge:…` channels (B); [`view.ts`](../../../packages/shared/src/domain/view.ts) — `'accounts'` settings page id (B) |
| Contract — vocabulary notes | [`forge.ts`](../../../packages/shared/src/domain/forge.ts) — `ForgeCliStatus` docblock, and the reversed premise in its header (B, D) |
| Engine — URL parsing | [`remote-url.ts`](../../../packages/git-engine/src/parsers/remote-url.ts) — `CANONICAL` gains two hosts, the Azure `_git`/`v3` normaliser (A); `remote-url.test.ts` (A, K) |
| Main — the seam | [`forge-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-handlers.ts) — `repoForge`, 24 call sites (A); [`forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts), [`forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts), [`mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts) (A, C) |
| Main — secrets | `main/secrets/secret-vault.ts` — extracted from [`credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts), which becomes its binding; 0600, loud degrade, constrained key; **shared path with [Phase 76 Theme D](phase-76-the-renderer-in-a-sandbox.md)** (B); [`companion/stt/credentials.ts`](../../../packages/desktop/src/main/companion/stt/credentials.ts) — the degrade behaviour copied from, not changed (B) |
| Shared — redaction | [`redact.ts`](../../../packages/shared/src/redact.ts) — one token pattern per provider, each in its own provider's PR (E, F, G) |
| Main — accounts | `main/forge/forge-accounts.ts`, `forge-accounts.json` + `forge-accounts.vault.json` in userData, modelled on [`repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts)/`repo-store.ts` (B) |
| Main — adapters | `main/forge/adapter.ts`, `registry.ts`, `http.ts` (D); `main/forge/github/` — the existing `gh-*.ts` files moved behind `createGitHubAdapter()` (D); `main/forge/gitlab/` (E); `main/forge/bitbucket/` (F); `main/forge/azure/` (G) |
| Main — gh auth | [`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts) — `gh auth switch`, `invalidateGhProbe()` on switch (C); [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) — the corrected `pullScopeFlags` docblock (C) |
| Preload | [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — five mechanical mappings in the `forge:` object (B) |
| Renderer — accounts UI | `features/settings/settings-pages/accounts-page.tsx` (B); [`user-avatar.tsx`](../../../packages/app/src/components/user-avatar.tsx) — an `src` escape hatch beside the Gravatar path (B); [`avatars.ts`](../../../packages/app/src/services/avatars.ts) — untouched (B) |
| Renderer — repo scoping | [`repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx) — `hasGithubForge` → capability-aware, active-account filtering (A, C); [`forge-sections.tsx`](../../../packages/app/src/features/repos/forge-sections.tsx) (H) |
| Renderer — queries & gating | [`queries.ts`](../../../packages/app/src/services/queries.ts) — account id in the query keys (C); [`use-forge-subscription.ts`](../../../packages/app/src/services/use-forge-subscription.ts) (C); [`app.tsx`](../../../packages/app/src/app.tsx) — `FORGE_GATED_VIEWS` reads the matrix (H) |
| Renderer — the four views | [`reviews-view.tsx`](../../../packages/app/src/features/reviews/reviews-view.tsx), [`actions-view.tsx`](../../../packages/app/src/features/actions/actions-view.tsx), [`issues-view.tsx`](../../../packages/app/src/features/issues/issues-view.tsx), [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx) + [`board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx) — one capability note each, no structural change (H) |
| Renderer — wizard | [`onboarding-modal.tsx`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx) — stepped, with Back/Skip/Continue; `features/onboarding/wizard-steps.ts`, `steps/connect-forges.tsx` (I) |
| Renderer — settings state | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — four `forge.*` keys, `SETTINGS_PAGES` entry, the `agentApiKeys['github']` slot removed after migration (B); [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts), [`persist-rename.ts`](../../../packages/app/src/store/persist-rename.ts) — the migration (B) |
| Website (off-graph) | [`routes.ts`](../../../packages/website/src/routes.ts), `pricing/index.html`, [`vite.config.ts`](../../../packages/website/vite.config.ts), `src/pages/pricing-page.tsx`, [`site-nav.tsx`](../../../packages/website/src/components/site-nav.tsx) (J) |
| Docs | [`docs/WEBSITE.md`](../../../docs/WEBSITE.md) — the third route (J); [`CLAUDE.md`](../../../CLAUDE.md)/[`AGENTS.md`](../../../AGENTS.md)/[`GEMINI.md`](../../../GEMINI.md) — one convention line on where forge credentials live, applied to all three (B) |
| Tests | per-adapter `__fixtures__/` + mapper tests (E, F, G, K); `secret-vault.test.ts`, `capabilities.test.ts`, `forge-accounts.test.ts`, an account-switch store test (K); `e2e/first-run-wizard.spec.ts` (K); one pricing-page visual baseline (K) |

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `scripts/e2e-budget.mjs` passes with exactly one
      new e2e test and one new visual baseline.
- [ ] A GitLab, a Bitbucket and an Azure DevOps remote each resolve to the right `ForgeKind`, and the
      Azure SSH form (`git@ssh.dev.azure.com:v3/org/project/repo`) and legacy host
      (`org.visualstudio.com/project/_git/repo`) both produce `owner: 'org/project'`, `repo: 'repo'`.
- [ ] `credential-vault.test.ts` passes **unchanged** against the extracted `secret-vault.ts`.
- [ ] No forge token appears in any IPC payload — asserted by schema, not by inspection — and no
      forge token appears in any `zustand` `partialize` list.
- [ ] `secrets/secret-vault.ts` writes at 0600 in a 0700 directory, and reports
      `encryptionAvailable: false` with a session-only fallback rather than dropping the secret.
- [ ] Every provider this phase ships has a token pattern in
      [`redact.ts`](../../../packages/shared/src/redact.ts), landed in the same PR as the provider.
- [ ] `agentApiKeys['github']` is migrated into the vault and gone from the persisted blob; the five
      LLM keys beside it are **untouched**.
- [ ] Theme D's refactor changes no `gh` command string: the existing `gh-*.test.ts` suite passes
      untouched, and the diff is moves plus one binding module.
- [ ] Switching the active account hides the repos that do not belong to it, reveals that account's
      reachable repos in the picker, and leaves every hidden repo still open in `repo-registry.ts`.
- [ ] Switching to a GitHub account changes what `gh auth status` reports in a terminal beside the
      app — and does **not**, with `forge.syncGhAuthSwitch` off. **Human pass.**
- [ ] No forge query serves account A's data to account B after a switch — a store-level test, and
      the one this phase would most regret skipping.
- [ ] A Bitbucket repo shows no Projects view and says why in one sentence; a Bitbucket repo with its
      issue tracker off reuses [Phase 54](phase-54-issues-view.md)'s existing disabled state rather
      than a new one.
- [ ] An Azure DevOps repo's Issues view calls them **work items** and shows the item type as a chip.
- [ ] A GitLab MR's approvals render, and the UI never claims a `CHANGES_REQUESTED` that GitLab
      cannot express.
- [ ] The capability matrix is exhaustive over `ForgeKind` — adding a member fails the build.
- [ ] The first-run wizard's forge step is skippable from the button at the bottom of the panel, the
      skip is remembered, and Settings ▸ Accounts offers the step again.
- [ ] The pricing page is reachable at `/pricing` as a deep link on a static host, renders three
      columns at desktop width and stacks on a phone, and `grep -r 'midnite-studio' packages/website/src`
      turns up no link to this private repo.
- [ ] `moon run website:build` succeeds with the third `rollupOptions.input` entry, and
      `moon run website:sync-install` still passes.
- [ ] Nothing in `packages/app` or `packages/desktop` reads `SubscriptionTierSchema`. **This is a
      deliberate assertion**: the phase ships a vocabulary, not a gate.
- [ ] **Human pass:** a real repo on each of the three new providers, with a real credential, showing
      its four views in the states its capability matrix declares.

## Not in this phase

- **Billing, payments, licence keys, entitlement enforcement.** Explicitly excluded by the human's
  own instruction. A pricing *page* ships; nothing reads a tier.
- **Jira.** It is Bitbucket's real board, and it is a different product with its own auth, its own
  API and its own phase. Pretending Bitbucket Projects is a kanban would be worse than the gap.
- **Self-hosted GitLab, Bitbucket Data Center, Azure DevOps Server.** Recognised by the URL parser,
  declared unsupported by the capability matrix. Each is a different base path and a different auth
  story, and one of them (Data Center) is a different API version entirely.
- **OAuth device flow or an OAuth app per provider.** Three app registrations, three redirect URIs
  and three client secrets this app has nowhere to keep. A pasted PAT is the honest credential for a
  desktop app with no server.
- **GitLab Epics, Azure Queries and Backlogs, GitHub ProjectV2 schema editing.** Each is a second
  data model behind a surface this phase is only widening.
- **Creating pull requests, merge requests, issues or work items.** The write surface stays what
  [Phase 20](phase-20-reviews-page.md) and [Phase 54](phase-54-issues-view.md) settled: comment,
  review/approve, resolve, close/reopen, and set a board field. Creation needs a composer per
  provider vocabulary.
- **Cross-account or cross-provider aggregation.** One active account at a time. A unified "all my
  PRs everywhere" inbox is a new surface, not a widening of four existing ones.
- **The other two plaintext-credential sites.**
  [`finance-store.ts`](../../../packages/app/src/features/finance/finance-store.ts)'s API key and
  `ui-store.ts`'s raw screen-lock `passcode` both stay. Theme B gives the repo the primitive that
  would fix them and absorbs the one slot that is genuinely a forge credential
  (`agentApiKeys['github']`); the rest belong to [Phase 76 Theme D](phase-76-the-renderer-in-a-sandbox.md)
  and Phase 91 Theme G, and are named here so they are not lost.
- **Retiring `gh` for GitHub.** It works, it is zero-config, it holds the user's credential already,
  and replacing it with an HTTP adapter would trade a working path for a token we would then have to
  keep. GitHub stays on the subprocess path and the adapter interface is what makes that invisible.

## Decisions / open questions

Every decision below was taken without a round-trip to the human, so each records what was chosen,
what was rejected, and on what evidence.

- **Settled — an adapter interface in main, not per-provider CLIs, and not renderer-side HTTP.**
  Three shapes were weighed. *Per-provider CLIs* (`glab`, `az devops`) would mirror the `gh`
  architecture exactly — but **Bitbucket has no first-party CLI at all**, and `az devops` is an
  extension to a Python-installed `az`, so the CLI model gives zero coverage on one provider and an
  unreasonable install on another. *Renderer-side HTTP* was rejected outright: it would put tokens in
  the renderer, which is the exact pattern `credential-vault.ts`'s docblock cites `finance-store.ts`
  for as a mistake. *An adapter interface in main* keeps `gh` for GitHub (no regression), puts every
  token behind `safeStorage`, and makes the 24 handlers provider-blind.
- **Settled — GitHub's vocabulary stays canonical; adapters map into it.** The alternative — a
  lowest-common-denominator vocabulary — would rewrite `ForgeRunConclusionSchema`,
  `ForgeReviewDecisionSchema` and every consumer of them, for a purity that buys nothing: GitHub is
  the provider with the richest enums, so mapping *into* it loses less than mapping everything into a
  new middle. The cost is that `CHANGES_REQUESTED` is unreachable on GitLab and `action_required` is
  unreachable everywhere else, which the capability matrix and the mapper tests make explicit.
- **Settled — a tri-state capability matrix, not booleans.** "Bitbucket has no boards" and
  "Bitbucket's issue tracker is usually off" are different facts. A boolean would force the second to
  be a lie in one direction or the other.
- **Settled — `glab` is not used even though it exists.** It is the one provider where a CLI would
  work, and using it there would mean two architectures for three providers plus a "install `glab`"
  prompt. One HTTP path for all three new providers is the smaller surface. (Rejected alternative:
  `glab` for GitLab, HTTP for the other two.)
- **Settled — the vault is extracted, not duplicated, and the path is `main/secrets/secret-vault.ts`.**
  `credential-vault.ts` already solved encryption and fingerprint-revocation; a second vault would be
  a second set of those decisions. [Phase 76 Theme D](phase-76-the-renderer-in-a-sandbox.md)
  specifies the same extraction under the name `main/secure-store.ts` — the collision was raised on
  the Phase 90/91 board and resolved in favour of this path, because it namespaces a directory for
  later vaults and this is the phase that generalises the module properly. Whichever executes first
  creates it. The acceptance criterion is unchanged: the existing DB vault tests pass untouched.
- **Settled — degrade loudly and session-only, not silently.** The two existing vaults disagree;
  `credential-vault.ts` drops the secret with no signal, `stt/credentials.ts` keeps it in memory for
  the session and tells the UI. The second is right — a user who typed a PAT and got nothing, with no
  message, will type it again.
- **Settled — absorb `agentApiKeys['github']`, disown the other five.** That slot is a forge token in
  plaintext localStorage and this phase is building the place it belongs. The five LLM keys beside it
  are agent credentials; moving them would be a security migration smuggled into a multi-forge phase,
  and they already have owners in Phase 76 Theme D and Phase 91 Theme G.
  (Rejected: absorbing the whole record; rejected: leaving the GitHub slot where it is.)
- **Settled — `hasToken: boolean` on the wire, never the token.** The renderer never needs the
  secret; main makes every request. This is asserted by a test rather than by convention because it
  is the kind of invariant a later convenience would quietly break.
- **Settled — `gh auth switch` is run, behind a default-on setting.** It mutates machine-wide state
  the user's own terminal shares, which is exactly the class of side effect that gets a switch in
  this repo (compare `Settings ▸ Git Safety ▸ Allow force-push`). Default **on** because the human
  asked for the behaviour; a setting because it reaches outside the app.
  (Rejected: doing it silently; rejected: not doing it and only filtering in-app.)
- **Settled — switching hides repos, it does not close them.** Closing would discard the registry
  entry and make the switch irreversible without re-picking folders. Hiding is a filter, and a filter
  is undoable.
- **Settled — the wizard is `onboarding-modal.tsx`, not `setup-dialog.tsx`.** The human asked for
  "the setup wizard", and neither is one today. `setup-dialog.tsx` writes `.midnite/` files into a
  *target repo* — putting "connect your GitLab account" there would scope an app-wide credential to
  one repository, and Phase 49's guardrails explicitly reject growing that dialog into a stepped
  view. The first-run modal is app-scoped, already has the focus trap and dialog semantics, and is
  where a first-run account setup belongs.
- **Settled — Skip renders only on optional steps, and a skip is remembered.** A Skip on a mandatory
  step is a lie; a skip the app forgets is a step the user can never find again.
- **Settled — the pricing page has three columns, and the prices picked from the bands are
  $8/month (Individual) and $12/seat/month (Team, 5-seat minimum).** The human gave ranges ($5–10 and
  $10–20); a range printed on a pricing page reads as indecision, so a number is chosen. $8 sits
  mid-band for Individual; $12 sits low in the Team band because the 5-seat minimum already sets the
  floor at $60/month and a low per-seat number is what makes a minimum palatable. **Both are trivially
  changeable — they are two constants in one file** — and this bullet exists so a human can overrule
  them in one line.
- **Settled — tiers are modelled as a feature-entitlement record, not an ordinal.** The human's
  forward note (Councils, Workflows, Video Editor behind a higher tier later) is the constraint:
  `tier >= 'individual'` cannot express "Team buys seats, Pro buys Councils" without a rewrite, and
  the rewrite would land after the first paying customer. A record costs nothing now and survives
  that.
- **Settled — the tier vocabulary ships unwired, and a verification line asserts it stays that way.**
  "Don't do anything here yet" is honoured literally; a name in `shared` is not a gate, and the
  docblock has to say so or a later session will assume otherwise.
- **Settled — PATs, not OAuth.** Three app registrations, three redirect URIs, three client secrets
  in a desktop binary. A pasted PAT with the scopes named on the settings page is the honest shape.
- **Settled — one active account, not several at once.** The human's requirement is a *switch*, and
  a switch is a single-selection control. Simultaneous multi-account is a different product decision
  and a much larger cache story.
- **Open — does a per-repo account override belong here?** A monorepo mirrored to two forges, or a
  work repo under one identity beside a personal one, both argue for pinning an account to a repo.
  *Recommendation:* **no, not in this phase.** It doubles the switching model's state and the global
  switch covers the case the human actually described. Revisit only if a real repo demands it.
- **Open — should `forge.scopeReposToActiveAccount` default on or off?** *Recommendation:* **on**,
  because "hide all repos that do not belong to that user" is the human's own phrasing. But it is the
  setting most likely to surprise someone who opened ten repos across two identities, so the switch
  should toast what it hid, once, with an undo.
- **Open — where does the active-account avatar actually live?** *Recommendation:* the title bar,
  right cluster, beside the existing sync controls — it is global state, and the rail is per-view.
  Worth one screenshot before committing to it; `titlebar-status/` is about CI, not identity, so this
  would be its first identity element.
- **Open — do the three new providers get their own poll intervals?** `FORGE_POLL_MS` is 60s for
  everyone and the backoff is shared. *Recommendation:* start shared, and only split if a provider's
  rate limit forces it — Bitbucket's is the tightest of the three and is the one to watch.
- **Open — should E, F and G each be their own PR?** *Recommendation:* **yes, three PRs against a
  frozen interface after D lands.** Each is XL, each is independently reviewable, and a single
  three-provider PR is a diff nobody can review honestly.
