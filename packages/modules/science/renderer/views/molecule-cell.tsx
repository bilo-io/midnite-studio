import { lazy, Suspense, useMemo, useState } from 'react';

import { bridge, noBridge } from '@midnite/studio-frame';
import type { ScienceCell } from '@midnite/studio-shared';

import { inferBonds } from '../molecule/bonds';
import { parseStructure } from '../molecule/parse';

type MoleculeCell = Extract<ScienceCell, { kind: 'molecule' }>;

// three and react-three-fiber are heavy: load them only when a molecule cell is on screen.
const MoleculeCanvas = lazy(() => import('../molecule/molecule-canvas'));

/** A molecule cell (Phase 126 Theme F.3): header with counts, Reset view and Replace, then the 3D view or the reason there is none. */
export function MoleculeCellView({ cell, onChange }: { cell: MoleculeCell; onChange: (cell: ScienceCell) => void }) {
  const [resetKey, setResetKey] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (cell.text === '') return null;
    const r = parseStructure(cell.text, cell.format);
    if (!r.ok) return r;
    return { ...r, bonds: r.bonds.length > 0 ? r.bonds : inferBonds(r.atoms) };
  }, [cell.text, cell.format]);

  const pick = async () => {
    setImportError(null);
    const res = (await bridge()?.science?.importStructure()) ?? noBridge();
    if (!res.ok) {
      setImportError(res.kind === 'error' ? res.message : 'Could not import the file.');
      return;
    }
    if ('cancelled' in res.value) return;
    onChange({ ...cell, name: res.value.name, format: res.value.format, text: res.value.text });
  };

  return (
    <div className="space-y-2 p-1" data-testid="molecule-cell">
      <header className="flex flex-wrap items-center gap-3 text-sm">
        <strong>{cell.name === '' ? 'Molecule' : cell.name}</strong>
        {parsed !== null && parsed.ok ? (
          <span className="text-xs opacity-70">
            {parsed.atoms.length} atoms · {parsed.bonds.length} bonds · {cell.format.toUpperCase()}
          </span>
        ) : null}
        <span className="flex-1" />
        {parsed !== null && parsed.ok ? (
          <button type="button" className="text-xs underline" onClick={() => setResetKey((k) => k + 1)}>
            Reset view
          </button>
        ) : null}
        <button type="button" className="text-xs underline" onClick={() => void pick()}>
          {cell.text === '' ? 'Import…' : 'Replace…'}
        </button>
      </header>
      {importError !== null ? (
        <p role="alert" className="text-xs text-red-400">
          {importError}
        </p>
      ) : null}
      {parsed === null ? (
        <p className="text-xs opacity-60">No structure yet. Import an XYZ, PDB, MOL or SDF file (up to 10 MB).</p>
      ) : !parsed.ok ? (
        <p role="alert" className="text-xs text-red-400">
          {parsed.message}
        </p>
      ) : (
        <Suspense fallback={<p className="text-xs opacity-60">Loading 3D view…</p>}>
          <MoleculeCanvas atoms={parsed.atoms} bonds={parsed.bonds} resetKey={resetKey} />
        </Suspense>
      )}
    </div>
  );
}
