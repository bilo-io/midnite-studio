/**
 * Run scaffold for zip and folder web exports: `serve.mjs`, `package.json` and `README-run.txt`, so an
 * extracted export starts with `npm start` instead of needing `file://` (where ES modules and fetch()
 * of assets break). Pure builders — game-export.ts decides what to write and never overwrites a game file.
 */
export const RUN_SERVE_FILE = 'serve.mjs';
export const RUN_PACKAGE_FILE = 'package.json';
export const RUN_README_FILE = 'README-run.txt';

export const RUN_README = `Run this game: npm start   (Node 18 or newer), then open the printed address.
Or serve this folder with any static server; opening index.html from disk (file://) will not work.
`;

export function buildRunPackage(slug: string): string {
  return `${JSON.stringify({ name: slug, private: true, type: 'module', scripts: { start: 'node serve.mjs' } }, null, 2)}\n`;
}

/** The server source, with the entry page baked in. Exports `createHandler` so it can be tested without a socket. */
export function buildServeScript(entry: string): string {
  return `import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRY = ${JSON.stringify(entry)};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

export function createHandler(root = ROOT, entry = ENTRY) {
  const base = resolve(root);
  return async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
    if (path.includes('\\0')) { res.writeHead(400).end('Bad request'); return; }
    if (path.endsWith('/')) path += path === '/' ? entry : 'index.html';
    const file = resolve(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end('Forbidden'); return; }
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  };
}

function listen(port, tries = 10) {
  const server = createServer(createHandler());
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && tries > 0) listen(port + 1, tries - 1);
    else throw error;
  });
  server.listen(port, () => console.log(\`http://localhost:\${port}\`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) listen(Number(process.env.PORT) || 8080);
`;
}
