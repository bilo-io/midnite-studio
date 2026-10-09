import { changelogEntry, parseIterations, videoFileUrl } from '@midnite/studio-shared';
import { useState } from 'react';

import { TreeSection } from '../../../components/tree-section';
import { MarkdownPreview } from '../../files/preview/markdown-preview';
import { useVideoFiles, useVideoProject, useVideoProjectFile } from './use-video';

/**
 * Media ▸ Video ▸ Versions. The video feature has no first-class "version"
 * model; a version is an **iteration** — an `output/vN…` render file as parsed
 * by `parseIterations`, the same list the explorer shows. Each is an accordion
 * (closed by default; the player mounts only once opened) holding its player
 * and a nested accordion with its brief. Briefs are per project, not per
 * version, so the nested brief is the project's BRIEF.md plus that
 * iteration's CHANGELOG.md entry when there is one.
 */
export function VideoVersions({ projectId }: { projectId: string }) {
  const output = useVideoFiles(projectId, 'output');
  const iterations = parseIterations(output.data.filter((f) => !f.isDir).map((f) => f.name));

  if (iterations.length === 0) {
    return <p className="text-muted-foreground">No versions yet. Render one from the Brief tab.</p>;
  }
  return (
    <div className="flex flex-col" data-testid="video-versions">
      {iterations.map((it) => (
        <VersionItem key={it.filename} projectId={projectId} filename={it.filename} />
      ))}
    </div>
  );
}

function VersionItem({ projectId, filename }: { projectId: string; filename: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TreeSection title={filename} collapsible open={open} onToggle={() => setOpen((o) => !o)} hideWhenEmpty={false}>
      {open ? <VersionBody projectId={projectId} filename={filename} /> : null}
    </TreeSection>
  );
}

function VersionBody({ projectId, filename }: { projectId: string; filename: string }) {
  const [briefOpen, setBriefOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 py-1">
      <video
        src={videoFileUrl(`projects/${projectId}/output/${filename}`)}
        controls
        aria-label={filename}
        className="w-full rounded-md bg-black"
      />
      <TreeSection
        title="Brief"
        collapsible
        depth={1}
        open={briefOpen}
        onToggle={() => setBriefOpen((o) => !o)}
        hideWhenEmpty={false}
      >
        {briefOpen ? <VersionBrief projectId={projectId} filename={filename} /> : null}
      </TreeSection>
    </div>
  );
}

function VersionBrief({ projectId, filename }: { projectId: string; filename: string }) {
  const project = useVideoProject(projectId);
  const briefPath = project.data?.valid ? project.data.brief : null;
  const brief = useVideoProjectFile(projectId, briefPath);
  const changelog = useVideoProjectFile(projectId, 'output/CHANGELOG.md');
  const entry = changelog.data ? changelogEntry(changelog.data, filename) : null;
  return (
    <div className="flex flex-col gap-2 px-2 text-xs">
      {brief.data ? <MarkdownPreview content={brief.data} /> : <p className="text-muted-foreground">Nothing written yet.</p>}
      {entry ? <MarkdownPreview content={entry} /> : null}
    </div>
  );
}
