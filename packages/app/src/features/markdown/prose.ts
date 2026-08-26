/**
 * Tailwind utilities that turn rendered markdown into readable prose.
 *
 * A shared constant rather than a component, because the two surfaces that
 * render markdown want the same typography and different containers: the file
 * preview is a scrolling document pane, and a commit message is a block inside
 * a panel header that scrolls with its neighbours.
 *
 * Written as arbitrary-variant selectors rather than `@tailwindcss/typography`
 * — the plugin brings its own colour scale, which would have to be re-themed
 * against the app's tokens in both light and dark for the sake of styles that
 * fit in one string.
 */
export const MARKDOWN_PROSE_CLASSES = `
  [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
  [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
  [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold
  [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold
  [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold
  [&_hr]:my-3 [&_hr]:border-border
  [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2
  [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0
  [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1
  [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
  [&_ul]:list-disc [&_ul]:pl-5
`;
