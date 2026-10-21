import { useRef } from 'react';

import { useTerrainChrome } from './chrome';

/**
 * Missing a heightmap is a question, not a silent default (Phase 105 Theme C). It opens when
 * `terrain-build` answers `needs-height-source` — main decides, so the UI and MCP share one rule —
 * and asks every time until a heightmap or noise parameters are saved on the spec. There is no
 * remembered default.
 *
 * "Generate from a prompt" is offered only when the app supplies it (`onPrompt`): the prompt dialog is made
 * of Images' provider picker, which a Terrain package cannot reach (the host's `HeightmapPromptDialog`).
 */
export function NoHeightmapDialog({
  open,
  onUseNoise,
  onUpload,
  onPrompt,
  onCancel,
}: {
  open: boolean;
  onUseNoise: () => void;
  onUpload: () => void;
  onPrompt?: () => void;
  onCancel: () => void;
}) {
  const { Modal } = useTerrainChrome();
  const noiseRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal open={open} onClose={onCancel} title="No heightmap attached" size="sm" role="alertdialog" initialFocusRef={noiseRef} testId="no-heightmap-dialog">
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">No heightmap attached</h2>
        <p className="text-sm text-muted-foreground">No heightmap attached — generate the shape from noise, or upload one?</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Cancel
          </button>
          {onPrompt ? (
            <button type="button" onClick={onPrompt} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
              Generate from a prompt
            </button>
          ) : null}
          <button type="button" onClick={onUpload} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            Upload heightmap…
          </button>
          <button
            ref={noiseRef}
            type="button"
            onClick={onUseNoise}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Use noise
          </button>
        </div>
      </div>
    </Modal>
  );
}
