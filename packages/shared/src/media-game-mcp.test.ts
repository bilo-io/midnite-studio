import { describe, expect, it } from 'vitest';

import { MCP_TOOLS } from './mcp';
import {
  GAME_INPUT_MAX_EVENTS,
  GAME_MCP_READ_TOOL_IDS,
  GAME_MCP_TOOL_IDS,
  GAME_SLOW_TOOL_IDS,
  GameInputInputSchema,
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
