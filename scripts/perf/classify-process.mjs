/**
 * Shared process classifier for perf scripts.
 *
 * Classifies an Electron/Chromium subprocess argv into a process kind:
 * - 'broker': midnite pty broker (spawns `broker.js` with no `--type=`)
 * - 'main': Electron main process (no `--type=` and not `broker.js`)
 * - 'renderer': `--type=renderer`
 * - 'gpu': `--type=gpu-process`
 * - `utility:<serviceName>`: `--type=utility` with `--utility-sub-type=` or `--service-name=`
 * - 'other': any remaining `--type=` (e.g. utility with no service name, zygote, etc.)
 */

/**
 * @param {string} args
 * @returns {'main' | 'renderer' | 'gpu' | 'broker' | `utility:${string}` | 'other'}
 */
export function classifyProcess(args) {
  if (!args || typeof args !== 'string') return 'other';

  // The pty broker is an Electron process spawned by main carrying no `--type=`.
  // Checked first so it is never attributed to main.
  if (args.includes('broker.js')) return 'broker';

  const typeMatch = /--type=([\w-]+)/.exec(args);
  if (!typeMatch) return 'main';

  const type = typeMatch[1];
  if (type === 'renderer') return 'renderer';
  if (type === 'gpu-process') return 'gpu';

  // Split catch-all utility processes by sub-type or service-name
  const serviceName =
    /--utility-sub-type=([\w.-]+)/.exec(args)?.[1] ??
    /--service-name=([\w.-]+)/.exec(args)?.[1];

  if (serviceName) return `utility:${serviceName}`;

  return 'other';
}
