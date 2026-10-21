import type { HeightmapPromptDialogProps } from '@midnite/studio-feature-media-terrain/renderer';
import { imageModelsFor, type ImageProviderId } from '@midnite/studio-shared';
import { useRef, useState } from 'react';

import { ProviderModelPicker } from '../../components/ai-thread';
import { Modal } from '../../components/modal';
import { imagePickerProviders } from '../../features/media/image/create-panel';
import { useImagePrefs, useImageProviders } from '../../features/media/image/use-images';

/** Describe the ground, pick the Images provider and model; the picture is made in the Images tab, then attached. */
export function HeightmapPromptDialog({ open, busy, error, onSubmit, onCancel }: HeightmapPromptDialogProps) {
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
