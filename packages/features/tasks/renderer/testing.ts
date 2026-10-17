/**
 * The views and parts, eagerly — for a composer's own tests (Studio's `compose/tasks/*.test.tsx`
 * render them under its providers). Production code goes through `tasksViews`, which keeps the view
 * in its own chunk.
 */
export { TasksView } from './tasks-view';
export { BoardView } from './board/board-view';
export { TaskCard } from './board/task-card';
export { CardDetail } from './board/card-detail';
export { CardPanelStack } from './board/card-panel-stack';
export { CardSkillPicker } from './board/card-skill-picker';
export type { SkillSuggestion } from './board/card-skill';
export { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from './board/card-chrome';
export { useCardVisible } from './board/use-card-visible';
export { CardActivityLine } from './board/card-activity-line';
export { useCardStatus } from './board/use-card-status';
export type { CardGlowState } from './board/glow-state';
export { resolveGroupField } from './board/resolve-group-field';
export { ProjectFieldCell } from './field-editor';
export { ProjectGraphNode } from './graph/project-graph-node';
export { ProjectGraphView } from './graph/project-graph-view';
export { idleGraphNodeActivity, useGraphAgentStates } from './graph/use-graph-agent-states';
export type { PositionedNode } from './graph/graph-layout';
export { DEFAULT_GRAPH_FACETS, type ProjectGraphFacets } from './graph/graph-filter';
export { IssuePills, TaskIssueProvider } from './issue-pills';
export { IssueActionBar } from './issue/issue-action-bar';
export { IssueDetail } from './issue/issue-detail';
export { IssueDialog } from './issue/issue-dialog';
export { PlanBlueprintSheet } from './plan/plan-blueprint-sheet';
export { PlanGraphPreview, planBlueprintToForgeGraph } from './plan/plan-graph-preview';
export { PlanWithAiBar } from './plan/plan-with-ai-bar';
export { ProjectDialog } from './project-dialog';
export { STATUS_STROKE_BLOCKED_OPACITY, statusStroke } from './status-stroke';
export { draftItem, issueItem, pullItem, resetProjectItemSeq, withBlockedBy } from './__fixtures__/project-item';
