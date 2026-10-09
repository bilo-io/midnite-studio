import { terrainFolderLabel, type TerrainLibraryRequest } from '@midnite/studio-shared';
import { useQueryClient } from '@tanstack/react-query';
import type { MouseEvent } from 'react';
import { LuCopy, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MediaProjectsAccordion, type MediaSelection } from '../media-projects-accordion';
import { MEDIA_KEYS, useMediaProjects } from '../use-media';

/** A terrain folder holds `terrain.json`; the explorer lists exactly those, one row per terrain. */
export const isTerrainSpecPath = (path: string): boolean => /^[^/]+\/terrain\.json$/.test(path);
export const terrainOfPath = (path: string): string => path.split('/')[0] ?? path;

/**
 * The Terrain explorer: the shared projects accordion (a project is a group), filtered to
 * `terrain.json` so each terrain is one row, plus New terrain and a right-click menu for Rename,
 * Duplicate and Delete. Delete moves the folder to the Trash behind a confirm that names it.
 */
export function TerrainExplorer({
  repoId,
  selection,
  onSelect,
}: {
  repoId: string;
  selection: MediaSelection | null;
  onSelect: (selection: MediaSelection | null) => void;
}) {
  const dialogs = useDialogs();
  const client = useQueryClient();
  const projects = useMediaProjects(repoId, 'terrain');
  const empty = projects.isSuccess && (projects.data ?? []).length === 0;

  const run = async (req: TerrainLibraryRequest) => {
    const api = bridge()?.media.terrain;
    const result = api ? await api.library(req) : noBridge<never>();
    reportFailure(result);
    if (result.ok) void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'terrain') });
    return result;
  };

  const create = () =>
    dialogs.prompt({
      title: 'New terrain',
      label: 'Name',
      confirmLabel: 'Create',
      placeholder: 'dunes',
      validate: (value) => (value.trim().length === 0 ? 'Enter a name.' : null),
      onConfirm: (name) => {
        void run({ op: 'create', repoId, name, ...(selection ? { project: selection.project } : {}) }).then((result) => {
          if (result.ok && result.value.project && result.value.terrain) onSelect({ project: result.value.project, path: `${result.value.terrain}/terrain.json` });
        });
      },
    });

  const menu = (event: MouseEvent, project: string, path: string) => {
    event.preventDefault();
    const terrain = terrainOfPath(path);
    const label = terrainFolderLabel(terrain);
    dialogs.openMenu(event, [
      {
        label: 'Rename',
        icon: LuPencil,
        onSelect: () =>
          dialogs.prompt({
            title: `Rename "${label}"`,
            label: 'Name',
            initialValue: label,
            confirmLabel: 'Rename',
            validate: (value) => (value.trim().length === 0 ? 'Enter a name.' : null),
            onConfirm: (to) => {
              void run({ op: 'rename', repoId, project, terrain, to }).then((result) => {
                if (result.ok && result.value.terrain) onSelect({ project, path: `${result.value.terrain}/terrain.json` });
              });
            },
          }),
      },
      {
        label: 'Duplicate',
        icon: LuCopy,
        onSelect: () => void run({ op: 'duplicate', repoId, project, terrain }),
      },
      { type: 'separator' },
      {
        label: 'Delete',
        icon: LuTrash2,
        danger: true,
        onSelect: () =>
          dialogs.confirm({
            title: `Delete "${label}"?`,
            body: `Moves .midnite/media/terrain/${project}/${terrain}/ to the Trash.`,
            confirmLabel: 'Move to Trash',
            danger: true,
            onConfirm: () => {
              void run({ op: 'delete', repoId, project, terrain });
              if (selection?.project === project && selection.path && terrainOfPath(selection.path) === terrain) onSelect(null);
            },
          }),
      },
    ]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="terrain-explorer">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Terrains</h2>
        <IconButton icon={LuPlus} label="New terrain" size="sm" className="ml-auto" onClick={create} />
      </div>
      <div className="min-h-0 flex-1">
        {empty ? (
          <EmptyState title="No terrains yet" body="Create one, or ask an agent to with `terrain_set_spec`." bodySize="xs" />
        ) : (
          <MediaProjectsAccordion
            repoId={repoId}
            tab="terrain"
            selection={selection}
            onSelect={onSelect}
            fileFilter={isTerrainSpecPath}
            fileLabel={(path) => terrainFolderLabel(terrainOfPath(path))}
            onFileContextMenu={menu}
          />
        )}
      </div>
    </div>
  );
}
