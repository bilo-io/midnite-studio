import type { TestPackage, TestSuiteKind } from '@midnite/git-shared';

/** One letter per kind, in a fixed palette — the same "small, calm dot" idiom
 *  the forge status pills use, kept text-only since seven kinds is too many
 *  for a colour-coded dot to stay legible. */
const KIND_LABEL: Record<TestSuiteKind, string> = {
  unit: 'unit',
  integration: 'integration',
  smoke: 'smoke',
  e2e: 'e2e',
  lint: 'lint',
  typecheck: 'typecheck',
  other: 'other',
};

export function SuiteList({
  packages,
  selectedId,
  onSelect,
}: {
  packages: readonly TestPackage[];
  selectedId: string | null;
  onSelect: (suiteId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {packages.map((pkg) => (
        <div key={pkg.path || '.'}>
          <h3 className="truncate px-2 py-1 text-[11px] font-medium text-muted-foreground/80">
            {pkg.name}
          </h3>
          {pkg.suites.map((suite) => (
            <button
              key={suite.id}
              type="button"
              onClick={() => onSelect(suite.id)}
              aria-current={suite.id === selectedId}
              className={`flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-accent/30 ${
                suite.id === selectedId ? 'bg-accent/50' : ''
              }`}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{suite.name}</span>
                <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {KIND_LABEL[suite.kind]}
                </span>
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {suite.displayCommand}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
