/** A sandbox view's stand-in until its theme lands (C: Emergence, D: Virtual worlds, E: Agent environments). */
export function SandboxPlaceholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <section aria-label={title} className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      <h1 className="text-base font-medium text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{blurb}</p>
    </section>
  );
}
