import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NODE_PROJECTS, projectDir } from './gate-projects-check.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscBin = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * @typedef {{ id: string, configPath: string }} TypecheckTarget
 */

/**
 * Builds the list of typecheck targets from project ids.
 *
 * @param {string[]} nodeProjects
 * @param {(id: string) => string} getProjectDir
 * @param {string} root
 * @returns {TypecheckTarget[]}
 */
export function buildTypecheckTargets(nodeProjects, getProjectDir, root = repoRoot) {
  return nodeProjects.map((id) => ({
    id,
    configPath: path.join(root, getProjectDir(id), 'tsconfig.json'),
  }));
}

/**
 * Runs a single tsc --noEmit invocation.
 *
 * @param {TypecheckTarget} target
 * @returns {Promise<{ ok: boolean, id: string, output: string }>}
 */
function runTsc(target) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tscBin, '--noEmit', '-p', target.configPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      const output = (stdout + stderr).trim();
      resolve({
        ok: code === 0,
        id: target.id,
        output,
      });
    });
  });
}

/**
 * Runs tasks through a worker pool with bounded concurrency.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = items[index++];
      const res = await worker(current);
      results.push(res);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

export async function main() {
  const targets = buildTypecheckTargets(NODE_PROJECTS, projectDir, repoRoot);

  const missing = targets.filter((t) => !existsSync(t.configPath));
  if (missing.length > 0) {
    console.error(
      `typecheck-node FAILED: missing tsconfig.json for: ${missing.map((m) => m.id).join(', ')}`,
    );
    process.exit(1);
  }

  // Ensure shared emits declaration types for projects referencing it (e.g. db-engine, knowledge)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tscBin, '-b', path.join(repoRoot, 'packages', 'shared')], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to build packages/shared (exit code ${code})`));
    });
  });

  const concurrency = Math.max(1, Math.min(availableParallelism(), 8));
  const startTime = Date.now();

  const results = await runWithConcurrency(targets, concurrency, runTsc);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\ntypecheck-node FAILED: ${failed.length} of ${targets.length} projects failed typecheck:\n`);
    for (const f of failed) {
      console.error(`=== ${f.id} ===`);
      console.error(f.output);
      console.error('');
    }
    process.exit(1);
  }

  console.log(`typecheck-node OK: all ${targets.length} node-portable packages passed typecheck (${elapsed}s, concurrency ${concurrency}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`typecheck-node crashed: ${err.message}`);
    process.exit(1);
  });
}
