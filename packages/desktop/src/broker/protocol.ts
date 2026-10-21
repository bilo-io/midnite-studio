/**
 * The broker's wire protocol lives in the runtime since Phase 113 Theme D —
 * the client every app attaches with and this server must speak the same
 * frames, and the client moved there. Re-exported by file (never the runtime
 * barrel) so the broker and mcp-shim bundles take only these bytes.
 */
export * from '@midnite/studio-runtime/broker/protocol';
