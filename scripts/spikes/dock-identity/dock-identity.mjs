#!/usr/bin/env node
/**
 * Phase 113 Theme B — Dock identity spike. Builds throwaway prototype bundles
 * from the repo's Electron and measures how each way of giving an app its own
 * Dock icon behaves. Findings: docs/spikes/dock-identity.md.
 *
 *   node scripts/spikes/dock-identity/dock-identity.mjs <outDir> [--idle=10] [--keep]
 *
 * Everything is built under <outDir> (a scratch dir, never /Applications) and
 * every process it starts is quit before exit. Bundles are never committed.
 * macOS only. Writes <outDir>/results.json and <outDir>/observations/*.txt.
 *
 * Mechanisms:
 *   spike1  one runtime process; a stub .app (shell script) forwards over a
 *           Unix socket and the runtime opens the window.
 *   spike2  one process per app: a stub .app with its own Info.plist/icon whose
 *           Contents/Frameworks reuses the runtime's Electron framework, linked
 *           by symlink, APFS clone (cp -c) or hardlink (cp -l).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? '');
if (!args.find((a) => !a.startsWith('--'))) {
  console.error('usage: dock-identity.mjs <outDir> [--idle=10] [--keep]');
  process.exit(2);
}
if (process.platform !== 'darwin') {
  console.error('macOS only');
  process.exit(2);
}
const IDLE_S = Number((args.find((a) => a.startsWith('--idle=')) ?? '--idle=10').slice(7));
const KEEP = args.includes('--keep');
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', ...opts });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

function findElectronApp() {
  const pnpm = path.join(repoRoot, 'node_modules/.pnpm');
  const candidates = [pnpm, path.resolve(repoRoot, '../../node_modules/.pnpm')];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    const d = fs.readdirSync(base).find((n) => /^electron@\d/.test(n));
    if (d) return path.join(base, d, 'node_modules/electron/dist/Electron.app');
  }
  throw new Error('Electron.app not found under node_modules/.pnpm');
}

// ---------- icons: flat colour PNG -> icns via sips (no external assets) ----------
function crc32(buf) {
  let c;
  let crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function png(size, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    // a lighter disc so the icon reads as "an icon", not a swatch
    const dx = x - size / 2;
    const inner = (dx * dx) / (size * size) < 0.09;
    row[1 + x * 3] = inner ? 255 - (255 - r) / 3 : r;
    row[2 + x * 3] = inner ? 255 - (255 - g) / 3 : g;
    row[3 + x * 3] = inner ? 255 - (255 - b) / 3 : b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function makeIcns(file, rgb) {
  const p = `${file}.png`;
  fs.writeFileSync(p, png(512, rgb));
  const r = sh('sips', ['-s', 'format', 'icns', p, '--out', file]);
  if (r.code !== 0) throw new Error(`sips failed: ${r.out}`);
}

// ---------- the apps' main processes (written into the bundles) ----------
const APP_MAIN = `
const { app, BrowserWindow } = require('electron');
const net = require('net');
const cfg = require('./config.json');
const t0 = Number(process.env.MSPIKE_T0 || 0);
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 420, height: 220, x: cfg.x, y: 120, title: cfg.name, show: true });
  const html = '<body style="font:16px system-ui;background:' + cfg.color + ';color:#fff;padding:24px"><h2>' + cfg.name + '</h2><p id=s>connecting to runtime daemon...</p>';
  win.loadURL('data:text/html,' + encodeURIComponent(html));
  win.webContents.on('did-finish-load', () => {
    const c = net.connect(cfg.sock);
    c.on('error', (e) => { win.setTitle(cfg.name + ' - daemon UNREACHABLE ' + e.code); });
    c.on('data', (d) => {
      win.setTitle(cfg.name + ' - daemon ok (' + String(d).trim() + ')');
      c.end();
    });
    c.write(JSON.stringify({ hello: cfg.id, pid: process.pid, readyAt: Date.now(), t0 }) + '\\n');
  });
});
app.on('window-all-closed', () => {});
`;

const RUNTIME_MAIN = `
const { app, BrowserWindow } = require('electron');
const net = require('net');
const fs = require('fs');
const sock = process.env.MSPIKE_SOCK || require('./config.json').sock;
const wins = new Map();
const open = (id) => {
  const w = new BrowserWindow({ width: 420, height: 220, x: id === 'monitor' ? 520 : 60, y: 120, title: id + ' (window inside the runtime process)' });
  w.loadURL('data:text/html,' + encodeURIComponent('<body style="font:16px system-ui;background:#444;color:#fff;padding:24px"><h2>' + id + '</h2><p>hosted by the runtime process, pid ' + process.pid));
  wins.set(id, w);
};
app.whenReady().then(() => {
  try { fs.unlinkSync(sock); } catch {}
  net.createServer((c) => {
    c.on('data', (d) => {
      const m = String(d).trim();
      if (m.startsWith('open ')) open(m.slice(5));
      c.end('runtime pid ' + process.pid + ' opened ' + m.slice(5));
    });
  }).listen(sock);
});
app.on('window-all-closed', () => {});
`;

const STUB_SH = (sockFile, runtimeApp) => `#!/bin/sh
# Spike 1 stub: no Chromium here, only a forwarder to the already-running runtime.
SOCK="$(cat "$(dirname "$0")/../Resources/sock")"
APP="$(basename "$(dirname "$(dirname "$(dirname "$0")")")" .app)"
ID="$(echo "$APP" | tr 'A-Z' 'a-z')"
if ! printf 'open %s\\n' "$ID" | /usr/bin/nc -U "$SOCK" >/dev/null 2>&1; then
  /usr/bin/open -a "${runtimeApp}"
  sleep 2
  printf 'open %s\\n' "$ID" | /usr/bin/nc -U "$SOCK" >/dev/null 2>&1
fi
# stay alive briefly so macOS registers the stub, as a real launcher stub would
sleep "\${MSPIKE_STUB_LIFETIME:-6}"
`;

// ---------- bundle helpers ----------
const PB = '/usr/libexec/PlistBuddy';
function plistSet(plist, key, val) {
  const set = sh(PB, ['-c', `Set :${key} ${val}`, plist]);
  if (set.code !== 0) sh(PB, ['-c', `Add :${key} string ${val}`, plist]);
}
function plistDelete(plist, key) {
  sh(PB, ['-c', `Delete :${key}`, plist]);
}
function stampPlist(plist, { id, name, exe, icon }) {
  plistSet(plist, 'CFBundleIdentifier', id);
  plistSet(plist, 'CFBundleName', name);
  plistSet(plist, 'CFBundleDisplayName', name);
  plistSet(plist, 'CFBundleExecutable', exe);
  plistSet(plist, 'CFBundleIconFile', icon);
}
const du = (p) => Number(sh('du', ['-sk', p]).out.split('\t')[0]) / 1024; // MB, du counts hardlinks once per tree
const dfFreeMB = () => {
  sh('sync', []);
  const out = sh('df', ['-k', outDir]).out.split('\n')[1].split(/\s+/);
  return Number(out[3]) / 1024;
};

function copyTree(src, dst, method) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (method === 'symlink') return fs.symlinkSync(src, dst);
  if (method === 'clone') return execFileSync('cp', ['-cR', src, dst]);
  if (method === 'hardlink') {
    // cp -Rl hardlinks regular files; directories and symlinks are re-created.
    return execFileSync('cp', ['-Rl', src, dst]);
  }
  return execFileSync('cp', ['-R', src, dst]);
}

function buildApp({ dir, name, id, color, x, electronApp, runtimeFrameworks, link, binary, sock }) {
  const app = path.join(dir, `${name}.app`);
  const c = path.join(app, 'Contents');
  fs.mkdirSync(path.join(c, 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(c, 'Resources/app'), { recursive: true });
  fs.mkdirSync(path.join(c, 'Frameworks'));
  const exe = name.replace(/\s/g, '');
  copyTree(path.join(electronApp, 'Contents/MacOS/Electron'), path.join(c, 'MacOS', exe), binary);
  fs.copyFileSync(path.join(electronApp, 'Contents/Info.plist'), path.join(c, 'Info.plist'));
  plistDelete(path.join(c, 'Info.plist'), 'ElectronAsarIntegrity');
  stampPlist(path.join(c, 'Info.plist'), { id, name, exe, icon: 'app.icns' });
  // Resources the framework/main binary expect next to Resources/app
  fs.copyFileSync(
    path.join(dir, `${id.split('.').pop()}.icns`),
    path.join(c, 'Resources/app.icns'),
  );
  for (const f of fs.readdirSync(runtimeFrameworks)) {
    copyTree(path.join(runtimeFrameworks, f), path.join(c, 'Frameworks', f), link);
  }
  fs.writeFileSync(
    path.join(c, 'Resources/app/package.json'),
    JSON.stringify({ name: id, main: 'main.js' }),
  );
  fs.writeFileSync(path.join(c, 'Resources/app/main.js'), APP_MAIN);
  fs.writeFileSync(
    path.join(c, 'Resources/app/config.json'),
    JSON.stringify({ id, name, color, x, sock }),
  );
  return { app, exe };
}

// ---------- process / macOS observation ----------
function psTable() {
  return sh('ps', ['-axo', 'pid=,ppid=,rss=,command='])
    .out.split('\n')
    .map((l) => {
      const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      return m ? { pid: +m[1], ppid: +m[2], rssKB: +m[3], cmd: m[4] } : null;
    })
    .filter(Boolean);
}
function treeFrom(rootPids) {
  const t = psTable();
  const set = new Set(rootPids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of t)
      if (!set.has(p.pid) && set.has(p.ppid)) {
        set.add(p.pid);
        grew = true;
      }
  }
  return t.filter((p) => set.has(p.pid));
}
const rootsUnder = (prefix) =>
  psTable()
    .filter((p) => p.cmd.startsWith(prefix) && !p.cmd.includes('--type='))
    .map((p) => p.pid);
function lsapp(label, bundleIds) {
  const list = sh('lsappinfo', ['list']).out;
  const blocks = list.split(/\n(?=\s*\d+\)\s)/);
  const mine = blocks.filter((b) => bundleIds.some((id) => b.includes(id)));
  const sysevents = sh('osascript', [
    '-e',
    'tell application "System Events" to get name of every process whose background only is false',
  ]).out;
  const text = `## ${label}\n${mine.join('\n')}\n\n# System Events foreground processes\n${sysevents}\n`;
  fs.writeFileSync(path.join(outDir, 'observations', `${label}.txt`), text);
  return {
    registered: mine.map((b) => ({
      name: (b.match(/"([^"]+)"\s*ASN/) ?? b.match(/\)\s+"([^"]+)"/))?.[1],
      bundleID: b.match(/bundleID="([^"]+)"/)?.[1],
      bundlePath: b.match(/bundle path="([^"]+)"/)?.[1],
    })),
    sysevents,
  };
}

async function quitAll(prefix) {
  for (const sig of ['SIGTERM', 'SIGKILL']) {
    for (const p of psTable().filter(
      (x) =>
        x.cmd.includes(prefix) &&
        x.pid !== process.pid &&
        x.pid !== process.ppid &&
        !x.cmd.includes('dock-identity.mjs'),
    )) {
      try {
        process.kill(p.pid, sig);
      } catch {
        /* gone */
      }
    }
    await sleep(800);
  }
}

