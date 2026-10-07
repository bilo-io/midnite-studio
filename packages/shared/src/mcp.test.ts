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
    'model_convert_to_mesh',
    'model_sdf_set',
    'model_sdf_patch',
    'model_sdf_bake',
    'model_sculpt_stroke',
    'model_mask',
    'model_subdivide',
    'model_remesh',
    'model_sculpt_undo',
    'model_decimate',
    'model_retopo',
    'model_unwrap',
    'model_bake',
    'model_export',
    'model_material_set',
    'model_layer_add',
    'model_layer_update',
    'model_layer_remove',
    'model_set_reference_views',
    'model_paint_stroke',
    'model_save',
    'model_generate_sf3d',
    'game_create',
    'game_open',
    'game_set_manifest',
    'game_run',
    'game_stop',
    'game_reload',
    'game_input',
    'game_import_asset',
    'game_replay_record',
    'game_replay_play',
    'game_assert_state',
    'game_assert_frame',
    'game_playtest',
    'terrain_open',
    'terrain_set_spec',
    'terrain_set_input',
    'terrain_build',
    'terrain_export',
    'sprite_open',
    'sprite_set_spec',
    'sprite_generate',
    'sprite_regenerate_frames',
    'sprite_patch_frames',
    'tileset_generate',
    'background_generate',
    'map_generate',
    'map_patch',
    'sprite_export',
    'sprite_cancel',
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
    model_convert_to_mesh: { ok: false, errors: [{ path: 'parts', message: 'x' }] },
    model_sdf_set: { ok: false, errors: [{ path: 'tree', message: 'x' }] },
    model_sdf_patch: { ok: false, errors: [{ path: 'ops.0', message: 'x' }] },
    model_sdf_bake: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_get_landmarks: { facing: '+z', landmarks: [{ name: 'top_of_head', position: [0, 1, 0], source: 'auto' }] },
    model_sculpt_stroke: { _content: [] },
    model_mask: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_subdivide: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_remesh: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_sculpt_undo: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_decimate: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_retopo: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_unwrap: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_bake: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_export: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_set_reference_views: { ok: false, errors: [{ path: 'views', message: 'x' }] },
    model_compare_reference: { _content: [{ type: 'text', text: '{}' }] },
    model_layer_list: { part: 's1', unwrapped: true, base: { color: '#ffffff', roughness: 0.5, metalness: 0, emissive: '#000000' }, sizes: { albedo: 1024 }, layers: [], bakes: ['curvature'], flattened: {} },
    model_material_set: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_layer_add: { ok: false, errors: [{ path: 'part', message: 'x' }] },
    model_layer_update: { ok: false, errors: [{ path: 'layer', message: 'x' }] },
    model_layer_remove: { ok: false, errors: [{ path: 'layer', message: 'x' }] },
    model_paint_stroke: { _content: [] },
    game_list: { games: [] },
    game_create: { path: '/g/x', gameId: 'g1', warnings: [] },
    game_open: { opened: true, gameId: 'g1' },
    game_get_manifest: { gameId: 'g1', manifest: null, issues: [{ path: '(root)', message: 'x' }] },
    game_set_manifest: { ok: true, gameId: 'g1' },
    game_run: { gameId: 'g1', runId: 'r1' },
    game_stop: { ok: true, gameId: 'g1' },
    game_reload: { ok: true, gameId: 'g1' },
    game_screenshot: { _content: [] },
    game_logs: { entries: [], next: 0 },
    game_input: { sent: 0 },
    game_state: { state: { score: 1 } },
    game_import_asset: { gameId: 'g1', name: 'hero', kind: 'sprite', path: 'assets/sprite/hero', sha256: 'a', commit: null },
    game_replay_record: { gameId: 'g1', recording: false, path: 'playtests/replays/walk.replay.json', frames: 120, events: 2 },
    game_replay_play: { gameId: 'g1', frames: 120, state: { frame: 120 } },
    game_assert_state: { gameId: 'g1', ok: true, status: 'pass', message: '$.scene = "level"' },
    game_assert_frame: { _content: [] },
    game_playtest: { _content: [] },
    terrain_list: { projects: [{ name: 'terrains', terrains: [{ terrain: 'dunes-20261004-120000', name: 'dunes', built: true, resolution: 129, mtimeMs: 1 }] }] },
    terrain_open: { opened: true, terrain: 'dunes-20261004-120000' },
    terrain_get_spec: { spec: {}, built: false, schema: {}, hint: 'x' },
    terrain_set_spec: { ok: false, errors: [{ path: 'resolution', message: 'x' }] },
    terrain_set_input: { slot: 'heightmap', attached: true, width: 8, height: 8, warnings: [] },
    terrain_build: { status: 'needs-height-source', message: 'x' },
    terrain_render_preview: { _content: [] },
    terrain_get_stats: { built: false },
    terrain_export: { path: '/r/x.terrain', bytes: 1 },
    sprite_list: { groups: [{ group: 'characters', assets: [{ asset: 'hero-20261004-120000', name: 'hero', kind: 'sheet', built: false, mtimeMs: 1 }] }] },
    sprite_open: { opened: true, asset: 'hero-20261004-120000' },
    sprite_get_spec: { spec: {}, schema: {}, hint: 'x' },
    sprite_set_spec: { ok: false, errors: [{ path: 'clips', message: 'x' }] },
    sprite_recommend_method: { method: 'hand-drawn', reason: 'x', alternatives: [] },
    sprite_generate: { jobId: 'j1', group: 'characters', asset: 'hero', requests: 24, hint: 'x' },
    sprite_regenerate_frames: { jobId: 'j1', group: 'characters', asset: 'hero', requests: 3, hint: 'x' },
    sprite_patch_frames: { applied: 1 },
    sprite_render_preview: { _content: [] },
    sprite_get_report: { kind: 'sheet', report: null, frames: 0, flagged: [], hint: 'x' },
    sprite_job_status: { jobId: 'j1', state: 'running', done: 1, total: 4 },
    sprite_cancel: { cancelled: true },
    tileset_generate: { jobId: 'j1', group: 'tilesets', asset: 'meadow', requests: 4, hint: 'x' },
    background_generate: { jobId: 'j1', group: 'backgrounds', asset: 'dusk', requests: 8, hint: 'x' },
    map_generate: { jobId: 'j1', group: 'maps', asset: 'isle', requests: 3, hint: 'x' },
    map_get: { mapSpec: null, tileset: null, terrains: [], built: false, orientation: null, width: null, height: null, layers: [] },
    map_patch: { ok: false, errors: [{ path: 'ops[0]', message: 'x' }] },
    sprite_export: { path: '/r/x.sprite', bytes: 1, frames: 1, pages: 1, warnings: [] },
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
      model_convert_to_mesh: { ...base, project: 'p', model: 'a.obj', targetVertices: 5000 },
      model_sdf_set: { ...base, project: 'p', model: 'a.obj', tree: { nodes: [{ kind: 'sphere', name: 'head', radius: 0.4 }] } },
      model_sdf_patch: { ...base, project: 'p', model: 'a.obj', ops: [{ op: 'remove', name: 'nose' }] },
      model_sdf_bake: { ...base, project: 'p', model: 'a.obj', resolution: 128 },
      model_get_landmarks: { ...base, project: 'p', model: 'a.obj' },
      model_sculpt_stroke: { ...base, project: 'p', model: 'a.obj', brush: 'clay', target: { mode: 'screen', view: 'front', points: [[190, 120]] } },
      model_mask: { ...base, project: 'p', model: 'a.obj', op: 'set', region: { bone: 'head' } },
      model_subdivide: { ...base, project: 'p', model: 'a.obj', levels: 1 },
      model_remesh: { ...base, project: 'p', model: 'a.obj', targetVertices: 20000 },
      model_sculpt_undo: { ...base, project: 'p', model: 'a.obj', steps: 2 },
      model_decimate: { ...base, project: 'p', model: 'a.obj', ratio: 0.25 },
      model_retopo: { ...base, project: 'p', model: 'a.obj', targetFaces: 5000 },
      model_unwrap: { ...base, project: 'p', model: 'a.obj', textureSize: 2048 },
      model_bake: { ...base, project: 'p', model: 'a.obj', size: 1024 },
      model_export: { ...base, project: 'p', model: 'a.obj', formats: ['glb'] },
      model_layer_list: { ...base, project: 'p', model: 'a.obj' },
      model_set_reference_views: { ...base, project: 'p', model: 'a.obj', fit: { view: 'front', height: 1.8 } },
      model_compare_reference: { ...base, project: 'p', model: 'a.obj', budget: 6 },
      model_material_set: { ...base, project: 'p', model: 'a.obj', preset: 'painted_metal' },
      model_layer_add: { ...base, project: 'p', model: 'a.obj', kind: 'fill', fill: { albedo: '#553311' }, mask: { source: 'cavity', invert: true } },
      model_layer_update: { ...base, project: 'p', model: 'a.obj', layer: 'dirt', opacity: 0.4, fill: { albedo: null } },
      model_layer_remove: { ...base, project: 'p', model: 'a.obj', layer: 'dirt' },
      model_paint_stroke: { ...base, project: 'p', model: 'a.obj', brush: 'brush', color: '#ff0000', target: { mode: 'screen', view: 'front', points: [[190, 120]] } },
      game_list: {},
      game_create: { name: 'Demo', engine: 'phaser', perspective: 'top-down' },
      game_open: { game: 'g1' },
      game_get_manifest: { game: 'g1' },
      game_set_manifest: { game: 'g1', patch: { network: 'off' } },
      game_run: { game: 'g1' },
      game_stop: { game: 'g1' },
      game_reload: { game: 'g1' },
      game_screenshot: { game: 'g1' },
      game_logs: { game: 'g1' },
      game_input: { game: 'g1', events: [] },
      game_state: { game: 'g1' },
      game_import_asset: { game: 'g1', source: { packPath: '/tmp/p' } },
      game_replay_record: { game: 'g1', action: 'stop', name: 'walk' },
      game_replay_play: { game: 'g1', replay: { version: 1, seed: 1, frames: 10, events: [{ f: 0, action: 'right', down: true }] } },
      game_assert_state: { game: 'g1', frame: 60, path: '$.scene', op: 'eq', value: 'level' },
      game_assert_frame: { game: 'g1', frame: 60, name: 'start' },
      game_playtest: { game: 'g1', name: 'smoke' },
      terrain_list: base,
      terrain_open: { ...base, project: 'p', terrain: 'dunes-20261004-120000' },
      terrain_get_spec: { ...base, project: 'p', terrain: 'dunes-20261004-120000' },
      terrain_set_spec: { ...base, project: 'p', terrain: 'dunes-20261004-120000', patch: { resolution: 129 } },
      terrain_set_input: { ...base, project: 'p', terrain: 'dunes-20261004-120000', slot: 'heightmap', path: 'a.png' },
      terrain_build: { ...base, project: 'p', terrain: 'dunes-20261004-120000' },
      terrain_render_preview: { ...base, project: 'p', terrain: 'dunes-20261004-120000' },
      terrain_get_stats: { ...base, project: 'p', terrain: 'dunes-20261004-120000' },
      terrain_export: { ...base, project: 'p', terrain: 'dunes-20261004-120000' },
      sprite_open: { ...base, group: 'characters', asset: 'hero-20261004-120000' },
      sprite_get_spec: { ...base, group: 'characters', asset: 'hero-20261004-120000' },
      sprite_set_spec: { ...base, group: 'characters', asset: 'hero-20261004-120000', patch: { directions: 4 } },
      sprite_generate: { ...base, spec: { kind: 'sheet', name: 'hero' } },
      sprite_regenerate_frames: { ...base, group: 'characters', asset: 'hero-20261004-120000', frames: ['walk/e/000'] },
      sprite_patch_frames: { ...base, group: 'characters', asset: 'hero-20261004-120000', ops: [{ op: 'flip', key: 'walk/e/000' }] },
      sprite_render_preview: { ...base, group: 'characters', asset: 'hero-20261004-120000', animate: 'walk' },
      sprite_get_report: { ...base, group: 'characters', asset: 'hero-20261004-120000' },
      sprite_job_status: { jobId: 'j1' },
      sprite_cancel: { jobId: 'j1' },
      tileset_generate: { ...base, group: 'tilesets', asset: 'meadow-20261004-120000' },
      background_generate: { ...base, spec: { kind: 'background', name: 'dusk' } },
      map_generate: { ...base, group: 'maps', asset: 'isle-20261004-120000', keepLayout: true },
      map_get: { ...base, group: 'maps', asset: 'isle-20261004-120000' },
      map_patch: { ...base, group: 'maps', asset: 'isle-20261004-120000', ops: [{ op: 'set', x: 1, y: 1, terrain: 'water' }, { op: 'refill' }] },
      sprite_export: { ...base, group: 'maps', asset: 'isle-20261004-120000', dest: 'game/assets' },
    };
    for (const id of MCP_TOOL_IDS) {
      const input = perTool[id] ?? base;
      const result = MCP_TOOLS[id].input.safeParse(input);
      expect(result.success, `${id} input schema rejected ${JSON.stringify(input)}`).toBe(true);
    }
  });
});
