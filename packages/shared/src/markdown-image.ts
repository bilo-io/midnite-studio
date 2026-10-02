import { mstudioFileUrl, type FsScope } from './fs';

/**
 * How a markdown preview's `![alt](src)` turns into something an `<img>` can
 * load. Pure — the renderer resolves, main re-checks (`fs-protocol.ts`).
 *
 * - A relative src resolves against the markdown FILE's directory.
 * - A leading `/` resolves against the scope root (repo or worktree), the way
 *   GitHub renders `/docs/a.png` in a README.
 * - `https:` loads directly: the app CSP's `img-src` already allows it.
 * - `http:` is refused by that same CSP, so it is reported as `blocked`
 *   rather than left as a silent gap — and the policy is not loosened for it.
 * - Anything that climbs above the root, names no file, or is not an image
 *   extension is `invalid`: the preview shows a placeholder, never a request.
 */

/** Image extensions a markdown preview may load from disk (lower-case, no dot). */
export const MARKDOWN_IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'avif',
  'bmp',
  'ico',
] as const;

const IMAGE_EXTENSION_SET: ReadonlySet<string> = new Set(MARKDOWN_IMAGE_EXTENSIONS);

/** True when `path`'s final extension is one of {@link MARKDOWN_IMAGE_EXTENSIONS}. */
export const isMarkdownImagePath = (path: string): boolean => {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return IMAGE_EXTENSION_SET.has(name.slice(dot + 1).toLowerCase());
};

/**
 * The query flag a markdown image request carries on `mstudio-file://`. It
 * narrows that request to image extensions in main, so a doc that embeds
 * `![x](secret.env)` gets a 404 instead of the bytes.
 */
export const MSTUDIO_IMAGE_ONLY_PARAM = 'as';
export const MSTUDIO_IMAGE_ONLY_VALUE = 'image';

/**
 * `mstudio-file://` URL for a markdown-embedded image: the ordinary jailed
 * media URL plus the image-only flag, so main refuses anything but an image.
 */
export const mstudioImageUrl = (
  scope: FsScope,
  repoId: string | null,
  relPath: string,
  worktreePath?: string | null,
): string => {
  const base = mstudioFileUrl(scope, repoId, relPath, worktreePath);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${MSTUDIO_IMAGE_ONLY_PARAM}=${MSTUDIO_IMAGE_ONLY_VALUE}`;
};

export type MarkdownImageSource =
  | { kind: 'local'; relPath: string }
  | { kind: 'remote'; url: string }
  | { kind: 'blocked'; url: string; reason: 'insecure-http' | 'unsupported-scheme' }
  | { kind: 'invalid'; reason: 'empty' | 'escapes-root' | 'not-an-image' };

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

export function resolveMarkdownImageSrc(
  src: string | undefined,
  currentRelPath?: string,
): MarkdownImageSource {
  const raw = (src ?? '').trim();
  if (raw.length === 0) return { kind: 'invalid', reason: 'empty' };

  // Protocol-relative (`//host/x.png`) is a remote URL, not a root path.
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
  const scheme = SCHEME.exec(absolute)?.[1]?.toLowerCase();
  if (scheme !== undefined) {
    if (scheme === 'https') return { kind: 'remote', url: absolute };
    if (scheme === 'http') return { kind: 'blocked', url: absolute, reason: 'insecure-http' };
    return { kind: 'blocked', url: absolute, reason: 'unsupported-scheme' };
  }

  const pathOnly = (raw.split('#')[0] ?? '').split('?')[0] ?? '';
  if (pathOnly.length === 0) return { kind: 'invalid', reason: 'empty' };

  const lastSlash = currentRelPath ? currentRelPath.lastIndexOf('/') : -1;
  const baseDir = currentRelPath && lastSlash >= 0 ? currentRelPath.slice(0, lastSlash) : '';
  const joined = pathOnly.startsWith('/') ? pathOnly : baseDir ? `${baseDir}/${pathOnly}` : pathOnly;

  const stack: string[] = [];
  for (const encoded of joined.split('/')) {
    let part: string;
    try {
      part = decodeURIComponent(encoded);
    } catch {
      return { kind: 'invalid', reason: 'escapes-root' };
    }
    // A decoded segment carrying a separator or NUL is a smuggled path, not a name.
    if (part.includes('/') || part.includes('\\') || part.includes('\0')) {
      return { kind: 'invalid', reason: 'escapes-root' };
    }
    if (part.length === 0 || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return { kind: 'invalid', reason: 'escapes-root' };
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  const relPath = stack.join('/');
  if (relPath.length === 0) return { kind: 'invalid', reason: 'empty' };
  if (!isMarkdownImagePath(relPath)) return { kind: 'invalid', reason: 'not-an-image' };
  return { kind: 'local', relPath };
}
