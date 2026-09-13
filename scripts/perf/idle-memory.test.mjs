import { describe, expect, it } from 'vitest';
import {
  HEAP_LOG_LINE,
  SETTLE_MS,
  formatIdleTable,
  parseHeapLogLine,
  summarizeIdleSamples,
} from './memory-report.mjs';

describe('SETTLE_MS', () => {
  it('is 15,000ms matching idle-cpu.mjs and Phase 85 Theme D spec', () => {
    expect(SETTLE_MS).toBe(15_000);
  });
});

describe('parseHeapLogLine', () => {
  it('parses a valid [perf] main heap log line', () => {
    const line = '[perf] main heap rss=120 heapUsed=45 heapTotal=60 external=10 arrayBuffers=4';
    const parsed = parseHeapLogLine(line);
    expect(parsed).toEqual({
      process: 'main',
      rssMb: 120,
      heapUsedMb: 45,
      heapTotalMb: 60,
      externalMb: 10,
      arrayBuffersMb: 4,
    });
  });

  it('parses a valid [perf] broker heap log line', () => {
    const line = '  [perf] broker heap rss=35 heapUsed=12 heapTotal=20 external=2 arrayBuffers=1  \n';
    const parsed = parseHeapLogLine(line);
    expect(parsed).toEqual({
      process: 'broker',
      rssMb: 35,
      heapUsedMb: 12,
      heapTotalMb: 20,
      externalMb: 2,
      arrayBuffersMb: 1,
    });
  });

  it('rejects boot marks that match MARK_LINE instead of heap line', () => {
    expect(parseHeapLogLine('[perf] main when-ready 412')).toBeNull();
    expect(parseHeapLogLine('[perf] renderer first-view-rendered 1200')).toBeNull();
  });

  it('rejects unknown processes or invalid formats', () => {
    expect(parseHeapLogLine('[perf] renderer heap rss=50 heapUsed=20 heapTotal=30 external=5 arrayBuffers=1')).toBeNull();
    expect(parseHeapLogLine('DevTools listening on ws://127.0.0.1:12345/devtools')).toBeNull();
    expect(parseHeapLogLine('[perf] main heap invalid')).toBeNull();
    expect(parseHeapLogLine('')).toBeNull();
    expect(parseHeapLogLine(null)).toBeNull();
    expect(parseHeapLogLine(undefined)).toBeNull();
  });
});

describe('summarizeIdleSamples', () => {
  it('handles empty sample array safely', () => {
    const summary = summarizeIdleSamples([]);
    expect(summary.groups).toEqual({});
    expect(summary.total).toEqual({ startKb: 0, endKb: 0, minKb: 0, maxKb: 0, medianKb: 0 });
  });

  it('summarizes per-group statistics and total RSS across multiple samples', () => {
    const samples = [
      {
        t: 0,
        rss: { main: 100, renderer: 200, gpu: 50, broker: 30, other: 10 },
        heap: {
          main: { rssMb: 100, heapUsedMb: 30, heapTotalMb: 40, externalMb: 5, arrayBuffersMb: 1 },
          broker: { rssMb: 30, heapUsedMb: 10, heapTotalMb: 15, externalMb: 1, arrayBuffersMb: 0 },
        },
      },
      {
        t: 60,
        rss: { main: 110, renderer: 210, gpu: 50, broker: 30, other: 10 },
        heap: {
          main: { rssMb: 110, heapUsedMb: 32, heapTotalMb: 45, externalMb: 5, arrayBuffersMb: 1 },
          broker: { rssMb: 30, heapUsedMb: 12, heapTotalMb: 15, externalMb: 1, arrayBuffersMb: 0 },
        },
      },
      {
        t: 120,
        rss: { main: 105, renderer: 205, gpu: 50, broker: 30, other: 10 },
        heap: {
          main: { rssMb: 105, heapUsedMb: 31, heapTotalMb: 42, externalMb: 5, arrayBuffersMb: 1 },
          broker: { rssMb: 30, heapUsedMb: 11, heapTotalMb: 15, externalMb: 1, arrayBuffersMb: 0 },
        },
      },
    ];

    const summary = summarizeIdleSamples(samples);

    // main: [100, 110, 105] -> min: 100, max: 110, median: 105, start: 100, end: 105
    expect(summary.groups.main).toEqual({
      startKb: 100,
      endKb: 105,
      minKb: 100,
      maxKb: 110,
      medianKb: 105,
      heapUsedMb: 31,
      heapTotalMb: 42,
    });

    // broker heap medians: heapUsed [10, 12, 11] -> 11, heapTotal [15, 15, 15] -> 15
    expect(summary.groups.broker.heapUsedMb).toBe(11);
    expect(summary.groups.broker.heapTotalMb).toBe(15);

    // renderer has no V8 heapSampler
    expect(summary.groups.renderer.heapUsedMb).toBeNull();
    expect(summary.groups.renderer.heapTotalMb).toBeNull();

    // totals per sample: 390, 410, 400 -> min: 390, max: 410, median: 400, start: 390, end: 400
    expect(summary.total).toEqual({
      startKb: 390,
      endKb: 400,
      minKb: 390,
      maxKb: 410,
      medianKb: 400,
    });
  });

  it('includes dynamic utility processes in allGroups', () => {
    const samples = [
      {
        t: 0,
        rss: { main: 100, renderer: 200, gpu: 50, broker: 30, other: 10, 'utility:audio': 25 },
        heap: { main: null, broker: null },
      },
    ];

    const summary = summarizeIdleSamples(samples);
    expect(summary.groups['utility:audio']).toBeDefined();
    expect(summary.groups['utility:audio'].medianKb).toBe(25);
  });
});

describe('formatIdleTable', () => {
  it('formats an ASCII table with headers, group rows and total', () => {
    const summary = {
      groups: {
        main: { startKb: 100, endKb: 105, minKb: 100, maxKb: 105, medianKb: 102, heapUsedMb: 30, heapTotalMb: 40 },
        renderer: { startKb: 200, endKb: 200, minKb: 200, maxKb: 200, medianKb: 200, heapUsedMb: null, heapTotalMb: null },
      },
      total: { startKb: 300, endKb: 305, minKb: 300, maxKb: 305, medianKb: 302 },
    };

    const table = formatIdleTable(summary);
    expect(table).toContain('Group');
    expect(table).toContain('Median (KB)');
    expect(table).toContain('V8 HeapUsed');
    expect(table).toContain('main');
    expect(table).toContain('30 MB');
    expect(table).toContain('40 MB');
    expect(table).toContain('renderer');
    expect(table).toContain('TOTAL');
    expect(table).toContain('302');
  });
});
