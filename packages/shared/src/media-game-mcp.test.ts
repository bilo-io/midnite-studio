import { describe, expect, it } from 'vitest';

import { MCP_TOOLS } from './mcp';
import {
  GAME_INPUT_MAX_EVENTS,
  GAME_MCP_READ_TOOL_IDS,
  GAME_MCP_TOOL_IDS,
  GAME_SLOW_TOOL_IDS,
  GameEntityAddInputSchema,
  GameEntityDeleteInputSchema,
  GameEntityUpdateInputSchema,
  GameInputInputSchema,
  GameLevelQueryInputSchema,
  GameLevelValidateOutputSchema,
  GameLogsInputSchema,
  GameScreenshotInputSchema,
  isGameMcpToolId,
} from './media-game-mcp';
import { jsonDepth } from './media-game';

describe('game_* MCP tools', () => {
  it('registers exactly the game tool ids, and the read ids are the read-only ones', () => {
    const registered = Object.keys(MCP_TOOLS).filter((id) => id.startsWith('game_'));
    expect(registered.sort()).toEqual([...GAME_MCP_TOOL_IDS].sort());
    expect(GAME_MCP_READ_TOOL_IDS.slice().sort()).toEqual(GAME_MCP_TOOL_IDS.filter((id) => MCP_TOOLS[id].readOnly).sort());
    expect(GAME_MCP_READ_TOOL_IDS).toContain('game_doctor');
    expect(isGameMcpToolId('game_run')).toBe(true);
    expect(isGameMcpToolId('model_save')).toBe(false);
  });

  it('every slow tool is a registered game tool', () => {
    for (const id of GAME_SLOW_TOOL_IDS) expect(isGameMcpToolId(id), id).toBe(true);
  });

  it('bounds a screenshot burst and applies the documented defaults', () => {
    expect(GameScreenshotInputSchema.parse({ game: 'g1' })).toEqual({ game: 'g1', count: 1, intervalMs: 250, scale: 0.5 });
    expect(GameScreenshotInputSchema.safeParse({ game: 'g1', count: 17 }).success).toBe(false);
    expect(GameScreenshotInputSchema.safeParse({ game: 'g1', intervalMs: 10 }).success).toBe(false);
    expect(GameScreenshotInputSchema.safeParse({ game: 'g1', scale: 2 }).success).toBe(false);
  });

  it('bounds logs and input', () => {
    expect(GameLogsInputSchema.parse({ game: 'g1' }).limit).toBe(200);
    expect(GameLogsInputSchema.safeParse({ game: 'g1', limit: 501 }).success).toBe(false);
    const events = Array.from({ length: GAME_INPUT_MAX_EVENTS + 1 }, () => ({ t: 0, type: 'keyDown' as const, key: 'a' }));
    expect(GameInputInputSchema.safeParse({ game: 'g1', events }).success).toBe(false);
    expect(GameInputInputSchema.safeParse({ game: 'g1', events: events.slice(1) }).success).toBe(true);
    expect(GameInputInputSchema.safeParse({ game: 'g1', events: [{ t: 70_000, type: 'keyDown', key: 'a' }] }).success).toBe(false);
    expect(GameInputInputSchema.safeParse({ game: 'g1', events: [{ t: 0, type: 'gamepad', button: 17, pressed: true }] }).success).toBe(false);
  });

  it('jsonDepth counts nesting without recursing', () => {
    expect(jsonDepth(1)).toBe(0);
    expect(jsonDepth({ a: [1, { b: 2 }] })).toBe(3);
    let deep: unknown = 0;
    for (let i = 0; i < 100_000; i += 1) deep = { d: deep };
    expect(jsonDepth(deep)).toBe(100_000);
  });
});

describe('level query and validate tools (Phase 138 Theme D)', () => {
  it('are read tools, and D5: their descriptions open with a verb and fit 220 characters', () => {
    for (const id of ['game_level_query', 'game_level_validate'] as const) {
      expect(GAME_MCP_READ_TOOL_IDS).toContain(id);
      expect(MCP_TOOLS[id].readOnly).toBe(true);
      expect(MCP_TOOLS[id].description.length).toBeLessThanOrEqual(220);
    }
  });

  it('the query input takes the target, a scene and the LevelQuery filters, with its defaults', () => {
    const parsed = GameLevelQueryInputSchema.parse({ game: 'g1', scene: 'level', types: ['crate'] });
    expect(parsed).toMatchObject({ game: 'g1', scene: 'level', unit: 'px', limit: 200 });
    expect(GameLevelQueryInputSchema.safeParse({ game: 'g1', scene: 'Bad Name' }).success).toBe(false);
  });

  it('the validate output shape holds counts and issues', () => {
    const out = { source: 'file', counts: { error: 1, warning: 0, info: 0 }, issues: [{ rule: 'level/no-spawn', severity: 'error', message: 'x' }] };
    expect(GameLevelValidateOutputSchema.safeParse(out).success).toBe(true);
  });
});


describe('entity write tools (Phase 138 Theme E)', () => {
  it('are writes with verb-led descriptions of at most 220 characters naming a command', () => {
    for (const id of ['game_entity_batch', 'game_entity_add', 'game_entity_update', 'game_entity_delete'] as const) {
      expect(GAME_MCP_READ_TOOL_IDS).not.toContain(id);
      expect(MCP_TOOLS[id].readOnly).toBe(false);
      expect(MCP_TOOLS[id].description.length).toBeLessThanOrEqual(220);
      expect(MCP_TOOLS[id].description).toMatch(/refused unless its Settings switch is on/);
    }
  });

  it('takes defaults (px, select) and leaves save unset for the caller to default', () => {
    const parsed = GameEntityDeleteInputSchema.parse({ game: 'g1', scene: 'level', ids: [4] });
    expect(parsed).toMatchObject({ unit: 'px', select: true });
    expect(parsed.save).toBeUndefined();
    expect(GameEntityAddInputSchema.safeParse({ game: 'g1', scene: 'level', entities: [] }).success).toBe(false);
    expect(GameEntityUpdateInputSchema.parse({ game: 'g1', scene: 'level', updates: [{ id: 2 }] }).updates[0]?.set).toEqual({});
  });
});
