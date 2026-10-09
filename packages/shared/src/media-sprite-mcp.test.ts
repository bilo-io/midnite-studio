import { describe, expect, it } from 'vitest';

import { MCP_TOOLS, isMcpToolId } from './mcp';
import { parseSpriteSpec, SpriteSheetSpecSchema } from './media-sprite';
import {
  estimateSpriteRequests,
  isSpriteMcpToolId,
  isSpriteSlowToolId,
  SPRITE_MCP_MAX_REQUESTS,
  SPRITE_MCP_TOOL_IDS,
  SPRITE_MCP_WRITE_TOOL_IDS,
  spriteRequestCapMessage,
} from './media-sprite-mcp';

describe('sprite MCP tool family (Phase 106 Theme K)', () => {
  it('has eighteen tools, every one registered, the writes not read-only', () => {
    expect(SPRITE_MCP_TOOL_IDS).toHaveLength(18);
    for (const id of SPRITE_MCP_TOOL_IDS) {
      expect(isMcpToolId(id), id).toBe(true);
      expect(MCP_TOOLS[id].readOnly, id).toBe(!SPRITE_MCP_WRITE_TOOL_IDS.includes(id));
    }
    expect(SPRITE_MCP_WRITE_TOOL_IDS).toHaveLength(11);
    expect(isSpriteMcpToolId('map_patch')).toBe(true);
    expect(isSpriteMcpToolId('terrain_build')).toBe(false);
    expect(isSpriteSlowToolId('sprite_render_preview')).toBe(true);
    expect(isSpriteSlowToolId('sprite_generate')).toBe(false);
  });

  it('estimates the worst case of a job', () => {
    const sheet = SpriteSheetSpecSchema.parse({ kind: 'sheet', name: 'hero', targetPerspective: 'isometric', directions: 8, clips: [{ name: 'walk', frames: 8 }, { name: 'idle', frames: 4 }] });
    // 12 frames × 8 directions × (1 + 2 re-rolls)
    expect(estimateSpriteRequests(sheet)).toBe(288);
    expect(estimateSpriteRequests(sheet, { clips: ['idle'] })).toBe(96);
    expect(estimateSpriteRequests(sheet, { frames: ['walk/s/000'] })).toBe(3);
    expect(estimateSpriteRequests(sheet, { turnaround: true })).toBe(1);
    expect(estimateSpriteRequests({ ...sheet, method: 'rendered' })).toBe(0);
    const side = SpriteSheetSpecSchema.parse({ kind: 'sheet', name: 'h', clips: [{ name: 'run', frames: 6 }], consistency: { enabled: false } });
    expect(estimateSpriteRequests(side)).toBe(6);
    expect(estimateSpriteRequests({ ...side, mirror: false } as typeof side)).toBe(12);
    expect(estimateSpriteRequests(parseSpriteSpec({ kind: 'tileset', name: 't' }))).toBe(4);
    expect(estimateSpriteRequests(parseSpriteSpec({ kind: 'map', name: 'm' }))).toBe(3);
    expect(spriteRequestCapMessage(288)).toContain(`up to 288 provider requests, over the ${SPRITE_MCP_MAX_REQUESTS}`);
  });
});
