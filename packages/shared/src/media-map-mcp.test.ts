import { describe, expect, it } from 'vitest';

import {
  MAP_MCP_TOOL_IDS,
  MAP_MCP_WRITE_TOOL_IDS,
  MAPS_OFF_MESSAGE,
  MapCaptureTerrainInputSchema,
  MapMeasureInputSchema,
  isMapMcpToolId,
  isMapSlowToolId,
} from './media-map-mcp';
import { MCP_TOOLS } from './mcp';

describe('media-map-mcp', () => {
  it('registers four tools, two of them gated', () => {
    expect(MAP_MCP_TOOL_IDS).toEqual(['map_list', 'map_measure', 'map_goto', 'map_capture_terrain']);
    expect([...MAP_MCP_WRITE_TOOL_IDS]).toEqual(['map_goto', 'map_capture_terrain']);
    for (const id of MAP_MCP_TOOL_IDS) expect(MCP_TOOLS[id].readOnly).toBe(!MAP_MCP_WRITE_TOOL_IDS.includes(id));
    expect(isMapMcpToolId('map_list')).toBe(true);
    expect(isMapMcpToolId('map_get')).toBe(false); // a sprite tool: the names must not collide
    expect(MAPS_OFF_MESSAGE).toContain('Let agents capture maps');
  });

  it('only a capture is slow', () => {
    expect(isMapSlowToolId('map_capture_terrain')).toBe(true);
    expect(isMapSlowToolId('map_measure')).toBe(false);
  });

  it('bounds the inputs', () => {
    expect(MapMeasureInputSchema.safeParse({ points: [[0, 0]] }).success).toBe(false);
    expect(MapMeasureInputSchema.safeParse({ center: [0, 0], radiusM: 10_000_000 }).success).toBe(false);
    expect(MapCaptureTerrainInputSchema.safeParse({ repoPath: '/r', center: [18, -34], sideM: 4000, size: 500 }).success).toBe(false);
    expect(MapCaptureTerrainInputSchema.safeParse({ repoPath: '/r', center: [18, -34], sideM: 70_000, size: 513 }).success).toBe(false);
    expect(MapCaptureTerrainInputSchema.safeParse({ repoPath: '/r', center: [18, -34], sideM: 4000, size: 513 }).success).toBe(true);
  });
});
