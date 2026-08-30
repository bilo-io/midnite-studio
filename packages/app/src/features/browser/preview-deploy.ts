export function matchPreviewDeploy(text: string): string[] {
  if (!text) return [];

  // Strict regex match on PR check output / comments for URLs ending in standard preview domains or deployment URLs
  const regex = /https?:\/\/([a-zA-Z0-9-]+\.)+(vercel\.app|netlify\.app|pages\.dev|surge\.sh|render\.com|fly\.dev)(:\d+)?(\/[^\s"!.,)]*)?/gi;
  const matches = text.match(regex);
  if (!matches) return [];

  return Array.from(new Set(matches));
}
