import type { Settings } from 'sigma/settings';
import type { NodeDisplayData, PartialButFor } from 'sigma/types';

/**
 * The hover / selection bubble, themed. sigma's own `drawDiscNodeHover`
 * paints a hard-coded `#FFF` box with a black drop shadow — fine on a white
 * page, a searchlight on the dark theme. This is the same shape (a rounded
 * label box growing out of the node's own disc) in the app's tokens: the box
 * is `--background`, its edge is `--border`, the text is whatever
 * `labelColor` resolved to — `--foreground`, the theme's own text colour.
 *
 * The colours arrive through `theme`, read by the caller each time it is
 * asked to draw, so a theme flip repaints without re-mounting sigma.
 */
export type HoverTheme = {
  box: string;
  border: string;
};

/** The slice of sigma's settings the drawer reads — the generic `Settings<N, E, G>` narrowed so this file needs no graphology type imports. */
export type HoverDrawSettings = Pick<Settings, 'labelSize' | 'labelFont' | 'labelWeight' | 'labelColor'>;

export function drawThemedNodeHover(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>,
  settings: HoverDrawSettings,
  theme: HoverTheme,
): void {
  const size = settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
  context.font = `${weight} ${size}px ${font}`;

  const PADDING = 3;
  context.fillStyle = theme.box;
  context.strokeStyle = theme.border;
  context.lineWidth = 1;

  if (typeof data.label === 'string') {
    const textWidth = context.measureText(data.label).width;
    const boxWidth = Math.round(textWidth + 2 * PADDING + 4);
    const boxHeight = Math.round(size + 2 * PADDING);
    const radius = Math.max(data.size, size / 2) + PADDING;
    const angleRadian = Math.asin(boxHeight / 2 / radius);
    const xDeltaCoord = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2));

    context.beginPath();
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2);
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
    context.closePath();
    context.fill();
    context.stroke();
  }

  // A ring in the node's own colour, so the bubble reads as "this node".
  context.beginPath();
  context.arc(data.x, data.y, data.size + 1, 0, Math.PI * 2);
  context.closePath();
  context.strokeStyle = data.color;
  context.lineWidth = 1.5;
  context.stroke();

  if (data.label) {
    const color = settings.labelColor.attribute
      ? ((data as Record<string, unknown>)[settings.labelColor.attribute] as string | undefined) ??
        settings.labelColor.color
      : settings.labelColor.color;
    context.fillStyle = color ?? '#000';
    context.fillText(data.label, data.x + data.size + PADDING + 3, data.y + size / 3);
  }
}
