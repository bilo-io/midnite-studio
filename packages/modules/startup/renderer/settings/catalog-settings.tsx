import { useEffect, useRef, useState } from 'react';

import { moneyCurrency, seedFleetCatalog, type FleetApiTier, type FleetCatalog, type FleetHardware, type FleetProjection } from '@midnite/studio-shared';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { useStartupSnapshot, useStartupWrite } from '../data/use-startup';
import { fromMinor, toMinor } from '../money-input';
import { ALERT, BUTTON, FIELD } from '../projections/styles';

export const CATALOG_SAVE_DEBOUNCE_MS = 400;

/** How many nodes and templates across all projections use each hardware / API-tier id. */
export function catalogUsage(projections: readonly FleetProjection[]): { hardware: Map<string, number>; apiTiers: Map<string, number> } {
  const hardware = new Map<string, number>();
  const apiTiers = new Map<string, number>();
  for (const p of projections) {
    for (const c of [...p.nodes, p.template]) {
      hardware.set(c.hardwareId, (hardware.get(c.hardwareId) ?? 0) + 1);
      apiTiers.set(c.apiTierId, (apiTiers.get(c.apiTierId) ?? 0) + 1);
    }
  }
  return { hardware, apiTiers };
}

/** Restore defaults: built-ins return to the seed (current currency), custom rows are kept. */
export function restoreDefaults(catalog: FleetCatalog, currency: string): FleetCatalog {
  const seed = seedFleetCatalog(currency);
  const fresh = <T extends { id: string }>(current: readonly T[], seeded: readonly T[]): T[] => [
    ...seeded,
    ...current.filter((x) => !seeded.some((s) => s.id === x.id) && !(x as { builtIn?: boolean }).builtIn),
  ];
  return { hardware: fresh(catalog.hardware, seed.hardware), apiTiers: fresh(catalog.apiTiers, seed.apiTiers) };
}

const CELL = `${FIELD} w-full`;

function PriceInput({ label, minor, currency, disabled, onCommit }: { label: string; minor: number; currency: string; disabled: boolean; onCommit: (minor: number) => void }) {
  const [text, setText] = useState(fromMinor(minor, currency));
  const [bad, setBad] = useState(false);
  // Follow the saved value when it changes from elsewhere (restore defaults), but never overwrite what is being typed.
  const last = useRef(minor);
  useEffect(() => {
    if (minor !== last.current) {
      last.current = minor;
      setText(fromMinor(minor, currency));
      setBad(false);
    }
  }, [minor, currency]);
  return (
    <input
      aria-label={label}
      aria-invalid={bad}
      className={CELL}
      disabled={disabled}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const m = toMinor(e.target.value, currency);
        if (m === null || m < 0 || !Number.isSafeInteger(m)) return setBad(true);
        setBad(false);
        last.current = m;
        onCommit(m);
      }}
    />
  );
}

