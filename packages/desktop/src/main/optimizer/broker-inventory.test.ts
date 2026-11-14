import { describe, expect, it } from 'vitest';

import { descendantsOf, type ProcessRow } from '../agent-process';
import {
  brokerArgvSocket,
  classifyBrokers,
  stampLostProcesses,
  type ClassifyBrokersInput,
} from './broker-inventory';

const DIR = '/Users/me/Library/Application Support/Midnite Studio/broker';
const PRIMARY = `${DIR}/0.4.0-cafe0001.sock`;
const OLD = `${DIR}/0.3.9-dead0002.sock`;
const ELECTRON = '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio';
const SCRIPT = '/Applications/Midnite Studio.app/Contents/Resources/app.asar.unpacked/dist/broker.js';

const brokerArgs = (socket: string) =>
  `${ELECTRON} ${SCRIPT} --socket ${socket} --user-data ${DIR.replace('/broker', '')} --version 0.4.0 --build-id x`;

const row = (pid: number, ppid: number, args: string): ProcessRow => ({
  pid,
  ppid,
  stat: 'S',
  rssBytes: pid * 1000,
  cpuPercent: 0,
  args,
});

const rows: ProcessRow[] = [
  row(100, 1, brokerArgs(PRIMARY)),
  row(101, 100, '/bin/zsh -l'),
  row(200, 1, brokerArgs(OLD)), // previous build, reachable
  row(201, 200, '/bin/zsh -l'),
  row(202, 201, 'claude'),
  row(300, 1, brokerArgs(PRIMARY)), // retired off the primary path, unreachable
  row(301, 300, '/bin/zsh -l'),
  row(400, 1, '/usr/bin/some-daemon'),
];

const base = (over: Partial<ClassifyBrokersInput> = {}): ClassifyBrokersInput => ({
  brokerDir: DIR,
  primarySocket: PRIMARY,
  pidFiles: [
    { socketName: '0.4.0-cafe0001.sock', pid: 100 },
    { socketName: '0.3.9-dead0002.sock', pid: 200 },
    { socketName: '0.4.0-cafe0001-retired-300.sock', pid: 300 },
  ],
  socketNames: new Set(['0.4.0-cafe0001.sock', '0.3.9-dead0002.sock']),
  rows,
  connectedPeers: [PRIMARY, OLD],
  sessionRows: new Set(['s-101', 's-201']),
  brokerSessions: [
    { pid: 101, sessionId: 's-101', owner: 'studio', cwd: '/r/a' },
    { pid: 201, sessionId: 's-201', owner: null, cwd: '/r/b' },
  ],
  ...over,
});

const reasonOf = (input: ClassifyBrokersInput) =>
  Object.fromEntries(classifyBrokers(input).brokers.map((b) => [b.pid, b.primary ? 'primary' : b.lost]));

describe('brokerArgvSocket', () => {
  it('reads the socket out of a broker argv, spaces in the path included', () => {
    expect(brokerArgvSocket(brokerArgs(OLD))).toBe(OLD);
    expect(brokerArgvSocket('/bin/zsh -l')).toBeNull();
  });
});

