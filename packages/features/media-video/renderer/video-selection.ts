/**
 * What the Video tab's explorer has selected (Phase 99 Theme D) — the detail
 * pane switches on `kind`. Paths are relative to their area: an asset's
 * `path` under `assets/`, a file's `name` under the project's `input/` or
 * `notes/`, an iteration's `filename` under its `output/`.
 */
export type VideoSelection =
  | { kind: 'asset'; path: string; size: number }
  | { kind: 'project'; projectId: string }
  | { kind: 'iteration'; projectId: string; filename: string }
  | { kind: 'file'; projectId: string; area: 'input' | 'notes'; name: string; size: number };

/** The project a selection belongs to — what the Studio pane follows. `null` for an asset. */
export function selectionProjectId(selection: VideoSelection | null): string | null {
  if (!selection || selection.kind === 'asset') return null;
  return selection.projectId;
}

export function sameSelection(a: VideoSelection | null, b: VideoSelection | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'asset':
      return b.kind === 'asset' && a.path === b.path;
    case 'project':
      return b.kind === 'project' && a.projectId === b.projectId;
    case 'iteration':
      return b.kind === 'iteration' && a.projectId === b.projectId && a.filename === b.filename;
    case 'file':
      return b.kind === 'file' && a.projectId === b.projectId && a.area === b.area && a.name === b.name;
  }
}

export type MediaKind = 'image' | 'video' | 'audio' | 'markdown' | 'other';

const EXT_KIND: Record<string, MediaKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  flac: 'audio',
  md: 'markdown',
};

export function mediaKindOf(name: string): MediaKind {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return EXT_KIND[ext] ?? 'other';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Group project ids (`brand/category/NNN-name`) into a folder tree for the
 * Projects accordion. A flat id is a top-level leaf.
 */
export type ProjectTreeNode =
  | { type: 'folder'; name: string; path: string; children: ProjectTreeNode[] }
  | { type: 'project'; name: string; id: string };

export function buildProjectTree(ids: readonly string[]): ProjectTreeNode[] {
  const root: ProjectTreeNode[] = [];
  for (const id of ids) {
    const segments = id.split('/');
    let level = root;
    let path = '';
    for (const segment of segments.slice(0, -1)) {
      path = path ? `${path}/${segment}` : segment;
      let folder = level.find(
        (node): node is Extract<ProjectTreeNode, { type: 'folder' }> => node.type === 'folder' && node.name === segment,
      );
      if (!folder) {
        folder = { type: 'folder', name: segment, path, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ type: 'project', name: segments[segments.length - 1]!, id });
  }
  return root;
}

/** Nest a flat recursive listing (`a`, `a/b.png`) into a tree for the Assets accordion. */
export type FileTreeNode = { name: string; path: string; isDir: boolean; size: number; children: FileTreeNode[] };

export function buildFileTree(entries: readonly { name: string; isDir: boolean; size: number }[]): FileTreeNode[] {
  const byPath = new Map<string, FileTreeNode>();
  const roots: FileTreeNode[] = [];
  const sorted = [...entries].sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  for (const entry of sorted) {
    const slash = entry.name.lastIndexOf('/');
    const node: FileTreeNode = {
      name: slash === -1 ? entry.name : entry.name.slice(slash + 1),
      path: entry.name,
      isDir: entry.isDir,
      size: entry.size,
      children: [],
    };
    byPath.set(entry.name, node);
    const parent = slash === -1 ? null : byPath.get(entry.name.slice(0, slash));
    (parent ? parent.children : roots).push(node);
  }
  const order = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    for (const node of nodes) order(node.children);
    return nodes;
  };
  return order(roots);
}
