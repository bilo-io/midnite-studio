import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { LuEllipsis } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import { VARIANTS, type KnowledgeVariant, type KnowledgeVariantId } from './renderer-contract';

/**
 * The pill bar (Phase 89 Theme A) — one pressable pill per registered
 * `KnowledgeVariant`, rendered above the canvas inside its own flex column
 * ([`knowledge-view.tsx`](./knowledge-view.tsx), so the filters sidebar and
 * the node panel keep their full height). Markup follows
 * [`filter-pill.tsx`](../optimizer/components/filter-pill.tsx)'s own
 * `aria-pressed` button shape, swapping its colour swatch for the variant's
 * `react-icons` glyph — there is no "category colour" axis here, but there
 * is a "which library" one, and an icon reads that job.
 *
 * With one registered variant (Theme A's own bar: sigma, alone) this never
 * overflows in practice, but the overflow mechanics below are real, not
 * stubbed — Themes D and F–I only ever add registry entries, never touch
 * this file, so the bar has to hold up at five-plus pills on day one.
 */
export function KnowledgeVariantPills({
  activeId,
  onSelect,
}: {
  activeId: KnowledgeVariantId;
  onSelect: (id: KnowledgeVariantId) => void;
}) {
  const { containerRef, measureRef, visible, overflow } = useOverflowVariants(VARIANTS);
  const [menuOpen, setMenuOpen] = useState(false);

  if (VARIANTS.length === 0) return null;

  return (
    <div className="border-b border-border px-3 py-1.5">
      {/*
        An off-screen, unmeasured-by-layout copy of every pill plus one
        trigger — `position: fixed` off the viewport rather than `hidden`
        or `display: none`, either of which would report a zero
        `offsetWidth` and defeat the whole measurement. `aria-hidden` and
        `inert` keep it out of the accessibility tree and tab order; nothing
        in it is ever clicked.
      */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="pointer-events-none fixed left-0 top-0 flex -translate-y-full items-center gap-1.5 opacity-0"
      >
        {VARIANTS.map((variant) => (
          <div key={variant.id} data-pill-id={variant.id}>
            <VariantPill variant={variant} selected={false} onSelect={() => {}} />
          </div>
        ))}
        <div data-trigger>
          <OverflowTrigger />
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex min-w-0 items-center gap-1.5"
        role="group"
        aria-label="Knowledge canvas renderer"
      >
        {visible.map((variant) => (
          <VariantPill
            key={variant.id}
            variant={variant}
            selected={variant.id === activeId}
            onSelect={onSelect}
          />
        ))}
        {overflow.length > 0 ? (
          <Popover
            open={menuOpen}
            onOpenChange={setMenuOpen}
            side="bottom"
            align="start"
            label="More renderers"
            testId="knowledge-variant-overflow"
            panelClassName="min-w-40"
            triggerClassName="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-border px-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            trigger={<OverflowTrigger />}
          >
            <div className="flex flex-col gap-0.5 p-1" role="menu">
              {overflow.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={variant.id === activeId}
                  onClick={() => {
                    onSelect(variant.id);
                    setMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                    variant.id === activeId
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <variant.icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {variant.label}
                </button>
              ))}
            </div>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

function OverflowTrigger() {
  return (
    <>
      <LuEllipsis aria-hidden className="h-3.5 w-3.5" />
      <span className="sr-only">More renderers</span>
    </>
  );
}

function VariantPill({
  variant,
  selected,
  onSelect,
}: {
  variant: KnowledgeVariant;
  selected: boolean;
  onSelect: (id: KnowledgeVariantId) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(variant.id)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      <variant.icon aria-hidden className="h-3 w-3 shrink-0" />
      {variant.label}
    </button>
  );
}

/**
 * Measures every pill's natural width off-screen (real widths need real
 * layout, not a guess), then — on every resize of the *visible* bar — walks
 * the list in order and keeps whatever fits ahead of the "…" trigger's own
 * reserved width. Recomputes on a `ResizeObserver` firing or the variant
 * list changing; a selection change alone does not resize anything and does
 * not retrigger this.
 */
function useOverflowVariants(variants: readonly KnowledgeVariant[]): {
  containerRef: RefObject<HTMLDivElement | null>;
  measureRef: RefObject<HTMLDivElement | null>;
  visible: readonly KnowledgeVariant[];
  overflow: readonly KnowledgeVariant[];
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(variants.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const available = container.clientWidth;
      const pillEls = Array.from(measure.querySelectorAll<HTMLElement>('[data-pill-id]'));
      const triggerEl = measure.querySelector<HTMLElement>('[data-trigger]');
      const triggerWidth = triggerEl?.offsetWidth ?? 0;
      const gap = 6; // matches both rows' `gap-1.5` (0.375rem)

      let used = 0;
      let fit = pillEls.length;
      for (let i = 0; i < pillEls.length; i += 1) {
        const width = pillEls[i]!.offsetWidth;
        // Every pill but the trailing one must also leave room for the "…"
        // trigger, since a later pill not fitting is what makes it appear.
        const reserve = i < pillEls.length - 1 ? triggerWidth + gap : 0;
        const next = used + width + (i > 0 ? gap : 0);
        if (next + reserve > available) {
          fit = i;
          break;
        }
        used = next;
      }
      setSplit(fit);
    };

    recompute();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [variants]);

  return {
    containerRef,
    measureRef,
    visible: variants.slice(0, split),
    overflow: variants.slice(split),
  };
}
