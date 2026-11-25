// Vite's `?inline` import: the file's bytes as a `data:` URI string.
declare module '*.png?inline' {
  const uri: string;
  export default uri;
}
