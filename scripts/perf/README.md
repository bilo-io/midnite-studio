# `scripts/perf/` — the numbers, and how to get them again

Phase 36. Three principles, in order of how often they are forgotten:

1. **Packaged-equivalent or it did not happen.** Every script here launches the
   built renderer against the esbuild-bundled main. Dev-mode numbers measure Vite's
   module graph and a sourcemap-laden bundle — they are noise, and they are noise
   that flatters. `moon run app:build desktop:bundle` first; the scripts refuse to
   guess if you have not.
2. **A median, never a single run.** `--runs=5` is the phase's official mode. One
   cold start is a coin toss on a laptop.
3. **Instrumentation is dev-side.** `MSTUDIO_PERF=1` gates every seam and each is a
   no-op otherwise; the scripts read `ps` from *outside* rather than having the app
   report on itself. Nothing perf-shaped ships in the product.

## The scripts

```sh
moon run app:build desktop:bundle          # both halves; nothing below works without them

node scripts/perf/startup-report.mjs --runs=5 --rss   # cold start, per-mark medians
node scripts/perf/bundle-report.mjs                   # entry chunk, total JS, top ten
node scripts/perf/bundle-report.mjs --assert          # ...and fail on a budget breach
node scripts/perf/idle-cpu.mjs --seconds=300          # focused idle, % of one core
node scripts/perf/idle-cpu.mjs --seconds=300 --blurred # blurred idle (what the gates key on)
node scripts/perf/broker-load.mjs --seconds=10        # broker CPU per MB under `yes`
scripts/perf/make-big-repo.sh                        # ~50k-commit graph fixture
MSTUDIO_BUNDLE_STATS=1 moon run app:build            # dist/stats.html treemap
```

`electron-run.mjs` is the shared launcher, not a script you run. Read its header
before touching a measurement: it documents the two things that make an Electron
startup number mean anything — a throwaway `--user-data-dir` per run (Electron
keys the single-instance lock on it, so a run beside the installed app quits
instantly with every mark missing) and a *seeded* profile (`graph-first-batch`
never happens unless a repo is selected, which is persisted state the app
deliberately does not invent).

## The budget suite

```sh
moon run app:perf
```

Three specs under `packages/app/e2e/perf/`, all reading `budgets.json`:

| Spec | Asserts |
|------|---------|
| `bundle-budget.spec.ts` | entry chunk KB, total JS KB, and the **absence** of `@xterm`, `react-grid-layout`, `react-markdown`, `remark-gfm` from the entry chunk |
| `startup-budget.spec.ts` | `ready-to-show` and `first-view-rendered` medians, every mark present in every run, and `repos-restored` before `create-window` |
| `diff-scroll.spec.ts` | median frame gap over a 60-frame scroll of a 4 000-line diff |

Deliberately **outside** `moon run :test`. A budget failure is a report, and a
report that blocks a green build on a busy laptop gets disabled rather than read.
`retries: 0` is kept: a retried timing assertion measures whichever attempt the
machine happened to be quiet for, which reports green while the regression is
real. The flake mitigations are medians rather than maxima and 2.5× headroom.

The absence assertions are the part worth keeping. The size budgets catch drift;
the absence list catches the one mistake this phase exists because of — a single
static import putting a whole library back on the boot path, which no functional
test would ever notice.

## Rebaselining

Budgets are floors under a *known* state, so a change to one needs the run that
justifies it. In order:

1. Land the change, and leave `moon run :typecheck :lint :test` green.
2. `moon run app:build desktop:bundle`
3. `node scripts/perf/startup-report.mjs --runs=5 --rss` and
   `node scripts/perf/bundle-report.mjs`. Note the medians.
4. Update `budgets.json`: the `_measured` block gets the raw numbers you just
   read, and each budget gets its multiplier applied — **2.5× for milliseconds,
   ~1.15× for bytes**. The 2.5× rule is a flake allowance and a byte count does
   not flake; at 2.5× the entry budget would be 2 712 KB, which is *above* the
   2 481 KB this phase started from, and a budget that permits undoing the phase
   is not a budget.
5. Say why in the commit message — specifically, whether the number moved because
   the app got slower or because the budget was wrong. Those need different
   responses and only the commit message can tell them apart later.
6. `moon run app:perf` green.

A budget that has been raised twice without step 5 being taken seriously is not
protecting anything. Raising one is a normal thing to do; raising one quietly is
how a performance phase gets undone a year later.

## What is not measured here

`idle %CPU` and renderer heap still need a human. Idle CPU wants two untouched
five-minute windows (focused and blurred) — the script does the arithmetic, but
nobody can touch the machine while it runs. Renderer heap needs a DevTools heap
snapshot, and the exact click-path is written into the phase doc, because a heap
number without the diff that produced it is not comparable to anything.