function HiddenSwitch({ label, hidden, disabled, onToggle }: { label: string; hidden: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={hidden} aria-label={`Hidden: ${label}`} disabled={disabled} onClick={onToggle} className={`h-5 w-9 shrink-0 rounded-full border border-border p-0.5 transition-colors disabled:opacity-50 ${hidden ? 'bg-purple-500' : 'bg-muted'}`}>
      <span className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${hidden ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function CatalogEditor({ catalog: saved, projections, currency, readOnly }: { catalog: FleetCatalog; projections: readonly FleetProjection[]; currency: string; readOnly: boolean }) {
  const dialogs = STARTUP_CHROME.useDialogs();
  const write = useStartupWrite((bridge, catalog: FleetCatalog) => bridge.upsertFleetCatalog({ catalog }));
  const writeRef = useRef(write);
  writeRef.current = write;

  const [catalog, setCatalog] = useState(saved);
  const catalogRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const usage = catalogUsage(projections);

  const flush = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    writeRef.current.mutate(catalogRef.current, { onSuccess: () => setProblem(null), onError: (e) => setProblem(e.message) });
  };
  useEffect(() => () => flush(), []);

  const commit = (next: FleetCatalog) => {
    catalogRef.current = next;
    setCatalog(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, CATALOG_SAVE_DEBOUNCE_MS);
  };

  const patchHw = (id: string, change: Partial<FleetHardware>) => commit({ ...catalog, hardware: catalog.hardware.map((h) => (h.id === id ? { ...h, ...change } : h)) });
  const patchTier = (id: string, change: Partial<FleetApiTier>) => commit({ ...catalog, apiTiers: catalog.apiTiers.map((t) => (t.id === id ? { ...t, ...change } : t)) });

  const refuseInUse = (n: number): boolean => {
    if (n === 0) return false;
    setProblem(`In use by ${n} ${n === 1 ? 'node' : 'nodes'} — hide it instead.`);
    return true;
  };
  const removeHw = (id: string) => {
    if (refuseInUse(usage.hardware.get(id) ?? 0)) return;
    commit({ ...catalog, hardware: catalog.hardware.filter((h) => h.id !== id) });
  };
  const removeTier = (id: string) => {
    if (refuseInUse(usage.apiTiers.get(id) ?? 0)) return;
    commit({ ...catalog, apiTiers: catalog.apiTiers.filter((t) => t.id !== id) });
  };

  const restore = () =>
    dialogs.confirm({
      title: 'Restore the default catalog?',
      body: `Built-in hardware and API tiers return to their list prices in ${currency} and are shown again. Your own entries stay.`,
      confirmLabel: 'Restore defaults',
      danger: true,
      onConfirm: () => commit(restoreDefaults(catalogRef.current, currency)),
    });

  const th = 'px-1 pb-1 text-left text-xs font-medium text-muted-foreground';
  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Catalog</h2>
        <p className="text-xs text-muted-foreground">
          Prices are in {currency}. Changing the company currency does not convert them: use Restore defaults to re-seed the built-ins in the new currency.
        </p>
      </header>

      <section aria-label="Hardware" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Hardware</h3>
        <table className="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-1">
          <thead>
            <tr><th className={th}>Label</th><th className={`${th} w-32`}>Price</th><th className={`${th} w-24`}>Watts</th><th className={`${th} w-14`}>Hidden</th><th className={`${th} w-20`} /></tr>
          </thead>
          <tbody>
            {catalog.hardware.map((h) => (
              <tr key={h.id}>
                <td><input aria-label={`Label: ${h.label}`} className={CELL} disabled={readOnly} value={h.label} maxLength={60} onChange={(e) => patchHw(h.id, { label: e.target.value })} /></td>
                <td><PriceInput label={`Price: ${h.label}`} minor={h.priceMinor} currency={currency} disabled={readOnly} onCommit={(priceMinor) => patchHw(h.id, { priceMinor })} /></td>
                <td><input aria-label={`Watts: ${h.label}`} type="number" min={0} max={100000} className={CELL} disabled={readOnly} value={h.watts} onChange={(e) => patchHw(h.id, { watts: Math.max(0, Math.min(100_000, Math.round(Number(e.target.value) || 0))) })} /></td>
                <td><HiddenSwitch label={h.label} hidden={h.hidden} disabled={readOnly} onToggle={() => patchHw(h.id, { hidden: !h.hidden })} /></td>
                <td>{h.builtIn ? null : <button type="button" className={BUTTON} disabled={readOnly} aria-label={`Delete ${h.label}`} onClick={() => removeHw(h.id)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <button type="button" className={BUTTON} disabled={readOnly || catalog.hardware.length >= 100} onClick={() => commit({ ...catalog, hardware: [...catalog.hardware, { id: crypto.randomUUID(), label: 'New hardware', priceMinor: 0, watts: 0, builtIn: false, hidden: false }] })}>
            Add hardware
          </button>
        </div>
      </section>

      <section aria-label="API tiers" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">API tiers</h3>
        <table className="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-1">
          <thead>
            <tr><th className={th}>Label</th><th className={`${th} w-32`}>Per month</th><th className={`${th} w-14`}>Hidden</th><th className={`${th} w-20`} /></tr>
          </thead>
          <tbody>
            {catalog.apiTiers.map((t) => (
              <tr key={t.id}>
                <td><input aria-label={`Label: ${t.label}`} className={CELL} disabled={readOnly} value={t.label} maxLength={60} onChange={(e) => patchTier(t.id, { label: e.target.value })} /></td>
                <td><PriceInput label={`Price: ${t.label}`} minor={t.monthlyMinor} currency={currency} disabled={readOnly} onCommit={(monthlyMinor) => patchTier(t.id, { monthlyMinor })} /></td>
                <td><HiddenSwitch label={t.label} hidden={t.hidden} disabled={readOnly} onToggle={() => patchTier(t.id, { hidden: !t.hidden })} /></td>
                <td>{t.builtIn ? null : <button type="button" className={BUTTON} disabled={readOnly} aria-label={`Delete ${t.label}`} onClick={() => removeTier(t.id)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <button type="button" className={BUTTON} disabled={readOnly || catalog.apiTiers.length >= 50} onClick={() => commit({ ...catalog, apiTiers: [...catalog.apiTiers, { id: crypto.randomUUID(), label: 'New API tier', monthlyMinor: 0, builtIn: false, hidden: false }] })}>
            Add API tier
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className={BUTTON} disabled={readOnly} onClick={restore}>Restore defaults</button>
        {problem !== null ? <p role="alert" className={ALERT}>{problem}</p> : null}
      </div>
    </div>
  );
}

/** Settings ▸ Catalog. Remounts on a new revision only while idle, so typing is never overwritten. */
export function CatalogPage() {
  const snapshot = useStartupSnapshot();
  if (snapshot.isPending) return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  if (snapshot.isError) return <p role="alert" className="p-4 text-sm text-red-500">{snapshot.error.message}</p>;
  const { workspace, readOnly } = snapshot.data;
  const currency = moneyCurrency(workspace.company);
  const catalog = workspace.fleetCatalog ?? seedFleetCatalog(currency);
  return <CatalogEditor catalog={catalog} projections={workspace.fleetProjections} currency={currency} readOnly={readOnly} />;
}
