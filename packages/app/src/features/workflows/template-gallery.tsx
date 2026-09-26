import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@midnite/studio-shared';
import { useMemo } from 'react';
import { LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { Modal } from '../../components/modal';
import { WORKFLOW_NODE_HEIGHT, WORKFLOW_NODE_WIDTH, autoLayout } from './canvas/workflow-layout';

/**
 * The template gallery (Phase 97 Theme L) — "New from template" in the
 * workflow list. Built-ins are shared data (`WORKFLOW_TEMPLATES`); the "Your
 * templates" section is whatever the editor's "Save as template" kept in main.
 * Choosing a card is the caller's business (it instantiates and selects).
 */
export function TemplateGallery({
  open,
  onClose,
  userTemplates,
  onUse,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  userTemplates: readonly WorkflowTemplate[];
  onUse: (template: WorkflowTemplate) => void;
  onDelete: (template: WorkflowTemplate) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="New from template" size="lg" testId="template-gallery">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto p-1">
        <GallerySection title="Built-in">
          {WORKFLOW_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} onUse={onUse} />
          ))}
        </GallerySection>
        <GallerySection title="Your templates">
          {userTemplates.length === 0 ? (
            <p className="col-span-full text-xs text-muted-foreground">
              Nothing saved yet — use “Save as template” in the editor toolbar.
            </p>
          ) : (
            userTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} onUse={onUse} onDelete={onDelete} />
            ))
          )}
        </GallerySection>
      </div>
    </Modal>
  );
}

function GallerySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TemplateCard({
  template,
  onUse,
  onDelete,
}: {
  template: WorkflowTemplate;
  onUse: (template: WorkflowTemplate) => void;
  onDelete?: (template: WorkflowTemplate) => void;
}) {
  return (
    <div className="group relative flex flex-col gap-1.5 rounded-md border border-border bg-card p-2 transition-colors hover:border-primary/60">
      <button
        type="button"
        onClick={() => onUse(template)}
        className="flex cursor-pointer flex-col gap-1.5 text-left"
        aria-label={`Use ${template.title}`}
      >
        <TemplatePreview template={template} />
        <span className="text-xs font-medium text-foreground">{template.title}</span>
        {template.blurb ? <span className="text-[11px] text-muted-foreground">{template.blurb}</span> : null}
      </button>
      {template.source ? <span className="text-[10px] italic text-muted-foreground/80">{template.source}</span> : null}
      {template.tags.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {template.tags.map((tag) => (
            <span key={tag} className="rounded bg-accent px-1 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </span>
      ) : null}
      {onDelete ? (
        <IconButton
          icon={LuTrash2}
          label={`Delete ${template.title}`}
          size="sm"
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(template)}
        />
      ) : null}
    </div>
  );
}

const PREVIEW_NODE_W = WORKFLOW_NODE_WIDTH;
const PREVIEW_NODE_H = WORKFLOW_NODE_HEIGHT;

/**
 * A static mini canvas: the template's graph laid out by the same dagre helper
 * the editor's auto-layout uses, drawn as plain SVG boxes and lines — a second
 * React Flow instance per card would be a lot of machinery for a thumbnail.
 */
export function TemplatePreview({ template }: { template: WorkflowTemplate }) {
  const { boxes, lines, viewBox } = useMemo(() => {
    const nodes = template.workflow.nodes.filter((node) => node.kind !== 'note' && node.kind !== 'frame');
    const ids = new Set(nodes.map((node) => node.id));
    const edges = template.workflow.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    const positions = autoLayout(nodes, edges);
    const at = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
    const boxes = nodes.map((node) => ({ id: node.id, ...at(node.id) }));
    const lines = edges.map((edge) => {
      const from = at(edge.from);
      const to = at(edge.to);
      return {
        id: edge.id,
        x1: from.x + PREVIEW_NODE_W,
        y1: from.y + PREVIEW_NODE_H / 2,
        x2: to.x,
        y2: to.y + PREVIEW_NODE_H / 2,
        loop: edge.kind === 'loop',
      };
    });
    const maxX = Math.max(PREVIEW_NODE_W, ...boxes.map((box) => box.x + PREVIEW_NODE_W));
    const maxY = Math.max(PREVIEW_NODE_H, ...boxes.map((box) => box.y + PREVIEW_NODE_H));
    const minX = Math.min(0, ...boxes.map((box) => box.x));
    const minY = Math.min(0, ...boxes.map((box) => box.y));
    return { boxes, lines, viewBox: `${minX - 8} ${minY - 8} ${maxX - minX + 16} ${maxY - minY + 16}` };
  }, [template]);

  return (
    <svg
      role="img"
      aria-label={`${template.title} preview`}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="h-20 w-full rounded bg-background/60"
    >
      {lines.map((line) => (
        <line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          strokeWidth={4}
          strokeDasharray={line.loop ? '10 8' : undefined}
          className="stroke-muted-foreground/50"
        />
      ))}
      {boxes.map((box) => (
        <rect
          key={box.id}
          x={box.x}
          y={box.y}
          width={PREVIEW_NODE_W}
          height={PREVIEW_NODE_H}
          rx={8}
          className="fill-card stroke-primary/70"
          strokeWidth={4}
        />
      ))}
    </svg>
  );
}
