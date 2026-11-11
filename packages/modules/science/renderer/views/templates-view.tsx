import { LuLayoutTemplate } from 'react-icons/lu';

/** The template shelf. A placeholder until Theme G fills it. */
export function TemplatesView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="templates-empty">
      <LuLayoutTemplate size={48} className="text-[#06b6d4]" aria-hidden />
      <h2 className="text-lg font-semibold">Templates</h2>
      <p className="text-sm opacity-70">Starter notebooks for each discipline are coming soon.</p>
    </div>
  );
}
