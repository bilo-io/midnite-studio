import type { Plugin, ViteDevServer } from 'vite';

import { buildCsp } from '../desktop/src/main/csp';

function devServerOrigin(server: ViteDevServer): string {
  const { port, host } = server.config.server;
  const hostname = host === true || host === undefined ? 'localhost' : String(host);
  return `http://${hostname}:${port}`;
}

function isDocumentRequest(url: string | undefined): boolean {
  const path = url?.split('?')[0] ?? '';
  return path === '/' || path.endsWith('.html') || !path.includes('.');
}

/** Mirrors `installCsp` on the Vite dev server so Playwright e2e sees the same policy. */
export function midniteCspPlugin(): Plugin {
  return {
    name: 'midnite-csp',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isDocumentRequest(req.url)) {
          res.setHeader(
            'Content-Security-Policy',
            buildCsp({ dev: true, devServerOrigin: devServerOrigin(server) }),
          );
        }
        next();
      });
    },
  };
}
