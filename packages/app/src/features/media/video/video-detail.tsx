import { changelogEntry, parseIterations, videoFileUrl } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuClapperboard, LuColumns2, LuExternalLink, LuFolderOpen } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { MarkdownPreview } from '../../files/preview/markdown-preview';
import { openVideoFile, revealVideoFile, useVideoFiles, useVideoProjectFile } from './use-video';
import { VideoCompareDialog } from './video-compare-dialog';
import { MediaPanelBody, MediaPanelLayout } from '../media-panel-layout';
import { VideoProjectDetail } from './video-project-detail';
import { formatBytes, formatDuration, mediaKindOf, type VideoSelection } from './video-selection';

const ASSETS_PROJECT = '-';

const sectionHeading = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
const smallButton =
  'flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50';

/**
 * An image, video or audio file with its readout: dimensions (image/video),
 * duration (video/audio) and size. Read from the element's own metadata
 * events — no probe round-trip. Markdown renders; anything else shows its size.
 */
function MediaPreview({ url, name, size }: { url: string; name: string; size: number }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const kind = mediaKindOf(name);
  const readout = [
    dims ? `${dims.w}×${dims.h}` : null,
    duration !== null ? formatDuration(duration) : null,
    formatBytes(size),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
      {kind === 'image' ? (
        <img
          src={url}
          alt={name}
          onLoad={(event) => setDims({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
          className="max-h-64 w-full rounded-md bg-card object-contain"
        />
      ) : kind === 'video' ? (
        <video
          src={url}
          controls
          aria-label={name}
          onLoadedMetadata={(event) => {
            setDims({ w: event.currentTarget.videoWidth, h: event.currentTarget.videoHeight });
            setDuration(event.currentTarget.duration);
          }}
          className="w-full rounded-md bg-black"
        />
      ) : kind === 'audio' ? (
        <audio
          src={url}
          controls
          aria-label={name}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          className="w-full"
        />
      ) : null}
      <p className="tabular-nums text-[11px] text-muted-foreground" data-testid="media-readout">
        {readout.join(' · ')}
      </p>
    </div>
  );
}

function AssetDetail({ path, size }: { path: string; size: number }) {
  const name = path.split('/').pop() ?? path;
  return (
    <MediaPanelLayout className="text-xs">
      <MediaPanelBody className="flex flex-col gap-3 p-3">
      <div>
        <h2 className="truncate text-sm font-semibold text-foreground">{name}</h2>
        <p className="truncate text-muted-foreground">assets/{path}</p>
      </div>
      <MediaPreview url={videoFileUrl(`assets/${path}`)} name={name} size={size} />
      <div className="flex gap-2">
        <button type="button" className={smallButton} onClick={() => revealVideoFile(ASSETS_PROJECT, 'assets', path)}>
          <LuFolderOpen aria-hidden className="h-3 w-3" /> Reveal
        </button>
      </div>
      </MediaPanelBody>
    </MediaPanelLayout>
  );
}

function FileDetail({
  projectId,
  area,
  name,
  size,
}: {
  projectId: string;
  area: 'input' | 'notes';
  name: string;
  size: number;
}) {
  const markdown = mediaKindOf(name) === 'markdown';
  const content = useVideoProjectFile(projectId, markdown ? `${area}/${name}` : null);
  return (
    <div className="hide-scrollbar flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs">
      <div>
        <h2 className="truncate text-sm font-semibold text-foreground">{name}</h2>
        <p className="truncate text-muted-foreground">
          {projectId}/{area}
        </p>
      </div>
      {markdown ? (
        content.data ? (
          <MarkdownPreview content={content.data} />
        ) : (
          <p className="text-muted-foreground">Empty.</p>
        )
      ) : (
        <MediaPreview url={videoFileUrl(`projects/${projectId}/${area}/${name}`)} name={name} size={size} />
      )}
      <div className="flex gap-2">
        <button type="button" className={smallButton} onClick={() => revealVideoFile(projectId, area, name)}>
          <LuFolderOpen aria-hidden className="h-3 w-3" /> Reveal
        </button>
      </div>
    </div>
  );
}

function IterationDetail({ projectId, filename }: { projectId: string; filename: string }) {
  const changelog = useVideoProjectFile(projectId, 'output/CHANGELOG.md');
  const output = useVideoFiles(projectId, 'output');
  const others = parseIterations(output.data.map((f) => f.name)).filter((it) => it.filename !== filename);
  const [compareWith, setCompareWith] = useState<string>('');
  const [comparing, setComparing] = useState<string | null>(null);
  const entry = changelog.data ? changelogEntry(changelog.data, filename) : null;
  const size = output.data.find((f) => f.name === filename)?.size ?? 0;

  return (
    <div className="hide-scrollbar flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs">
      <div>
        <h2 className="truncate text-sm font-semibold text-foreground">{filename}</h2>
        <p className="truncate text-muted-foreground">{projectId}</p>
      </div>
      <MediaPreview url={videoFileUrl(`projects/${projectId}/output/${filename}`)} name={filename} size={size} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButton} onClick={() => openVideoFile(projectId, 'output', filename)}>
          <LuExternalLink aria-hidden className="h-3 w-3" /> Open
        </button>
        <button type="button" className={smallButton} onClick={() => revealVideoFile(projectId, 'output', filename)}>
          <LuFolderOpen aria-hidden className="h-3 w-3" /> Reveal
        </button>
      </div>

      <section className="space-y-1">
        <h3 className={sectionHeading}>Changelog</h3>
        {entry ? (
          <MarkdownPreview content={entry} />
        ) : (
          <p className="text-muted-foreground">No CHANGELOG.md entry for this iteration.</p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className={sectionHeading}>Compare with…</h3>
        {others.length === 0 ? (
          <p className="text-muted-foreground">No other iteration to compare with.</p>
        ) : (
          <div className="flex gap-2">
            <select
              aria-label="Compare with"
              value={compareWith}
              onChange={(event) => setCompareWith(event.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-2"
            >
              <option value="">Pick an iteration</option>
              {others.map((it) => (
                <option key={it.filename} value={it.filename}>
                  {it.filename}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={smallButton}
              disabled={!compareWith}
              onClick={() => setComparing(compareWith)}
            >
              <LuColumns2 aria-hidden className="h-3 w-3" /> Compare
            </button>
          </div>
        )}
      </section>
      <VideoCompareDialog projectId={projectId} left={filename} right={comparing} onClose={() => setComparing(null)} />
    </div>
  );
}

/**
 * The Video tab's detail pane (Phase 99 Theme D) — whatever the explorer
 * selected: an **asset** (preview + dimensions/duration/size), a **project**
 * (Phase 44's brief, script, skill buttons, renders, plus New iteration), an
 * **iteration** (player, its CHANGELOG entry, Compare with…) or a project's
 * `input/`/`notes/` **file**.
 */
export function VideoDetail({ selection }: { selection: VideoSelection | null }) {
  if (!selection) {
    return <EmptyState icon={LuClapperboard} title="Nothing selected" body="Pick an asset, project or iteration." />;
  }
  switch (selection.kind) {
    case 'asset':
      return <AssetDetail path={selection.path} size={selection.size} />;
    case 'project':
      return <VideoProjectDetail projectId={selection.projectId} />;
    case 'iteration':
      return <IterationDetail projectId={selection.projectId} filename={selection.filename} />;
    case 'file':
      return (
        <FileDetail projectId={selection.projectId} area={selection.area} name={selection.name} size={selection.size} />
      );
  }
}
