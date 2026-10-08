import {
  GAME_CAMERA_IDS,
  GAME_DAY_MINUTES_MAX,
  GAME_DAY_MINUTES_MIN,
  GAME_FEATURE_KEYS,
  GAME_OPTION_HINT,
  GAME_OPTION_LABEL,
  GAME_TEMPLATE_MATRIX,
  gameOptionAvailability,
  normalizeGameOptions,
  starterId,
  type GameDimension,
  type GameFeatureKey,
  type GameGenre,
  type GamePerspective,
} from '@midnite/studio-shared';
import { useEffect, useRef, type Dispatch } from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import {
  BASE_PITCH,
  CAMERA_LABEL,
  GENRE_LABEL,
  GLYPH,
  PERSPECTIVE_LABEL,
  perspectivesOf,
} from './game-labels';
import { thumbnailFor } from './game-thumbnails';
import {
  WIZARD_LAST_STEP,
  WIZARD_STEPS,
  genresFor,
  type WizardAction,
  type WizardDerived,
  type WizardState,
} from './game-wizard-model';

type Wizard = { state: WizardState; derived: WizardDerived; dispatch: Dispatch<WizardAction> };

/** One pickable card: a thumbnail (or glyph) over a title and a one-line blurb. */
function PickCard({
  title,
  blurb,
  thumb,
  Glyph,
  selected,
  onPick,
  role,
}: {
  title: string;
  blurb: string;
  thumb: string | null;
  Glyph: (typeof GLYPH)[GamePerspective];
  selected: boolean;
  onPick: () => void;
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      {...(role ? { role, 'aria-checked': selected } : { 'aria-pressed': selected })}
      aria-label={title}
      onClick={onPick}
      className={`flex w-full flex-col gap-1 rounded-md border p-2 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        selected ? 'border-primary bg-primary/10' : 'border-input hover:bg-muted/60'
      }`}
    >
      <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-muted/60" aria-hidden>
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <Glyph className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <span className="text-xs font-semibold text-foreground">{title}</span>
      <span className="line-clamp-2 leading-tight text-muted-foreground">{blurb}</span>
    </button>
  );
}

const DIMENSIONS: { id: GameDimension; title: string; blurb: string }[] = [
  { id: '2d', title: '2D', blurb: 'Sprites and tiles on Phaser: platformers, top-down, isometric and raycaster games.' },
  { id: '3d', title: '3D', blurb: 'Models and physics on three.js with Rapier: first- and third-person games.' },
];

function DimensionStep({ wizard }: { wizard: Wizard }) {
  const { derived, dispatch } = wizard;
  return (
    <div role="radiogroup" aria-label="Dimension" className="grid grid-cols-2 gap-1.5">
      {DIMENSIONS.map((d) => (
        <PickCard
          key={d.id}
          role="radio"
          title={d.title}
          blurb={d.blurb}
          thumb={thumbnailFor(starterId(perspectivesOf(d.id)[0]!))}
          Glyph={GLYPH[perspectivesOf(d.id)[0]!]}
          selected={derived.dimension === d.id}
          onPick={() => dispatch({ type: 'dimension', value: d.id, current: derived.dimension })}
        />
      ))}
    </div>
  );
}

function PerspectiveStep({ wizard }: { wizard: Wizard }) {
  const { state, derived, dispatch } = wizard;
  return (
    <div role="group" aria-label="Perspective" className="grid grid-cols-2 gap-1.5">
      {perspectivesOf(derived.dimension).map((p) => {
        const count = genresFor(derived.dimension, p).length;
        return (
          <PickCard
            key={p}
            title={PERSPECTIVE_LABEL[p]}
            blurb={`${BASE_PITCH[p]} ${count} genre${count === 1 ? '' : 's'}.`}
            thumb={thumbnailFor(starterId(p))}
            Glyph={GLYPH[p]}
            selected={state.perspective === p}
            onPick={() => dispatch({ type: 'perspective', value: p })}
          />
        );
      })}
    </div>
  );
}

