import { SPRITE_GROUP_IDS, SPRITE_SPEC_FILE, TERRAIN_SPEC_FILE, type MediaKind } from '@midnite/studio-shared';

import { bridge } from '../../../../services/bridge';
import { useNotesStore } from '../../../../store/notes-store';
import type { ResourceCandidate, ResourceSource } from '../resolve';
import { basename, mapLimit, stripExtension } from './util';

/**
 * Notes + media sources. A note's body is searched in memory (the store holds
 * it) and never returned — only its first line, as the title. Each media tab
 * is its own source, so "the dragon model" asks one tab and a slow tab drops
 * only itself.
 */

/** A note's title: its first non-empty line, minus markdown heading/list/checkbox marks. */
export function noteTitle(body: string): string {
  const line = body.split('\n').find((candidate) => candidate.trim() !== '') ?? '';
  return line.replace(/^\s*(?:#+|[-*+]|\d+\.)?\s*(?:\[[ xX]\]\s*)?/, '').trim() || 'Untitled note';
}

const notes: ResourceSource = {
  id: 'notes',
  kinds: ['note'],
  load: async () =>
    Object.values(useNotesStore.getState().notes).map((note) => ({
      ref: { kind: 'note' as const, id: note.id },
      title: noteTitle(note.body),
      detail: note.done ? 'note · done' : `note · ${note.status}`,
      keywords: note.body.toLowerCase(),
      at: note.updatedAt,
    })),
};

/** Projects whose files are listed per find — the most recently touched. */
const PROJECTS_SCANNED = 6;
/** Files kept per project, newest first. */
const FILES_PER_PROJECT = 50;

type AssetRule = {
  /** Which files are things in their own right, and what to call them. */
  pick: (path: string) => string | null;
};

const byExtension =
  (re: RegExp): AssetRule['pick'] =>
  (path) =>
    re.test(path) ? stripExtension(basename(path)) : null;

/** An asset folder's name, minus the `-YYYYMMDD-HHMMSS` stamp the generators append. */
const assetName = (folder: string): string => folder.replace(/-\d{8}-\d{6}$/, '');

const inFolder =
  (spec: string): AssetRule['pick'] =>
  (path) => {
    const match = new RegExp(`^([^/]+)/${spec.replace('.', '\\.')}$`).exec(path);
    return match ? assetName(match[1]!) : null;
  };

/** How each repo-scoped tab's files map to things a person names. `null` lists the tab's projects only. */
const ASSET_RULES: Partial<Record<MediaKind, AssetRule>> = {
  doc: { pick: byExtension(/\.(md|markdown|txt)$/i) },
  image: { pick: byExtension(/\.(png|jpe?g|webp|gif|svg)$/i) },
  video: { pick: byExtension(/\.(mp4|mov|webm|mkv)$/i) },
  audio: { pick: byExtension(/\.(mp3|wav|ogg|flac|m4a)$/i) },
  model: { pick: byExtension(/\.obj$/i) },
  terrain: { pick: inFolder(TERRAIN_SPEC_FILE) },
  sprite: { pick: inFolder(SPRITE_SPEC_FILE) },
};

function mediaSource(tab: Exclude<MediaKind, 'game'>): ResourceSource {
  return {
    id: `media:${tab}`,
    kinds: ['media'],
    media: [tab],
    load: async (q) => {
      const api = bridge();
      if (!api || q.repoId === null) return [];
      const repoId = q.repoId;
      // Sprites keep fixed group folders rather than user projects.
      let projects: { name: string; mtimeMs: number }[];
      if (tab === 'sprite') {
        projects = SPRITE_GROUP_IDS.map((name) => ({ name, mtimeMs: 0 }));
      } else {
        const listed = await api.media.project.list({ repoId, tab });
        if (!listed.ok) return [];
        projects = listed.value;
      }
      const out: ResourceCandidate[] = [];
      if (tab !== 'sprite') {
        for (const project of projects) {
          out.push({ ref: { kind: 'media', repoId, media: tab, project: project.name }, title: project.name, detail: `${tab} project`, at: project.mtimeMs });
        }
      }
      const rule = ASSET_RULES[tab];
      if (!rule) return out;
      const scanned = [...projects].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, PROJECTS_SCANNED);
      const listings = await mapLimit(scanned, 3, (project) => api.media.file.list({ repoId, tab, project: project.name }));
      listings.forEach((listing, index) => {
        if (!listing.ok) return;
        const project = scanned[index]!.name;
        const files = [...listing.value].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, FILES_PER_PROJECT);
        for (const file of files) {
          const name = rule.pick(file.path);
          if (name === null) continue;
          out.push({
            ref: { kind: 'media', repoId, media: tab, project, path: file.path },
            title: name,
            detail: `${tab} in ${project}`,
            keywords: file.path.toLowerCase(),
            at: file.mtimeMs,
          });
        }
      });
      return out;
    },
  };
}

/** Games are app-global; the ref still carries the selected repo, as the media revealer expects. */
const games: ResourceSource = {
  id: 'media:game',
  kinds: ['media'],
  media: ['game'],
  load: async (q) => {
    const api = bridge();
    if (!api || q.repoId === null) return [];
    const repoId = q.repoId;
    const { games: list } = await api.games.list();
    return list.map((game) => ({
      ref: { kind: 'media' as const, repoId, media: 'game' as const, project: game.gameId },
      title: game.name,
      detail: ['game', game.engine].filter(Boolean).join(' · '),
    }));
  },
};

export const NOTES_MEDIA_SOURCES: readonly ResourceSource[] = [
  notes,
  ...(['doc', 'image', 'video', 'audio', 'map', 'model', 'terrain', 'sprite'] as const).map(mediaSource),
  games,
];
