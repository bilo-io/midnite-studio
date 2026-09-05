import type { ScanCategory, SystemCacheItem, TrashSummary } from '@midnite/studio-shared';
import { LuHardDrive, LuTrash2 } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { bridge } from '../../services/bridge';
import { useOptimizerStore } from '../../store/optimizer-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { formatBytes } from '../monitor/format-bytes';
import { CircularGauge } from './components/circular-gauge';
import { SegmentedBar } from './components/segmented-bar';
import { CATEGORY_LABELS, categoryColor } from './category-palette';
import {
  loadTrashSummary,
  runEmptyTrash,
  runSystemClean,
  runSystemReclaim,
  runSystemScan,
} from './use-optimizer';

// Phase 72 Theme D groups this list by ecosystem; until it lands, this stays
// the same flat four-of-five categories it always was (`toolCache` items are
// found but not yet listed here — Theme C's own sequencing note says that is
// safe on its own).
const CATEGORY_ORDER: readonly ScanCategory[] = [
  'dependencies',
  'buildOutput',
  'staleWorktree',
  'looseObjects',
];

function formatTrashDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function trashWarnings(summary: TrashSummary): string[] {
  const lines = [`${formatBytes(summary.totalBytes)} will be freed.`];
  if (summary.oldestModifiedAt) {
    lines.push(`The oldest item was last modified ${formatTrashDate(summary.oldestModifiedAt)}.`);
  }
  if (summary.volumeCount > 1) {
    const otherDisks = summary.volumeCount - 1;
    lines.push(
      `Includes the Trash on ${otherDisks} other mounted disk${otherDisks === 1 ? '' : 's'}.`,
    );
  }
  if (summary.truncated) {
    lines.push(
      'More than 200,000 entries were found — the count and size above are a floor, not an exact total.',
    );
  }
  return lines;
}

const TRASH_BUTTON_CLASS =
  'rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent';

/**
 * Phase 74 Theme D — a Trash card in its own destructive-tinted container,
 * never merged into Phase 73's System section: the Trash is not a tool
 * cache, and grouping it with Cargo/Plex would understate what it does.
 *
 * Gated on the same three-way AND Theme C established — hidden entirely
 * (not a disabled button) when any factor is off, because a disabled
 * control would advertise a capability the user has not consented to.
 */
function TrashCard() {
  const dialogs = useDialogs();
  const optimizerEnabled = useUiStore((s) => s.optimizerEnabled);
  const allowTrashEmpty = useUiStore((s) => s.allowTrashEmpty);
  const trashEmptyConsentGiven = useUiStore((s) => s.trashEmptyConsentGiven);
  const trash = useOptimizerStore((s) => s.trash);

  if (!(optimizerEnabled && allowTrashEmpty && trashEmptyConsentGiven)) return null;

  const handleCheck = (): void => {
    void loadTrashSummary();
  };

  // Decision 15 — the confirm recomputes its own numbers rather than
  // trusting the card's cached summary, since anything trashed since the
  // last "Check Trash" would make the confirm understate what it destroys.
  const handleEmpty = (): void => {
    dialogs.confirm({
      title: 'Empty the Trash?',
      confirmLabel: 'Empty Trash',
      danger: true,
      blastRadiusKind: 'trash',
      // Absent, not null — renders "Checking what this affects…" while the
      // fresh count below is still in flight.
      blastRadius: undefined,
      requireAck: 'I understand this cannot be undone',
      onConfirm: () => {
        void runEmptyTrash();
      },
    });

    void (async () => {
      const api = bridge();
      if (!api) {
        dialogs.close();
        useToastStore.getState().addToast({ message: 'The app bridge is unavailable.', status: 'error' });
        return;
      }
      const response = await api.optimizer.trashSummary();
      if (response.ok) {
        dialogs.setBlastRadius(
          { count: response.value.itemCount, sample: [] },
          trashWarnings(response.value),
        );
      } else {
        dialogs.close();
        useToastStore.getState().addToast({ message: response.message, status: 'error' });
      }
    })();
  };

  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-center gap-2">
        <LuTrash2 className="h-4 w-4 text-destructive" aria-hidden />
        <p className="text-sm font-medium text-foreground">Trash</p>
      </div>

      {trash.status === 'idle' ? (
        <>
          <p className="text-xs text-muted-foreground">The Trash hasn&rsquo;t been checked yet.</p>
          <button type="button" onClick={handleCheck} className={TRASH_BUTTON_CLASS}>
            Check Trash
          </button>
        </>
      ) : null}

      {trash.status === 'loading' ? (
        <button type="button" disabled className={TRASH_BUTTON_CLASS}>
          Checking…
        </button>
      ) : null}

      {trash.status === 'error' ? (
        <>
          <p className="text-xs text-destructive">{trash.message}</p>
          <button type="button" onClick={handleCheck} className={TRASH_BUTTON_CLASS}>
            Check Trash
          </button>
        </>
      ) : null}

      {trash.status === 'ready' && trash.summary && trash.summary.itemCount === 0 ? (
        <>
          <p className="text-xs text-muted-foreground">The Trash is empty.</p>
          <button type="button" disabled className={TRASH_BUTTON_CLASS}>
            Empty Trash…
          </button>
        </>
      ) : null}

      {trash.status === 'ready' && trash.summary && trash.summary.itemCount > 0 ? (
        <>
          <p className="text-sm text-foreground">
            {trash.summary.itemCount} item{trash.summary.itemCount === 1 ? '' : 's'} —{' '}
            {formatBytes(trash.summary.totalBytes)}
          </p>
          {trash.summary.oldestModifiedAt ? (
            <p className="text-xs text-muted-foreground">
              Oldest item last modified {formatTrashDate(trash.summary.oldestModifiedAt)}.
            </p>
          ) : null}
          {trash.summary.volumeCount > 1 ? (
            <p className="text-xs text-muted-foreground">
              Includes {trash.summary.volumeCount - 1} other mounted disk
              {trash.summary.volumeCount - 1 === 1 ? '' : 's'}.
            </p>
          ) : null}
          {trash.summary.truncated ? (
            <p className="text-xs text-muted-foreground">
              More than 200,000 entries — this is a floor.
            </p>
          ) : null}
          <button type="button" onClick={handleEmpty} className={TRASH_BUTTON_CLASS}>
            Empty Trash…
          </button>
        </>
      ) : null}
    </div>
  );
}

