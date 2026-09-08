import { Section } from '../components';

/**
 * A stand-in for a section that has not been built yet.
 *
 * Wave 1 ships the page's full running order with these in every slot but the
 * hero, so the shape of the finished page — and the anchor list in the nav —
 * is real from the first commit. That is deliberately not the same thing as an
 * empty page with a TODO: a section's *position* is a decision, and it is much
 * cheaper to argue about it while the box says `features` than after the box
 * has content.
 *
 * A wave-2 agent replaces the `Component` field in `registry.ts` and nothing
 * else. The `id`, the `label` and the order stay as they are.
 */
export const placeholderSection = (id: string, label: string) => {
  const Placeholder = () => (
    <Section id={id} label={label}>
      <div
        data-testid={`placeholder-${id}`}
        className="flex min-h-40 flex-col items-start justify-center gap-1 rounded-lg border border-dashed border-line-strong px-6 py-10"
      >
        <span className="font-mono text-sm text-accent">{id}</span>
        <span className="text-sm text-fg-subtle">
          {label} — not built yet. Replace this entry&rsquo;s `Component` in
          `src/sections/registry.ts`.
        </span>
      </div>
    </Section>
  );
  Placeholder.displayName = `Placeholder(${id})`;
  return Placeholder;
};
