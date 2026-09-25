import { useCallback, useId, useMemo, useState } from 'react';
import { Collapse } from '@bilo-io/ui';
import type { TestPackage, TestSuite, TestSuiteKind } from '@midnite/studio-shared';
import {
  LuChevronRight,
  LuChevronsDownUp,
  LuChevronsUpDown,
  LuPackage,
  LuTag,
} from 'react-icons/lu';

import { FilterInput } from '../../components/filter-input';
import { IconButton, type IconComponent } from '../../components/icon-button';

const KIND_LABEL: Record<TestSuiteKind, string> = {
  unit: 'unit',
  integration: 'integration',
  smoke: 'smoke',
  e2e: 'e2e',
  lint: 'lint',
  typecheck: 'typecheck',
  other: 'other',
};

const KIND_ORDER: readonly TestSuiteKind[] = [
  'unit',
  'integration',
  'e2e',
  'smoke',
  'lint',
  'typecheck',
  'other',
];

export type SuiteGroupBy = 'package' | 'kind';

export type SuiteListProps = {
  packages: readonly TestPackage[];
  selectedId: string | null;
  onSelect: (suiteId: string) => void;
  defaultGroupBy?: SuiteGroupBy;
  initialQuery?: string;
};

interface SuiteGroup {
  id: string;
  title: string;
  subtitle?: string;
  icon: IconComponent;
  suites: readonly TestSuite[];
  totalCount: number;
}

