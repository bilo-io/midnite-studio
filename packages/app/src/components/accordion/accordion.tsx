import type { ReactNode } from 'react';

import { useUiStore } from '../../store/ui-store';
import { TreeSection } from '../tree-section';

/**
 * A generic accordion (Phase 99 Theme A) — several collapsible sections, each
 * with a header, an optional count, an actions slot and a persisted
 * open/closed state. Built on `TreeSection`'s visuals so it reads as the same
 * sidebar grammar as the repos panel.
 *
 * Open state persists in `ui-store`'s `collapsedAccordionSections` under
 * `<id>:<section.id>` — a closed-set inversion, so a new section starts open.
 * Docs (projects), Video (Assets / Projects) and Audio (projects) all use it.
 */
export type AccordionSection = {
  id: string;
  title: string;
  count?: number;
  icon?: ReactNode;
  /** Trailing header controls (e.g. a "+" IconButton); outside the toggle button. */
  actions?: ReactNode;
  children: ReactNode;
};

export const accordionKey = (accordionId: string, sectionId: string): string => `${accordionId}:${sectionId}`;

export function Accordion({
  id,
  sections,
  tone,
  tinted,
}: {
  id: string;
  sections: AccordionSection[];
  /** `primary` tints section headings with the active theme's primary colour. */
  tone?: 'primary';
  /** A translucent primary-colour wash behind each header (Media ▸ Models). */
  tinted?: boolean;
}) {
  const collapsed = useUiStore((s) => s.collapsedAccordionSections);
  const toggle = useUiStore((s) => s.toggleAccordionSection);

  return (
    <div className="flex flex-col" data-accordion={id}>
      {sections.map((section) => {
        const key = accordionKey(id, section.id);
        return (
          <TreeSection
            key={section.id}
            title={section.title}
            {...(section.count !== undefined ? { count: section.count } : {})}
            icon={section.icon}
            meta={section.actions}
            collapsible
            open={!collapsed.includes(key)}
            onToggle={() => toggle(key)}
            hideWhenEmpty={false}
            {...(tone ? { tone } : {})}
            {...(tinted ? { tinted } : {})}
          >
            {section.children}
          </TreeSection>
        );
      })}
    </div>
  );
}