describe('classifyBrokers', () => {
  it('names the primary, a previous build and an unreachable retired broker', () => {
    expect(reasonOf(base())).toEqual({ 100: 'primary', 200: 'previous-build', 300: 'unreachable' });
    expect(classifyBrokers(base()).primaryPid).toBe(100);
  });

  it('never marks the primary lost, even when the client is not connected to it', () => {
    expect(reasonOf(base({ connectedPeers: [], socketNames: new Set() }))[100]).toBe('primary');
  });

  it('reads a broker as unreachable when its socket file is gone', () => {
    const socketNames = new Set(['0.4.0-cafe0001.sock']);
    expect(reasonOf(base({ socketNames }))[200]).toBe('unreachable');
  });

  it('reads a broker as unreachable when the client has no peer for it', () => {
    expect(reasonOf(base({ connectedPeers: [PRIMARY] }))[200]).toBe('unreachable');
  });

  it('ignores a pid file whose pid is dead (absent from ps)', () => {
    const pidFiles = [...base().pidFiles, { socketName: '0.1.0-0000aaaa.sock', pid: 999 }];
    expect(Object.keys(reasonOf(base({ pidFiles })))).not.toContain('999');
  });

  it('ignores a pid file whose pid now runs something else (recycled)', () => {
    const pidFiles = [...base().pidFiles, { socketName: '0.1.0-0000aaaa.sock', pid: 400 }];
    expect(Object.keys(reasonOf(base({ pidFiles })))).not.toContain('400');
  });

  it('does not claim a broker whose --socket points at another directory', () => {
    const foreign = row(500, 1, brokerArgs('/Users/me/Library/Application Support/Other App/broker/1.0-x.sock'));
    const pidFiles = [...base().pidFiles, { socketName: '1.0-x.sock', pid: 500 }];
    expect(Object.keys(reasonOf(base({ rows: [...rows, foreign], pidFiles })))).not.toContain('500');
  });

  it('finds a broker by argv alone when its pid file is gone', () => {
    const pidFiles = base().pidFiles.filter((f) => f.pid !== 200);
    expect(reasonOf(base({ pidFiles }))[200]).toBe('previous-build');
  });

  it('keeps a broker on the primary path protected unless it visibly retired', () => {
    // No pid file at all for 300: argv alone says primary path, so it is treated as the primary.
    const pidFiles = base().pidFiles.filter((f) => f.pid !== 300);
    expect(reasonOf(base({ pidFiles }))[300]).toBe('primary');
  });

  it('flags a studio pty with no terminals.json row under a reachable broker as no-row', () => {
    const inventory = classifyBrokers(base({ sessionRows: new Set(['s-101']) }));
    expect(inventory.noRowPtys).toEqual([{ pid: 201, brokerPid: 200 }]);
  });

  it('skips no-row when the rows could not be read, and never flags another app’s session', () => {
    expect(classifyBrokers(base({ sessionRows: null })).noRowPtys).toEqual([]);
    const inventory = classifyBrokers(
      base({
        sessionRows: new Set(),
        brokerSessions: [{ pid: 201, sessionId: 's-201', owner: 'agents', cwd: '/r/b' }],
      }),
    );
    expect(inventory.noRowPtys).toEqual([]);
    expect(inventory.foreignSessionPids).toEqual([201]);
  });
});

describe('stampLostProcesses', () => {
  it('stamps each lost tree, widens ours to non-primary brokers and leaves the primary alone', () => {
    const procs = rows.map((r) => ({ pid: r.pid, ours: r.pid === 101, owner: null as string | null }));
    stampLostProcesses(procs, rows, classifyBrokers(base()), descendantsOf);
    const by = Object.fromEntries(procs.map((p) => [p.pid, p]));

    expect(by[100]).toMatchObject({ ours: false, lost: null, brokerPid: 100 });
    expect(by[101]).toMatchObject({ ours: true, lost: null, brokerPid: 100 });
    for (const pid of [200, 201, 202]) expect(by[pid]).toMatchObject({ ours: true, lost: 'previous-build', brokerPid: 200 });
    for (const pid of [300, 301]) expect(by[pid]).toMatchObject({ ours: true, lost: 'unreachable', brokerPid: 300 });
    expect(by[400]).toMatchObject({ ours: false, lost: null, brokerPid: null });
  });

  it('never marks another app’s session ours', () => {
    const inventory = classifyBrokers(
      base({ brokerSessions: [{ pid: 201, sessionId: 's-201', owner: 'agents', cwd: '/r/b' }] }),
    );
    const procs = rows.map((r) => ({ pid: r.pid, ours: false, owner: null as string | null }));
    stampLostProcesses(procs, rows, inventory, descendantsOf);
    expect(procs.find((p) => p.pid === 202)?.ours).toBe(false);
    expect(procs.find((p) => p.pid === 200)?.ours).toBe(true);
  });
});
