import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MCP_TOOL_IDS,
  MCP_TOOLS,
  type McpToolId,
} from './mcp';

describe('MCP_TOOLS', () => {
  it('derives MCP_TOOL_IDS from the registry, never a hand-maintained list', () => {
    expect(MCP_TOOL_IDS).toEqual(Object.keys(MCP_TOOLS));
  });

  /**
   * Phase 81 Theme F's two `ui.*` write tools plus Phase 97 Theme D's
   * `workflow_gate_decide` are the only `readOnly: false` entries —
   * everything else, including `workflow_gates_list`, stays `true`.
   */
  const writeTools = new Set<McpToolId>([
    'ui.navigate',
    'ui.command',
    'workflow_gate_decide',
    'model_open',
    'model_set_spec',
    'model_patch_parts',
    'model_auto_rig',
    'model_patch_rig',
    'model_patch_animations',
    'model_retarget',
    'model_save',
    'model_generate_sf3d',
  ]);

  it('every entry has the readOnly flag its own kind calls for', () => {
    for (const id of MCP_TOOL_IDS) {
      expect(MCP_TOOLS[id].readOnly, id).toBe(!writeTools.has(id));
    }
  });

  it('every entry’s id matches the key it is registered under', () => {
    for (const id of MCP_TOOL_IDS) {
      expect(MCP_TOOLS[id].id).toBe(id);
    }
  });

  it('every description obeys the stated rule: ≤220 chars, one sentence, names a backticked command', () => {
    for (const id of MCP_TOOL_IDS) {
      const { description } = MCP_TOOLS[id];
      expect(description.length, `${id} description length`).toBeLessThanOrEqual(220);
      expect(description, `${id} description should read as one sentence`).not.toMatch(/\.\s+\S/);
      expect(description, `${id} description should name the command it replaces`).toMatch(/`[^`]+`/);
      expect(description, `${id} description should begin with a verb`).toMatch(/^[A-Z][a-z]+s\b/);
    }
  });

  it('imports nothing but zod and sibling shared modules', () => {
    const here = join(__dirname, 'mcp.ts');
    const source = readFileSync(here, 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)]
      .map((m) => m[1])
      .filter((specifier): specifier is string => typeof specifier === 'string');
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      const isZod = specifier === 'zod';
      const isSibling = specifier.startsWith('./') || specifier.startsWith('../');
      expect(isZod || isSibling, `unexpected import in mcp.ts: ${specifier}`).toBe(true);
    }
  });

  /*
   * A minimal, hand-built value per output schema — not the real fixtures
   * produced by git-engine's commands. `shared` may not import
   * `@midnite/studio-git-engine` (package boundary), so the check that a
   * handler's REAL return value parses is `tools.test.ts` in
   * `packages/desktop/src/main/mcp/` instead; this is the narrower guarantee
   * that each declared output schema can parse *some* well-formed value at
   * all, catching a schema that is accidentally unsatisfiable.
   */
  const minimalFixtures: Record<McpToolId, unknown> = {
    'repo.list': [],
    'repo.resolve': {
      repo: { id: 'repo:/x', path: '/x', name: 'x', headRef: 'main', worktrees: [] },
      branch: 'main',
    },
    'status.get': { branch: { head: 'main', oid: null, upstream: null, ahead: 0, behind: 0, unborn: true, detached: false }, entries: [], inProgress: null },
    'graph.log': [],
    'diff.file': {
      path: 'a.ts',
      oldPath: null,
      change: 'modified',
      binary: false,
      oldMode: null,
      newMode: null,
      hunks: [],
      insertions: 0,
      deletions: 0,
      contextLines: 3,
      truncated: false,
      droppedLines: 0,
    },
    'branch.list': [],
    'forge.pulls': { cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' }, pulls: [], error: null },
    'forge.checks': {
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      runs: [],
      error: null,
      verdict: null,
    },
    'ui.state': {
      activeView: 'graph',
      settingsPage: null,
      detached: [],
      repoPath: null,
      locked: false,
      uiToolsEnabled: false,
    },
    'ui.navigate': { did: 'navigated', view: 'graph' },
    'ui.command': { did: 'ran', label: 'Fetch' },
    workflow_gates_list: [],
    workflow_gate_decide: { decided: true },
    model_list: { projects: [{ name: 'p', models: [{ model: 'a.obj', name: 'a', parts: 2, mtimeMs: 1 }] }] },
    model_open: { opened: true, model: 'a.obj' },
    model_get_spec: { spec: {}, revision: 0, schema: {}, reference: '', limits: { maxParts: 128 } },
    model_set_spec: { ok: false, errors: [{ path: 'parts', message: 'x' }] },
    model_patch_parts: {
      ok: true,
      model: 'a.obj',
      revision: 1,
      partCount: 1,
      parts: [{ id: 'p1', name: 'a', shape: 'box' }],
      bounds: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1] },
    },
    model_render_preview: { _content: [] },
    model_get_reference_image: { _content: [] },
    model_save: { saved: true, files: ['a.obj'] },
    model_sf3d_status: {
      state: 'not-installed',
      installed: false,
      consentCurrent: false,
      licence: { name: 'Stability AI Community License', url: 'https://x', revenueLimitUsd: 1_000_000 },
      downloadBytes: 1,
      bytesOnDisk: 0,
    },
    model_generate_sf3d: { started: true, generationId: 'g1' },
    model_get_rig: { anatomy: 'static', facing: null, falloff: null, bones: [], bindings: [], animations: [], table: [], clipKinds: [], issues: [] },
    model_auto_rig: { ok: false, errors: [{ path: 'anatomy', message: 'x' }] },
    model_patch_rig: { ok: false, errors: [{ path: 'rig', message: 'x' }] },
    model_patch_animations: { ok: false, errors: [{ path: 'animations', message: 'x' }] },
    model_retarget: { ok: false, errors: [{ path: 'from', message: 'x' }] },
  };

  it('every output schema parses a minimal well-formed value', () => {
    for (const id of MCP_TOOL_IDS) {
      const result = MCP_TOOLS[id].output.safeParse(minimalFixtures[id]);
      expect(result.success, `${id} output schema rejected its own minimal fixture`).toBe(true);
    }
  });

  it('every input schema parses a minimal repo-scoped value where applicable', () => {
    const base = { repoPath: '/some/repo' };
    const perTool: Partial<Record<McpToolId, unknown>> = {
      'repo.list': {},
      'diff.file': { ...base, path: 'a.ts' },
      // Not repo-scoped at all (Phase 81 Theme F) — `base`'s `repoPath` would
      // otherwise be silently stripped by `ui.state`'s `z.object({})` and
      // fail `ui.navigate`/`ui.command`'s own required fields outright.
      'ui.state': {},
      'ui.navigate': { view: 'graph' },
      'ui.command': { id: 'sync.fetch' },
      // Workflows are global, not repo-scoped (`workflow.ts`'s own doc
      // comment) — neither gate tool extends `McpRepoTarget`.
      workflow_gates_list: {},
      workflow_gate_decide: { runId: 'r1', nodeId: 'n1', decision: 'approved' },
      model_list: base,
      model_set_spec: { ...base, project: 'p', model: 'a', spec: { parts: [] } },
      model_patch_parts: { ...base, project: 'p', model: 'a.obj', ops: [{ op: 'remove', id: 'p1' }] },
      model_open: { ...base, project: 'p', model: 'a.obj' },
      model_get_spec: { ...base, project: 'p', model: 'a.obj' },
      model_render_preview: { ...base, project: 'p', model: 'a.obj' },
      model_get_reference_image: { ...base, project: 'p', model: 'a.obj' },
      model_save: { ...base, project: 'p', model: 'a.obj' },
      model_sf3d_status: {},
      model_generate_sf3d: { ...base, project: 'p', imagePath: 'mug.png' },
      model_get_rig: { ...base, project: 'p', model: 'a.obj' },
      model_auto_rig: { ...base, project: 'p', model: 'a.obj', anatomy: 'biped' },
      model_patch_rig: { ...base, project: 'p', model: 'a.obj', ops: [{ op: 'falloff', value: 0.5 }] },
      model_patch_animations: { ...base, project: 'p', model: 'a.obj', ops: [{ op: 'remove', name: 'walk' }] },
      model_retarget: { ...base, project: 'p', model: 'a.obj', from: { model: 'b.obj' } },
    };
    for (const id of MCP_TOOL_IDS) {
      const input = perTool[id] ?? base;
      const result = MCP_TOOLS[id].input.safeParse(input);
      expect(result.success, `${id} input schema rejected ${JSON.stringify(input)}`).toBe(true);
    }
  });
});
