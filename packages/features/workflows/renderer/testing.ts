/**
 * The workflows feature's internals, for tests that exercise it *as a composing
 * app wires it* — Studio's `packages/app/src/compose/workflows/` suite renders
 * these under its real providers (Phase 113 Theme N).
 *
 * Not for production code: an app composes the feature through
 * `@midnite/studio-feature-workflows/renderer` and nothing else.
 */
export { DemoApiOfferBanner } from './demo-api-offer-banner';
export { DemoApiPill } from './demo-api-pill';
export { NodeInspector } from './canvas/node-inspector';
export { NODE_GROUPS, NODE_KIND_META } from './canvas/node-kind-meta';
export { NodePalette, paletteGroups, paletteKindMatches, WORKFLOW_NODE_DND_MIME } from './canvas/node-palette';
export { RunNodeDetail } from './canvas/run-node-detail';
export { WorkflowCanvas, type WorkflowGraph } from './canvas/workflow-canvas';
export { NODE_RING_REST_WIDTH, NODE_RING_SELECTED_WIDTH, nodeRing } from './canvas/workflow-node-view';
export { RunHistoryList } from './run-history-list';
export { RunOutputPanel, runToMarkdown } from './run-output-panel';
export { createNode, templateFromWorkflow, workflowFromTemplate } from './workflow-io';
export { TemplateGallery } from './template-gallery';
export {
  inspectorAutoCollapsed,
  inspectorAutoKey,
  useInspectorCollapse,
  type InspectorPanelKind,
} from './use-inspector-collapse';
export { WorkflowList } from './workflow-list';
export { WorkflowToolbar } from './workflow-toolbar';
export { WorkflowsView } from './workflows-view';
