import {
  agentHeadlessArgs,
  agentIteratesModel,
  MODEL_ITERATIONS_MAX,
  loopModelsFor,
  MODEL_DEFAULT_TEXT_MODEL,
  MODEL_DEFAULT_VISION_MODEL,
  MODEL_STAGE_LABELS,
  MODEL_SUGGESTED_TEXT,
  MODEL_SUGGESTED_VISION,
  modelPullHint,
  type LoopModel,
  type ModelEngine,
  type ModelImageAttachment,
} from '@midnite/studio-shared';
import { useMemo, useState, type DragEvent } from 'react';
import { LuImagePlus, LuInfo, LuSquare, LuX } from 'react-icons/lu';
import { SiOllama } from 'react-icons/si';

import { AiComposer, AttachMenu, ProviderModelPicker, useComposerMic, type PickerProvider } from '../../../components/ai-thread';
import { Spinner } from '../../../components/skeleton';
import { useUiStore } from '../../../store/ui-store';
import { useAgents } from '../../terminal/use-agents';
import { agentPickerProviders } from '../agent-model-picker';
import { MEDIA_PROMPT_BOX } from '../prompt-input';
import { appendDictation, useSpeakOutcome, useVoiceThread } from '../voice/use-voice-thread';
import { SpeechToggle } from '../voice/voice-controls';
import { generateBlockedReason, pickOllamaModel, readImageAttachment, textModels, visionModels } from './model-utils';
import { Sf3dPanel } from './sf3d-panel';
import { useModelGeneration, useModelPrefs, useModelProviders, type ModelTier } from './use-model';

/**
 * The right-hand panel of Media ▸ Models: the prompt box (with its engine
 * picker and an "attach image" menu — a picture can also be dropped on the
 * panel), what the vision model will do with that picture, and the live stage
 * of a running generation. Generation itself runs in main.
 */
export function ModelPanel(props: {
  repoId: string;
  /** The project a generation lands in. */
  project: string;
  /** Fired with the new project/file once a run succeeds. */
  onGenerated: (project: string, primary: string) => void;
}) {
  const tier = useModelPrefs((s) => s.tier);
  const setPrefs = useModelPrefs((s) => s.set);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TierSwitch tier={tier} onChange={(next) => setPrefs({ tier: next })} />
      <div className="flex min-h-0 flex-1 flex-col">{tier === 'sf3d' ? <Sf3dPanel {...props} /> : <ProceduralPanel {...props} />}</div>
    </div>
  );
}

/**
 * The fidelity tier (Phase 103): Tier 0 is the LLM-authored, procedural design the editor rigs and
 * animates; Tier 1 is SF3D, an opt-in local neural network that returns a textured mesh.
 */
