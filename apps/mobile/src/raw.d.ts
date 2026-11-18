// Vite's `?raw` import (vitest only): lets a test read a module's own source without a node builtin.
declare module '*?raw' {
  const text: string;
  export default text;
}
