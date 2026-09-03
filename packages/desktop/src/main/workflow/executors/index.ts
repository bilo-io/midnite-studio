import type { ExecutorRegistry } from '../executor-registry';
import { conditionExecutor } from './condition';
import { delayExecutor } from './delay';
import { httpExecutor } from './http';
import { noteExecutor } from './note';
import { transformExecutor } from './transform';

/**
 * The default registry — the one place a node kind is bound to its executor.
 *
 * Exhaustive by type: `ExecutorRegistry` is a `Record` over the `kind` union,
 * so adding node #6 to `workflow.ts` fails to compile here until it has an
 * executor. That is the guard the closed union exists for.
 *
 * The engine takes a registry as a parameter rather than importing this, so a
 * test can inject fakes without touching the real HTTP path.
 */
export const defaultExecutors: ExecutorRegistry = {
  http: httpExecutor,
  transform: transformExecutor,
  condition: conditionExecutor,
  delay: delayExecutor,
  note: noteExecutor,
};

export { conditionExecutor, delayExecutor, httpExecutor, noteExecutor, transformExecutor };