function GenreStep({ wizard }: { wizard: Wizard }) {
  const { state, derived, dispatch } = wizard;
  const p = derived.perspective;
  return (
    <div role="group" aria-label="Genre" className="grid grid-cols-2 gap-1.5">
      <PickCard
        title="Blank base"
        blurb={`${PERSPECTIVE_LABEL[p]} movement and camera, no genre systems.`}
        thumb={thumbnailFor(starterId(p))}
        Glyph={GLYPH[p]}
        selected={state.genre === 'blank'}
        onPick={() => dispatch({ type: 'genre', value: 'blank' })}
      />
      {genresFor(derived.dimension, p).map((g: GameGenre) => (
        <PickCard
          key={g}
          title={GENRE_LABEL[g]}
          blurb={GAME_TEMPLATE_MATRIX[g].pitch}
          thumb={thumbnailFor(starterId(p, g))}
          Glyph={GLYPH[p]}
          selected={state.genre === g}
          onPick={() => dispatch({ type: 'genre', value: g })}
        />
      ))}
    </div>
  );
}

function TuneStep({ wizard }: { wizard: Wizard }) {
  const { state, derived, dispatch } = wizard;
  const ctx = { genre: derived.genre, perspective: derived.perspective };
  const { options } = state;
  const set = (next: typeof options) => dispatch({ type: 'options', options: normalizeGameOptions(next, ctx) });

  const dayAvail = gameOptionAvailability('dayNight', ctx);
  const dayOn = options.dayNight.enabled && dayAvail.available;
  return (
    <div className="flex flex-col gap-1" data-testid="game-wizard-tune">
      <SettingsSwitchRow
        id="dayNight"
        label={GAME_OPTION_LABEL.dayNight}
        description={dayAvail.available ? GAME_OPTION_HINT.dayNight : dayAvail.reason}
        on={dayOn}
        disabled={!dayAvail.available}
        title={dayAvail.available ? GAME_OPTION_HINT.dayNight : dayAvail.reason}
        onToggle={(_, on) => set({ ...options, dayNight: { ...options.dayNight, enabled: on } })}
      />
      {dayOn ? (
        <label className="mb-1 ml-1.5 flex flex-col gap-1 text-[11px] text-muted-foreground">
          <span className="flex items-center justify-between">
            <span>Real time per game day</span>
            <output aria-live="polite" className="font-medium text-foreground">
              {options.dayNight.minutesPerDay} min
            </output>
          </span>
          <input
            type="range"
            aria-label="Minutes per game day"
            min={GAME_DAY_MINUTES_MIN}
            max={GAME_DAY_MINUTES_MAX}
            step={1}
            value={options.dayNight.minutesPerDay}
            onChange={(event) =>
              set({ ...options, dayNight: { ...options.dayNight, minutesPerDay: Number(event.target.value) } })
            }
          />
        </label>
      ) : null}
      {GAME_FEATURE_KEYS.map((key: GameFeatureKey) => {
        const avail = gameOptionAvailability(key, ctx, options);
        return (
          <SettingsSwitchRow
            key={key}
            id={key}
            label={GAME_OPTION_LABEL[key]}
            description={avail.available ? GAME_OPTION_HINT[key] : avail.reason}
            on={options[key] && avail.available}
            disabled={!avail.available}
            title={avail.available ? GAME_OPTION_HINT[key] : avail.reason}
            onToggle={(_, on) => set({ ...options, [key]: on })}
          />
        );
      })}

      {derived.thirdPerson ? (
        <fieldset className="mt-2 flex flex-col gap-1 rounded-md border border-input p-2 text-xs">
          <legend className="px-1 font-medium">Cameras</legend>
          {GAME_CAMERA_IDS.map((id) => (
            <label key={id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.cameras.includes(id)}
                onChange={(event) => {
                  const next = event.target.checked ? [...state.cameras, id] : state.cameras.filter((x) => x !== id);
                  // At least one camera must stay on.
                  if (next.length > 0) dispatch({ type: 'cameras', cameras: GAME_CAMERA_IDS.filter((x) => next.includes(x)) });
                }}
              />
              {CAMERA_LABEL[id]}
            </label>
          ))}
        </fieldset>
      ) : null}
      {derived.versus ? (
        <p className="mt-2 rounded-md border border-input p-2 text-xs text-muted-foreground" data-testid="game-wizard-versus">
          Versus camera: frames both fighters side-on, outside the five third-person cameras.
        </p>
      ) : null}
    </div>
  );
}

