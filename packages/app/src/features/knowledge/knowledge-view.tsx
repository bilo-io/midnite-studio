import { useCallback, useEffect, useMemo, useState } from 'react';

import { LuCircleAlert, LuClock } from 'react-icons/lu';
import { SiGrapheneos } from 'react-icons/si';

import { EmptyState } from '../../components/empty-state';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { Spinner } from '../../components/skeleton';
import { useWindowFocused } from '../../lib/use-window-focus';
import { useActiveWorktree } from '../../services/use-status';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { KnowledgeCanvas } from './knowledge-canvas';
import {
  communityNameFromNodeId,
  communityNodeId,
  nodesByCommunity as groupNodesByCommunity,
} from './knowledge-community-collapse';
import { KnowledgeCommunityPanel } from './knowledge-community-panel';
import { computeDegrees } from './knowledge-degree';
import { KnowledgeFiltersPanel } from './knowledge-filters-panel';
import {
  countVisibleLinks,
  distinctCommunityNames,
  distinctRelations,
  pickFocusNode,
  searchMatches,
} from './knowledge-filters';
import { useKnowledgeFiltersStore } from './knowledge-filters-store';
import { KnowledgeVariantPills } from './knowledge-variant-pills';
import { useKnowledgeLayoutProgress } from './use-knowledge-layout-progress';
import { KnowledgeNodePanel } from './knowledge-node-panel';
import { useKnowledgeGraph } from './use-knowledge-graph';
import { type KnowledgeLayoutProgress } from './use-knowledge-layout-progress';

/**
 * The Knowledge view — Phase 87.
 *
 * Theme C (PR #407) landed only the rail row and the view registration, with
 * a placeholder body. Theme F (PR #410) replaced that body with the real
 * empty/stale/malformed states, read from `useKnowledgeGraph` (react-query,
 * so a repo switch racing an in-flight load is react-query's own cache-key
 * guarantee, not bespoke code here) — but deliberately left `ready` as a
 * placeholder ("Theme D's canvas is where that progress bar belongs... so
 * the two themes' diffs don't collide on the same region of this file").
 * This is that replacement: `ready` now renders the sigma canvas (Theme D)
 * and its four interactions (Theme E) instead. Every OTHER branch —
 * loading/absent/unreadable/malformed/error, the staleness banner — is
 * still exactly Theme F's, untouched.
 */
