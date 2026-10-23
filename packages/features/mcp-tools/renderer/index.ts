/**
 * The MCP tools feature's renderer half (Phase 113 Theme N): the Tools view,
 * which Studio renders as Settings ▸ MCP Server and Agents as its Tools tab.
 * Needs only the frame (bridge, settings accordion and switch row) — which tools
 * and switches show is a prop, so there is no host port.
 *
 * `sideEffects: false` keeps an app that imports only the view from pulling
 * anything else in.
 */
export { mcpToolsManifest, type McpToolsManifest } from '../manifest';
export { McpToolsView, type McpToolsViewProps } from './mcp-tools-view';
export { AgentAuditView, summarizeAuditRecord } from './agent-audit-view';
export { useAgentLimitToasts } from './use-agent-limit-toasts';
export { McpServersSection, diffLines, type DiffLine } from './mcp-servers-section';
