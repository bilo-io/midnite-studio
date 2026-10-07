import { MEDIA_TAB_EXPORT_FORMATS, spriteSheetDirections, type SpriteFramesFile, type SpritePatchOp, type SpriteSheetSpec } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { useToastStore } from '../../../store/toast-store';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import { SpriteFrameStrip } from './sprite-frame-strip';
import { SpritePreviewer } from './sprite-previewer';
import type { SpriteRef } from './use-sprite';

/**
 * A sheet's working area (Phase 106 Theme G): the animation previewer, the frame strip under it,
 * and the pack export. The clip, direction and selected frame are shared by the two, so stepping in
 * either moves the other.
 */
export type SpriteAnimatorProps = {
  repoId: string;
  target: SpriteRef;
  spec: SpriteSheetSpec;
  file: SpriteFramesFile;
  version: string;
  busy: boolean;
  progress: { done: number; total: number } | null;
  /** Sends frame edits; resolves `true` when main accepted them. */
  apply: (ops: SpritePatchOp[]) => Promise<boolean>;
};

export function SpriteAnimator({ repoId, target, spec, file, version, busy, progress, apply }: SpriteAnimatorProps) {
  const directions = spriteSheetDirections(spec);
  const [clip, setClip] = useState(spec.clips[0]?.name ?? '');
  const [dir, setDir] = useState(directions[0] ?? 's');
  const [selected, setSelected] = useState(0);

  // Another asset, or a clip/direction the sheet no longer has: fall back to the first.
  const dirKey = directions.join(',');
  useEffect(() => {
    if (!spec.clips.some((c) => c.name === clip)) setClip(spec.clips[0]?.name ?? '');
    const dirs = dirKey.split(',');
    if (!dirs.includes(dir)) setDir(dirs[0] ?? 's');
  }, [spec.clips, dirKey, clip, dir]);
  useEffect(() => setSelected(0), [clip, dir, target.group, target.asset]);

  return (
    <section aria-label="Animation" className="flex flex-col gap-2">
      <SpriteExportBar repoId={repoId} target={target} hasFrames={Object.keys(file.frames).length > 0} busy={busy} />
      <SpritePreviewer
        repoId={repoId}
        target={target}
        spec={spec}
        file={file}
        clip={clip}
        dir={dir}
        onClip={setClip}
        onDir={setDir}
        frame={selected}
        onFrame={setSelected}
        version={version}
        progress={progress}
      />
      <SpriteFrameStrip
        repoId={repoId}
        target={target}
        spec={spec}
        file={file}
        clip={clip}
        dir={dir}
        version={version}
        selected={selected}
        onSelect={setSelected}
        apply={apply}
        busy={busy}
      />
    </section>
  );
}

/**
 * The pack export: the Media export folder, else a directory prompt. Main writes `<name>.sprite/`
 * there (refusing to overwrite) and refreshes the asset's own `export/`.
 */
export function SpriteExportBar({ repoId, target, hasFrames, busy, noun = 'frames' }: { repoId: string; target: SpriteRef; hasFrames: boolean; busy: boolean; noun?: string }) {
  const exportDir = useUiStore((s) => s.mediaExportDir);
  const [exporting, setExporting] = useState(false);
  const onExport = useCallback(async () => {
    const dest = exportDir ?? (await bridge()?.repos.pickDirectory());
    if (!dest) return;
    setExporting(true);
    try {
      const api = bridge()?.media.sprite;
      const result = api ? await api.export({ repoId, ...target, dest }) : noBridge<never>();
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      const warning = result.value.warnings.length > 0 ? ` ${result.value.warnings.join(' ')}` : '';
      useToastStore.getState().addToast({
        message: `Exported ${result.value.frames} ${noun} to ${result.value.path}.${warning}`,
        status: warning ? 'warning' : 'success',
        action: { label: 'Reveal', onAction: () => void bridge()?.media.reveal({ repoId, tab: 'sprite', project: target.group, path: target.asset }) },
      });
    } finally {
      setExporting(false);
    }
  }, [exportDir, repoId, target, noun]);
  return (
    <div className="flex items-center justify-end">
      <ExportToolbar formats={MEDIA_TAB_EXPORT_FORMATS.sprite} hasSelection={hasFrames && !busy} onExport={() => void onExport()} busy={exporting} />
    </div>
  );
}