export function KnowledgeView() {
  const { repoId, worktreePath } = useActiveWorktree();
  const { state, refetch } = useKnowledgeGraph(repoId);
  const layoutProgress = useKnowledgeLayoutProgress(repoId, state.kind === 'loading');

  const scopeKey = repoId ?? '';
  const ensureScope = useKnowledgeFiltersStore((s) => s.ensureScope);
  useEffect(() => {
    if (repoId) ensureScope(repoId);
  }, [repoId, ensureScope]);

  const filters = useKnowledgeFiltersStore((s) => s.filters);
  const selectedNodeId = useKnowledgeFiltersStore((s) => s.selectedNodeId);
  const setQuery = useKnowledgeFiltersStore((s) => s.setQuery);
  const toggleRelation = useKnowledgeFiltersStore((s) => s.toggleRelation);
  const setMinWeight = useKnowledgeFiltersStore((s) => s.setMinWeight);
  const setMinConfidence = useKnowledgeFiltersStore((s) => s.setMinConfidence);
  const toggleCommunity = useKnowledgeFiltersStore((s) => s.toggleCommunity);
  const showAllCommunities = useKnowledgeFiltersStore((s) => s.showAllCommunities);
  const hideAllCommunities = useKnowledgeFiltersStore((s) => s.hideAllCommunities);
  const selectNode = useKnowledgeFiltersStore((s) => s.selectNode);
  const focusNode = useKnowledgeFiltersStore((s) => s.focusNode);
  const flyToNodeId = useKnowledgeFiltersStore((s) => s.flyToNodeId);
  const collapsedCommunities = useKnowledgeFiltersStore((s) => s.collapsedCommunities);
  const toggleCollapsedCommunity = useKnowledgeFiltersStore((s) => s.toggleCollapsedCommunity);
  const setCommunityCollapsed = useKnowledgeFiltersStore((s) => s.setCommunityCollapsed);
  const collapseAllCommunities = useKnowledgeFiltersStore((s) => s.collapseAllCommunities);
  const expandAllCommunities = useKnowledgeFiltersStore((s) => s.expandAllCommunities);
  const communityListMode = useKnowledgeFiltersStore((s) => s.communityListMode);
  const setCommunityListMode = useKnowledgeFiltersStore((s) => s.setCommunityListMode);
  const rendererVariant = useKnowledgeFiltersStore((s) => s.rendererVariant);
  const setRendererVariant = useKnowledgeFiltersStore((s) => s.setRendererVariant);

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const filtersResizable = useResizable({
    size: layout.knowledgeFiltersWidth,
    onSize: (value) => setLayout('knowledgeFiltersWidth', value),
    initial: DEFAULT_LAYOUT.knowledgeFiltersWidth,
    axis: 'x',
    edge: 'start',
    ...LAYOUT_BOUNDS.knowledgeFiltersWidth,
  });

  const detailResizable = useResizable({
    size: layout.knowledgeDetailWidth,
    onSize: (value) => setLayout('knowledgeDetailWidth', value),
    initial: DEFAULT_LAYOUT.knowledgeDetailWidth,
    axis: 'x',
    edge: 'end',
    ...LAYOUT_BOUNDS.knowledgeDetailWidth,
  });

  // Phase 84's visibility gate: `KnowledgeView` isn't `global: true` (Theme
  // C), so it fully unmounts on a view switch already — the one thing left
  // to gate is a blurred-but-still-the-active-view window, which this
  // reactive hook answers safely (it is not a permanently-mounted host).
  const focused = useWindowFocused();

  const payload = state.kind === 'ready' ? state.graph : null;

  const relations = useMemo(() => (payload ? distinctRelations(payload.links) : []), [payload]);
  const communityNames = useMemo(
    () => (payload ? distinctCommunityNames(payload.nodes) : []),
    [payload],
  );
  const communityByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of payload?.nodes ?? []) map.set(node.id, node.communityName);
    return map;
  }, [payload]);
  const visibleLinkCount = useMemo(
    () => (payload ? countVisibleLinks(payload.links, communityByNodeId, filters) : 0),
    [payload, communityByNodeId, filters],
  );
  const searchFocusNodeId = useMemo(() => {
    if (!payload || !filters.query) return null;
    const matches = searchMatches(payload.nodes, filters.query);
    return pickFocusNode(payload.nodes, matches);
  }, [payload, filters.query]);
  // A tree-list pick wins over search's first match until the next keystroke (`setQuery` clears it).
  const focusNodeId = flyToNodeId ?? searchFocusNodeId;
  const nodesByCommunity = useMemo(
    () => (payload ? groupNodesByCommunity(payload.nodes) : new Map<string, never[]>()),
    [payload],
  );
  const degrees = useMemo(() => (payload ? computeDegrees(payload.links) : new Map<string, number>()), [payload]);

  /**
   * Double-click: an ordinary node folds its whole community into one meta-
   * node (and selects that, so the panel explains what just happened); a
   * meta-node unfolds again, leaving the panel on the node that was double-
   * clicked — there is none, so the selection clears.
   */
  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const collapsedName = communityNameFromNodeId(nodeId);
      if (collapsedName !== null) {
        setCommunityCollapsed(collapsedName, false);
        selectNode(null);
        return;
      }
      const communityName = communityByNodeId.get(nodeId);
      if (communityName === undefined) return;
      setCommunityCollapsed(communityName, true);
      selectNode(communityNodeId(communityName));
    },
    [communityByNodeId, setCommunityCollapsed, selectNode],
  );

  const selectedCommunityName = selectedNodeId ? communityNameFromNodeId(selectedNodeId) : null;

  switch (state.kind) {
    case 'loading':
      return <LoadingState progress={layoutProgress} onRetry={refetch} />;

    case 'absent':
      return <KnowledgeInstructions />;

    case 'unreadable':
      return (
        <EmptyState
          icon={LuCircleAlert}
          title="Can't read graphify-out/graph.json"
          body={state.message}
        />
      );

    case 'malformed':
      return (
        <EmptyState
          icon={LuCircleAlert}
          title="graphify-out/graph.json isn't a graph"
          body={`${state.message} Try running graphify update . to rebuild it.`}
        />
      );

    case 'error':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <EmptyState icon={LuCircleAlert} title="Couldn't load the graph" body={state.message} />
          <RetryButton onClick={refetch} />
        </div>
      );

    case 'ready':
      return (
        <div key={scopeKey} className="flex h-full min-h-0 w-full flex-col">
          {state.stale && state.commitsBehind !== null ? (
            <StaleBanner commitsBehind={state.commitsBehind} />
          ) : null}
          <div className="flex min-h-0 flex-1">
            <div
              style={{ width: filtersResizable.current }}
              className="flex h-full min-h-0 shrink-0 flex-col"
            >
              <KnowledgeFiltersPanel
                width={filtersResizable.current}
                filters={filters}
                relations={relations}
                communityNames={communityNames}
                nodesByCommunity={nodesByCommunity}
                collapsedCommunities={collapsedCommunities}
                communityListMode={communityListMode}
                visibleLinkCount={visibleLinkCount}
                totalLinkCount={state.graph.links.length}
                onQueryChange={setQuery}
                onToggleRelation={toggleRelation}
                onMinWeightChange={setMinWeight}
                onMinConfidenceChange={setMinConfidence}
                onToggleCommunity={toggleCommunity}
                onShowAllCommunities={showAllCommunities}
                onHideAllCommunities={hideAllCommunities}
                onCommunityListModeChange={setCommunityListMode}
                onToggleCollapsedCommunity={toggleCollapsedCommunity}
                onCollapseAllCommunities={collapseAllCommunities}
                onExpandAllCommunities={expandAllCommunities}
                onSelectNode={focusNode}
              />
            </div>
            <ResizeHandle
              resizable={filtersResizable}
              axis="x"
              label="Resize knowledge graph filters"
            />
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              <KnowledgeVariantPills activeId={rendererVariant} onSelect={setRendererVariant} />
              <KnowledgeCanvas
                rendererVariant={rendererVariant}
                payload={state.graph}
                filters={filters}
                focusNodeId={focusNodeId}
                selectedNodeId={selectedNodeId}
                collapsedCommunities={collapsedCommunities}
                onNodeClick={selectNode}
                onNodeDoubleClick={handleNodeDoubleClick}
                paused={!focused}
              />
            </div>
            {selectedNodeId ? (
              <>
                <ResizeHandle
                  resizable={detailResizable}
                  axis="x"
                  label="Resize knowledge graph detail"
                />
                <div
                  style={{ width: detailResizable.current }}
                  className="flex h-full min-h-0 shrink-0 flex-col"
                >
                  {selectedCommunityName !== null ? (
                    <KnowledgeCommunityPanel
                      width={detailResizable.current}
                      communityName={selectedCommunityName}
                      members={nodesByCommunity.get(selectedCommunityName) ?? []}
                      degrees={degrees}
                      hidden={filters.hiddenCommunities.has(selectedCommunityName)}
                      onClose={() => selectNode(null)}
                      onExpand={() => {
                        setCommunityCollapsed(selectedCommunityName, false);
                        selectNode(null);
                      }}
                      onToggleHidden={() => toggleCommunity(selectedCommunityName)}
                      onSelectNode={(nodeId) => {
                        // A member is only reachable on the canvas once its community is unfolded.
                        setCommunityCollapsed(selectedCommunityName, false);
                        focusNode(nodeId);
                      }}
                    />
                  ) : (
                    <KnowledgeNodePanel
                      width={detailResizable.current}
                      repoId={repoId ?? ''}
                      worktreePath={worktreePath}
                      nodeId={selectedNodeId}
                      onClose={() => selectNode(null)}
                    />
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      );
  }
}

/**
 * The un-graphified repo (Theme F). Copy is instructions, not an error — the
 * phase doc's own line — so this names what graphify is, the one-line
 * install, and the command that produces the file this view is waiting on.
 * `pip install graphifyy` is the real package name on PyPI (double `y`); the
 * console script it installs is `graphify`.
 */
function KnowledgeInstructions() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <SiGrapheneos aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-medium">This repo hasn't been graphified yet</p>
        <p className="text-sm text-muted-foreground">
          graphify turns a codebase into a navigable knowledge graph — god nodes, community
          detection, cross-file relationships. Run it once from a terminal in this repo, and this
          view will render what it finds.
        </p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-2 rounded border border-border bg-muted/40 p-3 text-left text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Install (once):</span>
          <code className="font-mono text-foreground">pip install graphifyy</code>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Build the graph:</span>
          <code className="font-mono text-foreground">graphify update .</code>
        </div>
      </div>
    </div>
  );
}

