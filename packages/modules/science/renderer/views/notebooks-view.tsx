import { LuLayoutTemplate, LuPlus } from 'react-icons/lu';
import { PiFlaskFill } from 'react-icons/pi';

/** The notebook list. In Theme A it is the empty state only; C fills it. */
export function NotebooksView({ onView }: { onView: (view: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="notebooks-empty">
      <PiFlaskFill size={48} className="text-[#06b6d4]" aria-hidden />
      <h2 className="text-lg font-semibold">No notebooks yet</h2>
      <p className="text-sm opacity-70">Start from a template or a blank page.</p>
      <div className="flex gap-2">
        <button type="button" disabled className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm opacity-50">
          <LuPlus aria-hidden /> New notebook
        </button>
        <button
          type="button"
          onClick={() => onView('templates')}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm"
        >
          <LuLayoutTemplate aria-hidden /> Browse templates
        </button>
      </div>
    </div>
  );
}
