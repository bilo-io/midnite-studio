import { describe, expect, it } from 'vitest';
import type { ProcessMetric } from 'electron';

import type { ProcessRow } from '../agent-process';
import {
  commandName,
  mergeAppMetrics,
  propagateOwnerToDescendants,
} from './app-metrics';

describe('commandName', () => {
  it('extracts basename of the command', () => {
    expect(commandName('/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio')).toBe('Midnite');
    expect(commandName('/usr/sbin/syslogd -s')).toBe('syslogd');
    expect(commandName('node index.js')).toBe('node');
    expect(commandName('')).toBe('');
  });
});

describe('mergeAppMetrics', () => {
  const sampleRows: ProcessRow[] = [
    { pid: 1, ppid: 0, stat: 'Ss', rssBytes: 20_000, cpuPercent: 0.1, args: '/sbin/launchd' },
    { pid: 100, ppid: 1, stat: 'S', rssBytes: 150_000, cpuPercent: 1.2, args: '/Applications/Midnite Studio' },
    { pid: 101, ppid: 100, stat: 'S', rssBytes: 80_000, cpuPercent: 3.5, args: '/Applications/Midnite Helper (Renderer)' },
    { pid: 200, ppid: 1, stat: 'S', rssBytes: 10_000, cpuPercent: 0.0, args: '/bin/zsh' },
    { pid: 201, ppid: 200, stat: 'S+', rssBytes: 90_000, cpuPercent: 12.0, args: 'node agent.js' },
    { pid: 300, ppid: 1, stat: 'S', rssBytes: 50_000, cpuPercent: 0.5, args: '/Applications/Other.app/Other' },
  ];

  const sampleMetrics: ProcessMetric[] = [
    {
      pid: 100,
      type: 'Browser',
      cpu: { percentCPUUsage: 0.4, idleWakeupsPerSecond: 0 },
      creationTime: 12345,
      memory: { workingSetSize: 0, peakWorkingSetSize: 0 },
    },
    {
      pid: 101,
      type: 'Tab',
      cpu: { percentCPUUsage: 5.8, idleWakeupsPerSecond: 0 },
      creationTime: 12346,
      memory: { workingSetSize: 0, peakWorkingSetSize: 0 },
    },
    {
      pid: 102,
      type: 'Utility',
      serviceName: 'Audio Service',
      cpu: { percentCPUUsage: 0.2, idleWakeupsPerSecond: 0 },
      creationTime: 12347,
      memory: { workingSetSize: 0, peakWorkingSetSize: 0 },
    },
  ];

  it('prefers Electron CPU percentage for pids in metrics while keeping ps RSS', () => {
    const result = mergeAppMetrics(sampleRows, sampleMetrics, { midnitePid: 100 });

    const mainProc = result.find((p) => p.pid === 100);
    expect(mainProc).toBeDefined();
    expect(mainProc?.cpuPercent).toBe(0.4); // Electron reported 0.4, ps had 1.2
    expect(mainProc?.rssBytes).toBe(150_000); // ps RSS preserved
    expect(mainProc?.ours).toBe(true);

    const helperProc = result.find((p) => p.pid === 101);
    expect(helperProc).toBeDefined();
    expect(helperProc?.cpuPercent).toBe(5.8); // Electron reported 5.8, ps had 3.5
    expect(helperProc?.rssBytes).toBe(80_000); // ps RSS preserved
    expect(helperProc?.ours).toBe(true);
  });

  it('sets ours: true for every pid in the metrics array', () => {
    const result = mergeAppMetrics(sampleRows, sampleMetrics, { midnitePid: 100 });

    for (const metric of sampleMetrics) {
      const proc = result.find((p) => p.pid === metric.pid);
      expect(proc?.ours).toBe(true);
    }
  });

  it('retains ps CPU and computes ownership for processes not in metrics', () => {
    const result = mergeAppMetrics(sampleRows, sampleMetrics, {
      midnitePid: 100,
      ptyPids: [200],
    });

    const launchd = result.find((p) => p.pid === 1);
    expect(launchd?.cpuPercent).toBe(0.1);
    expect(launchd?.rssBytes).toBe(20_000);
    expect(launchd?.ours).toBe(false);

    const other = result.find((p) => p.pid === 300);
    expect(other?.cpuPercent).toBe(0.5);
    expect(other?.ours).toBe(false);

    const ptyRoot = result.find((p) => p.pid === 200);
    expect(ptyRoot?.ours).toBe(true);

    const ptyChild = result.find((p) => p.pid === 201);
    expect(ptyChild?.ours).toBe(true);
  });

  it('includes processes reported by Electron that ps missed (with rssBytes: null)', () => {
    const result = mergeAppMetrics(sampleRows, sampleMetrics, { midnitePid: 100 });

    const utilityProc = result.find((p) => p.pid === 102);
    expect(utilityProc).toBeDefined();
    expect(utilityProc?.pid).toBe(102);
    expect(utilityProc?.rssBytes).toBeNull();
    expect(utilityProc?.cpuPercent).toBe(0.2);
    expect(utilityProc?.ours).toBe(true);
    expect(utilityProc?.owner).toBe('Audio Service');
  });

  it('assigns owners from owner map and falls back to metric serviceName / type', () => {
    const owners = new Map<number, string>([
      [100, 'Main window'],
      [101, 'Tab: GitHub'],
      [200, 'Terminal: session-1'],
    ]);

    const result = mergeAppMetrics(sampleRows, sampleMetrics, {
      midnitePid: 100,
      ptyPids: [200],
      owners,
    });

    expect(result.find((p) => p.pid === 100)?.owner).toBe('Main window');
    expect(result.find((p) => p.pid === 101)?.owner).toBe('Tab: GitHub');
    expect(result.find((p) => p.pid === 102)?.owner).toBe('Audio Service');
    expect(result.find((p) => p.pid === 200)?.owner).toBe('Terminal: session-1');
    expect(result.find((p) => p.pid === 300)?.owner).toBeNull();
  });
});

describe('propagateOwnerToDescendants', () => {
  it('propagates root pty owner label to child agent processes', () => {
    const rows: ProcessRow[] = [
      { pid: 2000, ppid: 1, stat: 'S', rssBytes: 1000, cpuPercent: 0, args: '/bin/zsh' },
      { pid: 2001, ppid: 2000, stat: 'S', rssBytes: 2000, cpuPercent: 0, args: 'python agent.py' },
      { pid: 2002, ppid: 2001, stat: 'S', rssBytes: 3000, cpuPercent: 0, args: 'git status' },
      { pid: 3000, ppid: 1, stat: 'S', rssBytes: 4000, cpuPercent: 0, args: 'unrelated' },
    ];

    const rootOwners = new Map<number, string>([[2000, 'Terminal: sess-abc']]);
    const fullOwners = propagateOwnerToDescendants(rows, rootOwners);

    expect(fullOwners.get(2000)).toBe('Terminal: sess-abc');
    expect(fullOwners.get(2001)).toBe('Terminal: sess-abc');
    expect(fullOwners.get(2002)).toBe('Terminal: sess-abc');
    expect(fullOwners.get(3000)).toBeUndefined();
  });
});