export function SuiteList({
  packages,
  selectedId,
  onSelect,
  defaultGroupBy = 'package',
  initialQuery = '',
}: SuiteListProps) {
  const [groupBy, setGroupBy] = useState<SuiteGroupBy>(defaultGroupBy);
  const [query, setQuery] = useState(initialQuery);
  const [selectedKind, setSelectedKind] = useState<'all' | TestSuiteKind>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const allSuites = useMemo(() => packages.flatMap((p) => p.suites), [packages]);

  const availableKinds = useMemo(() => {
    const found = new Set<TestSuiteKind>();
    for (const suite of allSuites) {
      found.add(suite.kind);
    }
    return KIND_ORDER.filter((k) => found.has(k));
  }, [allSuites]);

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltered = normalizedQuery.length > 0 || selectedKind !== 'all';

  const filteredSuites = useMemo(() => {
    return allSuites.filter((suite) => {
      if (selectedKind !== 'all' && suite.kind !== selectedKind) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        suite.name.toLowerCase().includes(normalizedQuery) ||
        suite.packageName.toLowerCase().includes(normalizedQuery) ||
        suite.kind.toLowerCase().includes(normalizedQuery) ||
        suite.displayCommand.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [allSuites, selectedKind, normalizedQuery]);

  const filteredSuiteIds = useMemo(
    () => new Set(filteredSuites.map((s) => s.id)),
    [filteredSuites],
  );

  const groups = useMemo<SuiteGroup[]>(() => {
    if (groupBy === 'package') {
      return packages
        .map((pkg) => {
          const matching = pkg.suites.filter((s) => filteredSuiteIds.has(s.id));
          return {
            id: pkg.name || pkg.path || 'root',
            title: pkg.name,
            subtitle: pkg.path && pkg.path !== pkg.name ? pkg.path : undefined,
            icon: LuPackage,
            suites: matching,
            totalCount: pkg.suites.length,
          };
        })
        .filter((group) => (isFiltered ? group.suites.length > 0 : true));
    }

    return KIND_ORDER.map((kind) => {
      const suitesOfKind = filteredSuites.filter((s) => s.kind === kind);
      const totalOfKind = allSuites.filter((s) => s.kind === kind).length;
      return {
        id: kind,
        title: KIND_LABEL[kind] ?? kind,
        subtitle: undefined,
        icon: LuTag,
        suites: suitesOfKind,
        totalCount: totalOfKind,
      };
    }).filter((group) => (isFiltered ? group.suites.length > 0 : group.totalCount > 0));
  }, [groupBy, packages, filteredSuiteIds, isFiltered, filteredSuites, allSuites]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedGroups({});
  }, []);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const group of groups) {
      next[group.id] = true;
    }
    setCollapsedGroups(next);
  }, [groups]);

  const handleGroupByChange = useCallback((nextGroupBy: SuiteGroupBy) => {
    setGroupBy(nextGroupBy);
    setCollapsedGroups({});
  }, []);

  const clearFilter = useCallback(() => {
    setQuery('');
    setSelectedKind('all');
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Search and action toolbar */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <FilterInput
            value={query}
            onChange={setQuery}
            placeholder="Filter suites, packages, tags…"
            className="min-w-0 flex-1"
          />
          <IconButton
            icon={groupBy === 'package' ? LuPackage : LuTag}
            label={
              groupBy === 'package'
                ? 'Group by package (click to group by kind)'
                : 'Group by kind (click to group by package)'
            }
            size="sm"
            onClick={() => handleGroupByChange(groupBy === 'package' ? 'kind' : 'package')}
            data-testid="toggle-group-by"
          />
          <IconButton
            icon={LuChevronsUpDown}
            label="Expand all groups"
            size="sm"
            onClick={expandAll}
            data-testid="expand-all"
          />
          <IconButton
            icon={LuChevronsDownUp}
            label="Collapse all groups"
            size="sm"
            onClick={collapseAll}
            data-testid="collapse-all"
          />
        </div>

        {/* Quick kind/tag filter pills */}
        {availableKinds.length > 1 && (
          <div
            className="no-scrollbar flex items-center gap-1 overflow-x-auto py-0.5"
            role="tablist"
            aria-label="Filter by kind"
          >
            <button
              key="all"
              type="button"
              role="tab"
              aria-selected={selectedKind === 'all'}
              aria-label="Filter by kind: all"
              onClick={() => setSelectedKind('all')}
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                selectedKind === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              All
            </button>
            {availableKinds.map((kind) => {
              const count = allSuites.filter((s) => s.kind === kind).length;
              const isSelected = selectedKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-label={`Filter by kind: ${kind}`}
                  onClick={() => setSelectedKind(isSelected ? 'all' : kind)}
                  className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span>{kind}</span>
                  <span className="tabular-nums text-[9px] opacity-75">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter status & match counts banner */}
      {isFiltered && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground">
          <span>
            Showing {filteredSuites.length} of {allSuites.length}{' '}
            {allSuites.length === 1 ? 'suite' : 'suites'}
          </span>
          <button
            type="button"
            onClick={clearFilter}
            className="text-[11px] text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Accordion groups list */}
      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {groups.map((group) => {
          const isOpen = !collapsedGroups[group.id];
          return (
            <SuiteAccordionGroup
              key={group.id}
              group={group}
              isOpen={isOpen}
              onToggle={() => toggleGroup(group.id)}
              selectedId={selectedId}
              onSelect={onSelect}
              isFiltered={isFiltered}
              groupBy={groupBy}
            />
          );
        })}

        {/* Empty state when filter matches no suites */}
        {isFiltered && filteredSuites.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <p className="text-xs">No test suites match the current filter.</p>
            <button
              type="button"
              onClick={clearFilter}
              data-testid="clear-filter"
              className="rounded bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SuiteAccordionGroup({
  group,
  isOpen,
  onToggle,
  selectedId,
  onSelect,
  isFiltered,
  groupBy,
}: {
  group: SuiteGroup;
  isOpen: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (suiteId: string) => void;
  isFiltered: boolean;
  groupBy: SuiteGroupBy;
}) {
  const contentId = useId();
  const GroupIcon = group.icon;

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-accent/30"
      >
        <LuChevronRight
          aria-hidden
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
            isOpen ? 'rotate-90 text-foreground' : ''
          }`}
        />
        <GroupIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground">
          {group.title}
        </span>
        {group.subtitle && (
          <span className="truncate text-[10px] text-muted-foreground/60">
            {group.subtitle}
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
          {isFiltered && group.suites.length !== group.totalCount
            ? `${group.suites.length}/${group.totalCount}`
            : group.suites.length}
        </span>
      </button>

      <Collapse open={isOpen} id={contentId} role="region" aria-label={group.title}>
        <div className="pb-1">
          {group.suites.map((suite) => (
            <button
              key={suite.id}
              type="button"
              onClick={() => onSelect(suite.id)}
              aria-current={suite.id === selectedId}
              className={`flex w-full flex-col items-start gap-0.5 py-1.5 pl-6 pr-3 text-left text-[13px] transition-colors hover:bg-accent/30 ${
                suite.id === selectedId ? 'bg-accent/50 font-medium' : ''
              }`}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{suite.name}</span>
                <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {groupBy === 'kind' ? suite.packageName : KIND_LABEL[suite.kind]}
                </span>
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {suite.displayCommand}
              </span>
            </button>
          ))}
        </div>
      </Collapse>
    </div>
  );
}
