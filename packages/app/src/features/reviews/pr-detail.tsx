import type {
  ForgeCliStatus,
  ForgePull,
  ForgePullDetail,
  ForgeWriteResult,
} from '@midnite/studio-shared';
import { SquareArrowOutUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { IconButton } from '../../components/icon-button';
import { formatNumber } from '../../lib/format-number';
import { useSlidesStore } from '../slides/slides-store';
import { PresentButton } from '../slides/present-button';
import {
  openExternal,
  useAddReviewComment,
  useForgePullComments,
  useForgePullDetail,
  useForgePullFiles,
  useForgePulls,
  useForgePullThreads,
  useReplyToReviewComment,
  useSetThreadResolved,
} from '../../services/queries';
import { checksStatus, pullStatus, StatusPill } from '../forge/forge-status';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { PrChecks } from './pr-checks';
import { PrConversation } from './pr-conversation';
import { PrFiles } from './pr-files';
import {
  PrDetailSkeleton,
  PrHeaderMetaSkeleton,
  PrOverviewSkeleton,
} from './reviews-skeletons';
import { ReviewActionBar } from './review-action-bar';

/**
 * One pull request, read in the app.
 *
 * Phase 17 shipped this as a summary and a link out, and said so in its own
 * doc comment: diffs, review threads and checks were the forge's surface. This
 * is that decision reversed for reading — the code, the conversation and the
 * verdict are the three things a reviewer needs open at once, and a browser
 * round trip for each is the whole friction the view removes.
 *
 * **Four tabs, three fetches, none of them speculative.** The detail query
 * runs as soon as the PR opens because every tab's header reads it — and it is
 * also all Overview needs, so that tab costs nothing extra; the patch and the
 * conversation are fetched only while their tab is mounted. A reader who opens
 * a PR to check whether CI passed never pulls its diff.
 *
 * **The description is a tab, not a header.** It used to sit under the title in
 * a 160px-tall scroller, which spent that height on every PR whether or not
 * anyone was reading it and pushed the tabs and the review actions down the
 * pane. As Overview it gets the whole panel when it is wanted and none of it
 * when it is not, and the header collapses to the facts that fit on two lines.
 */
export type PrTab = 'overview' | 'files' | 'conversation' | 'checks';

const TABS: { id: PrTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'files', label: 'Files' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'checks', label: 'Checks' },
];

