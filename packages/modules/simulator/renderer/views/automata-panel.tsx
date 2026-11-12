import { useState } from 'react';

import { ELEMENTARY_MAX_WIDTH, ELEMENTARY_MIN_WIDTH, type ElementaryParams } from '../sims/elementary';
import { LIFE_PRESETS, parseRule, RULE_HINT, type LifeParams } from '../sims/life';
import { parseRle, PATTERNS, fitProblem, type RlePattern } from '../sims/rle';

export type Mode = 'life' | 'elementary';

const SIZES = [64, 128, 256, 512, 1024];
const WIDTHS = [128, 256, 512, 1024];
const field = 'rounded border border-border bg-background px-1 py-0.5 text-sm';
const label = 'flex flex-col gap-1 text-xs text-muted-foreground';

type Props = {
  mode: Mode;
  onMode(mode: Mode): void;
  life: LifeParams;
  onLife(life: LifeParams): void;
  elementary: ElementaryParams;
  onElementary(params: ElementaryParams): void;
  /** Stamps a pattern at the grid centre; returns an error message when it cannot (too big, no grid yet). */
  onStamp(pattern: RlePattern): string | null;
  gridSize: [number, number];
};

/** The side panel: mode toggle, rule, size, density, patterns and RLE paste (Phase 127 Theme C.4). */
export function AutomataPanel(p: Props) {
  const [customRule, setCustomRule] = useState<string | null>(null);
  const [pattern, setPattern] = useState(PATTERNS[0]!.name);
  const [pasting, setPasting] = useState(false);
  const [rleText, setRleText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const stamp = (parsed: RlePattern | { error: string }) => {
    if ('error' in parsed) return setProblem(parsed.error);
    const fit = fitProblem(parsed, p.gridSize[0], p.gridSize[1]);
    const err = fit ?? p.onStamp(parsed);
    setProblem(err);
    if (err === null) setPasting(false);
  };

  const ruleText = customRule ?? p.life.rule;
  const ruleValid = parseRule(ruleText) !== null;
  const presetValue = LIFE_PRESETS.find((x) => x.rule === p.life.rule)?.rule ?? 'custom';

  return (
    <aside aria-label="Sandbox settings" className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3">
      <div role="tablist" aria-label="Mode" className="flex gap-1">
        {(['life', 'elementary'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={p.mode === m}
            className={`flex-1 rounded px-2 py-1 text-sm ${p.mode === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            onClick={() => p.onMode(m)}
          >
            {m === 'life' ? 'Life-like' : 'Elementary'}
          </button>
        ))}
      </div>

      {p.mode === 'life' ? (
        <>
          <label className={label}>
            Rule preset
            <select
              className={field}
              value={presetValue}
              onChange={(e) => {
                if (e.target.value === 'custom') return;
                setCustomRule(null);
                p.onLife({ ...p.life, rule: e.target.value });
              }}
            >
              {LIFE_PRESETS.map((x) => (
                <option key={x.rule} value={x.rule}>
                  {x.label} ({x.rule})
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className={label}>
            Custom rule
            <input
              className={field}
              aria-invalid={!ruleValid}
              value={ruleText}
              onChange={(e) => {
                setCustomRule(e.target.value);
                if (parseRule(e.target.value) !== null) p.onLife({ ...p.life, rule: e.target.value.toUpperCase() });
              }}
              onBlur={() => ruleValid && setCustomRule(null)}
            />
            {!ruleValid && <span className="text-destructive">{RULE_HINT}</span>}
          </label>
          <label className={label}>
            Grid size
            <select className={field} value={p.life.width} onChange={(e) => p.onLife({ ...p.life, width: Number(e.target.value), height: Number(e.target.value) })}>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Density {Math.round(p.life.density * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={p.life.density} onChange={(e) => p.onLife({ ...p.life, density: Number(e.target.value) })} />
          </label>
          <label className={label}>
            Pattern
            <select className={field} value={pattern} onChange={(e) => setPattern(e.target.value)}>
              {PATTERNS.map((x) => (
                <option key={x.name}>{x.name}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            <button className="flex-1 rounded bg-muted px-2 py-1 text-sm" onClick={() => stamp(parseRle(PATTERNS.find((x) => x.name === pattern)!.rle))}>
              Stamp
            </button>
            <button className="flex-1 rounded bg-muted px-2 py-1 text-sm" onClick={() => setPasting(true)}>
              Paste RLE…
            </button>
          </div>
          {pasting && (
            <div role="dialog" aria-label="Paste RLE" className="flex flex-col gap-1 rounded border border-border p-2">
              <textarea aria-label="RLE" rows={6} className={field} value={rleText} onChange={(e) => setRleText(e.target.value)} />
              <div className="flex gap-1">
                <button className="flex-1 rounded bg-primary px-2 py-1 text-sm text-primary-foreground" onClick={() => stamp(parseRle(rleText))}>
                  Stamp
                </button>
                <button
                  className="flex-1 rounded bg-muted px-2 py-1 text-sm"
                  onClick={() => {
                    setPasting(false);
                    setProblem(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {problem !== null && <span role="alert" className="text-xs text-destructive">{problem}</span>}
          <p className="text-xs text-muted-foreground">Drag to draw, right-drag or Alt to erase, Shift-drag to pan, wheel to zoom.</p>
        </>
      ) : (
        <>
          <label className={label}>
            Rule (0–255)
            <input
              type="number"
              min={0}
              max={255}
              className={field}
              value={p.elementary.rule}
              onChange={(e) => p.onElementary({ ...p.elementary, rule: Math.min(255, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
            />
          </label>
          <label className={label}>
            Width
            <select className={field} value={p.elementary.width} onChange={(e) => p.onElementary({ ...p.elementary, width: Number(e.target.value) })}>
              {WIDTHS.filter((x) => x >= ELEMENTARY_MIN_WIDTH && x <= ELEMENTARY_MAX_WIDTH).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Start
            <select className={field} value={p.elementary.start} onChange={(e) => p.onElementary({ ...p.elementary, start: e.target.value as ElementaryParams['start'] })}>
              <option value="single">Single cell</option>
              <option value="random">Random</option>
            </select>
          </label>
        </>
      )}
    </aside>
  );
}
