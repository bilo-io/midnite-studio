import {
  SF3D_DEFAULT_TEXTURE_SIZE,
  SF3D_OPTION_DEFAULTS,
  SF3D_OPTION_RANGES,
  SF3D_TEXTURE_SIZES,
  sf3dSettingsSuffix,
  type Sf3dResolvedOptions,
  type Sf3dTextureSize,
} from '@midnite/studio-shared';
import { LuChevronRight, LuRotateCcw } from 'react-icons/lu';

import { RadioRow, SwitchRow } from '@midnite/studio-frame';
import { FIELD, NumberField, SECTION, SliderField } from './fields';

export type Sf3dSettingsValue = { name: string; textureSize: Sf3dTextureSize; options: Sf3dResolvedOptions };

export const SF3D_SETTINGS_DEFAULT: Sf3dSettingsValue = { name: '', textureSize: SF3D_DEFAULT_TEXTURE_SIZE, options: { ...SF3D_OPTION_DEFAULTS } };

type NumberKey = keyof typeof SF3D_OPTION_RANGES;

/**
 * Every SF3D setting as a form control (sliders for what is felt, number boxes for what is typed),
 * the cut-out and framing up top and the network's own knobs under Advanced. The line under it names
 * the file-name suffix the non-default settings add, so two runs of one picture tell themselves apart.
 */
export function Sf3dSettings({
  value,
  placeholderName,
  disabled,
  onChange,
}: {
  value: Sf3dSettingsValue;
  /** The name a blank Name field falls back to (the picture's file name). */
  placeholderName: string;
  disabled: boolean;
  onChange: (next: Sf3dSettingsValue) => void;
}) {
  const { options } = value;
  const set = <K extends keyof Sf3dResolvedOptions>(key: K, next: Sf3dResolvedOptions[K]) => onChange({ ...value, options: { ...options, [key]: next } });
  const slider = (key: NumberKey, label: string) => (
    <SliderField label={label} value={options[key]} {...SF3D_OPTION_RANGES[key]} onCommit={(next) => set(key, next)} />
  );
  const number = (key: NumberKey, label: string, integer = false) => (
    <div className="flex items-center gap-1.5">
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <NumberField
        label={label}
        value={options[key]}
        {...SF3D_OPTION_RANGES[key]}
        integer={integer}
        onCommit={(next) => next !== undefined && set(key, next)}
      />
    </div>
  );
  const suffix = sf3dSettingsSuffix(value.textureSize, options);
  const fill = SF3D_OPTION_RANGES.foregroundRatio;
  const changed = value.textureSize !== SF3D_DEFAULT_TEXTURE_SIZE || suffix !== '' || options.decodeBatch !== SF3D_OPTION_DEFAULTS.decodeBatch;

  return (
    <fieldset disabled={disabled} data-testid="sf3d-settings" className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-2 disabled:opacity-60">
      <div className="flex items-center gap-2">
        <span className={SECTION}>Settings</span>
        <button
          type="button"
          data-testid="sf3d-settings-reset"
          disabled={!changed}
          onClick={() => onChange({ ...SF3D_SETTINGS_DEFAULT, name: value.name })}
          className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <LuRotateCcw aria-hidden className="h-3 w-3" />
          Defaults
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="w-24 shrink-0">Name</span>
        <input
          aria-label="Model name"
          value={value.name}
          maxLength={80}
          placeholder={placeholderName}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className={`${FIELD} min-w-0 flex-1`}
        />
      </label>
      <RadioRow
        name="sf3d-texture"
        label="Texture"
        options={SF3D_TEXTURE_SIZES.map((size) => ({ id: String(size), label: String(size), title: `${size} × ${size} texture atlas` }))}
        value={String(value.textureSize)}
        onSelect={(id) => onChange({ ...value, textureSize: Number(id) as Sf3dTextureSize })}
      />
      <SwitchRow
        id="removeBackground"
        label="Remove background"
        title="Cut a plain background (white, grey, any flat colour touching the edges) out of an opaque picture first. A picture that is already a cut-out is left as it is."
        on={options.removeBackground}
        onToggle={(_id, on) => set('removeBackground', on)}
      />
      {options.removeBackground ? slider('backgroundTolerance', 'Tolerance') : null}
      <SliderField
        label="Fill %"
        value={Math.round(options.foregroundRatio * 100)}
        min={fill.min * 100}
        max={fill.max * 100}
        step={fill.step * 100}
        onCommit={(next) => set('foregroundRatio', next / 100)}
      />
      <details data-testid="sf3d-advanced" className="group flex flex-col gap-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <LuChevronRight aria-hidden className="h-3 w-3 transition-transform group-open:rotate-90" />
          Advanced
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {slider('threshold', 'Threshold')}
          {slider('resolution', 'Deformation')}
          {slider('roughness', 'Roughness')}
          {slider('metalness', 'Metalness')}
          {number('cameraDistance', 'Camera distance')}
          {number('fov', 'Field of view °')}
          {number('decodeBatch', 'Decode batch', true)}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            A lower threshold keeps thinner parts; deformation is how far the surface may move off the grid (higher is finer). The camera
            settings describe how the picture was taken. Decode batch trades memory for speed and never changes the model.
          </p>
        </div>
      </details>
      <p data-testid="sf3d-suffix" className="truncate text-[10px] text-muted-foreground">
        {suffix ? (
          <>
            File name adds <span className="font-mono text-foreground">-{suffix}</span>
          </>
        ) : (
          'Default settings — no file-name suffix'
        )}
      </p>
    </fieldset>
  );
}