export function PrDetail({ repoId, number }: { repoId: string; number: number }) {
  /*
    Overview opens first because it is what the header used to show: a PR read
    for the first time answers "what is this?" before "what changed?", and the
    description was always visible before this tab existed.
  */
  const [tab, setTab] = useState<PrTab>('overview');

  /*
    The listing is the fallback header, not the source of truth.

    `useForgePulls` is already cached — the sidebar filled it — so the title and
    state pills can render on the first frame while `pullDetail` is still in
    flight. Without it, opening a PR shows an empty pane for the length of a
    subprocess.
  */
  const list = useForgePulls(repoId, true);
  const listed = list.data?.pulls.find((candidate) => candidate.number === number) ?? null;

  const detailQuery = useForgePullDetail(repoId, number);
  const detail = detailQuery.data?.detail ?? null;
  const pull: ForgePull | null = detail?.pull ?? listed;

  const files = useForgePullFiles(repoId, number, tab === 'files');
  const comments = useForgePullComments(repoId, number, tab === 'conversation');
  // Same tab gate as the patch it decorates: threads are only ever drawn on the
  // Files tab, so a reader who opens a PR onto Checks pays for no GraphQL call.
  const threads = useForgePullThreads(repoId, number, tab === 'files');

  /*
    The three writes, and one visible failure between them.

    `error` collapses to whichever write last failed, because only one composer
    can be open at a time and only one resolve can be in flight — so there is
    never a second failure to lose. `busy` is the same union, and it is what
    disables every control in the panel rather than each button tracking its own.
  */
  const addComment = useAddReviewComment(repoId, number);
  const reply = useReplyToReviewComment(repoId, number);
  const resolve = useSetThreadResolved(repoId, number);
  const writes = [addComment, reply, resolve];
  const busy = writes.some((write) => write.isPending);
  const writeError =
    writes
      .map((write) => writeFailure(write.data))
      .find((message): message is string => message !== null) ?? null;

  if (pull === null) {
    if (detailQuery.isLoading || list.isLoading) {
      return <PrDetailSkeleton />;
    }
    return (
      <Centered>
        {detailQuery.data?.error ??
          `Pull request #${number} could not be read. Refresh Reviews in the sidebar, or open it on GitHub.`}
      </Centered>
    );
  }

  const checks = checksStatus(pull);

  return (
    /*
      `flex-1 min-w-0`, matching `RunDetail`'s own root in the Actions view.
      Without them this pane is a flex item at its CONTENT width — a long log
      line or a wide markdown table sizes the whole detail column past the
      window and out over whatever sits beside it.
    */
    <section
      aria-label={`Pull request #${pull.number}`}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
    >
      <PrHeader pull={pull} detail={detail} loadingDetail={detailQuery.isLoading} />

      {/*
        Outside the tabpanel on purpose: these actions apply to the pull request,
        not to one view of it, so they stay put and stay visible whichever tab is
        open. Inside Conversation — GitHub's own placement — Merge would be
        hidden behind a tab.
      */}
      <div className="shrink-0 px-3 py-2">
        <ReviewActionBar repoId={repoId} pull={pull} detail={detail} />
      </div>

      <div
        role="tablist"
        aria-label="Pull request detail"
        className="flex shrink-0 gap-1 border-b border-border px-2"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`pr-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`pr-panel-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs transition-colors ${
              tab === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {/*
              The Checks pill rides the tab itself. A reviewer's first question
              of a PR is whether it is red, and answering it only once the tab
              is opened makes them click to find out something the row already
              knows.
            */}
            {id === 'checks' && checks !== null ? (
              <StatusPill status={checks} className="ml-1.5 align-middle" />
            ) : null}
          </button>
        ))}
      </div>

      <div
        id={`pr-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`pr-tab-${tab}`}
        /*
          The Checks tab lays its own children out (a job tree over a log pane)
          and so cannot be the scroller; it clips instead. Both of its chrome
          rows are `shrink-0`, so a window short enough that they do not fit
          would otherwise push them out of the bottom of the panel rather than
          simply leaving the log with no room.
        */
        className={`min-h-0 flex-1 ${
          tab === 'checks' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        {tab === 'overview' ? (
          <PrOverview detail={detail} isLoading={detailQuery.isLoading} number={pull.number} />
        ) : tab === 'files' ? (
          <PrFiles
            files={files.data?.files ?? null}
            isLoading={files.isLoading}
            error={files.data?.error ?? null}
            notReady={notReady(files.data?.cli)}
            pullUrl={pull.url}
            threads={threads.data?.threads ?? []}
            review={{
              headSha: detail?.headSha ?? null,
              /*
                The two text-bearing writes answer whether they landed, so the
                composer that holds the text can decide whether to close. A
                fire-and-forget `mutate` here is what made a refused comment
                disappear along with the paragraph somebody had just typed.
                `mutateAsync` is safe to await because the mutation function
                never throws — a refusal is an `ok: false` result.
              */
              onComment: async (input) => (await addComment.mutateAsync(input)).ok,
              onReply: async (input) => (await reply.mutateAsync(input)).ok,
              // Resolve carries no text, so there is nothing to lose and
              // nothing to wait for — the panel re-reads its state either way.
              onResolve: (input) => resolve.mutate(input),
              busy,
              error: writeError,
            }}
          />
        ) : tab === 'conversation' ? (
          <PrConversation
            comments={comments.data?.comments ?? []}
            isLoading={comments.isLoading}
            error={comments.data?.error ?? null}
            notReady={notReady(comments.data?.cli)}
          />
        ) : (
          <PrChecks
            repoId={repoId}
            headSha={detail?.headSha ?? null}
            headBranch={pull.headBranch}
            loadingDetail={detailQuery.isLoading}
          />
        )}
      </div>
    </section>
  );
}

/**
 * The description, given the whole panel.
 *
 * There is no fetch of its own: `detail` is the query the header already runs,
 * so opening a PR onto Overview costs exactly what opening it onto any other
 * tab costs. The three states are distinct on purpose — a PR whose body is
 * genuinely empty must not read the same as one whose detail is still in
 * flight, or the panel looks like it has answered when it has not.
 */
