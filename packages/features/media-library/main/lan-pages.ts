import { createHash } from 'node:crypto';

import {
  LIBRARY_KIND_LABELS,
  LIBRARY_KINDS,
  type LibraryItem,
  type LibraryPlaylist,
} from '@midnite/studio-shared';

import type { PlaybackPlan } from './ffmpeg';

/**
 * The pages the LAN stream server answers with (Phase 113 Theme R slice 2): a library index, one page per item
 * with a `<video>`/`<audio>`/`<img>`, and one per playlist that plays its items in order. Self-contained — no
 * external script, style, font or image — under a strict CSP that allows exactly the one inline style and the
 * one inline script below, by hash, and media and images from this server only. Every value that came from a
 * file (a title, a tag, a playlist name) is HTML-escaped.
 */

const STYLE = `:root{color-scheme:dark light;font-family:-apple-system,system-ui,sans-serif}
body{margin:0 auto;max-width:960px;padding:16px;line-height:1.4}
h1{font-size:1.4rem}h2{font-size:1.05rem;margin-top:1.6rem;opacity:.85}
ul{list-style:none;padding:0;margin:0}li{padding:6px 0;border-bottom:1px solid rgba(127,127,127,.25)}
a{color:inherit}small,.muted{opacity:.65}.off{opacity:.45}
video,audio,img{width:100%;max-height:75vh;background:#000;border-radius:6px}
audio{background:none}li.on{font-weight:600}li[data-src]{cursor:pointer}`;

/** Plays a playlist page's entries in order: `ended` moves to the next, a click jumps to one. */
const SCRIPT = `(function(){var p=document.getElementById('player');if(!p)return;
var l=[].slice.call(document.querySelectorAll('li[data-src]'));var i=0;
function go(n,play){if(n<0||n>=l.length)return;i=n;l.forEach(function(e,j){e.className=j===i?'on':''});
p.src=l[i].getAttribute('data-src');if(play){var r=p.play();if(r&&r.catch)r.catch(function(){})}}
p.addEventListener('ended',function(){go(i+1,true)});
l.forEach(function(e,j){e.addEventListener('click',function(){go(j,true)})});go(0,false)})();`;

