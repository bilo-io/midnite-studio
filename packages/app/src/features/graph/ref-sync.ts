import type { Ref } from '@midnite/studio-shared';

/**
 * What a branch can do with its remote, derived once.
 *
 * The badge's hover buttons and the badge's context menu are the same four
 * verbs on two surfaces, and the interesting part of each verb is not the call
 * — it is whether it is allowed and what to say when it is not. Deriving that
 * twice is how the menu ends up offering a pull the button greys out, so it is
 * derived here, as data, and both surfaces render the same array.
 *
 * Pure and free of React so the enablement rules are unit-testable without a
 * DOM: they are the part most likely to be wrong and the part least visible in
 * a screenshot.
 *
 * **Not the same thing as
 * [`status/sync-availability.ts`](../status/sync-availability.ts), and
 * deliberately so.** That module answers "what can the CHECKED-OUT branch do?"
 * from a `BranchStatus`, for the title bar and the sidebar rows. This one
 * answers "what can THIS ref do?" from a `Ref`, for a badge on any row in the
 * graph — which is why `publish` exists here and nowhere there: a branch you
 * are not on can be one that has never been pushed. Merging them would mean a
 * union input where half the fields are absent for half the callers, and the
 * enablement rules would have to start asking which caller they were serving.
 */
export type SyncActionKind = 'push' | 'pull' | 'publish' | 'fetch';

export type SyncAction = {
  kind: SyncActionKind;
  /**
   * The accessible name, the tooltip and the menu label, all at once — with
   * real numbers in it ("Push 3 commits to origin/main"), because a control
   * that says only "Push" leaves the user to find the count elsewhere on the
   * row and match it up.
   */
  label: string;
  disabled: boolean;
  /** Why it is dead. Rendered as the Phase 7 disabled-reason tooltip. */
  disabledReason?: string;
  /** Remote to act on, resolved against the configured remote names. */
  remote: string;
  /** Local branch the verb acts on. Absent for `fetch`, which is remote-wide. */
  branch?: string;
  /** `-u`, for the first push of a branch that has no upstream. */
  setUpstream: boolean;
  /** Commits behind the verb — 0 for `publish` and `fetch`. */
  count: number;
};

/**
 * The remote a tracking name belongs to.
 *
 * `origin/feature/x` splits at the FIRST slash and `origin/main` splits there
 * too, so a naive `split('/')[0]` is right almost always — and silently wrong
 * for the case that actually bites, a remote whose own name contains a slash.
 * Matching against the configured names instead, longest first, makes the
 * common case identical and the rare one correct.
 *
 * Falls back to the first segment when no configured remote matches, which is
 * what happens for a tracking ref left behind by a remote that has since been
 * removed: better to name the remote git recorded than to claim `origin`.
 */
export function splitUpstream(
  upstreamName: string,
  remoteNames: readonly string[],
): { remote: string; branch: string } {
  const candidates = [...remoteNames].sort((a, b) => b.length - a.length);
  for (const remote of candidates) {
    if (upstreamName.startsWith(`${remote}/`)) {
      return { remote, branch: upstreamName.slice(remote.length + 1) };
    }
  }
  const slash = upstreamName.indexOf('/');
  return slash === -1
    ? { remote: upstreamName, branch: '' }
    : { remote: upstreamName.slice(0, slash), branch: upstreamName.slice(slash + 1) };
}

/** Remote a branch with no upstream would be published to. */
export const defaultRemote = (remoteNames: readonly string[]): string | null =>
  remoteNames.includes('origin') ? 'origin' : (remoteNames[0] ?? null);

const plural = (n: number): string => (n === 1 ? 'commit' : 'commits');

/**
 * The sync verbs available on a ref, in the order they are offered.
 *
 * Only local branches get any. A tag does not track anything, and a
 * remote-tracking branch is the thing being tracked — "push origin/main" is
 * either a no-op or a force-push, and force-push is out of scope for the MVP.
 *
 * @param currentBranch HEAD's branch in the active worktree, or null when detached.
 * @param remoteNames   Configured remotes, from `useRemotes`.
 */