const STEP_TITLE = [
  'Pick a dimension',
  'Pick a perspective',
  'Pick a genre',
  'Fine-tune the game',
] as const;

/** A readable trail of what has been picked so far, e.g. `3D › Third person › Soulslike`. */
export function wizardTrail(derived: WizardDerived): string {
  const parts: string[] = [derived.dimension.toUpperCase()];
  if (derived.perspectiveChosen) parts.push(PERSPECTIVE_LABEL[derived.perspective]);
  if (derived.genreChosen) parts.push(derived.genre === null ? 'Blank base' : GENRE_LABEL[derived.genre]);
  return parts.join(' › ');
}

/** The scrolling part of the wizard: the step's heading, trail and cards or switches. */
export function GameWizardBody({ wizard }: { wizard: Wizard }) {
  const { state } = wizard;
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  // After a step change focus moves to the heading, so ←/→ keep working and screen readers announce the step.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [state.step]);

  return (
    <section aria-label="Game template wizard" data-testid="game-wizard" className="flex flex-col gap-2">
      <div>
        <h3 ref={heading} tabIndex={-1} className="text-xs font-semibold outline-none" data-testid="game-wizard-heading">
          {STEP_TITLE[state.step]}
        </h3>
        <p className="text-[11px] text-muted-foreground" data-testid="game-wizard-trail">
          {wizardTrail(wizard.derived)}
        </p>
      </div>
      {state.step === 0 ? <DimensionStep wizard={wizard} /> : null}
      {state.step === 1 ? <PerspectiveStep wizard={wizard} /> : null}
      {state.step === 2 ? <GenreStep wizard={wizard} /> : null}
      {state.step === 3 ? <TuneStep wizard={wizard} /> : null}
    </section>
  );
}

/** Back, the pagination dots and Next. The dots up to the furthest reached step are clickable. */
export function GameWizardNav({ wizard }: { wizard: Wizard }) {
  const { state, derived, dispatch } = wizard;
  const canNext = state.step < Math.min(derived.reached, WIZARD_LAST_STEP);
  return (
    <nav aria-label="Wizard steps" className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => dispatch({ type: 'go', step: state.step - 1 })}
        disabled={state.step === 0}
        className="flex items-center gap-0.5 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted/60 disabled:opacity-40"
      >
        <LuChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Back
      </button>
      <ol className="flex items-center gap-2">
        {WIZARD_STEPS.map((step, i) => {
          const current = i === state.step;
          const locked = i > derived.reached;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-label={`Step ${i + 1} of ${WIZARD_STEPS.length}: ${step.label}`}
                aria-current={current ? 'step' : undefined}
                title={locked ? `${step.label}: finish the earlier steps first` : step.label}
                disabled={locked}
                onClick={() => dispatch({ type: 'go', step: i })}
                className="group flex h-4 w-4 items-center justify-center rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed"
              >
                <span
                  className={`block rounded-full transition-all ${
                    current
                      ? 'h-2.5 w-2.5 bg-primary'
                      : locked
                        ? 'h-2 w-2 bg-muted-foreground/30'
                        : 'h-2 w-2 bg-muted-foreground/70 group-hover:bg-foreground'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => dispatch({ type: 'go', step: state.step + 1 })}
        disabled={!canNext}
        className="flex items-center gap-0.5 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted/60 disabled:opacity-40"
      >
        Next
        <LuChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </nav>
  );
}

/** ←/→ walk the wizard unless the key belongs to a text field, a select or a slider. */
export function wizardKeyHandler(wizard: Wizard) {
  return (event: React.KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target as HTMLElement;
    if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (target instanceof HTMLInputElement && ['text', 'range', 'number', 'search'].includes(target.type)) return;
    const { state, derived, dispatch } = wizard;
    if (event.key === 'ArrowLeft' && state.step > 0) {
      event.preventDefault();
      dispatch({ type: 'go', step: state.step - 1 });
    } else if (event.key === 'ArrowRight' && state.step < Math.min(derived.reached, WIZARD_LAST_STEP)) {
      event.preventDefault();
      dispatch({ type: 'go', step: state.step + 1 });
    }
  };
}
