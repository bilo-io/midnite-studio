/**
 * Node-side data for `generate-app-logos.cjs`: each app's id, accent and its
 * glyph as standalone white SVG markup. Bundled by esbuild at generation time,
 * so it reads the real catalog and glyph map rather than a copy of them.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { APPS } from '../src/common/catalog';
import { APP_GLYPHS, LAUNCHER_ACCENT, LAUNCHER_GLYPH } from '../src/renderer/app-glyphs';

export type LogoSpec = { id: string; accent: string; brand: boolean; svg: string };

function whiteSvg(icon: Parameters<typeof createElement>[0]): string {
  const svg = renderToStaticMarkup(createElement(icon, { size: 512, color: '#ffffff' }));
  return svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Every app's logo, then the launcher's own (`id: 'launcher'`). */
export function logoData(): LogoSpec[] {
  return [
    ...APPS.map((app) => ({
      id: app.id,
      accent: app.accent,
      brand: app.gradient === 'brand',
      svg: whiteSvg(APP_GLYPHS[app.id]),
    })),
    { id: 'launcher', accent: LAUNCHER_ACCENT, brand: true, svg: whiteSvg(LAUNCHER_GLYPH) },
  ];
}
