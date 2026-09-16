import { LuCircleAlert, LuClock } from 'react-icons/lu';
import { SiGrapheneos } from 'react-icons/si';

import { EmptyState } from '../../components/empty-state';
import { useActiveWorktree } from '../../services/use-status';
import { useKnowledgeGraph } from './use-knowledge-graph';

/**
 * The Knowledge view — Phase 87.
 *
 * Theme C (PR #407) landed only the rail row and the view registration, with
 * a placeholder body. This theme (F) replaces that body with the real
 * empty/stale/malformed states, read from `useKnowledgeGraph` — but still NOT
 * the canvas itself: `ready` renders a placeholder for the graph Theme D's
 * sigma canvas owns, so the two themes' diffs don't collide on the same
 * region of this file. `ready`'s only real content here is the staleness
 * banner (`commitsBehind`), which is Theme F's, not Theme D's.
 */
export function KnowledgeView() {
  const { repoId } = useActiveWorktree();
  const { state } = useKnowledgeGraph(repoId);

  switch (state.kind) {
    case 'loading':
      // No spinner dressing: a cold layout reports progress over
      // `knowledgeLayoutProgress` (Theme B), which Theme D's canvas is where
      // that progress bar belongs — this state is brief on a cache hit and
      // covered by Theme D's own loading UI once the canvas exists.
      return <EmptyState icon={SiGrapheneos} title="Knowledge" body="Loading the graph…" />;

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
      return <EmptyState icon={LuCircleAlert} title="Couldn't load the graph" body={state.message} />;

    case 'ready':
      return (
        <div className="flex h-full flex-col">
          {state.stale && state.commitsBehind !== null ? (
            <StaleBanner commitsBehind={state.commitsBehind} />
          ) : null}
          <div className="flex-1">
            <EmptyState
              icon={SiGrapheneos}
              title="Knowledge"
              body={`${state.graph.nodes.length.toLocaleString()} nodes, ${state.graph.links.length.toLocaleString()} links. A WebGL view of this repo's own graphify graph — communities, call edges, click-to-open. Coming soon.`}
            />
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
