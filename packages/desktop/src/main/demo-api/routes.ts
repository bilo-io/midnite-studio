import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  mergeRecord,
  replaceRecord,
} from './store';

/**
 * The demo API's routing table: `/:collection` and `/:collection/:id` across
 * seven methods, with the status codes a workflow author will actually test
 * against — 201 on create, 404 on a missing id, 204 on delete, 400 on
 * unparseable JSON, 405 with an `Allow` header on anything else.
 *
 * Split from `server.ts` so the whole request→response mapping is testable as
 * a pure-ish function of a URL and a method, with no socket in the way.
 */

const ALLOWED_ON_COLLECTION = 'GET, POST, HEAD';
const ALLOWED_ON_RECORD = 'GET, PUT, PATCH, DELETE, HEAD';

/** Bodies are small by construction; anything past this is a client bug. */
const MAX_BODY_BYTES = 1024 * 1024;

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  // A HEAD answer carries the headers of the GET it mirrors, and no body — so
  // `content-length` above is still the real figure, which is the whole reason
  // a caller sends HEAD.
  res.end(res.req.method === 'HEAD' ? undefined : payload);
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; message: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) return { ok: false, message: 'Request body too large.' };
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim() === '') return { ok: true, value: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: 'Body must be a JSON object.' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: 'Body is not valid JSON.' };
  }
}

/**
 * `?limit`/`?offset` steer the page; every other param is an equality filter,
 * so `GET /items?status=open` works with no per-collection configuration. That
 * is what gives the `QUERY`-shaped GET something to query.
 */
function parseQuery(searchParams: URLSearchParams): {
  limit?: number;
  offset?: number;
  filters: Record<string, string>;
} {
  const filters: Record<string, string> = {};
  let limit: number | undefined;
  let offset: number | undefined;
  for (const [key, value] of searchParams) {
    if (key === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) limit = parsed;
    } else if (key === 'offset') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) offset = parsed;
    } else {
      filters[key] = value;
    }
  }
  return { ...(limit === undefined ? {} : { limit }), ...(offset === undefined ? {} : { offset }), filters };
}

export async function handleDemoRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // The base is a placeholder: only the path and search are ever read, and
  // `req.url` on a server is always origin-form (`/items?x=1`), never absolute.
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  const method = req.method ?? 'GET';

  if (segments.length === 0) {
    send(res, 200, { service: 'midnite-studio demo api', collections: ['items', 'users', '…'] });
    return;
  }
  if (segments.length > 2) {
    send(res, 404, { error: 'Not found.' });
    return;
  }

  const collection = segments[0]!;
  const id = segments[1];

  if (id === undefined) {
    switch (method) {
      case 'GET':
      case 'HEAD': {
        const query = parseQuery(url.searchParams);
        const { records, total } = listRecords(collection, query);
        send(res, 200, { records, total }, { 'x-total-count': String(total) });
        return;
      }
      case 'POST': {
        const body = await readJsonBody(req);
        if (!body.ok) {
          send(res, 400, { error: body.message });
          return;
        }
        const record = createRecord(collection, body.value);
        send(res, 201, record, { location: `/${collection}/${record.id}` });
        return;
      }
      default:
        send(res, 405, { error: `${method} is not allowed here.` }, { allow: ALLOWED_ON_COLLECTION });
        return;
    }
  }

  switch (method) {
    case 'GET':
    case 'HEAD': {
      const record = getRecord(collection, id);
      if (!record) {
        send(res, 404, { error: 'Not found.' });
        return;
      }
      send(res, 200, record);
      return;
    }
    case 'PUT':
    case 'PATCH': {
      const body = await readJsonBody(req);
      if (!body.ok) {
        send(res, 400, { error: body.message });
        return;
      }
      const updated =
        method === 'PUT'
          ? replaceRecord(collection, id, body.value)
          : mergeRecord(collection, id, body.value);
      if (!updated) {
        send(res, 404, { error: 'Not found.' });
        return;
      }
      send(res, 200, updated);
      return;
    }
    case 'DELETE': {
      if (!deleteRecord(collection, id)) {
        send(res, 404, { error: 'Not found.' });
        return;
      }
      send(res, 204);
      return;
    }
    default:
      send(res, 405, { error: `${method} is not allowed here.` }, { allow: ALLOWED_ON_RECORD });
  }
}
