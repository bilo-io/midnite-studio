import {
  ANIMATION_ATTRIBUTION_LICENCES,
  ANIMATION_LICENCE_LABELS,
  type AnimationClip,
  type GameImportAssetResult,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LuGamepad2 } from 'react-icons/lu';

import { bridge, noBridge, reportFailure, SelectField, useFrameChrome } from '@midnite/studio-frame';

/**
 * Use in a game (Phase 125 Theme G): copy the selected clip from the global library into one of the user's games
 * (`assets/animations/<name>.<ext>`, with its licence and author recorded in the game). The copy and its commit
 * are main's (the games' asset bridge); this only picks the game, names the licence when it asks for credit, and
 * shows where the file landed. Importing the same clip twice is a no-op in main, so the result says so.
 */
export function UseInGame({ clip }: { clip: AnimationClip }) {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const games = useQuery<GameSummary[]>({
    queryKey: ['media-animation', 'games'],
    queryFn: async () => (await bridge()?.games?.list())?.games ?? [],
  });
  const usable = (games.data ?? []).filter((game) => game.valid);
  const [gameId, setGameId] = useState('');
  const [result, setResult] = useState<GameImportAssetResult | null>(null);
  const chosen = usable.find((game) => game.gameId === gameId) ?? usable[0];

  const importClip = useMutation({
    mutationFn: async (target: string): Promise<GitOpResult<GameImportAssetResult>> =>
      (await bridge()?.games?.assets.import({ gameId: target, source: { animationId: clip.id } })) ?? noBridge<GameImportAssetResult>(),
    onSuccess: (outcome) => {
      reportFailure(outcome);
      if (outcome.ok) setResult(outcome.value);
    },
  });

  if (!bridge()?.games) return null;
  const run = () => {
    if (!chosen) return;
    const go = () => importClip.mutate(chosen.gameId);
    if (!ANIMATION_ATTRIBUTION_LICENCES.includes(clip.licence)) return go();
    dialogs.confirm({
      title: `Use “${clip.name}” in ${chosen.name}?`,
      body: `This clip is ${ANIMATION_LICENCE_LABELS[clip.licence]}, which requires crediting ${clip.author || 'the author'}. The licence and author are recorded in the game's assets/index.json; the credit is yours to show.`,
      confirmLabel: 'Import',
      onConfirm: go,
    });
  };

  return (
    <section aria-label="Use in a game" className="space-y-1.5">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Use in a game</h3>
      {games.isPending ? (
        <p className="text-muted-foreground">Loading games…</p>
      ) : !chosen ? (
        <p className="text-muted-foreground">No games yet. Create one in Media ▸ Games.</p>
      ) : (
        <>
          <SelectField<string> label="Game" value={chosen.gameId} onChange={(next) => {
              setGameId(next);
              setResult(null);
            }} options={usable.map((game) => ({ value: game.gameId, label: game.name }))} />
          <button
            type="button"
            onClick={run}
            disabled={importClip.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 hover:bg-accent disabled:opacity-50"
          >
            <LuGamepad2 aria-hidden className="h-3.5 w-3.5" />
            {importClip.isPending ? 'Importing…' : 'Use in this game'}
          </button>
        </>
      )}
      {result ? (
        <p role="status" className="break-all text-muted-foreground">
          {result.commit ? 'Imported to ' : 'Already in the game at '}
          <span className="font-mono text-[10px] text-foreground">{result.path}</span>
        </p>
      ) : null}
    </section>
  );
}