export function StorageTab() {
  const result = useOptimizerStore((s) => s.scan.result);
  const selectRepo = useUiStore((s) => s.selectRepo);

  // The System section (Theme E) and the Trash card (Theme D) each have
  // their own, independent gating state and are NOT nested under "a Smart
  // Scan hasn't run yet" — they are variants of Storage's own "what's taking
  // up space" question, not facts this repo's own scan result gates. Both
  // render in both branches below, after the existing category breakdown.
  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Run a Smart Scan first — Storage shows the same result as a breakdown.
        </p>
        <SystemCachesSection />
        <TrashCard />
      </div>
    );
  }

  const segments = CATEGORY_ORDER.filter((category) => (result.byCategory[category] ?? 0) > 0).map(
    (category) => ({ id: category, bytes: result.byCategory[category] ?? 0 }),
  );

  return (
    <div className="flex flex-col gap-4">
      <SegmentedBar
        label="Reclaimable storage by category"
        total={result.totalBytes}
        segments={segments}
      />

      <ul className="space-y-1">
        {result.items.map((item) => (
          <li
            key={item.path}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
          >
            <button
              type="button"
              // Deep-links to the repo in the sidebar. Items sit at arbitrary
              // depth under a worktree, so only the owning repo (not the
              // exact worktree) is a reliable target to select.
              onClick={() => item.repoId && selectRepo(item.repoId)}
              disabled={!item.repoId}
              className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(item.category) }}
              />
              <span className="truncate font-mono text-xs text-foreground">{item.path}</span>
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatBytes(item.bytes)}
            </span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {CATEGORY_ORDER.map((category) => (
          <li key={category} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: categoryColor(category) }}
            />
            {CATEGORY_LABELS[category]}
          </li>
        ))}
      </ul>

      <SystemCachesSection />
      <TrashCard />
    </div>
  );
}

/**
 * Phase 73 Theme D's own labels for the four registered vendor reclaim
 * commands (`packages/desktop/src/main/optimizer/reclaim-commands.ts`'s
 * `DEFAULT_RECLAIM_COMMANDS`), mirrored here **for display only** — the
 * renderer may not import `packages/desktop`, so it has no way to learn
 * which entries have a registered command from the wire (the catalogue
 * schema deliberately carries no reclaim-command info, only `reclaim` cost).
 * Nothing here ever runs: the actual argv is resolved and spawned main-side
 * against its own copy of this table, keyed by the same `entryId`. A stale
 * label here is a UI cosmetic (a button might read "Move to Trash" for an
 * entry that actually has a reclaim command, or vice versa) — the safety
 * property (never a renderer-supplied argv) does not depend on this map.
 */
const RECLAIM_LABELS: Partial<Record<string, string>> = {
  'homebrew-cache': 'Run brew cleanup -s',
  'go-build-cache': 'Run go clean -cache',
  'go-mod-cache': 'Run go clean -modcache',
  'pnpm-store': 'Run pnpm store prune',
};