export function syncActions(
  ref: Ref,
  currentBranch: string | null,
  remoteNames: readonly string[],
): SyncAction[] {
  if (ref.kind !== 'localBranch') return [];

  const isCurrent = ref.name === currentBranch;
  const upstream = ref.upstream;

  /*
    A `gone` upstream is a branch whose remote counterpart was deleted. Its
    ahead/behind counts are stale rather than meaningful — git has nothing left
    to compare against — so it is offered the same verb a brand-new branch is,
    which is the one that would actually put it back.
  */
  if (!upstream || upstream.gone) {
    const remote = defaultRemote(remoteNames);
    return [
      {
        kind: 'publish',
        label: remote
          ? `Publish ${ref.name} to ${remote} (sets upstream)`
          : `Publish ${ref.name}`,
        disabled: remote === null,
        ...(remote === null
          ? { disabledReason: 'This repository has no remote configured.' }
          : {}),
        remote: remote ?? 'origin',
        branch: ref.name,
        setUpstream: true,
        count: 0,
      },
    ];
  }

  const { remote, branch: upstreamBranch } = splitUpstream(upstream.name, remoteNames);
  const { ahead, behind } = upstream;

  /*
    A branch usually tracks a remote branch of the same name, but it does not
    have to: `main` may track `origin/trunk`. That matters here because the
    push request carries a single `branch`, not a `local:remote` refspec pair —
    `git push origin main` would create `origin/main` beside the `origin/trunk`
    it was meant to update.

    So when the names differ, push stops naming the branch and lets git resolve
    the destination from the branch's own upstream config, which it can only do
    for the branch you are standing on. Pushing a renamed-tracking branch from
    elsewhere is the one case that needs a checkout first, and it says so.
  */
  const renamedTracking = upstreamBranch !== ref.name;

  return [
    {
      kind: 'pull',
      label:
        behind > 0
          ? `Pull ${behind} ${plural(behind)} from ${upstream.name}`
          : `Pull into ${ref.name}`,
      disabled: behind === 0 || !isCurrent,
      /*
        Two reasons, and the order matters: a branch that is neither checked
        out nor behind should be told the thing it can act on. "Check it out
        first" invites a checkout that changes nothing.
      */
      ...(behind === 0
        ? { disabledReason: 'Nothing to pull — already up to date.' }
        : !isCurrent
          ? {
              disabledReason: `Check out ${ref.name} first — a pull merges into the current branch.`,
            }
          : {}),
      remote,
      // The REMOTE's name for the branch: `git pull origin trunk` is what
      // updates a local `main` that tracks `origin/trunk`.
      branch: upstreamBranch,
      setUpstream: false,
      count: behind,
    },
    {
      kind: 'push',
      /*
        Push, unlike pull, is not inherently restricted to the checked-out
        branch: the refspec names it, so `git push origin feature/x` publishes
        it from wherever you happen to be standing.
      */
      label:
        ahead > 0 ? `Push ${ahead} ${plural(ahead)} to ${upstream.name}` : `Push ${ref.name}`,
      disabled: ahead === 0 || (renamedTracking && !isCurrent),
      ...(ahead === 0
        ? { disabledReason: 'Nothing to push — the remote is up to date.' }
        : renamedTracking && !isCurrent
          ? {
              disabledReason: `${ref.name} tracks ${upstream.name} under a different name — check it out to push it.`,
            }
          : {}),
      remote,
      ...(renamedTracking ? {} : { branch: ref.name }),
      setUpstream: false,
      count: ahead,
    },
    {
      kind: 'fetch',
      label: `Fetch ${remote}`,
      disabled: false,
      remote,
      setUpstream: false,
      count: 0,
    },
  ];
}

/**
 * The verbs the badge itself offers on hover — the counted ones, only when
 * they have a count.
 *
 * The badge is a chip in a virtualized table, not a toolbar: it earns buttons
 * only where they answer the question the counts on it just raised. `fetch` is
 * remote-wide and `publish` has no count to expand for, so both stay in the
 * context menu where there is room to name them.
 */
export const badgeActions = (actions: readonly SyncAction[]): SyncAction[] =>
  actions.filter((action) => action.count > 0);
