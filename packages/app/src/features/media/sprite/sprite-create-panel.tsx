import {
  clipsMatchPreset,
  defaultSpriteCamera,
  imageModelsFor,
  MODEL_SUGGESTED_VISION,
  modelPullHint,
  presetClips,
  SPRITE_LOOPS,
  SPRITE_PERSPECTIVES,
  SPRITE_STYLES,
  type ImageProviderId,
  type SpriteClip,
  type SpriteGroupId,
  type SpriteMethod,
  type SpritePerspective,
} from '@midnite/studio-shared';
import { useReducer, useState, type Dispatch } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { ProviderModelPicker } from '../../../components/ai-thread';
import { useDialogs } from '../../../components/dialog-host';
import { IconButton } from '../../../components/icon-button';
import { Spinner } from '../../../components/skeleton';
import { imagePickerProviders } from '../image/create-panel';
import { useImageProviders } from '../image/use-images';
import { PromptTextarea } from '../prompt-input';
import {
  envBlockedReason,
  envGenerates,
  formOneShot,
  envFormToSpec,
  FRAME_SIZE_PRESETS,
  formRecommendation,
  initialEnvForm,
  initialSheetForm,
  mirrorApplies,
  needsRig,
  providerBlockedFor,
  referenceCapable,
  SPRITE_DEFAULT_PROVIDER,
  withReferenceProvider,
  sheetBlockedReason,
  sheetFormToSpec,
  type EnvForm,
  type SheetForm,
} from './sprite-form';
import { EnvironmentFields } from './sprite-environment-form';
import { SpriteMethodPicker } from './sprite-method-picker';
import { SpriteRenderedOptions } from './sprite-rendered-options';
import { riggedModels } from './sprite-rig';
import { useSpriteActions, type SpriteRef } from './use-sprite';
import { useModelLibrary } from '../model/use-model-library';

type Mode = 'sheet' | 'environment';

type SheetAction =
  | { type: 'patch'; patch: Partial<SheetForm> }
  | { type: 'perspective'; perspective: SpritePerspective; replaceClips: boolean }
  | { type: 'method'; method: SpriteMethod }
  | { type: 'clip'; index: number; patch: Partial<SpriteClip> }
  | { type: 'addClip'; clip?: SpriteClip }
  | { type: 'removeClip'; index: number }
  | { type: 'replaceClips' };

/** Re-recommends the method until the user picks a card themselves. */
function withRecommendation(form: SheetForm): SheetForm {
  return form.methodChosen || form.method === 'one-shot' ? form : { ...form, method: formRecommendation(form).method };
}

/** Every change also keeps a hand-drawn form on a provider that can take a reference image. */
function sheetReducer(form: SheetForm, action: SheetAction): SheetForm {
  return withReferenceProvider(applySheetAction(form, action));
}

function applySheetAction(form: SheetForm, action: SheetAction): SheetForm {
  switch (action.type) {
    case 'patch':
      return withRecommendation({ ...form, ...action.patch });
    case 'perspective':
      return withRecommendation({
        ...form,
        perspective: action.perspective,
        ...(action.replaceClips ? { clips: presetClips(action.perspective), clipsEdited: false } : {}),
        ...(form.cameraChosen ? {} : { render: { ...form.render, camera: defaultSpriteCamera(action.perspective) } }),
      });
    case 'method':
      return { ...form, method: action.method, methodChosen: action.method !== 'one-shot' ? true : form.methodChosen };
    case 'clip':
      return { ...form, clipsEdited: true, clips: form.clips.map((c, i) => (i === action.index ? { ...c, ...action.patch } : c)) };
    case 'addClip':
      return { ...form, clipsEdited: true, clips: [...form.clips, action.clip ?? { name: `clip-${form.clips.length + 1}`, frames: 4, fps: 8, loop: 'loop' }] };
    case 'removeClip':
      return { ...form, clipsEdited: true, clips: form.clips.filter((_, i) => i !== action.index) };
    case 'replaceClips':
      return { ...form, clips: presetClips(form.perspective), clipsEdited: false };
  }
}

const FIELD = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';
const LABEL = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';

/**
 * The right-hand panel of Media ▸ Sprites: two modes, **Sheet** and **Environment**, swapping the
 * form beneath one shared prompt box. Sheet's Generate creates the asset and starts its job;
 * Environment's button creates the asset and starts its job (a map is only created until Theme J).
 */
