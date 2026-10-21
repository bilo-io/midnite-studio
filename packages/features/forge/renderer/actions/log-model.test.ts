import { isLogGapMarker, logGapMarker } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  foldGroups,
  groupCount,
  jobLogFor,
  parseRunLogLines,
  visibleRows,
  type LogNode,
} from './log-model';

/** A real `gh run view --log` row: job, step, stamped message. */
const row = (job: string, step: string, text: string) =>
  `${job}\t${step}\t2026-08-26T04:20:39.7297973Z ${text}`;

describe('parseRunLogLines', () => {
  it('splits a run into its jobs and strips the runner stamp', () => {
    const model = parseRunLogLines([
      row('build', 'Set up job', 'starting'),
      row('test / node-22', 'Run tests', 'ok'),
      row('build', 'Complete job', 'done'),
    ]);

    expect(model.jobs.map((job) => job.job)).toEqual(['build', 'test / node-22']);
    expect(model.jobs[0]?.nodes).toEqual([
      { kind: 'line', text: 'starting' },
      { kind: 'line', text: 'done' },
    ]);
  });

  it('splits on the first two tabs only', () => {
    // A step name — or a message — can contain tabs. `vitest` prints tabbed
    // tables constantly, and splitting on every tab would scatter one line
    // across fields that do not exist.
    const model = parseRunLogLines([row('build', 'Run tests', 'name\tstatus\ttime')]);
    expect(model.jobs[0]?.nodes[0]).toEqual({ kind: 'line', text: 'name\tstatus\ttime' });
  });

  it('keeps a line that carries no job prefix', () => {
    // This is what "gh printed a message where the payload should be" looks
    // like. Discarding it leaves an empty pane that explains nothing.
    const model = parseRunLogLines(['could not fetch logs for 30 jobs']);
    expect(model.jobs).toEqual([]);
    expect(model.preamble).toEqual([{ kind: 'line', text: 'could not fetch logs for 30 jobs' }]);
  });

  it('reads an empty log as empty, not as an error', () => {
    expect(parseRunLogLines([])).toEqual({ jobs: [], preamble: [] });
  });

  it('leaves a message with no timestamp alone', () => {
    expect(parseRunLogLines(['a\tb\tno stamp here']).jobs[0]?.nodes[0]).toEqual({
      kind: 'line',
      text: 'no stamp here',
    });
  });

  it('finds a job by the only name the log carries', () => {
    // The API's numeric job id appears nowhere in the log, so the name is the
    // join key whether we like it or not.
    const model = parseRunLogLines([row('test (ubuntu, 22)', 'Run', 'x')]);
    expect(jobLogFor(model, 'test (ubuntu, 22)')?.lineCount).toBe(1);
    expect(jobLogFor(model, 'nope')).toBeNull();
  });
});

describe('foldGroups', () => {
  it('folds the documented ::group:: form', () => {
    expect(foldGroups(['before', '::group::Install', 'a', 'b', '::endgroup::', 'after'])).toEqual([
      { kind: 'line', text: 'before' },
      { kind: 'group', label: 'Install', lines: ['a', 'b'] },
      { kind: 'line', text: 'after' },
    ]);
  });

  it('folds the runner’s own ##[group] form', () => {
    // The first two hundred lines of every log use this one, so handling only
    // the documented syntax would leave the noisiest part unfoldable.
    expect(foldGroups(['##[group]Runner Image', 'x', '##[endgroup]'])).toEqual([
      { kind: 'group', label: 'Runner Image', lines: ['x'] },
    ]);
  });

  it('keeps an unterminated group, with what it managed to say', () => {
    // A job killed mid-step leaves exactly this, and those lines are its last
    // words — the most valuable ones in the file.
    expect(foldGroups(['::group::Run tests', 'assert failed'])).toEqual([
      { kind: 'group', label: 'Run tests', lines: ['assert failed'] },
    ]);
  });

  it('closes an open group when a second one opens', () => {
    const nodes = foldGroups(['::group::One', 'a', '::group::Two', 'b']);
    expect(nodes).toEqual([
      { kind: 'group', label: 'One', lines: ['a'] },
      { kind: 'group', label: 'Two', lines: ['b'] },
    ]);
  });

  it('discards a stray endgroup', () => {
    expect(foldGroups(['::endgroup::', 'x'])).toEqual([{ kind: 'line', text: 'x' }]);
  });

  it('names an unlabelled group rather than rendering a blank header', () => {
    expect(foldGroups(['::group::', 'x', '::endgroup::'])).toEqual([
      { kind: 'group', label: 'group', lines: ['x'] },
    ]);
  });
});