/** One non-empty line — mirrors `process-runner.ts`'s `firstLine`, kept as a
 *  tiny renderer-side copy since that file is desktop-only. */
function firstNonEmptyLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? '';
}

/**
 * Phase 73 Theme E — a System section that never looks like "your project's
 * stuff": a distinct-accent banner, its own five states (idle/loading/empty/
 * error/approximate), and rows naming a `label`/`producer` rather than a raw
 * path. Gated on the Theme C three-way AND; renders nothing otherwise, and
 * the tab is exactly as Phase 72 left it above.
 *
 * Deliberately has no `SegmentedBar` of its own: Phase 72 Theme D generalises
 * that component (`color`/`name` injected as functions over `Id extends
 * string`) and this section is meant to consume it, not fork a second
 * implementation. Until that lands, the list renders without a bar rather
 * than generalising the component independently — see the phase doc's Theme
 * E, first bullet.
 */
function SystemCachesSection() {
  const optimizerEnabled = useUiStore((s) => s.optimizerEnabled);
  const allowSystemCacheClean = useUiStore((s) => s.allowSystemCacheClean);
  const systemCacheConsentGiven = useUiStore((s) => s.systemCacheConsentGiven);
  const systemScan = useOptimizerStore((s) => s.systemScan);
  const dialogs = useDialogs();

  const gated = optimizerEnabled && allowSystemCacheClean && systemCacheConsentGiven;
  if (!gated) return null;

  const trashEntry = (item: SystemCacheItem) => {
    dialogs.confirm({
      title: `Clean ${item.label}?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: 1, sample: [] },
      blastRadiusKind: 'systemCache',
      warnings: [`${formatBytes(item.bytes)} will be freed.`],
      onConfirm: () => {
        void runSystemClean([item.entryId]);
      },
    });
  };

  const reclaimEntry = (item: SystemCacheItem, reclaimLabel: string) => {
    dialogs.confirm({
      title: `${reclaimLabel}?`,
      // The exact argv, verbatim — never a paraphrase — so the user is never
      // surprised by what literally runs.
      body: `${reclaimLabel} for ${item.label}.`,
      confirmLabel: reclaimLabel,
      danger: true,
      // No blastRadius: the command decides what it removes and this app
      // cannot count it in advance — inventing a number here would be the
      // one dishonest confirm in the app.
      blastRadius: null,
      // A third way out: the plain trash-delete stays available as the
      // confirm's secondary, beside the reclaim command as the default.
      secondaryLabel: 'Move to Trash instead',
      onSecondary: () => trashEntry(item),
      onConfirm: () => {
        void (async () => {
          const outcome = await runSystemReclaim(item.entryId);
          if (outcome.ok) {
            useToastStore.getState().addToast({
              message: firstNonEmptyLine(outcome.stdout) || `${reclaimLabel} finished.`,
              status: 'info',
            });
            void runSystemScan();
          }
          // A failure is already toasted by `runSystemReclaim` itself.
        })();
      },
    });
  };

  const cleanEntry = (item: SystemCacheItem) => {
    const reclaimLabel = RECLAIM_LABELS[item.entryId];
    if (reclaimLabel) reclaimEntry(item, reclaimLabel);
    else trashEntry(item);
  };

  const { state, progress, result, message } = systemScan;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-3">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <LuHardDrive aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Outside any repo Midnite manages — your Cargo, Gradle, Homebrew, and other tool caches.
        </p>
      </div>

      {state === 'idle' ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-xs text-muted-foreground">
            Scan your system caches to see what&rsquo;s reclaimable outside your repos.
          </p>
          <button
            type="button"
            onClick={() => void runSystemScan()}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Scan system caches
          </button>
        </div>
      ) : state === 'scanning' ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <CircularGauge percent={progress} label="Checking your tool caches…" />
        </div>
      ) : state === 'error' ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : result && result.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None of the caches Midnite knows about are present on this machine.
        </p>
      ) : result ? (
        <>
          {result.approximate ? (
            <p className="text-xs text-muted-foreground">
              One or more caches were too large to measure completely; the figures below are
              minimums.
            </p>
          ) : null}
          <ul className="space-y-1">
            {result.items.map((item) => (
              <li
                key={item.entryId}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{item.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {item.producer}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.approximate ? 'at least ' : ''}
                  {formatBytes(item.bytes)}
                </span>
                <button
                  type="button"
                  onClick={() => cleanEntry(item)}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {RECLAIM_LABELS[item.entryId] ?? 'Move to Trash'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
