import { useState } from 'react';

import { LuImageOff, LuShieldAlert } from 'react-icons/lu';

import { mstudioImageUrl, resolveMarkdownImageSrc } from '@midnite/studio-shared';

import { type FsScopeInput } from '../file-tree';

/**
 * The markdown preview's `img` override.
 *
 * A local src resolves against the markdown file's directory (or, with a
 * leading `/`, the repo/worktree root) and loads through the same jailed
 * `mstudio-file://` protocol the Files pane already streams media from — with
 * `?as=image`, so main serves nothing but an image extension. No bytes cross
 * IPC, and an SVG stays an `<img>`: it is never inlined as markup.
 *
 * `https:` images load directly (the app CSP's `img-src` allows them);
 * `http:` and other schemes are refused by that CSP, so they get a visible
 * "blocked" chip instead of a silent gap. Anything that cannot be resolved,
 * or fails to load, gets a broken-image chip naming the alt text and path.
 */
export type MarkdownImageProps = {
  src?: string;
  alt?: string;
  title?: string;
  /** Where the markdown file lives; absent outside the Files pane. */
  scope?: FsScopeInput;
  currentRelPath?: string;
};

export function MarkdownImage({ src, alt, title, scope, currentRelPath }: MarkdownImageProps) {
  const source = resolveMarkdownImageSrc(src, currentRelPath);
  const label = alt ?? '';

  if (source.kind === 'blocked') {
    return (
      <ImageChip
        icon="blocked"
        text={`Remote image blocked${source.reason === 'insecure-http' ? ' (insecure http)' : ''}`}
        detail={source.url}
        alt={label}
      />
    );
  }
  if (source.kind === 'invalid') {
    return <ImageChip icon="broken" text={label || 'Image'} detail={src ?? ''} alt={label} />;
  }

  let url: string;
  let detail: string;
  if (source.kind === 'remote') {
    url = source.url;
    detail = source.url;
  } else if (scope) {
    url =
      scope.scope === 'repo'
        ? mstudioImageUrl('repo', scope.repoId, source.relPath, scope.worktreePath)
        : mstudioImageUrl('claude-home', null, source.relPath);
    detail = source.relPath;
  } else {
    return <ImageChip icon="broken" text={label || 'Image'} detail={source.relPath} alt={label} />;
  }

  // Keyed on the URL so a new src gets a fresh load instead of the old failure.
  return (
    <LoadedImage key={url} url={url} alt={label} title={title} detail={detail} remote={source.kind === 'remote'} />
  );
}

function LoadedImage({
  url,
  alt,
  title,
  detail,
  remote,
}: {
  url: string;
  alt: string;
  title?: string;
  detail: string;
  remote: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ImageChip icon="broken" text={alt || 'Image'} detail={detail} alt={alt} />;
  return (
    <img
      src={url}
      alt={alt}
      title={title}
      loading="lazy"
      decoding="async"
      // A remote host learns nothing about the app's own URL.
      referrerPolicy={remote ? 'no-referrer' : undefined}
      className="inline-block h-auto max-w-full"
      onError={() => setFailed(true)}
    />
  );
}

/** Inline, so it is valid inside the `<p>` react-markdown wraps an image in. */
function ImageChip({
  icon,
  text,
  detail,
  alt,
}: {
  icon: 'broken' | 'blocked';
  text: string;
  detail: string;
  alt: string;
}) {
  const Icon = icon === 'blocked' ? LuShieldAlert : LuImageOff;
  return (
    <span
      role="img"
      aria-label={alt ? `${text}: ${alt}` : text}
      data-markdown-image={icon}
      title={detail}
      className="inline-flex max-w-full items-center gap-1.5 rounded border border-dashed border-border bg-muted/40 px-2 py-1 align-middle text-xs text-muted-foreground"
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
      {detail ? <span className="truncate font-mono text-[10px] opacity-80">{detail}</span> : null}
    </span>
  );
}
