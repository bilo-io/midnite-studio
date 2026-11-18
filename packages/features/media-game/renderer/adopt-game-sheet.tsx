import { useState } from 'react';
import { LuFolderPlus } from 'react-icons/lu';

import {
  GAME_GENRES,
  GAME_PERSPECTIVES_2D,
  GAME_PERSPECTIVES_3D,
  type GameDiagnosis,
  type GameGenre,
  type GameManifest,
  type GamePerspective,
} from '@midnite/studio-shared';

import { useOccludeWhile } from './chrome';
import { GENRE_LABEL, PERSPECTIVE_LABEL } from './game-labels';

const FIELD = 'w-full rounded border border-border bg-background px-2 py-1 text-xs';

/**
 * Open Game on a folder with no `midnite-game.json` (Phase 149 Theme F): shows the manifest Midnite inferred as
 * editable fields, with the doctor's findings under them. Nothing is written or registered until
 * **Write manifest and add**; the folder's own repository gets one `chore(midnite)` commit naming only the manifest.
 */
export function AdoptGameSheet({
  path,
  proposed,
  diagnosis,
  busy = false,
  onCancel,
  onConfirm,
}: {
  path: string;
  proposed: GameManifest;
  diagnosis: GameDiagnosis;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (manifest: GameManifest) => void;
}) {
  useOccludeWhile(true);
  const [name, setName] = useState(proposed.name);
  const [perspective, setPerspective] = useState<GamePerspective>(proposed.perspective);
  const [genre, setGenre] = useState<GameGenre | ''>(proposed.genre ?? '');
  const [command, setCommand] = useState(proposed.build?.command ?? '');
  const [out, setOut] = useState(proposed.build?.out ?? 'dist');
  const perspectives = proposed.dimension === '3d' ? GAME_PERSPECTIVES_3D : GAME_PERSPECTIVES_2D;
  const trimmed = name.trim();
  const buildReady = command.trim() === '' || out.trim() !== '';
  const valid = trimmed !== '' && buildReady;

  const confirm = () => {
    const { build: _drop, ...rest } = proposed;
    void _drop;
    const manifest: GameManifest = {
      ...rest,
      name: trimmed,
      perspective,
      genre: genre === '' ? null : genre,
      ...(command.trim() !== '' ? { build: { command: command.trim(), out: out.trim() } } : {}),
    };
    onConfirm(manifest);
  };

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Add game"
      onClick={(event) => event.target === event.currentTarget && onCancel()}
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <div className="max-h-full w-full max-w-lg overflow-auto rounded-lg border border-border bg-popover shadow-xl">
        <div className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LuFolderPlus aria-hidden className="h-4 w-4" />
            Add this folder as a game
          </h2>
          <p className="text-xs text-muted-foreground">
            There is no midnite-game.json in <span className="break-all font-mono">{path}</span>. This is what Midnite found; edit it, then write it as one commit.
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="col-span-2 block">
              <span className="mb-1 block">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className={FIELD} />
            </label>
            <div>
              <span className="mb-1 block">Engine</span>
              <p className="rounded border border-border bg-muted/40 px-2 py-1">{proposed.engine === 'three' ? 'three.js' : 'Phaser'}</p>
            </div>
            <div>
              <span className="mb-1 block">Dimension</span>
              <p className="rounded border border-border bg-muted/40 px-2 py-1">{proposed.dimension.toUpperCase()}</p>
            </div>
            <label className="block">
              <span className="mb-1 block">Perspective</span>
              <select value={perspective} onChange={(event) => setPerspective(event.target.value as GamePerspective)} className={FIELD}>
                {perspectives.map((value) => (
                  <option key={value} value={value}>
                    {PERSPECTIVE_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block">Genre</span>
              <select value={genre} onChange={(event) => setGenre(event.target.value as GameGenre | '')} className={FIELD}>
                <option value="">Custom</option>
                {GAME_GENRES.map((value) => (
                  <option key={value} value={value}>
                    {GENRE_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block">Build command</span>
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="none" spellCheck={false} className={`${FIELD} font-mono`} />
            </label>
            <label className="block">
              <span className="mb-1 block">Build output</span>
              <input value={out} onChange={(event) => setOut(event.target.value)} disabled={command.trim() === ''} spellCheck={false} className={`${FIELD} font-mono`} />
            </label>
          </div>
          {diagnosis.findings.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium">After adding, the doctor will report</p>
              <ul className="space-y-1 rounded border border-border bg-muted/30 p-2 text-xs">
                {diagnosis.findings.map((finding, index) => (
                  <li key={`${finding.rule}-${index}`} className="flex gap-2">
                    <span className="shrink-0 font-mono uppercase text-muted-foreground">{finding.level}</span>
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs hover:bg-accent">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={confirm}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Write manifest and add
          </button>
        </div>
      </div>
    </div>
  );
}
