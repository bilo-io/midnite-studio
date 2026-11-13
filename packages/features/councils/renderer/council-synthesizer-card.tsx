import { LuSparkles, LuWandSparkles } from 'react-icons/lu';

import { RingSpinner as Spinner, SelectField } from '@midnite/studio-frame';
import {
  COUNCIL_SYNTH_INSTRUCTIONS_MAX,
  COUNCIL_SYNTHESIS_PRESETS,
  COUNCIL_SYNTHESIS_TYPES,
  councilSynthesisLabel,
  recommendSynthesisType,
  type CouncilMemberProvider,
  type CouncilSynthesisType,
} from '@midnite/studio-shared';

import { councilModelOptions, DEFAULT_MODEL_ID, useCouncilProviders } from './council-providers';
import { useCouncilsHost } from './host';

const TYPE_OPTIONS = COUNCIL_SYNTHESIS_TYPES.map((type) => ({ value: type, label: councilSynthesisLabel(type) }));

const isProvider = (id: string, providers: readonly { id: string }[]): id is CouncilMemberProvider =>
  providers.some((p) => p.id === id);

/**
 * The synthesizer (Phase 134 Theme B), above the members: who synthesizes,
 * which kind of synthesis it runs, and the instructions it runs with.
 *
 * A preset brings its own instructions — editable, with "Reset to preset" once
 * edited. Custom carries the user's own, or ones "Generate with AI" writes
 * (Theme E). The recommendation reads the topic in front of the user (the
 * composer's draft, else the open thread's first prompt, else the council's
 * description) and only suggests: nothing changes until "Use".
 */
export function CouncilSynthesizerCard({
  synthProvider,
  synthModel,
  onSynthChange,
  synthesisType,
  onTypeChange,
  instructions,
  edited,
  onInstructionsChange,
  onResetInstructions,
  topic,
  onGenerate,
  generating,
  generateError,
}: {
  synthProvider: CouncilMemberProvider;
  synthModel: string | undefined;
  onSynthChange: (provider: CouncilMemberProvider, model: string | undefined) => void;
  synthesisType: CouncilSynthesisType;
  onTypeChange: (type: CouncilSynthesisType) => void;
  /** The instructions as shown: the stored ones, or the preset's. */
  instructions: string;
  /** Whether `instructions` differ from the preset's — what "Reset to preset" undoes. */
  edited: boolean;
  onInstructionsChange: (text: string) => void;
  onResetInstructions: () => void;
  topic: string;
  onGenerate: () => void;
  generating: boolean;
  generateError: string | null;
}) {
  const { ProviderModelPicker } = useCouncilsHost();
  const { providers, installed } = useCouncilProviders();
  const recommendation = recommendSynthesisType(topic);
  const suggest = recommendation !== null && recommendation.type !== synthesisType ? recommendation : null;

  return (
    <section
      aria-label="Synthesizer"
      data-testid="council-synthesizer"
      className="gradient-border gradient-border--hover rounded-lg p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <LuSparkles aria-hidden className="h-3 w-3 text-primary" />
          Synthesizer
        </h3>
        <ProviderModelPicker
          providers={providers}
          provider={synthProvider}
          // A new agent starts on its own default model: the old model id belongs to the old agent.
          onProviderChange={(id) => isProvider(id, providers) && onSynthChange(id, undefined)}
          models={councilModelOptions(synthProvider)}
          model={synthModel ?? DEFAULT_MODEL_ID}
          onModelChange={(id) => onSynthChange(synthProvider, id === DEFAULT_MODEL_ID ? undefined : id)}
          testId="council-synth-picker"
        />
      </div>

      <div className="mt-2">
        <SelectField value={synthesisType} onChange={onTypeChange} options={TYPE_OPTIONS} label="Synthesis type" />
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {synthesisType === 'custom'
            ? 'Your own instructions, and the members you choose.'
            : COUNCIL_SYNTHESIS_PRESETS[synthesisType].summary}
        </p>
      </div>

      {suggest ? (
        <div
          data-testid="council-synthesis-recommendation"
          className="mt-2 flex items-start gap-2 rounded-md bg-primary/5 px-2 py-1.5 text-[11px] leading-snug"
        >
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">Suggested: {councilSynthesisLabel(suggest.type)}.</span>{' '}
            <span className="text-muted-foreground">{suggest.reason}</span>
          </span>
          <button
            type="button"
            onClick={() => onTypeChange(suggest.type)}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
          >
            Use
          </button>
        </div>
      ) : null}

      <div className="mt-2">
        <div className="flex items-center justify-between">
          <label htmlFor="council-synth-instructions" className="text-[11px] text-muted-foreground">
            Instructions
          </label>
          {synthesisType !== 'custom' && edited ? (
            <button
              type="button"
              onClick={onResetInstructions}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reset to preset
            </button>
          ) : null}
        </div>
        <textarea
          id="council-synth-instructions"
          aria-label="Synthesis instructions"
          value={instructions}
          rows={4}
          maxLength={COUNCIL_SYNTH_INSTRUCTIONS_MAX}
          placeholder="How should the synthesizer combine the members' answers?"
          onChange={(event) => onInstructionsChange(event.target.value)}
          className="mt-1 w-full resize-y rounded-md border border-input bg-background px-1.5 py-1 text-xs leading-snug outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {synthesisType === 'custom' ? (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || installed.length === 0}
            title={installed.length === 0 ? 'No agent CLI is installed' : undefined}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-40"
          >
            {generating ? <Spinner size="xs" tone="inherit" /> : <LuWandSparkles aria-hidden className="h-3.5 w-3.5" />}
            {generating ? 'Generating…' : 'Generate with AI'}
          </button>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Writes the instructions and the members from the topic, using the agents installed here.
          </p>
          {generateError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {generateError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
