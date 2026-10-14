/**
 * Node-side data for `generate-app-logos.cjs`: each app's id, accent and its
 * glyph as standalone white SVG markup. Bundled by esbuild at generation time,
 * so it reads the real catalog and glyph map rather than a copy of them.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { APPS } from '../src/common/catalog';
import { APP_GLYPHS } from '../src/renderer/app-glyphs';

export function logoData(): { id: string; accent: string; svg: string }[] {
  return APPS.map((app) => {
    let svg = renderToStaticMarkup(createElement(APP_GLYPHS[app.id], { size: 512, color: '#ffffff' }));
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return { id: app.id, accent: app.accent, svg };
  });
}