function PrOverview({
  detail,
  isLoading,
  number,
}: {
  detail: ForgePullDetail | null;
  isLoading: boolean;
  number: number;
}) {
  // Claims `activeMarkdown` only once there is a real body to present — an
  // empty-description PR has nothing worth the palette's future command
  // targeting. Cleared on unmount, matching `MarkdownPreview`'s own rule.
  const body = detail !== null && detail.body.trim().length > 0 ? detail.body : null;
  useEffect(() => {
    if (body === null) return;
    useSlidesStore.getState().setActiveMarkdown({ content: body, label: `PR #${number}` });
    return () => useSlidesStore.getState().setActiveMarkdown(null);
  }, [body, number]);

  if (detail === null) {
    if (isLoading) return <PrOverviewSkeleton />;
    return <Centered>No description to show.</Centered>;
  }
  if (body === null) {
    return <Centered>This pull request has no description.</Centered>;
  }
  return (
    <div className="px-4 py-3">
      <PresentButton source={{ content: body, label: `PR #${number}` }} className="mb-1" />
      <div data-selectable className={`max-w-none text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}>
        {/* No `rehype-raw` — see `CommitMessage`'s note on attacker-authored text. */}
        <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
          {body}
        </Markdown>
      </div>
    </div>
  );
}

/**
 * The PR's facts — two lines, and no more.
 *
 * `detail` is optional throughout: the header renders from the cached listing
 * row the moment the PR opens, and fills in the base branch and line counts as
 * the second fetch lands. A header that waits for everything is a header that
 * is blank for the length of a subprocess.
 *
 * The description used to live here too; it is the Overview tab now, so this
 * stays a fixed two rows however long the body is and the tabs sit directly
 * beneath it.
 */
function PrHeader({
  pull,
  detail,
  loadingDetail,
}: {
  pull: ForgePull;
  detail: ForgePullDetail | null;
  /** Whether the fetch that fills in the base branch and the counts is still out. */
  loadingDetail: boolean;
}) {
  const checks = checksStatus(pull);

  return (
    <header className="shrink-0 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <StatusPill status={pullStatus(pull)} />
        {checks ? <StatusPill status={checks} /> : null}
        <h2 className="truncate text-sm font-semibold" data-selectable>
          <span className="text-muted-foreground">#{pull.number}</span> {pull.title}
        </h2>
        <IconButton
          icon={SquareArrowOutUpRight}
          label={`Open #${pull.number} on GitHub`}
          size="sm"
          className="ml-auto"
          onClick={() => openExternal(pull.url)}
        />
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span data-selectable>
          {pull.author || 'someone'} wants to merge{' '}
          <span className="text-foreground">{pull.headBranch}</span>
          {detail !== null && detail.baseBranch.length > 0 ? (
            <>
              {' into '}
              <span className="text-foreground">{detail.baseBranch}</span>
            </>
          ) : null}
        </span>
        {detail !== null ? (
          <span className="tabular-nums">
            {formatNumber(detail.changedFiles)}{' '}
            {detail.changedFiles === 1 ? 'file' : 'files'}{' '}
            <span className="text-success">+{formatNumber(detail.additions)}</span>{' '}
            <span className="text-destructive">−{formatNumber(detail.deletions)}</span>
          </span>
        ) : loadingDetail ? (
          /*
            Bars, not nothing. This line renders from the cached listing row
            while the detail fetch is out, so the base branch and the counts
            arrive a beat later into a line that is already on screen — and
            appearing from nothing shoves the rest of the row along with them.
          */
          <PrHeaderMetaSkeleton />
        ) : null}
        {/*
          `CONFLICTING` is the only mergeability worth a word here. `MERGEABLE`
          is the unremarkable default, and `UNKNOWN` means GitHub has not
          finished computing it — reporting either would be noise on every
          healthy PR.
        */}
        {detail?.mergeable === 'CONFLICTING' ? (
          <span className="text-destructive">Conflicts with the base branch</span>
        ) : null}
      </p>
    </header>
  );
}

/**
 * The sentence a machine without a usable `gh` should read, if any.
 *
 * Without this a signed-out user gets "this pull request changes no files" and
 * "nobody has commented" — two confident statements about a repository nothing
 * ever asked. The `cli` reason is on every forge envelope precisely so a tab
 * can tell "no answer" from "the answer is none", and the hint is the command
 * that would fix it.
 */
/**
 * The sentence a refused write should show, if any.
 *
 * Three states, and they are not the same: `undefined` is "nothing has been
 * attempted", `ok: true` is a write that landed, and `ok: false` with a null
 * `error` is a machine that could not write at all — which the tab's own
 * `notReady` line already says, so repeating it beside the composer would be the
 * same news twice. Only `gh`'s actual message reaches the user from here.
 */
function writeFailure(result: ForgeWriteResult | undefined): string | null {
  if (result === undefined || result.ok) return null;
  return result.error;
}

function notReady(cli: ForgeCliStatus | undefined): string | null {
  if (cli === undefined || cli.reason === 'ready') return null;
  return cli.hint.length > 0 ? cli.hint : 'The GitHub CLI is not available.';
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
