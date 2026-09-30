import {
  VIDEO_CODEC_INFO,
  VIDEO_RENDER_CODECS,
  type VideoRenderCodec,
  type VideoRenderOptions,
} from '@midnite/studio-shared';
import { useState } from 'react';

import { Modal } from '../../../components/modal';

const SCALES = [0.25, 0.5, 1, 2] as const;

/**
 * The render dialog (Phase 99 Theme D) — codec, crf/quality and resolution
 * scale, run through `remotion render --codec` in main. Renders land in the
 * project's next free `vN` like any other iteration.
 */
export function VideoRenderDialog({
  open,
  onClose,
  onRender,
  compositionId,
}: {
  open: boolean;
  onClose: () => void;
  onRender: (options: VideoRenderOptions) => void;
  compositionId: string;
}) {
  const [codec, setCodec] = useState<VideoRenderCodec>('h264');
  const [crf, setCrf] = useState(18);
  const [scale, setScale] = useState<number>(1);
  const [label, setLabel] = useState('');
  const labelValid = label === '' || /^[\w.-]+$/.test(label);
  const takesCrf = VIDEO_CODEC_INFO[codec].crf;

  const submit = () => {
    if (!labelValid) return;
    onRender({
      codec,
      ...(takesCrf ? { crf } : {}),
      ...(scale !== 1 ? { scale } : {}),
      ...(label ? { label } : {}),
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Render ${compositionId}`} size="sm" testId="video-render-dialog">
      <form
        className="flex flex-col gap-3 p-4 text-xs"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 className="text-sm font-semibold text-foreground">Render {compositionId}</h2>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">Codec</span>
          <select
            aria-label="Codec"
            value={codec}
            onChange={(event) => setCodec(event.target.value as VideoRenderCodec)}
            className="h-8 rounded-md border border-border bg-card px-2"
          >
            {VIDEO_RENDER_CODECS.map((c) => (
              <option key={c} value={c}>
                {VIDEO_CODEC_INFO[c].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            Quality (crf {takesCrf ? crf : '—'}) <span className="text-muted-foreground">lower is better</span>
          </span>
          <input
            aria-label="Quality (crf)"
            type="range"
            min={0}
            max={51}
            value={crf}
            disabled={!takesCrf}
            onChange={(event) => setCrf(Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">Resolution scale</span>
          <select
            aria-label="Resolution scale"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
            className="h-8 rounded-md border border-border bg-card px-2"
          >
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">Label</span>
          <input
            aria-label="Label"
            value={label}
            placeholder="first-cut"
            onChange={(event) => setLabel(event.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2"
          />
          {!labelValid ? (
            <span className="text-destructive">Letters, digits, dot, dash and underscore only.</span>
          ) : null}
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 hover:bg-accent">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!labelValid}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Render
          </button>
        </div>
      </form>
    </Modal>
  );
}
