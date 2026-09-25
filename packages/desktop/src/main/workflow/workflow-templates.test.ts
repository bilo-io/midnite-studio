import { beforeEach, describe, expect, it } from 'vitest';

import {
  WORKFLOW_TEMPLATES,
  instantiateWorkflowTemplateWorkflow,
  type WorkflowRun,
} from '@midnite/studio-shared';

import type { ExecutorRegistry, NodeExecutor } from './executor-registry';
import { createGateExecutor } from './executors/gate';
import { stateExecutor } from './executors/state';
import { resetGateWaitersForTests } from './gate-waiters';
import { decideWorkflowGate, startWorkflowRun, type EngineDeps } from './workflow-engine';

/**
 * Every built-in template runs to completion in the engine (Phase 97 Theme
 * L) against fake executors: each verify passes, each router takes its first
 * case, every other kind succeeds, and any gate reached is approved through
 * the real gate path.
 */

function makeStore() {
  const runs = new Map<string, WorkflowRun>();
  return {
    get: (id: string) => runs.get(id),
    saveRun: async (run: WorkflowRun) => {
      runs.set(run.id, structuredClone(run));
    },
    getRun: async (runId: string) => {
      const run = runs.get(runId);
      return run ? structuredClone(run) : null;
    },
  };
}

function happyPathRegistry(): ExecutorRegistry {
  const ok: NodeExecutor = async (node) => ({ ok: true, output: { id: node.id } });
  return {
    http: ok,
    transform: ok,
    condition: async (node) => ({ ok: true, output: { id: node.id }, port: 'true' }),
    delay: ok,
    note: ok,
    agent: ok,
    script: ok,
    join: ok,
    gate: createGateExecutor(),
    router: async (node) => ({
      ok: true,
      output: { id: node.id },
      port: node.kind === 'router' ? (node.config.cases[0]?.id ?? 'default') : 'default',
    }),
    verify: async (node) => ({ ok: true, output: { id: node.id }, port: 'pass' }),
    trigger: ok,
    state: stateExecutor,
    frame: ok,
    policy: ok,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 1));
}

beforeEach(() => {
  resetGateWaitersForTests();
});

describe.each(WORKFLOW_TEMPLATES.map((template) => [template.id, template] as const))(
  'template %s in the engine',
  (_id, template) => {
    it('runs to completion on the happy path', async () => {
      const store = makeStore();
      const deps: EngineDeps = {
        saveRun: store.saveRun,
        getRun: store.getRun,
        emitChanged: () => {},
        executors: happyPathRegistry(),
      };

      const started = await startWorkflowRun(instantiateWorkflowTemplateWorkflow(template, 1), deps);
      expect(started.ok).toBe(true);
      const runId = started.ok ? started.value.id : '';

      for (let round = 0; round < 10; round += 1) {
        await settle();
        const run = store.get(runId)!;
        if (run.status !== 'running') break;
        const waiting = run.nodes.filter((node) => node.status === 'waiting');
        for (const node of waiting) {
          const decided = await decideWorkflowGate(runId, node.nodeId, 'approved', undefined, 'panel', deps);
          expect(decided.ok).toBe(true);
        }
      }

      const run = store.get(runId)!;
      expect(run.status).toBe('completed');
      expect(run.nodes.some((node) => node.status === 'failed')).toBe(false);
    });
  },
);
