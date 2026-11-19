// Theme H: react-native-svg's native build hangs jsdom; these stand-ins render real <svg>/<path> so a test can read `d`.
import type { ReactNode } from 'react';

export default function Svg({ children }: { children?: ReactNode; [k: string]: unknown }) {
  return <svg>{children}</svg>;
}
export function Path({ d, stroke }: { d?: string; stroke?: string; [k: string]: unknown }) {
  return <path d={d} stroke={stroke} data-testid="edge" />;
}