function TierSwitch({ tier, onChange }: { tier: ModelTier; onChange: (tier: ModelTier) => void }) {
  const options: { id: ModelTier; label: string; hint: string }[] = [
    { id: 'procedural', label: 'Procedural', hint: 'Tier 0 — an LLM designs editable parts; riggable, no download' },
    { id: 'sf3d', label: 'SF3D · image → 3D', hint: 'Tier 1 — a local neural network returns a textured mesh; opt-in download' },
  ];
  return (
    <div role="radiogroup" aria-label="Model engine tier" data-testid="model-tier" className="flex shrink-0 gap-1 border-b border-border/50 p-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={tier === option.id}
          title={option.hint}
          data-testid={`model-tier-${option.id}`}
          onClick={() => onChange(option.id)}
          className="h-7 flex-1 rounded-md border border-transparent px-2 text-[11px] text-muted-foreground hover:bg-accent aria-checked:border-border aria-checked:bg-card aria-checked:font-medium aria-checked:text-foreground"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ProceduralPanel({
  repoId,
  project,
  onGenerated,
}: {
  repoId: string;
  project: string;
  onGenerated: (project: string, primary: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<ModelImageAttachment | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const prefs = useModelPrefs();
  const providers = useModelProviders();
  const generation = useModelGeneration(repoId);
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  const headless = useMemo(() => agents.filter((a) => agentHeadlessArgs(a.id) !== null), [agents]);

  const voice = useVoiceThread();
  const mic = useComposerMic({ onTranscript: (text) => setPrompt((current) => appendDictation(current, text)) });
  const running = generation.pending.length > 0;
  useSpeakOutcome(voice, running, generation.lastError, 'Your 3D model is ready.');

  const ollama = providers.data?.ollama;
  const installedText = ollama ? textModels(ollama.models) : [];
  const installedVision = ollama ? visionModels(ollama.models) : [];
  const engineId = prefs.engineId === 'ollama' || headless.some((a) => a.id === prefs.engineId) ? prefs.engineId : 'ollama';
  const ollamaModel = pickOllamaModel(ollama?.models ?? [], prefs.ollamaModel);

  const engine: ModelEngine =
    engineId === 'ollama'
      ? { kind: 'ollama', model: ollamaModel }
      : { kind: 'agent', agentId: engineId, ...(prefs.agentModel !== 'default' ? { model: prefs.agentModel } : {}) };

  const iterative = engine.kind === 'agent' && agentIteratesModel(engine.agentId);
  const blocked = generateBlockedReason({
    iterative,
    prompt,
    image,
    running,
    engine: { id: engineId, model: engineId === 'ollama' ? ollamaModel : prefs.agentModel },
    providers: providers.data,
  });

  // Say in the picker itself which engines iterate (build, render, look, refine) and which answer once.
  const pickerProviders: PickerProvider[] = [
    { id: 'ollama', label: 'Ollama (local, free) · one-shot', icon: SiOllama, color: '#F5F5F5', recommended: true },
    ...agentPickerProviders(headless, primaryAgent).map((p) => ({
      ...p,
      label: `${p.label} · ${agentIteratesModel(p.id) ? 'iterative (MCP)' : 'one-shot'}`,
    })),
  ];
  const pickerModels =
    engineId === 'ollama'
      ? installedText.map((m, i) => ({ id: m.id, label: m.label, ...(i === 0 ? { recommended: true } : {}) }))
      : loopModelsFor(engineId).map((m) => ({ id: m.id, label: m.label, ...(m.id === 'default' ? { recommended: true } : {}) }));

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

  const onGenerate = () => {
    if (blocked) return;
    generation.generate.mutate(
      {
        project,
        prompt: prompt.trim(),
        engine,
        ...(iterative ? { maxIterations: prefs.maxIterations } : {}),
        ...(image ? { image } : {}),
        ...(image && prefs.visionModel ? { visionModel: prefs.visionModel } : {}),
      },
      {
        onSuccess: (result) => {
          if (!result.ok) return;
          onGenerated(project, result.value.primary);
          setPrompt('');
          setImage(null);
        },
      },
    );
  };

  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragging(false);
    void attach([...event.dataTransfer.files].find((f) => f.type.startsWith('image/')));
  };

  const live = generation.pending[0];
  const stage = live?.stage;
  const ollamaDown = engineId === 'ollama' && ollama && !ollama.available;
  const noTextModel = engineId === 'ollama' && ollama?.available && installedText.length === 0;
  const noVision = image && !iterative && ollama?.available && installedVision.length === 0;

  return (
    <form
      aria-label="Create 3D model"
      data-dragging={dragging || undefined}
      className="flex h-full min-h-0 flex-col data-[dragging]:bg-primary/5"
      onSubmit={(event) => {
        event.preventDefault();
        onGenerate();
      }}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Describe an object — or attach a picture of one — and the engine designs it from boxes, spheres, cylinders and revolved
          profiles. You get an <span className="font-medium text-foreground">.obj</span> and an{' '}
          <span className="font-medium text-foreground">.fbx</span>.
        </p>

        <div data-testid="model-engine-mode" data-mode={iterative ? 'iterative' : 'one-shot'} className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          {iterative ? (
            <>
              <p>
                <span className="font-medium text-foreground">Iterative (MCP).</span> The agent builds a first design, renders previews of it,
                looks at them, and refines — up to the passes below — and you watch it take shape in the editor. With a picture attached it
                looks at the picture itself.
              </p>
              <label className="flex items-center gap-2">
                Refinement passes
                <input
                  type="range"
                  aria-label="Refinement passes"
                  min={1}
                  max={MODEL_ITERATIONS_MAX}
                  step={1}
                  value={prefs.maxIterations}
                  disabled={running}
                  onChange={(event) => prefs.set({ maxIterations: Number(event.target.value) })}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
                />
                <span className="tabular-nums w-7 text-right text-[11px] text-foreground">{prefs.maxIterations}</span>
              </label>
            </>
          ) : (
            <p>
              <span className="font-medium text-foreground">One-shot.</span>{' '}
              {engineId === 'ollama'
                ? 'The model writes the whole design in one reply, and is asked to fix it if it does not validate.'
                : 'This agent writes the whole design in one reply — it cannot be attached to Midnite’s MCP tools here. Claude Code and Codex iterate.'}
            </p>
          )}
        </div>

        {image ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-2" data-testid="model-image">
            <div className="flex items-center gap-2">
              <img
                alt=""
                src={`data:${image.mime};base64,${image.data}`}
                className="h-12 w-12 shrink-0 rounded border border-border object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs">{image.name}</span>
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => setImage(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LuX aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
            {!iterative && installedVision.length > 0 ? (
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                Vision model
                <select
                  aria-label="Vision model"
                  value={prefs.visionModel}
                  onChange={(event) => prefs.set({ visionModel: event.target.value })}
                  className="h-6 min-w-0 flex-1 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
                >
                  <option value="">Auto ({installedVision[0]!.id})</option>
                  {installedVision.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {iterative
                ? 'The agent looks at this picture itself and compares each preview of the model with it.'
                : 'A vision model describes the picture, then the engine builds that description. It is not an image-to-3D network, so expect a stylised likeness.'}
            </p>
          </div>
        ) : null}

        {noVision ? (
          <Notice testId="model-no-vision">
            No vision model is installed. Run <Code>{modelPullHint(MODEL_DEFAULT_VISION_MODEL)}</Code> ({MODEL_SUGGESTED_VISION[0]!.downloadGb} GB,
            ~{MODEL_SUGGESTED_VISION[0]!.ramGb} GB RAM) or the lighter <Code>{modelPullHint(MODEL_SUGGESTED_VISION[1]!.id)}</Code> (
            {MODEL_SUGGESTED_VISION[1]!.downloadGb} GB), then attach again.
          </Notice>
        ) : null}
        {ollamaDown ? (
          <Notice testId="model-ollama-down">
            {ollama.reason ?? 'Ollama is not running.'} Or choose an agent in the picker below.
          </Notice>
        ) : null}
        {noTextModel ? (
          <Notice testId="model-no-text">
            No Ollama model is installed. Run <Code>{modelPullHint(MODEL_DEFAULT_TEXT_MODEL)}</Code> ({MODEL_SUGGESTED_TEXT[0]!.downloadGb} GB,
            ~{MODEL_SUGGESTED_TEXT[0]!.ramGb} GB RAM), or <Code>{modelPullHint(MODEL_SUGGESTED_TEXT[1]!.id)}</Code> for a lighter one.
          </Notice>
        ) : null}

        {imageError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {imageError}
          </p>
        ) : null}
        {generation.lastError ? (
          <p role="alert" className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {generation.lastError}
          </p>
        ) : null}
        {running && stage ? (
          <div role="status" data-testid="model-stage" className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <Spinner /> {MODEL_STAGE_LABELS[stage]}
              {live?.iteration ? (
                <span data-testid="model-iteration" className="ml-auto tabular-nums text-foreground">
                  Pass {live.iteration.n} of {live.iteration.max}
                </span>
              ) : null}
            </p>
            {live?.score ? (
              <p data-testid="model-score" className="flex items-center gap-2 pl-6 tabular-nums">
                <span>Reference match {live.score.value.toFixed(2)}</span>
                <span className="text-foreground" title="Score per pass">
                  {live.score.history.map((s) => s.toFixed(2)).join(' → ')}
                </span>
              </p>
            ) : null}
            {live?.action ? (
              <p data-testid="model-action" className="truncate pl-6" title={live.action}>
                {live.action}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/50 p-3">
        <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Description
          <AiComposer
            ariaLabel="Description"
            value={prompt}
            onChange={setPrompt}
            onSend={onGenerate}
            canSend={!blocked}
            enterToSend={false}
            sendTooltip={blocked ?? 'Generate (Cmd/Ctrl+Enter)'}
            sendAriaLabel="Generate"
            rows={5}
            placeholder="A low-poly red fox sitting, with a bushy white-tipped tail"
            mic={mic}
            leading={
              <>
                <ProviderModelPicker
                  testId="model-picker"
                  providers={pickerProviders}
                  provider={engineId}
                  onProviderChange={(id) => prefs.set({ engineId: id })}
                  models={pickerModels}
                  model={engineId === 'ollama' ? ollamaModel : prefs.agentModel}
                  onModelChange={(id) => prefs.set(engineId === 'ollama' ? { ollamaModel: id } : { agentModel: id as LoopModel })}
                />
                <AttachMenu
                  testId="model-attach"
                  options={[{ id: 'image', label: 'Attach image…', icon: LuImagePlus, onSelect: pickFile }]}
                />
              </>
            }
            trailing={<SpeechToggle voice={voice} />}
            boxClassName={MEDIA_PROMPT_BOX}
            testIdPrefix="model-prompt"
          />
        </div>
        {running ? (
          <button
            type="button"
            onClick={generation.cancelAll}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
          >
            <LuSquare aria-hidden className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Notice({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p role="status" data-testid={testId} className="flex items-start gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[11px] text-muted-foreground">
      <LuInfo aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">{children}</code>
);
