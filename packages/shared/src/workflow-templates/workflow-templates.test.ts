import { describe, expect, it } from 'vitest';

import { validateWorkflow, workflowIssueSeverity } from '../workflow';
import { WORKFLOW_TEMPLATES, WorkflowTemplateSchema, instantiateWorkflowTemplateWorkflow } from './index';

describe('built-in workflow templates (Phase 97 Theme L)', () => {
  it('ships the five built-ins with unique ids', () => {
    const ids = WORKFLOW_TEMPLATES.map((template) => template.id);
    expect(ids).toEqual([
      'graph-engineering-diamond',
      'harness-bounded-build',
      'loop-maker-checker',
      'research-and-publish',
      'risk-router',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(WORKFLOW_TEMPLATES.map((template) => [template.id, template] as const))('%s', (_id, template) => {
    it('parses as a WorkflowTemplate', () => {
      expect(WorkflowTemplateSchema.safeParse(template).success).toBe(true);
    });

    it('passes validateWorkflow with no error-severity issue', () => {
      const workflow = instantiateWorkflowTemplateWorkflow(template, 1);
      const errors = validateWorkflow(workflow).filter((issue) => workflowIssueSeverity(issue) === 'error');
      expect(errors).toEqual([]);
    });

    it('points every http node at the demo API only', () => {
      for (const node of template.workflow.nodes) {
        if (node.kind !== 'http') continue;
        expect(node.config.url.startsWith('{{demo.baseUrl}}/')).toBe(true);
      }
    });

    it('quotes the article rule it demonstrates in a note node', () => {
      const notes = template.workflow.nodes.filter((node) => node.kind === 'note');
      expect(notes.length).toBeGreaterThan(0);
    });

    it('mints a fresh workflow id on every instantiation', () => {
      const a = instantiateWorkflowTemplateWorkflow(template, 1);
      const b = instantiateWorkflowTemplateWorkflow(template, 1);
      expect(a.id).not.toBe(b.id);
      expect(a.createdAt).toBe(1);
    });
  });

  it('only the risk router needs setup — its forge trigger needs a registered repo', () => {
    const withChecklist = WORKFLOW_TEMPLATES.filter((template) => template.setupChecklist?.length);
    expect(withChecklist.map((template) => template.id)).toEqual(['risk-router']);
  });
});
