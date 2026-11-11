import { create, all, type MathJsInstance } from 'mathjs';

/**
 * One mathjs instance per module load (Phase 126 Theme D.1). A notebook can arrive as a file, so its
 * expressions are untrusted: the functions that reach JavaScript are replaced with ones that throw, the
 * mathjs security guidance. `parse` and `compile` are captured first because the evaluator still needs them.
 */
export const math: MathJsInstance = create(all);

/** The real parse and compile, captured before `import` is disabled. */
export const parse = math.parse.bind(math);
export const compile = math.compile.bind(math);

const disabled = (name: string) => () => {
  throw new Error(`Function ${name} is disabled`);
};

math.import(
  {
    import: disabled('import'),
    createUnit: disabled('createUnit'),
    reviver: disabled('reviver'),
    evaluate: disabled('evaluate'),
    parse: disabled('parse'),
    compile: disabled('compile'),
  },
  { override: true },
);
