import { GRAPH_DENSITIES, graphTheme, scaleTheme, type GraphDensity } from '../graph/graph-themes';
import { useUiStore } from '../../store/ui-store';

const LABELS: Record<GraphDensity, { label: string; blurb: string }> = {
  comfortable: {
    label: 'Comfortable',
    blurb: 'The style at its own proportions.',
  },
  compact: {
    label: 'Compact',
    blurb: 'Shorter rows and a smaller node — more history per screen.',
  },
};

/**
 * Row density, beside the style picker rather than inside it.
 *
 * Deliberately not five more style cards: density multiplies the styles rather
 * than adding to them, and a ten-card grid would make two independent choices
 * look like one list of ten.
 *
 * Each option previews itself with the CURRENT style's numbers, because that is
 * the only honest preview — compact takes `git-graph` from 34px rows to 28 and
 * `gitkraken` from 38 to 31, and a fixed illustration would be wrong for four
 * styles out of five.
 */
export function GraphDensityPicker() {
  const themeId = useUiStore((s) => s.graphTheme);
  const active = useUiStore((s) => s.graphDensity);
  const setGraphDensity = useUiStore((s) => s.setGraphDensity);
  // `graphTheme`, not a bare lookup: a style id persisted by a future build
  // falls back here exactly as it does for the graph itself. Indexing directly
  // would leave the graph rendering fine and crash this page alone.
  const base = graphTheme(themeId);

  return (
    <div className="px-3 pb-3">
      <h3 className="pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Row density
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GRAPH_DENSITIES.map((density) => {
          const theme = scaleTheme(base, density);
          const selected = active === density;
          return (
            <button
              key={density}
              type="button"
              aria-pressed={selected}
              onClick={() => setGraphDensity(density)}
              className={`flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
                selected
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-primary/50 hover:bg-accent/40'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{LABELS[density].label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {theme.rowHeight}px
                </span>
              </span>
              {/*
                Four stacked bars at the real row height. Not a picture of the
                graph — the style picker above already shows that — just the
                rhythm, which is the only thing density changes.
              */}
              <span aria-hidden className="flex flex-col gap-px">
                {[0, 1, 2, 3].map((row) => (
                  <span
                    key={row}
                    className="flex items-center gap-1.5 rounded-sm bg-muted/60 px-1"
                    style={{ height: theme.rowHeight }}
                  >
                    <span
                      className="shrink-0 rounded-full bg-muted-foreground/50"
                      style={{
                        width: theme.node === 'avatar' ? theme.avatarSize : theme.nodeRadius * 2,
                        height: theme.node === 'avatar' ? theme.avatarSize : theme.nodeRadius * 2,
                      }}
                    />
                    <span className="h-1 flex-1 rounded-full bg-muted-foreground/25" />
                  </span>
                ))}
              </span>
              <span className="text-xs text-muted-foreground">{LABELS[density].blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
