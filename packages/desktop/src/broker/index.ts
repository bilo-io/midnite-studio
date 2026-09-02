import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createBrokerServer, type SpawnPtyFn } from './server';
import { createStalenessProbe } from './staleness';

// Ensure this process is running as a Node process
if (!process.env['ELECTRON_RUN_AS_NODE']) {
  process.env['ELECTRON_RUN_AS_NODE'] = '1';
}

function parseArgs(args: string[]): {
  socketPath: string | null;
  userDataDir: string | null;
  appVersion: string;
  buildId: string;
} {
  let socketPath: string | null = null;
  let userDataDir: string | null = null;
  let appVersion = '0.0.0';
  let buildId = 'unknown';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--socket' && i + 1 < args.length) {
      socketPath = args[++i] ?? null;
    } else if (arg === '--user-data' && i + 1 < args.length) {
      userDataDir = args[++i] ?? null;
    } else if (arg === '--version' && i + 1 < args.length) {
      appVersion = args[++i] ?? '0.0.0';
    } else if (arg === '--build-id' && i + 1 < args.length) {
      buildId = args[++i] ?? 'unknown';
    }
  }

  return { socketPath, userDataDir, appVersion, buildId };
}

const { socketPath, userDataDir, appVersion, buildId } = parseArgs(process.argv.slice(2));

if (!socketPath || !userDataDir) {
  // eslint-disable-next-line no-console
  console.error('[broker] fatal: --socket and --user-data arguments are required');
  process.exit(1);
}

// Load node-pty native module
let nodePtyModule: typeof import('node-pty');
let nodePtyDir: string;
try {
  const unpackedNodePty = join(__dirname, '..', '..', 'app.asar.unpacked', 'node_modules', 'node-pty');
  if (existsSync(unpackedNodePty)) {
    nodePtyDir = unpackedNodePty;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodePtyModule = require(unpackedNodePty) as typeof import('node-pty');
  } else {
    nodePtyDir = dirname(require.resolve('node-pty/package.json'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodePtyModule = require('node-pty') as typeof import('node-pty');
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[broker] fatal: failed to load node-pty:', err);
  process.exit(3);
}

/**
 * The executable node-pty will `posix_spawnp` for every shell, resolved the
 * same way node-pty's own `loadNativeModule` resolves `pty.node` — first hit
 * wins — so the probe watches the file that will actually be used. Not on
 * Windows, where there is no helper.
 */
function resolveSpawnHelper(): string | null {
  if (process.platform === 'win32') return null;
  const candidates = ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`];
  for (const dir of candidates) {
    const helper = join(nodePtyDir, dir, 'spawn-helper');
    if (existsSync(helper)) return helper;
  }
  return null;
}

const spawnHelper = resolveSpawnHelper();
const isStale = createStalenessProbe([__filename, ...(spawnHelper ? [spawnHelper] : [])]);

const spawnPty: SpawnPtyFn = (file, args, options) => {
  return nodePtyModule.spawn(file, args, options);
};

const broker = createBrokerServer({
  socketPath,
  userDataDir,
  appVersion,
  buildId,
  isStale,
  spawnPty,
  // eslint-disable-next-line no-console
  log: (msg) => console.log(msg),
});

// eslint-disable-next-line no-console
console.log(`[broker] build ${buildId}; spawn-helper ${spawnHelper ?? '(none)'}`);

process.on('SIGTERM', () => {
  void broker.close().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  void broker.close().then(() => process.exit(0));
});

void broker.closed.then(() => {
  process.exit(0);
});
