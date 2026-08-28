import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createBrokerServer, type SpawnPtyFn } from './server';

// Ensure this process is running as a Node process
if (!process.env['ELECTRON_RUN_AS_NODE']) {
  process.env['ELECTRON_RUN_AS_NODE'] = '1';
}

function parseArgs(args: string[]): {
  socketPath: string | null;
  userDataDir: string | null;
  appVersion: string;
} {
  let socketPath: string | null = null;
  let userDataDir: string | null = null;
  let appVersion = '0.0.0';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--socket' && i + 1 < args.length) {
      socketPath = args[++i] ?? null;
    } else if (arg === '--user-data' && i + 1 < args.length) {
      userDataDir = args[++i] ?? null;
    } else if (arg === '--version' && i + 1 < args.length) {
      appVersion = args[++i] ?? '0.0.0';
    }
  }

  return { socketPath, userDataDir, appVersion };
}

const { socketPath, userDataDir, appVersion } = parseArgs(process.argv.slice(2));

if (!socketPath || !userDataDir) {
  // eslint-disable-next-line no-console
  console.error('[broker] fatal: --socket and --user-data arguments are required');
  process.exit(1);
}

// Load node-pty native module
let nodePtyModule: typeof import('node-pty');
try {
  const unpackedNodePty = join(__dirname, '..', '..', 'app.asar.unpacked', 'node_modules', 'node-pty');
  if (existsSync(unpackedNodePty)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodePtyModule = require(unpackedNodePty) as typeof import('node-pty');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodePtyModule = require('node-pty') as typeof import('node-pty');
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[broker] fatal: failed to load node-pty:', err);
  process.exit(3);
}

const spawnPty: SpawnPtyFn = (file, args, options) => {
  return nodePtyModule.spawn(file, args, options);
};

const broker = createBrokerServer({
  socketPath,
  userDataDir,
  appVersion,
  spawnPty,
  // eslint-disable-next-line no-console
  log: (msg) => console.log(msg),
});

process.on('SIGTERM', () => {
  void broker.close().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  void broker.close().then(() => process.exit(0));
});

void broker.closed.then(() => {
  process.exit(0);
});
