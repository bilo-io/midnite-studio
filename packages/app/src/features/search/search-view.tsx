import { useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  LuCaseSensitive,
  LuFile,
  LuGitCommitVertical,
  LuRegex,
  LuSearch,
  LuUser,
  LuX,
} from 'react-icons/lu';
import { MdFormatShapes } from 'react-icons/md';

import { EmptyState } from '../../components/empty-state';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { Spinner } from '../../components/skeleton';
import { useUiStore } from '../../store/ui-store';
import { FileIcon } from '../files/file-icons';
import { FilePreview } from '../files/preview/file-preview';
import { CommitDetail } from '../commit/commit-detail';
import {
  useSearchStore,
  type SearchMode,
} from './search-store';
import { useSearch } from './use-search';

export function SearchView() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);

  // Trigger search pipeline
  useSearch(selectedRepoId, selectedWorktreePath);


  const mode = useSearchStore((s) => s.mode);
  const setMode = useSearchStore((s) => s.setMode);

  const inFlight = useSearchStore((s) => s.inFlight);
  const totalResults = useSearchStore((s) => s.totalResults);
  const truncated = useSearchStore((s) => s.truncated);
  const error = useSearchStore((s) => s.error);

  const commitsResults = useSearchStore((s) => s.commitsResults);
  const contentResults = useSearchStore((s) => s.contentResults);
  const filesResults = useSearchStore((s) => s.filesResults);

  const selectedItem = useSearchStore((s) => s.selectedItem);
  const setSelectedItem = useSearchStore((s) => s.setSelectedItem);

  // Resizable split: results on left, preview on right
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const resizable = useResizable({
    size: sidebarWidth,
    onSize: setSidebarWidth,
    initial: 380,
    min: 260,
    max: 800,
    axis: 'x',
    edge: 'start',
  });

  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten for virtualizer based on mode
  const itemCount =
    mode === 'commits'
      ? commitsResults.length
      : mode === 'files'
      ? filesResults.length
      : contentResults.length;

  const rowVirtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (mode === 'commits' ? 56 : mode === 'content' ? 44 : 32),
    overscan: 5,
  });

  if (!selectedRepoId) {
    return (
      <EmptyState
        icon={LuSearch}
        title="No repository selected"
        body="Open a repository from the sidebar to search across commits, content, and files."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
      {/* Left panel: Query builder + Results List */}
      <div
        style={{ width: resizable.current }}
        className="flex h-full min-h-0 flex-col border-r border-border bg-card shrink-0"
      >
        {/* Mode Selector Tabs */}
        <div className="flex border-b border-border p-1 bg-muted/20">
          {(['commits', 'content', 'files'] as SearchMode[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`flex-1 py-1 text-xs font-medium rounded-sm capitalize transition-colors ${
                mode === tab
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Query Input Bars per mode */}
        <div className="p-3 border-b border-border bg-background/50 flex flex-col gap-2">
          {mode === 'commits' && <CommitsQueryInputs />}
          {mode === 'content' && <ContentQueryInputs />}
          {mode === 'files' && <FilesQueryInputs />}
        </div>

        {/* Results status bar */}
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/10 font-mono">
          <div className="flex items-center gap-1.5">
            {inFlight && <Spinner size="xs" tone="inherit" className="text-primary" />}
            <span>
              {totalResults} {totalResults === 1 ? 'match' : 'matches'}
              {truncated ? ' (capped at 5,000)' : ''}
            </span>
          </div>
          {error && <span className="text-destructive font-sans">{error}</span>}
        </div>

        {/* Virtualized Results List */}
        <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
          {itemCount === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs">
              {inFlight ? 'Searching repository…' : 'No matching results found.'}
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const index = virtualRow.index;
                if (mode === 'commits') {
                  const commit = commitsResults[index];
                  if (!commit) return null;
                  const isSelected =
                    selectedItem?.kind === 'commit' && selectedItem.commit.sha === commit.sha;

                  return (
                    <div
                      key={commit.sha}
                      onClick={() => setSelectedItem({ kind: 'commit', commit })}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex flex-col justify-center px-3 border-b border-border/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold truncate flex-1">
                          {commit.subject}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                          {commit.sha.slice(0, 7)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
                        <span className="truncate">{commit.authorName}</span>
                        <span className="shrink-0 text-[10px]">
                          {new Date(commit.authorDate * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                } else if (mode === 'content') {
                  const hit = contentResults[index];
                  if (!hit) return null;
                  const isSelected =
                    selectedItem?.kind === 'content' &&
                    selectedItem.hit.path === hit.path &&
                    selectedItem.hit.line === hit.line;

                  return (
                    <div
                      key={`${hit.path}:${hit.line}:${index}`}
                      onClick={() => setSelectedItem({ kind: 'content', hit })}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex flex-col justify-center px-3 border-b border-border/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground truncate">
                        <FileIcon name={hit.path.slice(hit.path.lastIndexOf('/') + 1)} />
                        <span className="truncate">{hit.path}</span>
                        <span className="text-muted-foreground font-mono text-[10px]">
                          :{hit.line}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground truncate pl-4">
                        {hit.text}
                      </div>
                    </div>
                  );
                } else {
                  const filePath = filesResults[index];
                  if (!filePath) return null;
                  const isSelected =
                    selectedItem?.kind === 'file' && selectedItem.path === filePath;

                  return (
                    <div
                      key={filePath}
                      onClick={() => setSelectedItem({ kind: 'file', path: filePath })}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex items-center gap-2 px-3 border-b border-border/40 cursor-pointer transition-colors text-xs ${
                        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40'
                      }`}
                    >
                      <FileIcon name={filePath.slice(filePath.lastIndexOf('/') + 1)} />
                      <span className="truncate flex-1 font-mono">{filePath}</span>
                    </div>
                  );
                }
              })}
            </div>
          )}
        </div>
      </div>

      <ResizeHandle resizable={resizable} axis="x" label="Resize search sidebar" />

      {/* Right panel: Detail / Inspector / Code Preview */}
      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden bg-background">
        {selectedItem?.kind === 'commit' ? (
          <CommitDetail
            sha={selectedItem.commit.sha}
            repoId={selectedRepoId}
          />
        ) : selectedItem?.kind === 'content' ? (
          <FilePreview
            scope={{
              scope: 'repo',
              repoId: selectedRepoId,
              ...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {}),
            }}
            relPath={selectedItem.hit.path}
            targetLine={selectedItem.hit.line}
          />
        ) : selectedItem?.kind === 'file' ? (
          <FilePreview
            scope={{
              scope: 'repo',
              repoId: selectedRepoId,
              ...(selectedWorktreePath ? { worktreePath: selectedWorktreePath } : {}),
            }}
            relPath={selectedItem.path}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-xs">
            Select an item on the left to preview details.
          </div>
        )}
      </div>
    </div>
  );
}