const hash = (text: string) =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The pages' CSP: nothing from anywhere else, no plugins, no framing, no form posts, no base rewrite. */
export const PAGE_CSP = [
  "default-src 'none'",
  "img-src 'self'",
  "media-src 'self'",
  `style-src ${hash(STYLE)}`,
  `script-src ${hash(SCRIPT)}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** HTML-escapes text for an element body or a quoted attribute. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A path on this server with the access token on it — ids only, never a file path. */
export const linkTo = (path: string, token: string): string =>
  `${path}?k=${encodeURIComponent(token)}`;

const page = (title: string, body: string, script = false): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="referrer" content="no-referrer"><title>${esc(title)}</title>` +
  `<style>${STYLE}</style></head><body>${body}${script ? `<script>${SCRIPT}</script>` : ''}</body></html>`;

/** The line a listing shows for an item. */
export function itemLabel(item: LibraryItem): string {
  switch (item.kind) {
    case 'show': {
      const code =
        item.season !== null || item.episode !== null
          ? ` S${String(item.season ?? 0).padStart(2, '0')}E${String(item.episode ?? 0).padStart(2, '0')}`
          : '';
      return `${item.showTitle ?? 'Unknown show'}${code} — ${item.title}`;
    }
    case 'music':
      return [item.artist, item.album, item.title].filter(Boolean).join(' — ');
    case 'film':
      return item.year !== null ? `${item.title} (${item.year})` : item.title;
    case 'photo':
      return item.title;
  }
}

const UNPLAYABLE = ' <small>(this browser cannot play it)</small>';

export type IndexEntry = { item: LibraryItem; plan: PlaybackPlan };

export function renderIndexPage(input: {
  token: string;
  entries: readonly IndexEntry[];
  playlists: readonly LibraryPlaylist[];
}): string {
  const { token } = input;
  const sections: string[] = [];
  if (input.playlists.length > 0) {
    sections.push(
      `<h2>Playlists</h2><ul>${input.playlists
        .map(
          (playlist) =>
            `<li><a href="${esc(linkTo(`/playlist/${playlist.id}`, token))}">${esc(playlist.name)}</a> ` +
            `<small>${playlist.itemIds.length} item${playlist.itemIds.length === 1 ? '' : 's'}</small></li>`,
        )
        .join('')}</ul>`,
    );
  }
  for (const kind of LIBRARY_KINDS) {
    const ofKind = input.entries.filter((entry) => entry.item.kind === kind);
    if (ofKind.length === 0) continue;
    sections.push(
      `<h2>${esc(LIBRARY_KIND_LABELS[kind])}</h2><ul>${ofKind
        .map(({ item, plan }) =>
          plan === 'unplayable'
            ? `<li class="off">${esc(itemLabel(item))}${UNPLAYABLE}</li>`
            : `<li><a href="${esc(linkTo(`/item/${item.id}`, token))}">${esc(itemLabel(item))}</a></li>`,
        )
        .join('')}</ul>`,
    );
  }
  const body =
    sections.length > 0
      ? sections.join('')
      : '<p class="muted">The library is empty — add a folder in Midnite Media first.</p>';
  return page('Library', `<h1>Library</h1>${body}`);
}

/** Where a page's player reads an item's bytes from: the file itself, or the transcoder. */
export const streamPath = (item: LibraryItem, plan: PlaybackPlan): string =>
  plan === 'transcode' ? `/transcode/${item.id}` : `/media/${item.id}`;

export function renderItemPage(input: {
  token: string;
  item: LibraryItem;
  plan: PlaybackPlan;
}): string {
  const { token, item, plan } = input;
  const back = `<p><a href="${esc(linkTo('/', token))}">← Library</a></p>`;
  const title = itemLabel(item);
  if (plan === 'unplayable')
    return page(
      title,
      `${back}<h1>${esc(title)}</h1><p class="muted">A browser cannot play this file, and transcoding is off ` +
        `or ffmpeg is not installed on the computer sharing it.</p>`,
    );
  const src = esc(linkTo(streamPath(item, plan), token));
  const poster =
    item.art && item.kind !== 'photo' ? ` poster="${esc(linkTo(`/art/${item.id}`, token))}"` : '';
  const media =
    item.kind === 'photo'
      ? `<img src="${src}" alt="${esc(item.title)}">`
      : item.kind === 'music'
        ? `<audio controls preload="metadata" src="${src}"></audio>`
        : `<video controls playsinline preload="metadata" src="${src}"${poster}></video>`;
  const plot = item.plot ? `<p>${esc(item.plot)}</p>` : '';
  const note =
    plan === 'transcode' ? '<p class="muted">Converted for this browser as it plays.</p>' : '';
  return page(title, `${back}<h1>${esc(title)}</h1>${media}${note}${plot}`);
}

export function renderPlaylistPage(input: {
  token: string;
  playlist: LibraryPlaylist;
  entries: readonly IndexEntry[];
}): string {
  const { token, playlist, entries } = input;
  const back = `<p><a href="${esc(linkTo('/', token))}">← Library</a></p>`;
  const rows = entries
    .map(({ item, plan }) =>
      plan === 'unplayable' || item.kind === 'photo'
        ? `<li class="off">${esc(itemLabel(item))}${plan === 'unplayable' ? UNPLAYABLE : ''}</li>`
        : `<li data-src="${esc(linkTo(streamPath(item, plan), token))}">${esc(itemLabel(item))}</li>`,
    )
    .join('');
  const playable = entries.some(({ item, plan }) => plan !== 'unplayable' && item.kind !== 'photo');
  const player = playable
    ? '<video id="player" controls playsinline preload="metadata"></video>'
    : '<p class="muted">Nothing in this playlist plays in a browser.</p>';
  return page(
    playlist.name,
    `${back}<h1>${esc(playlist.name)}</h1>${player}<ul>${rows}</ul>`,
    playable,
  );
}
