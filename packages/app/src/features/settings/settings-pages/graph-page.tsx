import { GraphDensityPicker } from '../density-picker';
import { GraphThemePicker } from '../graph-theme-picker';

/**
 * How the graph is drawn: the style, then the density.
 *
 * Two independent axes, in the order they matter — style decides what the graph
 * looks like, density only how much of it fits. The density preview reads the
 * chosen style's numbers, so picking a style above changes the illustration
 * below.
 */
export function GraphPage() {
  return (
    <>
      <GraphThemePicker />
      <GraphDensityPicker />
    </>
  );
}