function CommitsQueryInputs() {
  const options = useSearchStore((s) => s.commitsOptions);
  const setOptions = useSearchStore((s) => s.setCommitsOptions);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
        <LuSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={options.grep}
          onChange={(e) => setOptions({ grep: e.target.value })}
          placeholder="Message grep…"
          aria-label="Commit message grep"
          className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {options.grep && (
          <button
            type="button"
            onClick={() => setOptions({ grep: '' })}
            className="text-muted-foreground hover:text-foreground"
          >
            <LuX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
          <LuUser className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={options.author}
            onChange={(e) => setOptions({ author: e.target.value })}
            placeholder="Author…"
            aria-label="Commit author"
            className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
          <MdFormatShapes className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={options.pickaxeString}
            onChange={(e) => setOptions({ pickaxeString: e.target.value })}
            placeholder="Pickaxe (-S)…"
            aria-label="Pickaxe string"
            className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOptions({ ignoreCase: !options.ignoreCase })}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
            options.ignoreCase
              ? 'bg-accent text-accent-foreground border-accent'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <LuCaseSensitive className="h-3.5 w-3.5" />
          <span>Match Case</span>
        </button>

        <button
          type="button"
          onClick={() => setOptions({ regexp: !options.regexp })}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
            options.regexp
              ? 'bg-accent text-accent-foreground border-accent'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <LuRegex className="h-3.5 w-3.5" />
          <span>RegExp</span>
        </button>
      </div>
    </div>
  );
}

function ContentQueryInputs() {
  const options = useSearchStore((s) => s.contentOptions);
  const setOptions = useSearchStore((s) => s.setContentOptions);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
        <LuSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={options.pattern}
          onChange={(e) => setOptions({ pattern: e.target.value })}
          placeholder="Search text in files…"
          aria-label="Pattern to grep"
          className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {options.pattern && (
          <button
            type="button"
            onClick={() => setOptions({ pattern: '' })}
            className="text-muted-foreground hover:text-foreground"
          >
            <LuX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
          <LuGitCommitVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={options.rev}
            onChange={(e) => setOptions({ rev: e.target.value })}
            placeholder="Revision (HEAD)…"
            aria-label="Revision to grep"
            className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
          <LuFile className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={options.paths}
            onChange={(e) => setOptions({ paths: e.target.value })}
            placeholder="Paths (comma sep)…"
            aria-label="Paths to filter"
            className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOptions({ ignoreCase: !options.ignoreCase })}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
            options.ignoreCase
              ? 'bg-accent text-accent-foreground border-accent'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <LuCaseSensitive className="h-3.5 w-3.5" />
          <span>Case Sensitive</span>
        </button>

        <button
          type="button"
          onClick={() => setOptions({ regexp: !options.regexp })}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
            options.regexp
              ? 'bg-accent text-accent-foreground border-accent'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <LuRegex className="h-3.5 w-3.5" />
          <span>RegExp</span>
        </button>

        <button
          type="button"
          onClick={() => setOptions({ wordMatch: !options.wordMatch })}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
            options.wordMatch
              ? 'bg-accent text-accent-foreground border-accent'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Whole Word</span>
        </button>
      </div>
    </div>
  );
}

function FilesQueryInputs() {
  const options = useSearchStore((s) => s.filesOptions);
  const setOptions = useSearchStore((s) => s.setFilesOptions);

  return (
    <div className="flex items-center gap-1.5 bg-card rounded border border-border px-2 py-1">
      <LuSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <input
        type="text"
        value={options.query}
        onChange={(e) => setOptions({ query: e.target.value })}
        placeholder="Filter files by name…"
        aria-label="Filter files"
        className="h-5 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      {options.query && (
        <button
          type="button"
          onClick={() => setOptions({ query: '' })}
          className="text-muted-foreground hover:text-foreground"
        >
          <LuX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
