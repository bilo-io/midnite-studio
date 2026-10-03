import { MODELS_OFF_MESSAGE } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BOX_SPEC, memoryModelKit } from '../media/model/model-test-kit';
import { dispatchMcpCall } from './dispatch';
import { setModelTools } from './model-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowModelsState } from './ui-gate';

/** vitest: the global MCP server's consent model for the model_* tools, through the real dispatcher. */

describe('model_* over the global MCP dispatcher', () => {
  const kit = memoryModelKit();
  const target = { repoPath: kit.repoPath, project: 'gen', model: 'crate' };

  beforeEach(() => {
    setModelTools(kit.tools);
    resetMcpAllowUiStateForTests();
    kit.files.clear();
  });
  afterEach(() => setModelTools(null));

  it('refuses the four state-changing tools with a named reason while the switch is off', async () => {
    for (const [tool, input] of [
      ['model_set_spec', { ...target, spec: BOX_SPEC }],
      ['model_patch_parts', { ...target, ops: [{ op: 'remove', id: 'p1' }] }],
      ['model_save', target],
      ['model_open', target],
    ] as const) {
      expect(await dispatchMcpCall(tool, input), tool).toEqual({ ok: false, kind: 'refused', message: MODELS_OFF_MESSAGE });
    }
    expect(kit.files.size).toBe(0);
  });

  it('lets an external session read, list and render with the switch off', async () => {
    setMcpAllowModelsState(true);
    const made = await dispatchMcpCall('model_set_spec', { ...target, spec: BOX_SPEC });
    expect(made).toMatchObject({ ok: true, value: { ok: true, model: 'crate-20261003-141502.obj' } });
    setMcpAllowModelsState(false);
    const model = 'crate-20261003-141502.obj';
    expect(await dispatchMcpCall('model_list', { repoPath: kit.repoPath })).toMatchObject({ ok: true });
    expect(await dispatchMcpCall('model_get_spec', { ...target, model })).toMatchObject({ ok: true });
    const render = await dispatchMcpCall('model_render_preview', { ...target, model, views: ['top'], size: 128 });
    expect(render).toMatchObject({ ok: true, value: { _content: [{ type: 'text' }, { type: 'text', text: 'top' }, { type: 'image' }] } });
  });

  it('with the switch on, an external session edits and the open editor hears about it', async () => {
    setMcpAllowModelsState(true);
    const made = await dispatchMcpCall('model_set_spec', { ...target, spec: BOX_SPEC });
    const model = (made as { value: { model: string } }).value.model;
    const patched = await dispatchMcpCall('model_patch_parts', { ...target, model, ops: [{ op: 'update', id: 'p1', fields: { color: '#112233' } }] });
    expect(patched).toMatchObject({ ok: true, value: { ok: true, partCount: 1 } });
    expect(kit.changed.at(-1)).toMatchObject({ path: model, saved: false });
    expect((await dispatchMcpCall('model_save', { ...target, model }))).toMatchObject({ ok: true, value: { saved: true } });
  });

  it('reports bad input with the path of the problem, and an unbound tool set as an error, never a throw', async () => {
    const bad = await dispatchMcpCall('model_patch_parts', { ...target, ops: [{ op: 'explode' }] });
    expect(bad).toMatchObject({ ok: false, kind: 'error', message: expect.stringContaining('ops.0') });
    setModelTools(null);
    expect(await dispatchMcpCall('model_list', { repoPath: kit.repoPath })).toMatchObject({ ok: false, kind: 'error' });
  });
});
