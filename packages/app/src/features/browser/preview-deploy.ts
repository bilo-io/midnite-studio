export function matchPreviewDeploy(urlOrText: string): string[] {
  if (!urlOrText) return [];

  // Match URLs with host suffixes: vercel.app, netlify.app, pages.dev, surge.sh, render.com, fly.dev
  const regex = /https?:\/\/([a-zA-Z0-9-]+\.)+(vercel\.app|netlify\.app|pages\.dev|surge\.sh|render\.com|fly\.dev)(:\d+)?(\/[^\s"!.,)]*)?/gi;
  const matches = urlOrText.match(regex);
  if (!matches) return [];

  return Array.from(new Set(matches));
}