describe('visibleRows', () => {
  const nodes: LogNode[] = [
    { kind: 'line', text: 'top' },
    { kind: 'group', label: 'A', lines: ['a1', 'a2'] },
    { kind: 'group', label: 'B', lines: ['b1'] },
    { kind: 'line', text: 'tail' },
  ];

  it('expands every group by default', () => {
    const rows = visibleRows(nodes, new Set());
    expect(rows.map((r) => (r.kind === 'header' ? `[${r.label}]` : r.text))).toEqual([
      'top',
      '[A]',
      'a1',
      'a2',
      '[B]',
      'b1',
      'tail',
    ]);
  });

  it('removes a collapsed group’s lines from the index space entirely', () => {
    // Not hidden at zero height: the virtualiser measures what it is given, and
    // a row present-but-invisible is a measurement that disagrees with the screen.
    const rows = visibleRows(nodes, new Set([0]));
    expect(rows.map((r) => (r.kind === 'header' ? `[${r.label}]` : r.text))).toEqual([
      'top',
      '[A]',
      '[B]',
      'b1',
      'tail',
    ]);
    expect(rows.find((r) => r.kind === 'header' && r.label === 'A')).toMatchObject({ open: false });
  });

  it('collapses by ordinal, so same-named groups fold independently', () => {
    // A job's log routinely contains four groups called "Run actions/checkout@v4".
    const repeated: LogNode[] = [
      { kind: 'group', label: 'Run actions/checkout@v4', lines: ['x'] },
      { kind: 'group', label: 'Run actions/checkout@v4', lines: ['y'] },
    ];
    const rows = visibleRows(repeated, new Set([0]));
    expect(rows.filter((r) => r.kind === 'line').map((r) => (r.kind === 'line' ? r.text : ''))).toEqual([
      'y',
    ]);
  });

  it('reports each group’s hidden line count on its header', () => {
    const header = visibleRows(nodes, new Set([0]))[1];
    expect(header).toMatchObject({ kind: 'header', count: 2 });
  });

  it('gives every row a unique key', () => {
    const keys = visibleRows(nodes, new Set()).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('counts groups for "collapse all"', () => {
    expect(groupCount(nodes)).toBe(2);
    expect(groupCount([{ kind: 'line', text: 'x' }])).toBe(0);
  });
});

describe('the review’s findings, kept fixed', () => {
  /* Byte-for-byte what main splices in — imported, not restated, because the
     writer and the reader sharing one definition is the whole point. */
  const gap = logGapMarker(4_211);

  it('keeps the truncation marker instead of filing it as preamble', () => {
    // It carries no `job<TAB>step<TAB>` prefix, so the un-fixed parser routed
    // it to `preamble`, which nothing renders — a capped log then read as a
    // complete one, which is the one outcome the shape forbids.
    const model = parseRunLogLines([row('build', 'Run', 'head'), gap, row('build', 'Run', 'tail')]);
    expect(model.preamble).toEqual([]);
    expect(model.jobs[0]?.nodes).toEqual([
      { kind: 'line', text: 'head' },
      { kind: 'gap', text: gap },
      { kind: 'line', text: 'tail' },
    ]);
  });

  it('does not let a group opened in the head window swallow the tail', () => {
    // The head window is cut mid-log, so its last `##[group]` has no
    // `##[endgroup]`. Folding the concatenation absorbed every tail line —
    // including the failure — under that dangling header, where "Collapse all
    // groups" then hid it completely.
    const model = parseRunLogLines([
      row('build', 'Run', '##[group]Install'),
      row('build', 'Run', 'npm install'),
      gap,
      row('build', 'Run', 'FAIL the actual failure'),
    ]);

    expect(model.jobs[0]?.nodes).toEqual([
      { kind: 'group', label: 'Install', lines: ['npm install'] },
      { kind: 'gap', text: gap },
      // Outside the group, and therefore not foldable out of existence.
      { kind: 'line', text: 'FAIL the actual failure' },
    ]);
  });

  it('gives a job no gap node when nothing of its output was dropped', () => {
    const model = parseRunLogLines([gap, row('only-in-tail', 'Run', 'x')]);
    expect(model.jobs.map((job) => job.job)).toEqual(['only-in-tail']);
    expect(model.jobs[0]?.nodes.some((node) => node.kind === 'gap')).toBe(true);
  });

  it('renders the gap as a row that folding cannot remove', () => {
    const nodes = [
      { kind: 'group' as const, label: 'A', lines: ['a'] },
      { kind: 'gap' as const, text: gap },
      { kind: 'group' as const, label: 'B', lines: ['b'] },
    ];
    // Every group collapsed, and the marker is still there.
    const rows = visibleRows(nodes, new Set([0, 1]));
    expect(rows.filter((r) => r.kind === 'gap')).toHaveLength(1);
    // And it does not consume a group ordinal, or collapsing would be off by one.
    expect(groupCount(nodes)).toBe(2);
    expect(rows.filter((r) => r.kind === 'line')).toEqual([]);
  });
});

describe('the gap marker contract', () => {
  it('is recognised by the reader, for every count the writer can produce', () => {
    // The writer lives in `packages/desktop`, the reader here. They share one
    // definition in `@midnite/studio-shared` precisely so this cannot drift — and
    // this is the assertion that says so out loud.
    for (const omitted of [0, 1, 999, 4_211, 1_000_000]) {
      expect(isLogGapMarker(logGapMarker(omitted))).toBe(true);
    }
  });

  it('does not mistake an ordinary log line for the marker', () => {
    expect(isLogGapMarker('··· not a marker')).toBe(false);
    expect(isLogGapMarker(`job\tstep\t··· 4 lines omitted ···`)).toBe(false);
    expect(isLogGapMarker('FAIL src/a.test.ts')).toBe(false);
  });
});
