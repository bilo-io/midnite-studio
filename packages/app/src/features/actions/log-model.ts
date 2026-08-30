/**
 * Turning one run's log into something a pane can render.
 *
 * `gh run view --log` returns the whole run as flat lines, each prefixed
 * `job<TAB>step<TAB>timestamp message`. That is three separate facts to
 * recover — which job a line belongs to, which step, and what it actually says
 * — and one fetch that serves every job in the run. Splitting it here rather
 * than fetching per job is the trade the phase made deliberately: one
 * subprocess for the run, and clicking between its jobs is then free.
 *
 * Everything in this file is pure and indexed, because the pane virtualises.
 * A fold that changed a row's *height* would be invisible to the virtualiser's
 * measurement; a fold that changes which rows exist is not, so collapsing is
 * modelled as a different visible-rows array over the same parsed tree.
 */

import { isLogGapMarker } from '@midnite/studio-shared';

/** One entry of a job's log: a plain line, a foldable group, or the splice. */
export type LogNode =
  | { kind: 'line'; text: string }
  | { kind: 'group'; label: string; lines: string[] }
  /** Where a truncated log's middle was removed. Never folded, never hidden. */
  | { kind: 'gap'; text: string };

/** What the virtualiser renders, one element per visible row. */
export type LogRow =
  | { kind: 'line'; key: string; text: string }
  | { kind: 'gap'; key: string; text: string }
  | { kind: 'header'; key: string; label: string; open: boolean; count: number; group: number };

/**
 * The two group syntaxes Actions emits.
 *
 * `::group::` is the documented workflow-command form. `##[group]` is what the
 * runner itself uses for its own setup output — the first two hundred lines of
 * every log — so handling only the documented one would leave the noisiest part
 * of the file unfoldable.
 */
