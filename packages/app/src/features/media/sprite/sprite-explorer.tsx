import { SPRITE_GROUP_IDS, SPRITE_GROUPS, spriteFolderLabel, type SpriteLibraryRequest } from '@midnite/studio-shared';
import { useQueryClient } from '@tanstack/react-query';
import type { MouseEvent } from 'react';
import { LuCopy, LuPencil, LuTrash2 } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MediaProjectsAccordion, type MediaSelection } from '../media-projects-accordion';
import { MEDIA_KEYS } from '../use-media';

/** An asset folder holds `sprite.json`; the explorer lists exactly those, one row per asset. */
export const isSpriteSpecPath = (path: string): boolean => /^[^/]+\/sprite\.json$/.test(path);
export const spriteOfPath = (path: string): string => path.split('/')[0] ?? path;

const FIXED_GROUPS = SPRITE_GROUP_IDS.map((id) => ({ name: id, title: SPRITE_GROUPS[id] }));

/**
 * The Sprites explorer: the shared accordion with its five fixed groups (Characters, Objects,
 * Tilesets, Backgrounds, Maps — always shown, an empty one reads 0), filtered to `sprite.json` so
 * each asset is one row, and a right-click menu for Rename, Duplicate and Delete. Assets are made
 * from the create panel, so there is no "New" here.
 */
export function SpriteExplorer({
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

  const run = async (req: SpriteLibraryRequest) => {
    const api = bridge()?.media.sprite;
    const result = api ? await api.library(req) : noBridge<never>();
    reportFailure(result);
    if (result.ok) void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'sprite') });
    return result;
  };

  const menu = (event: MouseEvent, project: string, path: string) => {
    event.preventDefault();
    const group = SPRITE_GROUP_IDS.find((id) => id === project);
    if (!group) return;
    const asset = spriteOfPath(path);
    const label = spriteFolderLabel(asset);
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
              void run({ op: 'rename', repoId, group, asset, to }).then((result) => {
                if (result.ok && result.value.asset) onSelect({ project: group, path: `${result.value.asset}/sprite.json` });
              });
            },
          }),
      },
      { label: 'Duplicate', icon: LuCopy, onSelect: () => void run({ op: 'duplicate', repoId, group, asset }) },
      { type: 'separator' },
      {
        label: 'Delete',
        icon: LuTrash2,
        danger: true,
        onSelect: () =>
          dialogs.confirm({
            title: `Delete "${label}"?`,
            body: `Moves .midnite/media/sprite/${group}/${asset}/ to the Trash.`,
            confirmLabel: 'Move to Trash',
            danger: true,
            onConfirm: () => {
              void run({ op: 'delete', repoId, group, asset });
              if (selection?.project === group && selection.path && spriteOfPath(selection.path) === asset) onSelect(null);
            },
          }),
      },
    ]);
  };

  return (
    <div className="h-full min-h-0" data-testid="sprite-explorer">
      <MediaProjectsAccordion
        repoId={repoId}
        tab="sprite"
        selection={selection}
        onSelect={onSelect}
        fileFilter={isSpriteSpecPath}
        fileLabel={(path) => spriteFolderLabel(spriteOfPath(path))}
        onFileContextMenu={menu}
        fixedProjects={FIXED_GROUPS}
      />
    </div>
  );
}
