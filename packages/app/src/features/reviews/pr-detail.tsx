import type { ForgeCliStatus, ForgePull, ForgePullDetail } from '@midnite/git-shared';
import { SquareArrowOutUpRight } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { IconButton } from '../../components/icon-button';
import {
  openExternal,
  useForgePullComments,
  useForgePullDetail,
  useForgePullFiles,
  useForgePulls,
} from '../../services/queries';
import { checksStatus, pullStatus, StatusPill } from '../forge/forge-status';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { PrChecks } from './pr-checks';
import { PrConversation } from './pr-conversation';
import { PrFiles } from './pr-files';

/**
 * One pull request, read in the app.
 *
 * Phase 17 shipped this as a summary and a link out, and said so in its own
 * doc comment: diffs, review threads and checks were the forge's surface. This
 * is that decision reversed for reading — the code, the conversation and the
 * verdict are the three things a reviewer needs open at once, and a browser
 * round trip for each is the whole friction the view removes.
 *
 * **Three tabs, three fetches, none of them speculative.** The detail query
 * runs as soon as the PR opens because every tab's header reads it; the patch
 * and the conversation are fetched only while their tab is mounted. A reader
 * who opens a PR to check whether CI passed never pulls its diff.
 */
export type PrTab = 'files' | 'conversation' | 'checks';

const TABS: { id: PrTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'checks', label: 'Checks' },
];

export function PrDetail({ repoId, number }: { repoId: string; number: number }) {
  const [tab, setTab] = useState<PrTab>('files');

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

  if (pull === null) {
    if (detailQuery.isLoading || list.isLoading) {
      return <Centered>Reading pull request #{number}…</Centered>;
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
    <section aria-label={`Pull request #${pull.number}`} className="flex h-full min-h-0 flex-col">
      <PrHeader pull={pull} detail={detail} />

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
        className={`min-h-0 flex-1 ${tab === 'checks' ? 'flex flex-col' : 'overflow-y-auto'}`}
      >
        {tab === 'files' ? (
          <PrFiles
            files={files.data?.files ?? null}
            isLoading={files.isLoading}
            error={files.data?.error ?? null}
            notReady={notReady(files.data?.cli)}
            pullUrl={pull.url}
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
 * The PR's facts and its description.
 *
 * `detail` is optional throughout: the header renders from the cached listing
 * row the moment the PR opens, and fills in the base branch, line counts and
 * body as the second fetch lands. A header that waits for everything is a
 * header that is blank for the length of a subprocess.
 */
function PrHeader({ pull, detail }: { pull: ForgePull; detail: ForgePullDetail | null }) {
  const checks = checksStatus(pull);

  return (
    <header className="shrink-0 border-b border-border px-4 py-3">
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

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
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
            {detail.changedFiles} {detail.changedFiles === 1 ? 'file' : 'files'}{' '}
            <span className="text-success">+{detail.additions}</span>{' '}
            <span className="text-destructive">−{detail.deletions}</span>
          </span>
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

      {detail !== null && detail.body.trim().length > 0 ? (
        <div
          data-selectable
          className={`mt-2 max-h-40 max-w-none overflow-y-auto text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
        >
          {/* No `rehype-raw` — see `CommitMessage`'s note on attacker-authored text. */}
          <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
            {detail.body}
          </Markdown>
        </div>
      ) : null}
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
