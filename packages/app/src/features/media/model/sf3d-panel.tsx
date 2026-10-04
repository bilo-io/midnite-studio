import {
  consentIsCurrent,
  SF3D_DEFAULT_TEXTURE_SIZE,
  SF3D_DOWNLOAD_BYTES,
  SF3D_STAGE_LABELS,
  SF3D_TEXTURE_SIZES,
  sf3dBlockedReason,
  type ModelImageAttachment,
} from '@midnite/studio-shared';
import { useState, type DragEvent } from 'react';
import { LuBox, LuDownload, LuImagePlus, LuSquare, LuTrash2, LuX } from 'react-icons/lu';

import { Spinner } from '../../../components/skeleton';
import { readImageAttachment } from './model-utils';
import { Sf3dConsentDialog } from './sf3d-consent-dialog';
import { formatBytes, useSf3d } from './use-sf3d';

/**
 * Media ▸ Models ▸ SF3D (Phase 103 Theme J): the opt-in, local image-to-3D tier. Shows the install
 * state, opens the licence consent before any download, follows the download with a cancel, and —
 * once installed — turns an attached picture into a textured `.glb` in the current group.
 */
export function Sf3dPanel({
  repoId,
  project,
  onGenerated,
}: {
  repoId: string;
  project: string;
  onGenerated: (project: string, primary: string) => void;
}) {
  const sf3d = useSf3d(repoId);
  const [consentOpen, setConsentOpen] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [image, setImage] = useState<ModelImageAttachment | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [textureSize, setTextureSize] = useState<512 | 1024 | 2048>(SF3D_DEFAULT_TEXTURE_SIZE);
  const [dragging, setDragging] = useState(false);

  const status = sf3d.status.data;
  const installed = status?.state === 'installed' && consentIsCurrent(status.consent);
  const running = sf3d.running !== null || sf3d.generate.isPending;
  const blocked = sf3dBlockedReason(status, image !== null, running);
  const progress = sf3d.installing ? sf3d.progress : null;
  const total = status?.totalBytes ?? SF3D_DOWNLOAD_BYTES;
  const partial = !installed && !sf3d.installing && (status?.bytesOnDisk ?? 0) > 0 && consentIsCurrent(status?.consent ?? null);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    const read = await readImageAttachment(file);
    setImageError(read.ok ? null : read.error);
    if (read.ok) setImage(read.attachment);
  };
  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => void attach(input.files?.[0]);
    input.click();
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (installed) void attach([...event.dataTransfer.files].find((f) => f.type.startsWith('image/')));
  };
  const onGenerate = () => {
    if (blocked || !image) return;
    sf3d.generate.mutate(
      { project, image, textureSize },
      {
        onSuccess: (result) => {
          if (!result.ok) return;
          onGenerated(project, result.value.primary);
          setImage(null);
        },
      },
    );
  };

  const stateLabel =
    status === undefined
      ? 'Checking…'
      : status.state === 'unavailable'
        ? 'Unavailable'
        : sf3d.installing
          ? `Installing ${Math.round((progress?.fraction ?? 0) * 100)}%`
          : installed
            ? 'Installed'
            : 'Not installed';

  return (
    <div
      data-testid="sf3d-panel"
      data-state={installed ? 'installed' : sf3d.installing ? 'installing' : (status?.state ?? 'loading')}
      data-dragging={dragging || undefined}
      className="flex h-full min-h-0 flex-col data-[dragging]:bg-primary/5"
      onDragOver={(event) => {
        if (installed && [...event.dataTransfer.types].includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
        <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-2">
          <div className="flex items-center gap-2">
            <LuBox aria-hidden className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">SF3D · Stable Fast 3D</span>
            <span
              data-testid="sf3d-state"
              className="ml-auto rounded-full border border-border bg-background px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground"
            >
              {stateLabel}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A neural network that turns a picture of one object into a UV-unwrapped, textured mesh (<span className="font-medium text-foreground">.glb</span>),
            on this Mac. Opt-in: {formatBytes(total)} is downloaded into the app’s data folder only after you accept its licence.
            A cut-out picture (transparent background) works best.
          </p>
        </div>

        {status?.state === 'unavailable' ? (
          <p role="status" className="rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            {status.reason ?? 'SF3D cannot run in this build.'}
          </p>
        ) : null}

        {!installed && !sf3d.installing && status && status.state !== 'unavailable' ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="sf3d-setup"
              onClick={() => (partial ? sf3d.install.mutate() : setConsentOpen(true))}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <LuDownload aria-hidden className="h-3.5 w-3.5" />
              {partial ? `Resume install (${formatBytes(status.bytesOnDisk)} of ${formatBytes(total)})` : `Set up SF3D (${formatBytes(total)})…`}
            </button>
            {status.error ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                {status.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {sf3d.installing ? (
          <div role="status" data-testid="sf3d-install-progress" className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Spinner />
              <span className="min-w-0 flex-1 truncate">
                {progress?.phase === 'manifest'
                  ? 'Checking the manifest…'
                  : progress?.phase === 'verify'
                    ? `Verified ${progress.file ?? ''}`
                    : `Downloading ${progress?.file ?? ''}`}
              </span>
              <span className="tabular-nums text-foreground">
                {formatBytes(progress?.receivedBytes ?? 0)} / {formatBytes(progress?.totalBytes ?? total)}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="SF3D download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
            <button
              type="button"
              data-testid="sf3d-cancel-install"
              onClick={sf3d.cancelInstall}
              className="flex h-7 items-center justify-center gap-1.5 self-start rounded-md border border-border bg-card px-2 text-[11px] hover:bg-accent"
            >
              <LuSquare aria-hidden className="h-3 w-3" />
              Cancel (keeps what is downloaded)
            </button>
          </div>
        ) : null}

        {installed ? (
          <div className="flex flex-col gap-2" data-testid="sf3d-generate-area">
            {image ? (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 p-2" data-testid="sf3d-image">
                <img alt="" src={`data:${image.mime};base64,${image.data}`} className="h-14 w-14 shrink-0 rounded border border-border object-contain" />
                <span className="min-w-0 flex-1 truncate">{image.name}</span>
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImage(null)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <LuX aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="sf3d-attach"
                onClick={pickFile}
                className="flex h-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LuImagePlus aria-hidden className="h-5 w-5" />
                Attach or drop a picture of one object
              </button>
            )}
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Texture
              <select
                aria-label="Texture size"
                value={textureSize}
                disabled={running}
                onChange={(event) => setTextureSize(Number(event.target.value) as 512 | 1024 | 2048)}
                className="h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
              >
                {SF3D_TEXTURE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} × {size}
                  </option>
                ))}
              </select>
            </label>
            {running && sf3d.running ? (
              <div role="status" data-testid="sf3d-stage" className="flex items-center gap-2 text-muted-foreground">
                <Spinner /> {SF3D_STAGE_LABELS[sf3d.running.stage]}
                {sf3d.running.fraction !== undefined ? <span className="ml-auto tabular-nums text-foreground">{Math.round(sf3d.running.fraction * 100)}%</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {imageError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {imageError}
          </p>
        ) : null}
        {sf3d.lastError ? (
          <p role="alert" className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {sf3d.lastError}
          </p>
        ) : null}
      </div>

      {installed ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 p-3">
          {running ? (
            <button
              type="button"
              onClick={sf3d.cancelGenerate}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
            >
              <LuSquare aria-hidden className="h-3.5 w-3.5" />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              data-testid="sf3d-generate"
              disabled={blocked !== null}
              title={blocked ?? 'Generate a textured 3D model from the picture'}
              onClick={onGenerate}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <LuBox aria-hidden className="h-3.5 w-3.5" />
              Generate 3D model
            </button>
          )}
          {confirmUninstall ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground" data-testid="sf3d-uninstall-confirm">
              <span className="flex-1">Remove SF3D ({formatBytes(status?.bytesOnDisk ?? total)}) and your licence acceptance?</span>
              <button type="button" onClick={() => setConfirmUninstall(false)} className="h-6 rounded-md border border-border px-2 hover:bg-accent">
                Keep
              </button>
              <button
                type="button"
                data-testid="sf3d-uninstall-yes"
                onClick={() => {
                  setConfirmUninstall(false);
                  sf3d.uninstall.mutate();
                }}
                className="h-6 rounded-md border border-destructive/50 px-2 text-destructive hover:bg-destructive/10"
              >
                Uninstall
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="sf3d-uninstall"
              disabled={running}
              onClick={() => setConfirmUninstall(true)}
              className="flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <LuTrash2 aria-hidden className="h-3 w-3" />
              Uninstall SF3D
            </button>
          )}
        </div>
      ) : null}

      <Sf3dConsentDialog
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        busy={sf3d.consentAndInstall.isPending}
        onAccept={(licenceSha256) => {
          setConsentOpen(false);
          sf3d.consentAndInstall.mutate({ licenceSha256 });
        }}
      />
    </div>
  );
}