// ---------- main ----------
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'observations'), { recursive: true });
const SOCK = `/tmp/mds-${process.pid}.sock`; // sun_path is ~104 bytes; scratch paths are longer
const electronApp = findElectronApp();
const results = {
  electron: fs.readFileSync(path.join(electronApp, '../version'), 'utf8').trim(),
  idleSeconds: IDLE_S,
  electronAppMB: du(electronApp),
  spike1: {},
  spike2: [],
  concurrency: null,
};
const COLORS = { cleaner: [20, 184, 166], monitor: [99, 102, 241], runtime: [120, 120, 120] };
for (const [k, v] of Object.entries(COLORS)) makeIcns(path.join(outDir, `${k}.icns`), v);

// runtime.app: the shared base. Spike 2 stubs reuse its Contents/Frameworks.
const rtApp = path.join(outDir, 'runtime', 'Midnite Runtime.app');
fs.mkdirSync(path.dirname(rtApp), { recursive: true });
execFileSync('cp', ['-cR', electronApp, rtApp]);
fs.renameSync(
  path.join(rtApp, 'Contents/MacOS/Electron'),
  path.join(rtApp, 'Contents/MacOS/MidniteRuntime'),
);
plistDelete(path.join(rtApp, 'Contents/Info.plist'), 'ElectronAsarIntegrity');
stampPlist(path.join(rtApp, 'Contents/Info.plist'), {
  id: 'io.bilo.midnite.spike.runtime',
  name: 'Midnite Runtime',
  exe: 'MidniteRuntime',
  icon: 'runtime.icns',
});
fs.copyFileSync(
  path.join(outDir, 'runtime.icns'),
  path.join(rtApp, 'Contents/Resources/runtime.icns'),
);
fs.mkdirSync(path.join(rtApp, 'Contents/Resources/app'), { recursive: true });
fs.writeFileSync(
  path.join(rtApp, 'Contents/Resources/app/package.json'),
  JSON.stringify({ name: 'runtime', main: 'main.js' }),
);
fs.writeFileSync(path.join(rtApp, 'Contents/Resources/app/main.js'), RUNTIME_MAIN);
fs.writeFileSync(
  path.join(rtApp, 'Contents/Resources/app/config.json'),
  JSON.stringify({ sock: SOCK }),
);
results.runtimeMB = du(rtApp);
const rtSign = sh('codesign', ['--force', '--deep', '--sign', '-', rtApp]);
console.log('runtime signed:', rtSign.code, rtSign.out.split('\n').pop());

