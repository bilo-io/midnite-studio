import { Easing, interpolate } from "remotion";

import { useDrawing } from "./boil";
import { between } from "./noise";
import { INK, scriptFamily, serifFamily } from "./palette";

/**
 * The two type treatments. Nothing else in the film is set in type: the
 * reference carries its words in the voice-over, and puts letters on screen
 * only for the title and the credits.
 */

/**
 * A credit: a short handwritten line above a name in wide-tracked serif caps.
 * The script writes itself on left to right behind a ragged edge; the caps
 * resolve letter by letter, each jumping into place from a small offset on
 * twos rather than sliding, so they look drawn rather than animated.
 *
 * `t` is frames since the credit started.
 */
export const Credit: React.FC<{
  id: string;
  x: number;
  y: number;
  role: string;
  name: string;
  t: number;
  align?: "start" | "end";
  color?: string;
}> = ({ id, x, y, role, name, t, align = "start", color = INK.chalk }) => {
  const drawing = useDrawing();
  const write = interpolate(t, [8, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const anchor = align === "end" ? "end" : "start";
  const roleW = 520;
  const clipX = align === "end" ? x - roleW : x;
  return (
    <g>
      <defs>
        <clipPath id={`${id}-write`}>
          <rect x={clipX - 20} y={y - 110} width={(roleW + 40) * write} height={90} />
        </clipPath>
      </defs>
      <text
        x={x}
        y={y - 44}
        textAnchor={anchor}
        fontFamily={scriptFamily}
        fontSize={56}
        fill={color}
        clipPath={`url(#${id}-write)`}
        transform={`rotate(-4 ${x} ${y - 44})`}
      >
        {role}
      </text>
      <text x={x} y={y + 40} textAnchor={anchor} fontFamily={serifFamily} fontSize={64} letterSpacing={18} fill={color}>
        {name.split("").map((ch, i) => {
          // `dx`/`dy` on a tspan shift every glyph after it too, so each letter
          // takes its own jitter minus the one before it to stay on the line.
          const jitter = (k: number): [number, number] => {
            if (k < 0 || t >= 22 + k * 2 + between(0, 6, id, "at", k) + 6) return [0, 0];
            return [between(-6, 6, id, "jx", k, drawing), between(-8, 8, id, "jy", k, drawing)];
          };
          const [jx, jy] = jitter(i);
          const [px, py] = jitter(i - 1);
          const on = t >= 22 + i * 2 + between(0, 6, id, "at", i);
          return (
            <tspan key={i} dx={jx - px} dy={jy - py} opacity={on ? 1 : 0}>
              {ch}
            </tspan>
          );
        })}
      </text>
    </g>
  );
};

/**
 * The title band: a black dry-brush stroke across the middle of the page, the
 * title revealed behind its head, the author pinned to the far end, a small
 * mark at the start. `head` is the brush head's x; the type is clipped to it so
 * the band uncovers the words as it paints.
 */
export const TitleText: React.FC<{
  id: string;
  y: number;
  head: number;
  title: string;
  author: string;
  color?: string;
}> = ({ id, y, head, title, author, color = INK.paper }) => {
  const settle = interpolate(head, [400, 1900], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  return (
    <g>
      <defs>
        <clipPath id={`${id}-head`}>
          <rect x={0} y={y - 80} width={Math.max(0, head - 30)} height={160} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-head)`} fill={color}>
        <g transform={`translate(70 ${y})`} stroke={color} strokeWidth={2.5} fill="none">
          <circle r={14} />
          <line x1={-20} y1={0} x2={20} y2={0} />
          <line x1={0} y1={-20} x2={0} y2={20} />
        </g>
        <text x={130} y={y + 17} fontFamily={serifFamily} fontSize={50} letterSpacing={1 + settle}>
          {title}
        </text>
        <text x={1850} y={y + 17} textAnchor="end" fontFamily={serifFamily} fontSize={44}>
          {author}
        </text>
      </g>
    </g>
  );
};
