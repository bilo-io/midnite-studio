import { describe, expect, it } from 'vitest';

import { MCP_TOOLS } from './mcp';
import {
  isStartupMcpToolId,
  STARTUP_MCP_TOOL_IDS,
  STARTUP_MCP_WRITE_TOOL_IDS,
  startupToolsForConsent,
} from './startup-mcp';

describe('startup MCP tools', () => {
  it('registers all eight ids, and the writes are exactly the not-read-only ones', () => {
    expect(STARTUP_MCP_TOOL_IDS).toHaveLength(8);
    for (const id of STARTUP_MCP_TOOL_IDS) {
      expect(MCP_TOOLS[id].readOnly, id).toBe(!STARTUP_MCP_WRITE_TOOL_IDS.includes(id));
      expect(isStartupMcpToolId(id)).toBe(true);
    }
    expect(isStartupMcpToolId('repo.list')).toBe(false);
  });

  it('lists nothing without read, the five reads with it, and all eight with changes on', () => {
    expect(startupToolsForConsent({ read: false, write: false })).toEqual([]);
    // "make changes" without "read" still lists nothing: read is the gate.
    expect(startupToolsForConsent({ read: false, write: true })).toEqual([]);
    expect(startupToolsForConsent({ read: true, write: false })).toEqual(STARTUP_MCP_TOOL_IDS.slice(0, 5));
    expect(startupToolsForConsent({ read: true, write: true })).toEqual([...STARTUP_MCP_TOOL_IDS]);
  });
});
