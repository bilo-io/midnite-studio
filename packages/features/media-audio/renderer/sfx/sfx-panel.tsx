import {
  SFX_ATTRIBUTION,
  SFX_DOWNLOAD_BYTES,
  SFX_OPTION_RANGES,
  SFX_SEED_MAX,
  SFX_STAGE_LABELS,
  sfxBlockedReason,
  sfxConsentIsCurrent,
} from '@midnite/studio-shared';
import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { LuDices, LuDownload, LuMusic, LuSquare, LuTrash2, LuWandSparkles } from 'react-icons/lu';

import { RingSpinner as Spinner } from '@midnite/studio-frame';

import { formatBytes, formatSeconds } from './format';
import { SfxConsentDialog } from './sfx-consent-dialog';
import { toSfxRequest, type SfxFormState } from './sfx-form-state';
import { useSfx } from './use-sfx';

/** A labelled range slider with its value beside it. */
function Slider({
  label,
  hint,
  value,
  range,
  format,
  disabled,
  testId,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (value: number) => string;
  disabled?: boolean;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1" title={hint}>
      <span className="flex items-center text-[11px] text-muted-foreground">
        {label}
        <span className="ml-auto tabular-nums text-foreground">{format(value)}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        data-testid={testId}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50';

/**
 * Media ▸ SFX's right-hand panel: the Stable Audio Open Small install (consent first, then a verified download
 * with a cancel), and once installed the prompt form — every knob the model has, as sliders and inputs — with
 * Generate, the running stage, and the "Powered by Stability AI" line the licence asks for.
 */
export function SfxPanel({
  repoId,
  project,
  form,
  setForm,
  onGenerated,
}: {
  repoId: string;
  project: string;
  form: SfxFormState;
  setForm: Dispatch<SetStateAction<SfxFormState>>;
  onGenerated: (project: string, files: string[]) => void;
}) {
  const sfx = useSfx(repoId);
  const [consentOpen, setConsentOpen] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  const status = sfx.status.data;
  const installed = status?.state === 'installed' && sfxConsentIsCurrent(status.consent);
  const running = sfx.running !== null || sfx.generate.isPending;
  const checked = toSfxRequest(form);
  const blocked =
    sfxBlockedReason(status, form.prompt, running) ??
    (sfx.busy ? 'Another sound is being generated (another window, repository or an agent) — this one can start when it ends.' : null) ??
    ('error' in checked ? checked.error : null);
  const progress = sfx.installing ? sfx.progress : null;
  const total = status?.totalBytes || SFX_DOWNLOAD_BYTES;
  const partial = !installed && !sfx.installing && (status?.bytesOnDisk ?? 0) > 0 && sfxConsentIsCurrent(status?.consent ?? null);
  const set = <K extends keyof SfxFormState>(key: K, value: SfxFormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const onGenerate = () => {
    if (blocked || 'error' in checked) return;
    sfx.generate.mutate(
      { project, ...checked },
      {
        onSuccess: (result) => {
          if (result.ok) onGenerated(project, result.value.takes.map((t) => t.file));
        },
      },
    );
  };

  const stateLabel =
    status === undefined
      ? 'Checking…'
      : status.state === 'unavailable'
        ? 'Unavailable'
        : sfx.installing
          ? `Installing ${Math.round((progress?.fraction ?? 0) * 100)}%`
          : installed
            ? 'Installed'
            : 'Not installed';

  return (
    <div data-testid="sfx-panel" data-state={installed ? 'installed' : sfx.installing ? 'installing' : (status?.state ?? 'loading')} className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
        <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-2">
          <div className="flex items-center gap-2">
            <LuMusic aria-hidden className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Stable Audio Open Small</span>
            <span data-testid="sfx-state" className="ml-auto rounded-full border border-border bg-background px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {stateLabel}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Sound effects from a text prompt — up to 11 s of 44.1 kHz stereo, generated on this Mac in about ten seconds. Opt-in:{' '}
            {formatBytes(total)} is downloaded into the app’s data folder only after you accept its licence.
          </p>
        </div>

        {status?.state === 'unavailable' ? (
          <p role="status" data-testid="sfx-unavailable" className="rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            {status.reason ?? 'Stable Audio Open Small cannot run in this build.'}
          </p>
        ) : null}

        {!installed && !sfx.installing && status && status.state !== 'unavailable' ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="sfx-setup"
              onClick={() => (partial ? sfx.install.mutate() : setConsentOpen(true))}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <LuDownload aria-hidden className="h-3.5 w-3.5" />
              {partial ? `Resume install (${formatBytes(status.bytesOnDisk)} of ${formatBytes(total)})` : `Set up Stable Audio Open Small (${formatBytes(total)})…`}
            </button>
            {partial ? (
              <button
                type="button"
                data-testid="sfx-discard"
                onClick={() => sfx.uninstall.mutate()}
                disabled={sfx.uninstall.isPending}
                className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Discard the partial download
              </button>
            ) : null}
            {status.error ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                {status.error}
              </p>
            ) : null}
          </div>
        ) : null}

        {sfx.installing ? (
          <div role="status" data-testid="sfx-install-progress" className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Spinner />
              <span className="min-w-0 flex-1 truncate">
                {progress?.phase === 'manifest' ? 'Preparing…' : progress?.phase === 'verify' ? `Verified ${progress.file ?? ''}` : `Downloading ${progress?.file ?? ''}`}
              </span>
              <span className="tabular-nums text-foreground">
                {formatBytes(progress?.receivedBytes ?? 0)} / {formatBytes(progress?.totalBytes ?? total)}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Stable Audio Open Small download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
            <button
              type="button"
              data-testid="sfx-cancel-install"
              onClick={sfx.cancelInstall}
              className="flex h-7 items-center justify-center gap-1.5 self-start rounded-md border border-border bg-card px-2 text-[11px] hover:bg-accent"
            >
              <LuSquare aria-hidden className="h-3 w-3" />
              Cancel (keeps what is downloaded)
            </button>
          </div>
        ) : null}

        {installed ? (
          <div className="flex flex-col gap-3" data-testid="sfx-form">
            <Field label="Prompt">
              <textarea
                data-testid="sfx-prompt"
                value={form.prompt}
                disabled={running}
                rows={3}
                placeholder="laser zap, sci-fi, short"
                onChange={(event) => set('prompt', event.target.value)}
                className="resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
              />
            </Field>
            <Field label="File name (optional)">
              <input value={form.name} disabled={running} placeholder="From the prompt" onChange={(event) => set('name', event.target.value)} className={inputClass} />
            </Field>
            <Slider
              label="Length"
              hint="The clip length. The model conditions on it, then the clip is trimmed to exactly this."
              testId="sfx-seconds"
              value={form.seconds}
              range={SFX_OPTION_RANGES.seconds}
              format={formatSeconds}
              disabled={running}
              onChange={(v) => set('seconds', v)}
            />
            <Slider
              label="Steps"
              hint="Sampler steps. 8 is what this distilled model was tuned for; more rarely helps and costs time."
              testId="sfx-steps"
              value={form.steps}
              range={SFX_OPTION_RANGES.steps}
              format={String}
              disabled={running}
              onChange={(v) => set('steps', v)}
            />
            <Slider
              label="Guidance (CFG)"
              hint="1 = off, the model’s default. Above 1 doubles the work per step and enables the negative prompt; the distilled model was trained without it, so results vary."
              testId="sfx-cfg"
              value={form.cfgScale}
              range={SFX_OPTION_RANGES.cfgScale}
              format={(v) => v.toFixed(1)}
              disabled={running}
              onChange={(v) => set('cfgScale', v)}
            />
            <Field label={form.cfgScale > 1 ? 'Negative prompt' : 'Negative prompt (needs guidance above 1)'}>
              <input
                data-testid="sfx-negative"
                value={form.negativePrompt}
                disabled={running || form.cfgScale <= 1}
                placeholder="music, speech"
                onChange={(event) => set('negativePrompt', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Slider
              label="Variations"
              hint="How many takes to make, each with the next seed."
              testId="sfx-variations"
              value={form.variations}
              range={SFX_OPTION_RANGES.variations}
              format={String}
              disabled={running}
              onChange={(v) => set('variations', v)}
            />
            <Field label="Seed (empty = random)">
              <span className="flex gap-1">
                <input
                  data-testid="sfx-seed"
                  inputMode="numeric"
                  value={form.seed}
                  disabled={running}
                  placeholder="Random"
                  onChange={(event) => set('seed', event.target.value.replace(/[^0-9]/g, ''))}
                  className={`${inputClass} min-w-0 flex-1 tabular-nums`}
                />
                <button
                  type="button"
                  aria-label="Pick a random seed"
                  title="Pick a random seed"
                  disabled={running}
                  onClick={() => set('seed', String(Math.floor(Math.random() * SFX_SEED_MAX)))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-50"
                >
                  <LuDices aria-hidden className="h-3.5 w-3.5" />
                </button>
              </span>
            </Field>
            {running && sfx.running ? (
              <div role="status" data-testid="sfx-stage" className="flex items-center gap-2 text-muted-foreground">
                <Spinner /> {SFX_STAGE_LABELS[sfx.running.stage]}
                {sfx.running.variations && sfx.running.variations > 1 ? ` · take ${sfx.running.variation ?? 1} of ${sfx.running.variations}` : ''}
                {sfx.running.fraction !== undefined ? <span className="ml-auto tabular-nums text-foreground">{Math.round(sfx.running.fraction * 100)}%</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {sfx.lastError ? (
          <p role="alert" className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {sfx.lastError}
          </p>
        ) : null}
      </div>

      {installed ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 p-3">
          {running ? (
            <button
              type="button"
              onClick={sfx.cancelGenerate}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
            >
              <LuSquare aria-hidden className="h-3.5 w-3.5" />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              data-testid="sfx-generate"
              disabled={blocked !== null}
              title={blocked ?? 'Generate the sound'}
              onClick={onGenerate}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <LuWandSparkles aria-hidden className="h-3.5 w-3.5" />
              Generate {form.variations > 1 ? `${form.variations} takes` : 'sound'}
            </button>
          )}
          <div className="flex items-center gap-2">
            <span data-testid="sfx-attribution" className="text-[10px] text-muted-foreground">
              {SFX_ATTRIBUTION}
            </span>
            {confirmUninstall ? null : (
              <button
                type="button"
                data-testid="sfx-uninstall"
                disabled={running}
                onClick={() => setConfirmUninstall(true)}
                className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <LuTrash2 aria-hidden className="h-3 w-3" />
                Uninstall
              </button>
            )}
          </div>
          {confirmUninstall ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground" data-testid="sfx-uninstall-confirm">
              <span className="flex-1">Remove Stable Audio Open Small ({formatBytes(status?.bytesOnDisk ?? total)}) and your licence acceptance?</span>
              <button type="button" onClick={() => setConfirmUninstall(false)} className="h-6 rounded-md border border-border px-2 hover:bg-accent">
                Keep
              </button>
              <button
                type="button"
                data-testid="sfx-uninstall-yes"
                onClick={() => {
                  setConfirmUninstall(false);
                  sfx.uninstall.mutate();
                }}
                className="h-6 rounded-md border border-destructive/50 px-2 text-destructive hover:bg-destructive/10"
              >
                Uninstall
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <SfxConsentDialog
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        busy={sfx.consentAndInstall.isPending}
        onAccept={(licenceSha256) => {
          setConsentOpen(false);
          sfx.consentAndInstall.mutate({ licenceSha256 });
        }}
      />
    </div>
  );
}
