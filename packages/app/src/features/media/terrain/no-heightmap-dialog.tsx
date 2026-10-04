import { imageModelsFor, type ImageProviderId } from '@midnite/studio-shared';
import { useRef, useState } from 'react';

import { ProviderModelPicker } from '../../../components/ai-thread';
import { Modal } from '../../../components/modal';
import { imagePickerProviders } from '../image/create-panel';
import { useImagePrefs, useImageProviders } from '../image/use-images';

/**
 * Missing a heightmap is a question, not a silent default (Phase 105 Theme C). It opens when
 * `terrain-build` answers `needs-height-source` — main decides, so the UI and MCP share one rule —
 * and asks every time until a heightmap or noise parameters are saved on the spec. There is no
 * remembered default.
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
  onPrompt: () => void;
  onCancel: () => void;
}) {
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
          <button type="button" onClick={onPrompt} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            Generate from a prompt
          </button>
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

/** Describe the ground, pick the Images provider and model; the picture is made in the Images tab, then attached. */
export function HeightmapPromptDialog({
  open,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (req: { prompt: string; provider: ImageProviderId; model: string }) => void;
  onCancel: () => void;
}) {
  const statuses = useImageProviders().data ?? [];
  const prefs = useImagePrefs();
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<ImageProviderId>(prefs.provider);
  const [model, setModel] = useState(prefs.model);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const status = statuses.find((s) => s.id === provider);
  const models = imageModelsFor(provider, status?.models);
  const blocked = status && !status.available && !status.missingKey ? status.reason : null;
  const canSubmit = prompt.trim().length > 0 && model.length > 0 && !blocked && !busy;

  return (
    <Modal open={open} onClose={onCancel} title="Generate a heightmap from a prompt" size="sm" initialFocusRef={promptRef} testId="heightmap-prompt-dialog">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit({ prompt: prompt.trim(), provider, model });
        }}
      >
        <h2 className="text-sm font-semibold">Generate a heightmap from a prompt</h2>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Describe the ground
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="a volcanic island with a crater lake"
            className="rounded-md border border-border bg-background p-2 text-xs text-foreground"
          />
        </label>
        <ProviderModelPicker
          testId="terrain-image-picker"
          providers={imagePickerProviders(statuses)}
          provider={provider}
          models={models}
          model={model}
          onProviderChange={(id) => {
            const next = id as ImageProviderId;
            setProvider(next);
            setModel(imageModelsFor(next, statuses.find((s) => s.id === next)?.models)[0]?.id ?? '');
          }}
          onModelChange={setModel}
        />
        {blocked ? <p className="text-[11px] text-muted-foreground">{blocked}</p> : null}
        {error ? (
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate heightmap'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