// the fake runtime daemon for Spike 2: a plain node process on the same socket
const daemonLog = [];
let daemon = null;
function startDaemon() {
  try {
    fs.unlinkSync(SOCK);
  } catch {
    /* none */
  }
  daemon = net
    .createServer((c) => {
      c.on('data', (d) => {
        const m = JSON.parse(String(d));
        daemonLog.push({ ...m, launchMs: m.t0 ? m.readyAt - m.t0 : null });
        c.end(`daemon pid ${process.pid}`);
      });
    })
    .listen(SOCK);
}
const stopDaemon = () => {
  daemon?.close();
  try {
    fs.unlinkSync(SOCK);
  } catch {
    /* none */
  }
};

async function measure(label, prefix, bundleIds) {
  await sleep(IDLE_S * 1000);
  const roots = rootsUnder(prefix);
  const tree = treeFrom(roots);
  const lsa = lsapp(label, bundleIds);
  return {
    rootPids: roots,
    processes: tree.length,
    rssMB: Math.round(tree.reduce((a, p) => a + p.rssKB, 0) / 1024),
    registeredWithMacOS: lsa.registered,
    foregroundProcessesSeenBySystemEvents: lsa.sysevents.slice(0, 400),
  };
}

// ===== Spike 1: stub forwards to a single runtime process =====
{
  const dir = path.join(outDir, 'spike1');
  fs.mkdirSync(dir, { recursive: true });
  const stubs = {};
  for (const [name, id] of [
    ['Cleaner', 'cleaner'],
    ['Monitor', 'monitor'],
  ]) {
    const app = path.join(dir, `${name}.app`);
    fs.mkdirSync(path.join(app, 'Contents/MacOS'), { recursive: true });
    fs.mkdirSync(path.join(app, 'Contents/Resources'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Contents/MacOS', name.toLowerCase()), STUB_SH(SOCK, rtApp), {
      mode: 0o755,
    });
    fs.writeFileSync(path.join(app, 'Contents/Resources/sock'), SOCK);
    fs.copyFileSync(path.join(outDir, `${id}.icns`), path.join(app, 'Contents/Resources/app.icns'));
    fs.writeFileSync(
      path.join(app, 'Contents/Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.bilo.midnite.spike.${id}</string>
<key>CFBundleName</key><string>${name}</string>
<key>CFBundleDisplayName</key><string>${name}</string>
<key>CFBundleExecutable</key><string>${name.toLowerCase()}</string>
<key>CFBundleIconFile</key><string>app.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>`,
    );
    stubs[id] = app;
  }
  results.spike1.stubMB = du(stubs.cleaner);
  results.spike1.signing = signReport(stubs.cleaner);
  const t0 = Date.now();
  spawn('open', ['-a', rtApp], { stdio: 'ignore', env: { ...process.env, MSPIKE_SOCK: SOCK } });
  await sleep(4000);
  // launch both stubs, as a user clicking Cleaner then Monitor in the Dock would
  sh('open', ['-n', stubs.cleaner]);
  await sleep(2500);
  sh('open', ['-n', stubs.monitor]);
  await sleep(2500);
  results.spike1.duringStubs = lsapp('spike1-during-stub-lifetime', ['io.bilo.midnite.spike']);
  await sleep(8000); // stubs exit
  const m = await measure(
    'spike1-after-stubs-exit',
    path.join(rtApp, 'Contents/MacOS/MidniteRuntime'),
    ['io.bilo.midnite.spike'],
  );
  results.spike1.afterStubsExit = m;
  results.spike1.firstWindowMs = null; // runtime start + forward, see launch note in the doc
  results.spike1.startToIdleMs = Date.now() - t0 - IDLE_S * 1000;
  await quitAll(rtApp);
  await quitAll(dir);
}

// ===== Spike 2: one process per app, framework reused =====
function signReport(app) {
  const sign = sh('codesign', ['--force', '--deep', '--sign', '-', app]);
  const verify = sh('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const spctl = sh('spctl', ['--assess', '--type', 'execute', '-vv', app]);
  return {
    sign: { code: sign.code, out: sign.out.slice(0, 600) },
    verify: { code: verify.code, out: verify.out.slice(0, 800) },
    spctl: { code: spctl.code, out: spctl.out.slice(0, 400) },
  };
}
const VARIANTS = [
  { key: 'symlink', link: 'symlink', binary: 'copy' },
  { key: 'clone', link: 'clone', binary: 'clone' },
  { key: 'hardlink', link: 'hardlink', binary: 'hardlink' },
];
startDaemon();
const rtFrameworks = path.join(rtApp, 'Contents/Frameworks');
for (const v of VARIANTS) {
  const dir = path.join(outDir, `spike2-${v.key}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(outDir, 'cleaner.icns'), path.join(dir, 'cleaner.icns'));
  const before = dfFreeMB();
  const built = buildApp({
    dir,
    name: 'Cleaner',
    id: 'io.bilo.midnite.spike.cleaner',
    color: '#0f766e',
    x: 60,
    electronApp,
    runtimeFrameworks: rtFrameworks,
    link: v.link,
    binary: v.binary,
    sock: SOCK,
  });
  const after = dfFreeMB();
  const row = {
    variant: v.key,
    diskDuMB: Math.round(du(built.app)),
    diskDfDeltaMB: Math.round(before - after),
    duFollowsSymlinks: false,
  };
  row.signing = signReport(built.app);
  row.runtimeStillVerifies = sh('codesign', ['--verify', '--deep', '--strict', rtApp]).code === 0;
  const bin = path.join(built.app, 'Contents/MacOS', built.exe);
  daemonLog.length = 0;
  const t0 = Date.now();
  const o = sh('open', ['-n', '-a', built.app, '--env', `MSPIKE_T0=${t0}`]);
  row.launchCmd = o.code === 0 ? 'open -n ok' : o.out;
  await sleep(4000);
  row.daemonSawHello = daemonLog.length > 0;
  row.launchToWindowMs = daemonLog[0]?.launchMs ?? null;
  if (row.daemonSawHello) {
    Object.assign(row, await measure(`spike2-${v.key}`, bin, ['io.bilo.midnite.spike']));
  } else {
    const direct = spawnSync(bin, ['--version'], {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    });
    row.directLaunchLog = `${direct.stdout ?? ''}${direct.stderr ?? ''}`.slice(0, 1500);
    row.directLaunchExit = direct.status ?? `signal ${direct.signal}`;
    await sleep(1000);
    row.daemonSawHelloDirect = daemonLog.length > 0;
  }
  await quitAll(bin);
  await quitAll(dir);
  results.spike2.push(row);
  console.log(
    v.key,
    JSON.stringify({
      ...row,
      signing: undefined,
      registeredWithMacOS: undefined,
      foregroundProcessesSeenBySystemEvents: undefined,
    }),
  );
}

// two apps at once (best working variant) — separate processes, own identities
{
  const ok = results.spike2.find((r) => r.daemonSawHello);
  if (ok) {
    const dir = path.join(outDir, `spike2-${ok.variant}`);
    const v = VARIANTS.find((x) => x.key === ok.variant);
    fs.copyFileSync(path.join(outDir, 'monitor.icns'), path.join(dir, 'monitor.icns'));
    const second = buildApp({
      dir,
      name: 'Monitor',
      id: 'io.bilo.midnite.spike.monitor',
      color: '#4338ca',
      x: 520,
      electronApp,
      runtimeFrameworks: rtFrameworks,
      link: v.link,
      binary: v.binary,
      sock: SOCK,
    });
    sh('codesign', ['--force', '--deep', '--sign', '-', second.app]);
    const cleanerExe = path.join(dir, 'Cleaner.app/Contents/MacOS/Cleaner');
    daemonLog.length = 0;
    sh('open', ['-n', path.join(dir, 'Cleaner.app')]);
    sh('open', ['-n', second.app]);
    await sleep(IDLE_S * 1000);
    const a = rootsUnder(cleanerExe);
    const b = rootsUnder(path.join(second.app, 'Contents/MacOS', second.exe));
    const lsa = lsapp('spike2-two-apps', ['io.bilo.midnite.spike']);
    results.concurrency = {
      variant: ok.variant,
      cleanerPids: a,
      monitorPids: b,
      separateProcesses: a.length === 1 && b.length === 1 && a[0] !== b[0],
      daemonClients: daemonLog.map((d) => d.hello),
      cleanerRssMB: Math.round(treeFrom(a).reduce((s, p) => s + p.rssKB, 0) / 1024),
      monitorRssMB: Math.round(treeFrom(b).reduce((s, p) => s + p.rssKB, 0) / 1024),
      registeredWithMacOS: lsa.registered,
    };
    await quitAll(dir);
  }
}
stopDaemon();
await quitAll(outDir);
fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`results: ${path.join(outDir, 'results.json')}`);
if (!KEEP)
  for (const d of fs.readdirSync(outDir))
    if (/^(spike|runtime)/.test(d))
      fs.rmSync(path.join(outDir, d), { recursive: true, force: true });