const GROUP_START = /^(?:::group::|##\[group\])(.*)$/;
const GROUP_END = /^(?:::endgroup::|##\[endgroup\])\s*$/;

/** `2026-08-26T04:20:39.7297973Z ` — the runner's per-line stamp. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/;

export type JobLog = {
  /** As the runner names it — `no-response / noResponse` for a matrix leg. */
  job: string;
  nodes: LogNode[];
  lineCount: number;
};

export type RunLogModel = {
  jobs: JobLog[];
  /**
   * Lines that carried no job prefix.
   *
   * Not discarded, because they are how a *failure to produce a log at all*
   * looks: `gh` printing a message where the payload should be. Surfacing them
   * under their own heading beats an empty pane that says nothing.
   */
  preamble: LogNode[];
};

/** Parse a whole run's log into per-job trees. */
export function parseRunLogLines(lines: readonly string[]): RunLogModel {
  /*
    The gap marker is a hard boundary, and folding must not cross it.

    A truncated log is two windows that were never adjacent. The head window is
    cut mid-log, so its last `##[group]` has no `##[endgroup]` — and folding the
    concatenation would absorb every line of the tail into that dangling group,
    filing the failure the log was opened for under the wrong header and hiding
    it entirely behind "Collapse all groups".

    So each window is folded on its own, and the marker survives as a node of
    its own rather than being quietly dropped for having no job prefix.
  */
  const at = lines.findIndex(isLogGapMarker);
  const head = split(at === -1 ? lines : lines.slice(0, at));
  const tail = at === -1 ? emptySplit() : split(lines.slice(at + 1));
  const gap: LogNode | null = at === -1 ? null : { kind: 'gap', text: lines[at] ?? '' };

  // Insertion order, head before tail — the order the runner wrote them, and
  // the closest thing the log has to a chronology.
  const names = [...new Set([...head.byJob.keys(), ...tail.byJob.keys()])];

  return {
    jobs: names.map((job) => {
      const before = head.byJob.get(job) ?? [];
      const after = tail.byJob.get(job) ?? [];
      return {
        job,
        nodes: [
          ...foldGroups(before),
          // Only where something was actually dropped from this job's output.
          ...(gap !== null && (before.length > 0 || after.length > 0) ? [gap] : []),
          ...foldGroups(after),
        ],
        lineCount: before.length + after.length,
      };
    }),
    preamble: foldGroups([...head.loose, ...tail.loose]),
  };
}

type Split = { byJob: Map<string, string[]>; loose: string[] };

const emptySplit = (): Split => ({ byJob: new Map(), loose: [] });

/**
 * Route one window's lines to their jobs.
 *
 * The prefix is split on the first two tabs only. A step name can contain
 * anything — `Run tests (shard 1/4)` — and a message certainly can, so
 * splitting on every tab would scatter a line across fields that do not exist.
 */
function split(lines: readonly string[]): Split {
  const out = emptySplit();

  for (const line of lines) {
    const first = line.indexOf('\t');
    const second = first === -1 ? -1 : line.indexOf('\t', first + 1);
    if (first === -1 || second === -1) {
      out.loose.push(line);
      continue;
    }

    const job = line.slice(0, first);
    const text = line.slice(second + 1).replace(TIMESTAMP, '');
    const existing = out.byJob.get(job);
    if (existing) existing.push(text);
    else out.byJob.set(job, [text]);
  }

  return out;
}

/**
 * Collapse `::group::` … `::endgroup::` spans into single nodes.
 *
 * An unterminated group is kept as a group rather than dropped: a job killed
 * mid-step leaves exactly that, and the lines inside it are the last thing it
 * managed to say. A stray `::endgroup::` with no opener is discarded, since
 * there is nothing for it to close.
 */
export function foldGroups(lines: readonly string[]): LogNode[] {
  const nodes: LogNode[] = [];
  let open: { label: string; lines: string[] } | null = null;

  for (const line of lines) {
    const start = GROUP_START.exec(line);
    if (start !== null) {
      // A group opening inside a group: Actions does not nest, so treat this as
      // the previous one having ended without saying so.
      if (open) nodes.push({ kind: 'group', label: open.label, lines: open.lines });
      open = { label: (start[1] ?? '').trim() || 'group', lines: [] };
      continue;
    }
    if (GROUP_END.test(line)) {
      if (open) nodes.push({ kind: 'group', label: open.label, lines: open.lines });
      open = null;
      continue;
    }
    if (open) open.lines.push(line);
    else nodes.push({ kind: 'line', text: line });
  }

  if (open) nodes.push({ kind: 'group', label: open.label, lines: open.lines });
  return nodes;
}

/**
 * Flatten a tree to the rows currently on screen.
 *
 * One index space for the virtualiser, and a collapsed group genuinely absent
 * from it rather than present at zero height — which is the difference between
 * a measurement the virtualiser can trust and one it silently gets wrong.
 *
 * `collapsed` holds group ordinals rather than labels: a job's log routinely
 * contains four groups called "Run actions/checkout@v4", and keying on the
 * label would fold all four together.
 */
export function visibleRows(nodes: readonly LogNode[], collapsed: ReadonlySet<number>): LogRow[] {
  const rows: LogRow[] = [];
  let group = 0;

  for (const [index, node] of nodes.entries()) {
    if (node.kind === 'line') {
      rows.push({ kind: 'line', key: `l${index}`, text: node.text });
      continue;
    }
    if (node.kind === 'gap') {
      // Always visible. It is the one row whose absence would let a capped log
      // read as a complete one.
      rows.push({ kind: 'gap', key: `x${index}`, text: node.text });
      continue;
    }

    const open = !collapsed.has(group);
    rows.push({
      kind: 'header',
      key: `g${group}`,
      label: node.label,
      open,
      count: node.lines.length,
      group,
    });
    if (open) {
      node.lines.forEach((text, at) => rows.push({ kind: 'line', key: `g${group}:${at}`, text }));
    }
    group += 1;
  }

  return rows;
}

/** How many groups a tree has — what "collapse all" needs to know. */
export const groupCount = (nodes: readonly LogNode[]): number =>
  nodes.reduce((total, node) => total + (node.kind === 'group' ? 1 : 0), 0);

/**
 * The job whose log a user opening a run wants to see.
 *
 * Matched on the runner's job name, which is the only key the log carries — the
 * API's numeric job id appears nowhere in it. Names collide only across matrix
 * legs, and those carry their parameters in the name, so it is unique in
 * practice.
 */
export const jobLogFor = (model: RunLogModel, job: string): JobLog | null =>
  model.jobs.find((entry) => entry.job === job) ?? null;
