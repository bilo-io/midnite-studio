import { create, all, type EvalFunction, type FactoryFunctionMap, type MathJsInstance, type MathNode } from 'mathjs';

/**
 * One mathjs instance per module load (Phase 126 Theme D.1). A notebook can arrive as a file, so its
 * expressions are untrusted. The functions that reach JavaScript or build new functions (`import`,
 * `createUnit`, `reviver`) and the ones that evaluate more source (`evaluate`, `parse`, `compile`) are refused
 * by walking each parsed expression before it is compiled: a call to one, or a bare reference to one, throws
 * `Function <name> is disabled`.
 *
 * This is a guard on the expression, not `math.import(..., { override: true })`: overriding `parse` rebinds
 * every mathjs function built on it, and `derivative` and `simplify` — which reach no JavaScript and are the
 * point of a CAS-lite — would stop working.
 */
export const math: MathJsInstance = create(all as FactoryFunctionMap);

const DISABLED = new Set(['import', 'createUnit', 'reviver', 'evaluate', 'parse', 'compile']);

/** The real parser, for the evaluator's own use (TeX output). */
export const parse = (expr: string): MathNode => math.parse(expr);

/** Throws `Function <name> is disabled` if the expression names a refused function anywhere. */
export function assertAllowed(node: MathNode): void {
  node.traverse((n: MathNode) => {
    const name = (n as { name?: string }).name;
    const type = (n as { type?: string }).type;
    if ((type === 'SymbolNode' || type === 'FunctionAssignmentNode') && name !== undefined && DISABLED.has(name)) {
      throw new Error(`Function ${name} is disabled`);
    }
  });
}

/** Parses, guards and compiles one expression. */
export function compile(expr: string): EvalFunction {
  const node = parse(expr);
  assertAllowed(node);
  return node.compile();
}