/**
 * "N commits behind" (Theme F) — reported, never acted on (phase doc
 * guardrail: the app never runs graphify). `commitsBehind` is `> 0` whenever
 * this renders (`KnowledgeViewState`'s own `stale` derivation), so there is
 * always a real count to show, never a "some" placeholder.
 */
function StaleBanner({ commitsBehind }: { commitsBehind: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <LuClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>
        This graph is {commitsBehind} commit{commitsBehind === 1 ? '' : 's'} behind HEAD. Run{' '}
        <code className="font-mono text-foreground">graphify update .</code> to refresh it.
      </span>
    </div>
  );
}

/**
 * After this long on the spinner, the view stops pretending the load is
 * routine. Measured in the packaged app on this repo's own graph: a cold load
 * (read + ForceAtlas2 + IPC + first sigma paint) is ~12 s, a cache hit under
 * 2 s — so 30 s is "something is wrong", not "a big graph". The Retry it
 * offers is the same `refetch` the error state gets; the fetch itself is
 * still bounded by `use-knowledge-graph.ts`'s stall guard, this is only the
 * moment the user is told they need not wait for it.
 */
export const KNOWLEDGE_SLOW_LOAD_MS = 30_000;

function LoadingState({
  progress,
  onRetry,
}: {
  progress: KnowledgeLayoutProgress;
  onRetry: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), KNOWLEDGE_SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <Spinner size="md" />
      <p className="text-xs text-muted-foreground">
        {progress && progress.total > 0
          ? `Laying out the graph… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
          : 'Reading the knowledge graph…'}
      </p>
      {slow ? (
        <>
          <p className="max-w-sm text-center text-xs text-muted-foreground">
            This is taking longer than usual. A cold layout of a large graph takes about ten
            seconds; a spinner past that usually means the request went astray.
          </p>
          <RetryButton onClick={onRetry} />
        </>
      ) : null}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
    >
      Retry
    </button>
  );
}
