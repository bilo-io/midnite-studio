import { z } from 'zod';

/**
 * Turn off zod's JIT before any schema is built.
 *
 * zod 4 compiles a fast object parser with `new Function` and, the first time a
 * `z.object` is constructed, probes whether that is allowed. Under the
 * renderer's CSP (no `unsafe-eval`) the probe is refused — zod catches the throw
 * and falls back — but the browser still fires a `securitypolicyviolation`
 * (`blockedURI: 'eval'`). The e2e harness's `csp-console-guard` treats every
 * violation as fatal, so the app never mounted. `jitless` skips the probe
 * entirely (zod checks it first), which is the behaviour production already had
 * in practice: eval was never allowed here, so the JIT path never ran.
 *
 * Must be the first import of `boot.tsx`: schemas are built at module load, so
 * this has to evaluate before any module that defines one.
 */
z.config({ jitless: true });