export function SpriteCreatePanel({
  repoId,
  onCreated,
  onJob,
}: {
  repoId: string;
  /** The asset that was just created, to select it. */
  onCreated: (group: SpriteGroupId, asset: string) => void;
  /** A job that was just started for it. */
  onJob: (ref: SpriteRef, jobId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('sheet');
  const statuses = useImageProviders().data ?? [];
  const actions = useSpriteActions(repoId);
  const dialogs = useDialogs();
  const defaultModel = imageModelsFor(SPRITE_DEFAULT_PROVIDER).find((m) => referenceCapable(SPRITE_DEFAULT_PROVIDER, m.id))?.id ?? '';
  const [sheet, dispatch] = useReducer(sheetReducer, undefined, () => initialSheetForm(SPRITE_DEFAULT_PROVIDER, defaultModel));
  const [env, setEnv] = useState<EnvForm>(() => initialEnvForm(SPRITE_DEFAULT_PROVIDER, defaultModel));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommendation = formRecommendation(sheet);
  const sheetBlocked = sheetBlockedReason(sheet);
  const envBlocked = envBlockedReason(env);

  const createAndGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await actions.create(sheetFormToSpec(sheet));
      if (!created.ok || !created.value.group || !created.value.asset) return;
      const ref = { group: created.value.group, asset: created.value.asset };
      onCreated(ref.group, ref.asset);
      // Hand-drawn starts at step 1: a turnaround the user approves before any frame is drawn.
      const started = await actions.generate(ref, sheet.method === 'hand-drawn' ? { turnaround: true } : {});
      if (started.ok) onJob(ref, started.value.jobId);
      else setError(started.kind === 'error' ? started.message : 'Could not start generation.');
    } finally {
      setBusy(false);
    }
  };

  const createEnvironment = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await actions.create(envFormToSpec(env));
      if (!created.ok || !created.value.group || !created.value.asset) return;
      const ref = { group: created.value.group, asset: created.value.asset };
      onCreated(ref.group, ref.asset);
      if (!envGenerates(env.kind)) return;
      const started = await actions.generate(ref, {});
      if (started.ok) onJob(ref, started.value.jobId);
      else setError(started.kind === 'error' ? started.message : 'Could not start generation.');
    } finally {
      setBusy(false);
    }
  };

  const library = useModelLibrary(sheet.method === 'rendered' ? repoId : null);
  const rigged = riggedModels(library.data ?? []);
  /** Rendering from 3D with no model: the Attach button focuses the model picker in the form. */
  const attachRig = () => document.querySelector<HTMLSelectElement>('[data-testid="sprite-rig-picker"]')?.focus();

  const handDrawn = sheet.method === 'hand-drawn';
  const envModels = imageModelsFor(env.provider, statuses.find((s) => s.id === env.provider)?.models);
  const models = imageModelsFor(sheet.provider, statuses.find((s) => s.id === sheet.provider)?.models).filter((m) => !handDrawn || referenceCapable(sheet.provider, m.id));
  const pickerProviders = imagePickerProviders(statuses).map((p) => {
    const blocked = providerBlockedFor(sheet.method, p.id as ImageProviderId);
    return blocked && !p.disabled ? { ...p, disabled: true, reason: blocked } : p;
  });

  const setPerspective = (perspective: SpritePerspective) => {
    const unedited = !sheet.clipsEdited || clipsMatchPreset(sheet.clips, sheet.perspective);
    dispatch({ type: 'perspective', perspective, replaceClips: unedited });
    if (!unedited) {
      dialogs.confirm({
        title: `Replace your clips with the ${perspective} preset?`,
        body: 'Your edited clips will be replaced.',
        confirmLabel: 'Replace',
        onConfirm: () => dispatch({ type: 'replaceClips' }),
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="sprite-create-panel">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 p-3">
        <div role="radiogroup" aria-label="Create" className="flex rounded-md border border-border p-0.5">
          {(['sheet', 'environment'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              tabIndex={mode === id ? 0 : -1}
              onClick={() => setMode(id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  setMode(id === 'sheet' ? 'environment' : 'sheet');
                }
              }}
              className={`rounded px-3 py-1 text-xs font-medium ${mode === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {id === 'sheet' ? 'Sheet' : 'Environment'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        {mode === 'sheet' ? (
          <SheetFields
            form={sheet}
            dispatch={dispatch}
            recommendation={recommendation}
            onPerspective={setPerspective}
            rigged={rigged}
            riggedLoading={library.isPending && sheet.method === 'rendered'}
          />
        ) : (
          <EnvironmentFields repoId={repoId} form={env} onChange={(patch) => setEnv((current) => ({ ...current, ...patch }))} />
        )}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 p-3">
        <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Prompt
          <PromptTextarea
            aria-label="Prompt"
            rows={4}
            value={mode === 'sheet' ? sheet.prompt : env.prompt}
            placeholder={mode === 'sheet' ? 'A knight in plate armour with a red plume' : 'Lush grass with dirt paths'}
            onChange={(event) => (mode === 'sheet' ? dispatch({ type: 'patch', patch: { prompt: event.target.value } }) : setEnv((c) => ({ ...c, prompt: event.target.value })))}
          />
        </div>
        {mode === 'sheet' ? (
          <div className="flex items-center gap-2">
            <ProviderModelPicker
              testId="sprite-picker"
              providers={pickerProviders}
              provider={sheet.provider}
              models={models.map((m) => ({ ...m, ...(m.id === models[0]?.id ? { recommended: true } : {}) }))}
              model={sheet.model}
              onProviderChange={(id) => {
                const provider = id as ImageProviderId;
                dispatch({ type: 'patch', patch: { provider, model: imageModelsFor(provider, statuses.find((s) => s.id === id)?.models)[0]?.id ?? '' } });
              }}
              onModelChange={(model) => dispatch({ type: 'patch', patch: { model } })}
            />
            {needsRig(sheet) ? (
              <button type="button" onClick={attachRig} className="ml-auto h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
                Attach a rigged model…
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || sheetBlocked !== null}
                title={sheetBlocked ?? 'Generate'}
                onClick={() => void createAndGenerate()}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Spinner /> : null}
                {handDrawn ? 'Generate reference' : 'Generate'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {envGenerates(env.kind) && !env.fromTerrain ? (
              <ProviderModelPicker
                testId="sprite-env-picker"
                providers={imagePickerProviders(statuses)}
                provider={env.provider}
                models={envModels.map((m) => ({ ...m, ...(m.id === envModels[0]?.id ? { recommended: true } : {}) }))}
                model={env.model}
                onProviderChange={(id) => {
                  const provider = id as ImageProviderId;
                  setEnv((c) => ({ ...c, provider, model: imageModelsFor(provider, statuses.find((s) => s.id === id)?.models)[0]?.id ?? '' }));
                }}
                onModelChange={(model) => setEnv((c) => ({ ...c, model }))}
              />
            ) : null}
            <button
              type="button"
              disabled={busy || envBlocked !== null}
              title={envBlocked ?? (envGenerates(env.kind) ? 'Generate' : 'Create')}
              onClick={() => void createEnvironment()}
              className="ml-auto flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Spinner /> : null}
              {envGenerates(env.kind) ? 'Generate' : 'Create'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SheetFields({
  form,
  dispatch,
  recommendation,
  onPerspective,
  rigged,
  riggedLoading,
}: {
  form: SheetForm;
  dispatch: Dispatch<SheetAction>;
  recommendation: ReturnType<typeof formRecommendation>;
  onPerspective: (perspective: SpritePerspective) => void;
  rigged: ReturnType<typeof riggedModels>;
  riggedLoading: boolean;
}) {
  const patch = (p: Partial<SheetForm>) => dispatch({ type: 'patch', patch: p });
  return (
    <>
      <label className={LABEL}>
        Name
        <input aria-label="Name" className={FIELD} value={form.name} placeholder="knight" onChange={(e) => patch({ name: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Category
          <select aria-label="Category" className={FIELD} value={form.category} onChange={(e) => patch({ category: e.target.value as SheetForm['category'] })}>
            <option value="character">Character</option>
            <option value="object">Object</option>
          </select>
        </label>
        <label className={LABEL}>
          Style
          <select aria-label="Style" className={FIELD} value={form.style} onChange={(e) => patch({ style: e.target.value as SheetForm['style'] })}>
            {SPRITE_STYLES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Perspective
          <select aria-label="Perspective" className={FIELD} value={form.perspective} onChange={(e) => onPerspective(e.target.value as SpritePerspective)}>
            {SPRITE_PERSPECTIVES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Directions
          <select aria-label="Directions" className={FIELD} value={form.directions} onChange={(e) => patch({ directions: Number(e.target.value) as SheetForm['directions'] })}>
            <option value={1}>1</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
      </div>
      <div className="flex items-end gap-2">
        <label className={`${LABEL} w-20`}>
          Width
          <input aria-label="Frame width" type="number" min={8} max={512} className={FIELD} value={form.frameW} onChange={(e) => patch({ frameW: clampDim(e.target.value) })} />
        </label>
        <label className={`${LABEL} w-20`}>
          Height
          <input aria-label="Frame height" type="number" min={8} max={512} className={FIELD} value={form.frameH} onChange={(e) => patch({ frameH: clampDim(e.target.value) })} />
        </label>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {FRAME_SIZE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Frame size ${n}`}
              aria-pressed={form.frameW === n && form.frameH === n}
              onClick={() => patch({ frameW: n, frameH: n })}
              className={`rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${form.frameW === n && form.frameH === n ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Method</span>
        <SpriteMethodPicker method={form.method} recommended={recommendation} onMethod={(method) => dispatch({ type: 'method', method })} />
        {form.method === 'rendered' ? (
          <SpriteRenderedOptions
            form={form}
            rigged={rigged}
            loading={riggedLoading}
            onPatch={patch}
            onAddClip={(clip) => dispatch({ type: 'addClip', clip })}
          />
        ) : null}
        {form.method === 'hand-drawn' ? <HandDrawnOptions form={form} patch={patch} /> : null}
        {form.method === 'one-shot' ? <OneShotOptions form={form} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center">
          <span className="text-[11px] font-medium text-muted-foreground">Clips</span>
          <IconButton icon={LuPlus} label="Add clip" size="sm" className="ml-auto" onClick={() => dispatch({ type: 'addClip' })} />
        </div>
        {form.clips.map((clip, index) => (
          <div key={index} className="flex items-center gap-1" data-testid="clip-row">
            <input aria-label={`Clip ${index + 1} name`} className={`${FIELD} min-w-0 flex-1`} value={clip.name} onChange={(e) => dispatch({ type: 'clip', index, patch: { name: e.target.value } })} />
            <input aria-label={`${clip.name} frames`} type="number" min={1} max={64} className={`${FIELD} w-12`} value={clip.frames} onChange={(e) => dispatch({ type: 'clip', index, patch: { frames: clampInt(e.target.value, 1, 64) } })} />
            <input aria-label={`${clip.name} fps`} type="number" min={1} max={60} className={`${FIELD} w-12`} value={clip.fps} onChange={(e) => dispatch({ type: 'clip', index, patch: { fps: clampInt(e.target.value, 1, 60) } })} />
            <select aria-label={`${clip.name} loop`} className={`${FIELD} w-[4.5rem]`} value={clip.loop} onChange={(e) => dispatch({ type: 'clip', index, patch: { loop: e.target.value as SpriteClip['loop'] } })}>
              {SPRITE_LOOPS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <IconButton icon={LuTrash2} label={`Remove ${clip.name}`} size="sm" onClick={() => dispatch({ type: 'removeClip', index })} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Hand-drawn's own switches: the consistency check, and mirroring for side sheets. */
function HandDrawnOptions({ form, patch }: { form: SheetForm; patch: (p: Partial<SheetForm>) => void }) {
  const vision = MODEL_SUGGESTED_VISION[0]!.id;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/60 p-2" data-testid="hand-drawn-options">
      <p className="text-[11px] text-muted-foreground">Generate draws a character turnaround first. Approve it, and every frame is drawn against it.</p>
      <label className="flex items-center gap-1.5 text-[11px] text-foreground">
        <input type="checkbox" checked={form.checkConsistency} onChange={(e) => patch({ checkConsistency: e.target.checked })} className="accent-[hsl(var(--primary))]" />
        Check consistency
      </label>
      <p className="pl-5 text-[10px] text-muted-foreground">
        A local Ollama vision model scores each frame against the reference and re-rolls the ones that drift. Without one (<code>{modelPullHint(vision)}</code>), frames are kept and marked unchecked.
      </p>
      {mirrorApplies(form) ? (
        <>
          <label className="flex items-center gap-1.5 text-[11px] text-foreground">
            <input type="checkbox" checked={form.asymmetric} onChange={(e) => patch({ asymmetric: e.target.checked })} className="accent-[hsl(var(--primary))]" />
            My character is asymmetric
          </label>
          <p className="pl-5 text-[10px] text-muted-foreground">
            {form.asymmetric ? 'The west facing is drawn too, from the same poses.' : 'The west facing is the east frames mirrored — no extra requests.'}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** One-shot (Theme F): the grid the whole sheet is asked as, and the refusal when it is too large. */
function OneShotOptions({ form }: { form: SheetForm }) {
  const { grid, aspect, blocked } = formOneShot(form);
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-2" data-testid="one-shot-options">
      <p className="text-[11px] tabular-nums text-foreground">
        One image: {grid.columns} {grid.columns === 1 ? 'column' : 'columns'} × {grid.rows} {grid.rows === 1 ? 'row' : 'rows'} of {grid.cell[0]}×{grid.cell[1]} cells, {grid.gutter} px gutters, asked at {aspect}.
      </p>
      <p className="text-[10px] text-muted-foreground">
        One row per clip{form.directions > 1 ? ' and direction' : ''}. The real gutters are detected in what comes back; a sheet whose grid does not match is reported, not sliced, and a failing row can be redrawn with Hand-drawn.
      </p>
      {blocked ? (
        <p role="alert" className="text-[11px] text-destructive">
          {blocked}
        </p>
      ) : null}
    </div>
  );
}

const clampInt = (raw: string, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(Number(raw)) || min));
const clampDim = (raw: string): number => clampInt(raw, 8, 512);

