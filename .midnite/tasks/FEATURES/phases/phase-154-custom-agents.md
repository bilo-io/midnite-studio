# Phase 154 — Custom agents

**Refined: x1** · 2026-11-19 · designed 2026-11-19 · UI/UX, visual design, accessibility, empty/loading/error states, edge cases, data model, persistence, concurrency, security, testing, performance, observability, acceptance criteria, file map, sequencing, out-of-scope

Planned 2026-11-18 with the user · grounded against the tree as of `6ba3f3303`.

A new **Agents** page where a user builds their own agent. A custom agent is a **profile** on top of one of the
roster CLIs: a name, an icon and accent, a base CLI, a model, a system prompt, an allowlist of midnite MCP tools, a
set of skills, a limits override, and a **blueprint** (stack choices across five lifecycle stages, kept as design
notes). The page has three tabs — **Your agents**, **Builder**, **Info** — and is a rail view in Studio and in the
Agents app. In Studio a custom agent launches from the new-session menu like a roster agent. For Claude and Codex
bases, its tool allowlist and tool-call limit are enforced through a private MCP socket for each session it starts.

> **Builds on.**
> - **The agent roster** (Phase 21): `AgentDefinitionSchema` and `BUILTIN_AGENTS`
>   ([`terminal.ts`](../../../packages/shared/src/terminal.ts)). A profile references a roster agent by `id`; it
>   never replaces one.
> - **Feature packages and manifests** (Phase 113): `FEATURE_VIEWS` / `STUDIO_VIEW_ORDER`
>   ([`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts)), `FEATURE_PLACEMENT`
>   ([`placement.ts`](../../../packages/shared/src/domain/placement.ts)), the extraction guide in
>   [`docs/APPS.md`](../../../docs/APPS.md) ("Extracting the next feature"). **Package crib:
>   [`packages/features/councils`](../../../packages/features/councils)**: both halves, Agents placement, a
>   user-data JSON store.
> - **Feature toggles** (Phase 135): a package that contributes a view must be a toggle
>   ([`feature-toggles.ts`](../../../packages/shared/src/feature-toggles.ts)). A toggle is on unless the user's
>   sparse `disabled` list names it, so there is no "default on" field to set.
> - **Agent limits and the breaker** (Phase 121): `AgentLimitsOverrideSchema`, `resolveAgentLimits`
>   ([`agent-limits.ts`](../../../packages/shared/src/agent-limits.ts)); `limitsFor(sessionId)` in
>   [`agent-breaker.ts`](../../../packages/desktop/src/main/agent-breaker.ts), with seams bound in
>   [`agent-breaker-wiring.ts`](../../../packages/desktop/src/main/agent-breaker-wiring.ts).
> - **Private MCP sockets for headless runs** (Phases 99 and 107): a per-run `startMcpServer({ socketPath, dispatch })`
>   with the shim pointed at it by `--socket`
>   ([`iterative-host.ts`](../../../packages/desktop/src/main/media/iterative-host.ts)); Claude's
>   `--mcp-config … --strict-mcp-config` and Codex's `-c mcp_servers.<name>.*` arguments
>   ([`iterative.ts`](../../../packages/features/media-model/main/model/iterative.ts) `buildCliArgs`); a shim that
>   lists and serves only named tools ([`run-shim.ts`](../../../packages/runtime/src/agent-run/run-shim.ts)
>   `toolIds`). Theme G reuses all three for interactive custom-agent sessions.
> - **Launching an agent with a prompt**: [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts)
>   lines 195-206 build one typed line from `launch.command`, `agentInvocationArgs(agentId, mode)` and a quoted
>   prompt word ([`agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts)).
>
> **Scope guardrails.** The feature package is `packages/features/agent-profiles` (not `agents`: that name is the
> module, and `agent` is an existing placement folder); the view id and its label are `agents` / "Agents". A feature
> imports the frame and `shared` only. The roster, the models list, the skills list, live-session counts and
> launching all arrive through host ports, with one adapter in Studio and one in the Agents module. No new eslint
> exception. IPC ops return the house envelope (`GitOpResultOf`, `ok(value)`, `failure(message)` from
> [`result.ts`](../../../packages/shared/src/domain/result.ts)) and never throw. Icons come from `react-icons/lu`
> only, and colours are theme tokens, not the pasted brief's `slate`/`zinc`. macOS only. Every new test is a vitest
> unless its header names the browser capability it needs. The blueprint is data and UI only: it installs nothing
> and does not change how an agent runs. **The Agents app has no terminal, breaker or MCP server**
> ([`context.ts`](../../../packages/modules/agents/main/context.ts) lines 96-97 and 175-177). There it lists and
> edits agents only; launching and enforcement are Studio-only.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Shared contract (M).** ◻ This theme defines:
- `AgentProfileSchema` and the five blueprint stages as data.
- Per-CLI tables for prompt delivery and enforcement.
- Launch helpers that build the typed line from a prompt *file*.
- The `agentProfile*` channels, using house envelopes, with conflict-aware saves.
- `profileId` on sessions and `profileLaunchId` on `PtyCreateRequest`.
- The view, window-role and toggle registrations, with every list that pins them.

**Theme B — Package, store and IPC (M).** ◻ This theme adds:
- `packages/features/agent-profiles`, with an atomic `agent-profiles.json` store capped at 200 agents.
- A prompt file per agent.
- Import and export through injected dialog services.
- A conflict check on save.
- Registration in Studio's main and the Agents host. The Agents host gets dialogs only; it has no launch service.

**Theme C — Agents page and the Your agents tab (M).** ◻ This theme adds:
- The `agents` rail view in both apps, and the three-tab shell.
- The list, with launch (Studio only), edit, duplicate, import, export, delete (the confirm shows the live-session count) and three starter templates.
- Literal copy for loading, failed-load, empty and missing-CLI states.
- Focus rules after each action.

**Theme D — Builder tab (L).** ◻ This theme adds:
- An explicit-Save form with a conflict prompt (Reload or Overwrite) and an unsaved-changes guard.
- Each base CLI's support for prompt delivery and enforcement, stated beside the field it affects.
- A self-contained round info-icon popover on every field and option: hover, focus and click open it, Escape closes it.
- The Blueprint section: stage list, options and note, and a sticky stack bar, with full keyboard support.

**Theme E — Info tab (S).** ◻ This theme adds:
- The five stages and their options.
- How a custom agent runs, including the per-CLI enforcement table and the cost of strict MCP mode.
- A glossary and documentation links.

**Theme F — Launch (L).** ◻ Main's `agentProfile:prepareLaunch` builds the whole typed line. It is the only place
that does, and fresh starts, wakes and Resume all go through it.
- Model flag.
- System prompt from the prompt file: Claude takes `--append-system-prompt-file`; any other CLI that accepts a prompt argument takes `"$(cat '<file>')"`; any other CLI gets no prompt.
- The private-socket MCP arguments from Theme G.

The new-session menu gains a "Your agents" section. A session shows the agent's name, icon and accent, falling back
to the base CLI's when the agent has been deleted.

**Theme G — Enforcement (L).** ◻ For Claude and Codex bases, each custom-agent session gets a private MCP socket:
- The socket lists and serves only the agent's allowed tools.
- A refused call is recorded as a `policy-decision` denial.
- Every call is attributed to the session, so the breaker applies the agent's tool-call limit.
- Claude launches with `--strict-mcp-config` when tools are restricted.
- The socket closes when the session exits.

The breaker layers the agent's limits over the repo's, read live. A verification item at the start of the theme
settles one question: does a per-launch `midnite` server take precedence over the user's global one?

## Build order

1. **A** first: everything reads the schema, the stage data and the channels.
2. **B** next: the store, the prompt file and the handlers the renderer queries.
3. **C**, then **D** and **E** in either order once C's three-tab shell exists.
4. **G1** (the precedence check, a manual item) before any other G work; its answer decides how unrestricted agents
   launch (see G).
5. **F** and **G** together: `prepareLaunch` (F) calls the socket service (G). Land G's socket service first inside
   the same PR, or stub it so `prepareLaunch` returns no MCP arguments until G lands.

Suggested PRs, each leaving `main` working:
- `PR-1` = A + B. The store and IPC exist; nothing renders.
- `PR-2` = C + E. The page lists, creates from templates, imports, exports and deletes; Launch is hidden because no host fills `useLaunchProfile` yet.
- `PR-3` = D. Full editing.
- `PR-4` = G's socket service and audit attribution, plus F. Launch appears.

## Visual & UI/UX Design

Designed 2026-11-19 with the user. The design rests on four agreed choices:
- The list is a card grid.
- The Builder has a section index on the left and a scrolling form on the right.
- An agent's colour shows only on its icon and a 3 px stripe.
- Two visual-regression crops are added.

**Tokens only.** Use the Tailwind theme colours from `packages/app/tailwind.config.ts`, which the Agents app shares
through `frameContent`:
- `background`, `foreground`, `card`, `popover`, `muted`, `accent`, `primary`, `secondary`, `destructive`, `success`, `border`, `input`, `ring`.

No raw hex values, with two exceptions: the agent's own `accent`, applied only as an inline `style` on its icon and
stripe, and the accent picker's swatch. There is no `warning` token, so warnings use `text-muted-foreground` with a
`LuTriangleAlert` glyph, and errors use `text-destructive`. Type sizes follow the existing views: `text-sm` titles,
`text-xs` body and controls, and `text-[11px]` meta. Everything works unchanged in light and dark because every
colour is a token.

### Page shell (both apps)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ⧉  🤖 Agents                                          12 agents            │  header: flex items-center gap-2
│ ─────────────────────────────────────────────────────────────────────────── │
│  ▦ Your agents │ ✎ Builder • │ ⓘ Info                                      │  tablist: border-b border-border/60
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                            │
│                         (active tab panel, scrolls)                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Root.** `flex h-full min-h-0 flex-col gap-3 p-4`. Only the tab panel scrolls (`min-h-0 flex-1 overflow-y-auto`),
  so the header and tabs stay put. This differs from `models-view.tsx`, which scrolls the whole page, because the
  Builder's footer and the stack bar must stick inside the panel.
- **Header.** It holds `<PageDetachMark role="agents" />`, then `LuBot` at `h-5 w-5`, then
  `<h1 className="text-sm font-semibold">Agents</h1>`. On the right, a count in `ml-auto text-[11px] text-muted-foreground`
  reads "<n> agent(s)" and is hidden while loading.
- **Tabs.** These are the `TabStrip` classes from `models-view.tsx`: `-mb-px border-b-2 px-2.5 py-1.5 text-xs
  font-medium transition-colors`. The active tab adds `border-primary text-foreground`; an inactive one adds
  `border-transparent text-muted-foreground hover:text-foreground`.
  - Each tab has a 14 px icon before its label: `LuLayoutGrid` Your agents, `LuPencilRuler` Builder, `LuInfo` Info.
  - The Builder tab's unsaved dot is a `h-1.5 w-1.5 rounded-full bg-primary` after the label.
  - Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
    focus-visible:ring-offset-background`. This focus ring is used on **every** interactive element in the feature.
- **Narrow (panel narrower than 720 px).** The feature's own `usePanelWidth(ref)` hook reads the panel's width. The
  repo has no container queries, so the hook is a `ResizeObserver`, net-new in `renderer/use-panel-width.ts`. Tab
  labels stay; the header count hides below 480 px.

### Your agents tab

```
┌ toolbar ───────────────────────────────────────────────────────────────────┐
│ [＋ New agent]  [▤ New from template ▾]  [⇧ Import]          [⌕ Filter…  ] │
└────────────────────────────────────────────────────────────────────────────┘
┌▌─────────────────────────────┐ ┌▌─────────────────────────────┐ ┌▌─────────
│▌ ◉  Reviewer                 │ │▌ ◉  Researcher                │ │▌ ◉  …
│▌    Reads diffs and reports  │ │▌    Reads and summarises with │ │
│▌    findings by severity.    │ │▌    sources.                  │ │
│▌    Claude · Sonnet 5.5      │ │▌    Codex · Default           │ │
│▌    [⑂ LangGraph] [⚡ MCP] +2 │ │▌    [⌕ Hybrid search]         │ │
│▌ ───────────────────────────│ │▌ ──────────────────────────── │ │
│▌ [▶ Launch]      ✎  ⧉  ⇩  🗑 │ │▌ [▶ Launch]      ✎  ⧉  ⇩  🗑  │ │
└▌─────────────────────────────┘ └▌─────────────────────────────┘ └▌─────────
 ▌ = 3 px stripe in the agent's accent
```

- **Toolbar.** `flex flex-wrap items-center gap-2`.
  - Primary button ("New agent", `LuPlus`): `rounded-md border border-border bg-accent/40 px-2.5 py-1 text-xs
    font-medium text-foreground hover:bg-accent`.
  - Secondary buttons ("New from template", `LuLayoutTemplate` plus `LuChevronDown`; "Import", `LuUpload`):
    `rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-40`.
  - A `FilterInput` (from the frame) on the right, `ml-auto w-48`. It matches name, description and base CLI label,
    case-insensitive. It is shown only when there are more than 6 agents.
- **Grid.** `grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]`. The grid falls to a single
  column on its own in a narrow panel.
- **Card.** It is an `article` with `aria-labelledby` set to its name button.
  - Classes: `relative flex flex-col gap-2 overflow-hidden rounded-md border border-border bg-card p-3 pl-4 transition-colors
    hover:border-foreground/20 focus-within:border-foreground/30`.
  - The stripe is `absolute inset-y-0 left-0 w-[3px]`, with `style={{ background: accent }}`.
  - The icon is 18 px, with `style={{ color: accent }}`, and `aria-hidden`.
  - The name is a `button` in `truncate text-sm font-medium hover:underline`.
  - The description is `line-clamp-2 text-xs text-muted-foreground`, omitted when empty.
  - The meta line is `text-[11px] text-muted-foreground`, reading `<Base label> · <Model label>`.
  - Each chip is `inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5
    text-[11px]`, holding the option's 12 px icon and label. At most six are shown, then a `+N` chip whose `title`
    lists the rest.
  - The footer is `mt-auto flex items-center gap-1 border-t border-border/60 pt-2`:
    - "Launch" (`LuPlay`) is a small primary button.
    - Then, `ml-auto`, the frame `IconButton`s, each 28 px: Edit `LuPencil`, Duplicate `LuCopy`, Export `LuDownload`,
      Delete `LuTrash2`. Delete adds `hover:text-destructive`.
    - Every icon button has an `aria-label` and a `title` naming the action and the agent ("Delete Reviewer").
  - The missing-base chip is `rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground`,
    with `LuTriangleAlert`, placed under the meta line.
- **Loading.** Three skeleton cards: the same box, with `animate-pulse` blocks in `bg-muted` (a 40% title bar, two
  70% lines and a chip row), wrapped in `aria-busy="true"`. `motion-reduce:animate-none`.
- **Failed load.** A centred `max-w-sm` block: `LuCircleAlert` at 24 px in `text-destructive`, "Couldn't load your
  agents." in `text-sm`, the message in `text-xs text-muted-foreground`, and "Retry" (`LuRotateCw`) as a secondary
  button.
- **Empty.** A centred `max-w-xl` block: `LuBot` at 32 px in `text-muted-foreground`, the heading "No agents yet"
  (`text-sm font-medium`) and the body copy (`text-xs text-muted-foreground`). Below them, a three-column grid of
  template cards, each a `button` with the same card classes, holding the template's icon, label and `summary`.
  Below the grid, a "Start from scratch" secondary button. The cards stack in one column below 560 px.
- **Filter with no match.** "No agents match "<text>"." in `text-xs text-muted-foreground`, with a "Clear filter"
  link button.

### Builder tab

```
┌ index ───────┬ form (scrolls) ──────────────────────────────────────────────┐
│ ● Identity   │ IDENTITY                                                     │
│ ○ Base       │ Name ⓘ          [Reviewer                              ]     │
│ ○ Prompt     │ Description ⓘ   [Reads diffs and reports findings…     ]     │
│ ○ Tools  3   │ Colour ⓘ  [■][#8b5cf6]        Icon ⓘ  [◉ claude      ▾]     │
│ ○ Skills 2   │ BASE                                                         │
│ ○ Limits     │ Base CLI ⓘ  [Claude        ▾]   Model ⓘ  [Sonnet 5.5   ▾]   │
│ ○ Blueprint 5│ SYSTEM PROMPT                                                │
│              │ ┌──────────────────────────────────────────────────────┐     │
│              │ │ You review diffs…                                    │     │
│              │ └──────────────────────────────────────────── 312/20,000┘     │
│              │ ↳ Passed to Claude as a system prompt.                       │
│              │ …                                                            │
├──────────────┴──────────────────────────────────────────────────────────────┤
│ ● Unsaved changes                                    [Discard]  [Save]       │  sticky footer
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Layout.** `grid grid-cols-[160px_1fr] gap-4` inside the scrolling panel.
  - The index is `sticky top-0 self-start`: a `nav` with `aria-label="Builder sections"` and a list of anchor
    buttons, each `flex items-center gap-2 rounded px-2 py-1 text-xs`.
    - The current section adds `bg-accent text-foreground` and `aria-current="true"`; the others are
      `text-muted-foreground hover:text-foreground`.
    - A count pill (tools, skills, chosen blueprint options) sits `ml-auto text-[10px]`.
  - Scroll-spy uses one `IntersectionObserver` on the section headings, with `rootMargin: '0px 0px -70% 0px'`.
    Clicking an entry calls `scrollIntoView({ block: 'start', behavior })`, where `behavior` is `'auto'` under
    `prefers-reduced-motion`, and moves focus to the section heading (`tabIndex={-1}`).
  - **Narrow (< 720 px):** the index becomes a horizontal, scrollable chip row
    (`sticky top-0 z-10 flex gap-1 overflow-x-auto bg-background/95 py-1`) above a single-column form.
- **Sections.** Each is a `section` with an `h2` in `text-[11px] font-semibold uppercase tracking-wide
  text-muted-foreground`, separated by `space-y-6`. Each field row uses
  `grid grid-cols-[minmax(120px,160px)_1fr] items-start gap-x-3 gap-y-1`, stacking below 560 px. Two fields share a
  row only for Colour + Icon and Base CLI + Model, at 720 px and wider.
- **Controls.** These are the existing input classes (`rounded-md border border-input bg-background px-2 py-1 text-xs
  focus-visible:ring-2 focus-visible:ring-ring`).
  - Invalid: `border-destructive`, with the message under it in `text-[11px] text-destructive`, linked by
    `aria-describedby`.
  - Counters: `text-[11px] tabular-nums text-muted-foreground`, turning `text-destructive` past 95%.
  - The delivery line and the enforcement notes: `flex items-start gap-1.5 text-[11px] text-muted-foreground`,
    with `LuCornerDownRight`, or with `LuTriangleAlert` for a warning.
- **Checklists (Tools, Skills).** A bordered box, `max-h-72 overflow-y-auto rounded-md border border-border`, with a
  sticky header row holding the filter, "Select all" and "Select none" (`text-[11px]` link buttons) and a "<n>
  selected" count.
  - Rows are `flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent/40`, each with a native checkbox
    (`accent-[hsl(var(--primary))]`), the title, a `font-mono text-[10px] text-muted-foreground` id, and the
    `InfoTip`.
  - Skill scope badges are `rounded px-1 text-[10px] bg-muted text-muted-foreground`.
  - Tools is disabled (`opacity-50 pointer-events-none`, with `aria-disabled`) while "Restrict midnite tools" is
    off.
- **Footer.** `sticky bottom-0 flex items-center gap-2 border-t border-border bg-background/95 px-1 py-2
  backdrop-blur-sm`.
  - On the left: "● Unsaved changes" (dot `bg-primary`), "Saved" (`LuCheck`, `text-success`, fades after 2 s), or
    nothing.
  - On the right: "Discard" (secondary), then "Save" (primary, disabled while clean or saving). While saving it shows
    a 12 px `LuLoaderCircle animate-spin` and the label "Saving…".
  - The live-session notice sits above the footer: `rounded-md border border-border bg-muted/40 p-2 text-xs`, with
    `LuInfo`, dismissible.

### Blueprint section (inside the Builder)

```
┌ Pipeline ────────────┬ Configurator ─────────────────────────────────────────┐
│ ① Understand &   (1) │ Understand & Orchestrate · Frameworks          ⓘ      │
│   Orchestrate        │ ┌──────────────────────┐ ┌──────────────────────┐     │
│ ② Ingest & Ground(2) │ │ ⑂ LangGraph       ⓘ ✓│ │ 👥 CrewAI          ⓘ │     │
│ ③ Connect & Act  (1) │ │   Docs ↗             │ │   Docs ↗             │     │
│ ④ Optimize & Adapt   │ └──────────────────────┘ └──────────────────────┘     │
│ ⑤ Secure, Deploy (1) │ ┌──────────────────────┐ ┌──────────────────────┐     │
│   & Operate          │ │ ☰ LlamaIndex WF   ⓘ  │ │ </> Custom        ⓘ  │     │
│                      │ └──────────────────────┘ └──────────────────────┘     │
│                      │ Note  [Graph per reviewer persona…            ] 41/500 │
├──────────────────────┴───────────────────────────────────────────────────────┤
│ Stack: Frameworks [LangGraph] · RAG [Vector DBs][Hybrid] · Tools [MCP] ·     │  sticky stack bar
│        Fine-tuning None chosen · Production [Guardrails]                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Container.** `rounded-md border border-border` with `grid grid-cols-[minmax(200px,1fr)_2fr]`. The stack bar
  spans both columns (`col-span-2`).
- **Pipeline rows.** `flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left text-xs transition-colors
  duration-150`.
  - Active: `border-primary bg-primary/10 text-foreground`. Inactive: `border-transparent text-muted-foreground
    hover:bg-accent/40`.
  - Number badge: `grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border text-[10px]
    tabular-nums`, filled `bg-primary text-primary-foreground` when the stage has a choice.
  - Label `font-medium`, subtitle `text-[11px] text-muted-foreground`, count pill `ml-auto`.
  - Rows are joined by a 1 px `bg-border` connector between badges, decorative and `aria-hidden`, to read as a
    timeline.
- **Configurator.** `p-3 space-y-3`.
  - The heading is `text-sm font-medium` "<Stage label> · <subtitle>", with an `InfoTip` carrying the stage summary.
  - The options grid is `grid grid-cols-2 gap-2`, one column below 560 px.
  - Option card: `flex items-start gap-2 rounded-md border p-2.5 text-left text-xs transition-colors duration-150`.
    - Pressed: `border-primary bg-primary/10`, with a `LuCheck` at 14 px in `text-primary` at top right.
    - Unpressed: `border-border hover:bg-accent/40`.
  - The option icon is 16 px in `text-muted-foreground`, or `text-primary` when pressed.
  - "Docs" is a `text-[11px] underline-offset-2 hover:underline` link button with `LuExternalLink` at 11 px.
  - The note uses the Builder's control classes, at 3 rows.
- **Stack bar.** `sticky bottom-[49px] z-[1] flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border
  bg-background/95 px-3 py-2 backdrop-blur-sm`. The 49 px offset sits it just above the Builder footer; measure it
  from the footer's real height via a CSS variable `--builder-footer-h` set by the footer's own `ResizeObserver`,
  not a literal.
  - The label "Stack" is `text-[11px] font-semibold uppercase text-muted-foreground`.
  - Each group is a `button` in `inline-flex items-center gap-1 rounded px-1 text-[11px] hover:bg-accent/40`,
    showing "<subtitle>" and then the option chips (as on the card), or "None chosen" in `italic
    text-muted-foreground`.
- **Narrow (< 720 px).** The pipeline becomes a horizontal, scrollable row of compact badges above the configurator
  (`flex overflow-x-auto border-b`). Each badge shows only the number and the short label (the first word of the
  stage label); the full label stays in `aria-label`. The stack bar wraps.
- **Motion.** Colour transitions only, at 150 ms, and `motion-reduce:transition-none`. No layout animation.

### Info popover (`InfoTip`)

```
  Model ⓘ
        ┌────────────────────────────────────────┐
        │ The model the base CLI runs. "Default" │  role="tooltip"
        │ leaves the CLI's own choice in place.  │
        └────────────────────────────────────────┘
```

- **Trigger.** `inline-grid h-[18px] w-[18px] place-items-center rounded-full text-muted-foreground
  hover:bg-accent hover:text-foreground`, holding `LuInfo` at 14 px. It shares the feature's focus ring. When open,
  it gains `bg-accent text-foreground`.
- **Popover.** `absolute z-50 w-max max-w-[280px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs
  leading-snug text-popover-foreground shadow-md`.
  - With `side="top"` it sits at `bottom-full mb-1.5`; with `side="bottom"` it sits at `top-full mt-1.5`.
  - It is horizontally centred (`left-1/2 -translate-x-1/2`).
  - There is no arrow and no animation.
  - Pipeline and stack-bar tips use `side="bottom"`, because the top row has no room above it.

### Info tab

- **Layout.** `mx-auto max-w-3xl space-y-8 text-xs leading-relaxed`.
  - The anchor list at the top is `flex flex-wrap gap-2`, with chips in the toolbar's secondary button style.
  - `h2` headings are `text-sm font-semibold`, each with `scroll-mt-4`.
- **Stages.** One `div` per stage, `rounded-md border border-border p-3`. The heading row holds the stage icon, the
  label and the subtitle. Options form a definition list (`dl grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5`): `dt`
  holds the icon and label, `dd` holds the summary and a "Docs ↗" link.
- **Tables (delivery, enforcement).** `w-full border-collapse text-xs`. `th` is `text-left text-[11px] font-medium
  text-muted-foreground border-b border-border py-1`; `td` is `border-b border-border/60 py-1.5`.
  - Yes is `LuCheck` in `text-success`; No is `LuMinus` in `text-muted-foreground`. Each carries a text alternative
    ("Enforced", "Not enforced") in `sr-only`.
  - Each agent cell holds its 14 px icon in its roster accent, then its label.
- **Glossary.** A `dl` with each term in `font-medium` and each definition in `text-muted-foreground`, in two columns
  at 720 px and wider.

### "Your agents" in the new-session menu (Studio)

```
┌ New terminal or agent ───────────────┐
│ ▸ Terminal                           │
│ YOUR AGENTS                          │  same heading classes as the other sections
│ ▌◉ Reviewer          Claude          │  ▌ = 2 px accent stripe; base label right-aligned
│ ▌◉ Researcher        Codex  (greyed) │  disabled: opacity-50, title = reason
│ PROPRIETARY                          │
│ ◉ Claude                             │
│ …                                    │
└──────────────────────────────────────┘
```

- The section heading reuses the existing classes (`px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide
  text-muted-foreground`).
- A profile row reuses the agent row's `menuitem` classes. It adds a `relative` wrapper with a 2 px left stripe in the
  profile accent (`absolute inset-y-1 left-0.5 w-0.5 rounded-full`), and the base CLI label right-aligned in
  `ml-auto text-[11px] text-muted-foreground`.
- Disabled rows follow the existing `greyedOut` treatment.
- Session tab, header and list entries for a profile session show the profile icon in its accent and the profile
  name; there is no extra badge. They fall back to the base agent's look when the profile is deleted.

### Icons (`react-icons/lu` only)

| Use | Glyph |
|---|---|
| Page, rail, empty state | `LuBot` |
| Tabs | `LuLayoutGrid` · `LuPencilRuler` · `LuInfo` |
| Toolbar | `LuPlus` · `LuLayoutTemplate` + `LuChevronDown` · `LuUpload` |
| Card actions | `LuPlay` · `LuPencil` · `LuCopy` · `LuDownload` · `LuTrash2` |
| States | `LuTriangleAlert` (warning) · `LuCircleAlert` (error) · `LuRotateCw` (retry) · `LuLoaderCircle` (saving) · `LuCheck` (saved, pressed, yes) · `LuMinus` (no) |
| Builder notes and links | `LuCornerDownRight` · `LuExternalLink` |
| Stages | orchestrate `LuWorkflow` · ground `LuDatabase` · act `LuPlug` · adapt `LuSlidersHorizontal` · operate `LuShieldCheck` |
| Options | langgraph `LuGitFork` · crewai `LuUsers` · llamaindex-workflows `LuListTree` · custom `LuCode` · vector-db `LuDatabaseZap` · hybrid-search `LuSearch` · managed-kb `LuLibrary` · mcp `LuPlugZap` · api-sdks `LuBraces` · local-exec `LuTerminal` · open-weight `LuCpu` · managed-apis `LuCloud` · prompt-evals `LuFlaskConical` · hosting `LuServer` · guardrails `LuShield` · observability `LuActivity` |

Lucide renamed some glyphs (for example `AlertTriangle` became `TriangleAlert`, and `Loader2` became `LoaderCircle`).
Use whichever name the installed `react-icons/lu` exports. `components/icons/icon-names.test.ts` fails on a name that
does not resolve; extend its source glob to `packages/features/agent-profiles/renderer/**` if it does not already
cover features.

## Deliverables

### A — Shared contract (M)

- [ ] New `packages/shared/src/agent-profiles.ts` (zod only), exported from `packages/shared/src/index.ts`.
  - `AGENT_PROFILE_ID_PREFIX = 'profile-'`; `MAX_AGENT_PROFILES = 200`.
  - Schema:

    ```ts
    AgentProfileSchema = z.object({
      id: z.string().startsWith('profile-'),
      name: z.string().trim().min(1).max(60),
      description: z.string().max(280).default(''),
      baseAgentId: z.string().min(1),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      icon: z.string().min(1).optional(),
      model: z.string().min(1).default('default'),
      systemPrompt: z.string().max(20_000).default(''),
      mcpTools: z.array(z.string()).nullable().default(null),
      skills: z.array(z.string().min(1).max(200)).max(50).default([]),
      limits: AgentLimitsOverrideSchema.default({}),
      blueprint: AgentBlueprintSchema.default({}),
      createdAt: z.number().int(),
      updatedAt: z.number().int(),
    })
    ```
  - `mcpTools: null` means "no restriction"; `[]` means "no midnite tools at all".
  - `model` holds an `AgentModelInfo.id` from `modelsForAgent(baseAgentId)`
    ([`ai-models.ts`](../../../packages/shared/src/ai-models.ts)), not a CLI string. For Claude that is a loop id
    such as `sonnet-5-5`.
  - `parseAgentProfiles(raw: unknown): AgentProfile[]` keeps valid entries and drops invalid ones and later
    duplicates of an `id`; crib `parseCustomLoops` in [`custom-loops.ts`](../../../packages/shared/src/custom-loops.ts).
  - `createBlankAgentProfile(ids = defaultIdFactory, now = Date.now())` returns `name: 'New agent'`,
    `baseAgentId: 'claude'` and `accent: '#8b5cf6'`. It reuses `IdFactory` / `defaultIdFactory` from `custom-loops.ts`
    with the `profile-` prefix.
  - `duplicateAgentProfile(profile, existingNames, ids?, now?)` gives a new `id` and fresh timestamps. The name is
    `uniqueProfileName(\`${name} copy\`, existingNames)`.
  - `uniqueProfileName(base, existing)` returns `base`, or the first of `base 2`, `base 3`, … not in `existing`. The
    result is trimmed to 60 characters, cutting from `base` and never from the suffix.
- [ ] Blueprint data in the same file.
  - `AGENT_BLUEPRINT_STAGE_IDS = ['orchestrate', 'ground', 'act', 'adapt', 'operate'] as const`.
  - `AGENT_BLUEPRINT_STAGES` has the shape
    `readonly { id; label; subtitle; summary; options: readonly { id; label; summary; docsUrl }[] }[]`, with exactly
    these stages and options:
    1. `orchestrate`: "Understand & Orchestrate" (Frameworks). Options: `langgraph` LangGraph, `crewai` CrewAI,
       `llamaindex-workflows` LlamaIndex Workflows, `custom` Custom / in-house.
    2. `ground`: "Ingest & Ground" (RAG & data). Options: `vector-db` Vector DBs (Pinecone / pgvector),
       `hybrid-search` Hybrid search, `managed-kb` Managed knowledge bases.
    3. `act`: "Connect & Act" (Tools & MCP). Options: `mcp` Model Context Protocol, `api-sdks` Custom API SDKs,
       `local-exec` Local shell / DB execution.
    4. `adapt`: "Optimize & Adapt" (Fine-tuning). Options: `open-weight` Open-weight fine-tuning (Unsloth / Axolotl),
       `managed-apis` Managed APIs (OpenAI / Anthropic), `prompt-evals` Prompt evaluation frameworks.
    5. `operate`: "Secure, Deploy & Operate" (Production). Options: `hosting` Orchestration hosting
       (Modal / Baseten), `guardrails` Guardrails (NeMo / Llama Guard), `observability` Observability
       (LangSmith / Phoenix).
  - Each `summary` is one or two plain sentences of at most 220 characters. Each `docsUrl` is the project's own
    documentation home page over `https`. `custom` has no docs link, so its `docsUrl` is `null`; type it
    `string | null`.
  - `AgentBlueprintSchema = z.partialRecord(z.enum(AGENT_BLUEPRINT_STAGE_IDS), z.object({ options: z.array(z.string()).max(4).default([]), note: z.string().max(500).default('') }))`.
    A missing stage means nothing is chosen. If the repo's zod has no `partialRecord`, use
    `z.record(...).and(...)` with every key optional, and say so in the PR.
  - `blueprintSummary(blueprint)` returns `{ stageId; stageLabel; optionLabels: string[]; note: string }[]`: one
    entry per stage, in stage order, dropping unknown option ids. The stack bar, the list card and the Info tab all
    render from it.
- [ ] Per-CLI tables in `packages/shared/src/agent-profile-launch.ts` (net-new).
  - `promptDeliveryFor(baseAgentId): 'flag' | 'argument' | 'none'`.
    - Returns `'flag'` for `claude`, which uses `--append-system-prompt-file <path>`. That flag is verified present
      in `claude --help` on 2026-11-19.
    - Returns `'argument'` for every other agent id whose interactive invocation already takes a prompt word in
      `start-agent.ts` (read `agentInteractiveArgs` in `agent-invocation.ts` to list them; at minimum `codex`).
    - Returns `'none'` for everything else.
  - `enforcementFor(baseAgentId): { tools: boolean; toolCallLimit: boolean }` is `true`/`true` for `claude` and
    `codex` and `false`/`false` for every other id. The other limits (file writes, pushes, outbound hosts, spend) are
    enforced for every base CLI, because their audit records already carry a session.
  - `composeProfilePrompt(profile): string` is `systemPrompt.trim()`, then, when `skills.length > 0`, a blank line and
    `Prefer these skills when they fit: <names joined by ', '>.`. It returns `''` when both are empty.
  - `profileModelArgs(baseAgentId, model): string[]`:
    - Returns `[]` when `model === 'default'`.
    - Returns `loopModelArgs('claude', model)` for `claude` ([`loops.ts`](../../../packages/shared/src/loops.ts) line 207).
    - Otherwise returns `modelArgsFor(baseAgentId, cliModel ?? model)`, where `cliModel` is looked up in
      `modelsForAgent(baseAgentId)`.
    - `modelArgsFor` alone is wrong here: it always emits `--model <x>`.
  - `buildProfileLaunchLine(input): string` is pure. `input` is
    `{ base: AgentDefinition; model: string; promptPath: string | null; delivery; mcpArgs: string[]; resume: boolean }`.
    - The words are `[base.command, ...base.args, ...(resume ? base.resume ?? [] : []), ...profileModelArgs(…), ...mcpArgs, ...promptWords]`.
    - `promptWords` is `['--append-system-prompt-file', shellQuote(promptPath)]` for `'flag'`.
    - For `'argument'` it is `[...agentInvocationArgs(base.id, 'interactive'), \`"$(cat ${shellQuote(promptPath)})"\`]`,
      and `[]` when `resume` is true (the conversation already holds it).
    - It is `[]` for `'none'` or a `null` path.
    - The words are joined with one space; no trailing `\r`.
    - Reuse the existing `shellQuote` from `agent-invocation.ts`. Paths have no newlines, so its whitespace
      flattening is harmless. Do **not** add a second quoting helper.
- [ ] Channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts):
  - `agentProfileList: 'mstudio:agent-profile:list'`
  - `agentProfileSave: 'mstudio:agent-profile:save'`
  - `agentProfileDelete: 'mstudio:agent-profile:delete'`
  - `agentProfileExport: 'mstudio:agent-profile:export'`
  - `agentProfileImport: 'mstudio:agent-profile:import'`
  - `agentProfilePrepareLaunch: 'mstudio:agent-profile:prepare-launch'`
- [ ] Schemas in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), all responses via `GitOpResultOf`:
  - `AgentProfileListResponse = GitOpResultOf(z.object({ profiles: z.array(AgentProfileSchema) }))`.
  - `AgentProfileSaveRequest = z.object({ profile: AgentProfileSchema, expectedUpdatedAt: z.number().int().nullable() })`.
    `null` means "new". `AgentProfileSaveResponse = GitOpResultOf(z.discriminatedUnion('status', [z.object({ status: z.literal('saved'), profile }), z.object({ status: z.literal('conflict'), current: AgentProfileSchema })]))`.
  - `AgentProfileDeleteRequest = z.object({ id })`; response `GitOpResultSchema`.
  - `AgentProfileExportRequest = z.object({ id })`; response `GitOpResultOf(z.object({ path: z.string().nullable() }))`.
    `null` path means the dialog was dismissed.
  - `AgentProfileImportResponse = GitOpResultOf(z.object({ profile: AgentProfileSchema.nullable() }))`. `null` means
    dismissed.
  - `AgentProfilePrepareLaunchRequest = z.object({ profileId, cwd: z.string().min(1), resume: z.boolean() })`;
    response `GitOpResultOf(z.object({ launchId: z.string(), line: z.string() }))`.
- [ ] Bridge type in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts): an
  `agentProfile: { list; save; delete; export; import; prepareLaunch }` slice, cribbed from the `council` slice
  (line ~1164).
- [ ] Session fields.
  - Add `profileId: z.string().optional()` **inline** to `TerminalSessionSchema` (`terminal.ts:666`; it cannot be
    `.extend()`ed). Without it, `TerminalSaveRequest`'s parse strips the field.
  - Add `profileLaunchId: z.string().optional()` to `PtyCreateRequest` only. It is per-launch and never persisted.
  - No store version bump is needed: the file store's `parseStoredSessions` never checks `version` and keeps extra
    keys (`features/terminal/main/terminal-store.ts:118`), and the renderer store is not persisted.
- [ ] Registration.
  - `FEATURE_PLACEMENT['agent-profiles'] = 'agents'`.
  - `FEATURE_VIEWS['agent-profiles'] = ['agents']`.
  - `'agent-profiles'` in `STUDIO_VIEW_ORDER` after `'models'` and before `'api-client'`. The array holds feature
    keys, not view ids.
  - `'agents'` in `PAGE_WINDOW_ROLES` ([`window.ts`](../../../packages/shared/src/domain/window.ts)) after `'models'`.
- [ ] `FEATURE_TOGGLES.agentProfiles`:

  ```ts
  { label: 'Custom agents', description: 'Build your own agents on top of the roster CLIs.', group: 'agent',
    requires: [], packages: ['agent-profiles'], views: ['agents'], settingsPages: [], commands: [],
    data: { files: ['agent-profiles.json', 'agent-profiles/'], storeKeys: [], vault: [] } }
  ```

  No default field: toggles are on unless disabled.
- [ ] Tests.
  - `agent-profiles.test.ts`:
    - Schema defaults; a bad accent and an empty trimmed name fail.
    - `parseAgentProfiles` keeps 2 of [valid, invalid, duplicate-id, valid].
    - The factories with an injected id factory and clock.
    - `uniqueProfileName('Reviewer', ['Reviewer','Reviewer 2'])` is `'Reviewer 3'`, and the 60-character truncation
      keeps the suffix.
    - Every stage has 3 or 4 options with unique ids across stages.
    - `blueprintSummary` returns stage order and drops an unknown id.
  - `agent-profile-launch.test.ts`:
    - `profileModelArgs('claude','default')` is `[]`.
    - `profileModelArgs('claude','sonnet-5-5')` equals `loopModelArgs('claude','sonnet-5-5')`.
    - A flag line ends with `--append-system-prompt-file '<path>'`, and a path with a space stays one word.
    - An argument line ends with `"$(cat '<path>')"` and drops it when `resume`.
    - `resume` adds `base.resume`.
    - The `mcpArgs` sit before the prompt words.
    - `composeProfilePrompt` with and without skills.
    - `enforcementFor('aider')` is false/false.
  - Update `feature-registrations.test.ts` (`LEGACY_VIEW_IDS` gains `'agents'` after `'models'`), `view.test.ts`, and
    `shared/src/feature-toggles.test.ts`.

### B — Package, store and IPC (M)

- [ ] Create `packages/features/agent-profiles` by copying councils' `package.json`, `moon.yml`, `tsconfig.json`,
  `tsconfig.main.json` and `vitest.config.ts`.
  - Name it `@midnite/studio-feature-agent-profiles`, with moon id `feature-agent-profiles`.
  - Tags: `layer-feature`, `app-agents`, `app-studio`.
  - Exports: `./renderer`, `./renderer/testing`, `./main`.
- [ ] `manifest.ts` and `manifest.test.ts`.
  - `manifest.ts`:

    ```ts
    agentProfilesManifest = defineFeatureManifest({
      feature: 'agent-profiles', owner: 'agents',
      views: [{ id: 'agents', global: true, rail: { group: 'agent', label: 'Agents', description: 'Build and manage your own agents' } }],
      settingsPages: [], ipc: [the six channels], events: [], mcpTools: [],
    })
    ```
  - `manifest.test.ts` follows councils:
    - The owner matches the placement.
    - The view ids equal `FEATURE_VIEWS['agent-profiles']`.
    - The keys of `agentProfilesViews` equal the view ids.
    - The channels match `/^mstudio:agent-profile:/`.
- [ ] `main/agent-profiles-store.ts`.
  - `FILE_NAME = 'agent-profiles.json'`; file shape `{ version: 1, profiles: [] }`.
  - `createAgentProfilesStore(dir)` gives `{ load(): Promise<AgentProfile[]>; save(profiles): Promise<void>; writePrompt(id, text): Promise<string | null>; removePrompt(id): Promise<void>; promptPath(id): string }`.
  - `load`: a missing or malformed file gives `[]`; entries go through `parseAgentProfiles`.
  - `save` writes pretty JSON plus a trailing newline to `<file>.tmp` and then `rename`s it. Crib the atomic write in
    [`capture-store.ts`](../../../packages/features/capture/main/capture-store.ts), **not** councils, whose store is a
    plain `writeFile`.
  - Prompts are `<dir>/agent-profiles/prompts/<id>.md`, mode `0o600`.
    - `writePrompt` writes `composeProfilePrompt(profile)`, or removes the file and returns `null` when it is empty.
  - `nullAgentProfilesStore` is a no-op store.
- [ ] `main/agent-profiles-service.ts`. Every mutation runs through one in-module promise chain, so two saves never
  interleave.
  - `configureAgentProfiles(store)`, `listAgentProfiles()`, `getAgentProfile(id)`, `resetAgentProfilesState()`.
  - `saveAgentProfile(profile, expectedUpdatedAt)`:
    - If an entry with that `id` exists and `existing.updatedAt !== expectedUpdatedAt`, return
      `{ status: 'conflict', current: existing }` and write nothing.
    - A new `id` while `MAX_AGENT_PROFILES` exist throws
      `'You have 200 agents, the most this version keeps. Delete one to add another.'`, which the handler turns into
      `failure`.
    - Otherwise upsert, keeping the existing `createdAt` and setting `updatedAt = max(Date.now(), existing.updatedAt + 1)`
      so two saves in one millisecond still differ. Then write the prompt file and return `{ status: 'saved', profile }`.
  - `deleteAgentProfile(id)` removes the entry and its prompt file. An unknown id is a no-op success.
- [ ] `main/index.ts`: `agentProfilesMain = defineFeatureMain<AgentProfilesMainServices>(…)`, registering the six
  channels with `ipc.handle` / `handleBare`, and `ok` / `failure`.
  - Services type:

    ```ts
    AgentProfilesMainServices = {
      dialogs: { pickFile(o: { title: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null>;
                 pickSavePath(o: { title: string; defaultPath: string }): Promise<string | null> };
      launch?: AgentProfileLaunchService;
    }
    ```

    This is cribbed from `ApiClientDialogs` in
    [`api-client-handlers.ts`](../../../packages/features/api-client/main/handlers/api-client-handlers.ts) lines 49-57.
  - `AgentProfileLaunchService` has the shape
    `{ prepare(profile: AgentProfile, req: { cwd: string; resume: boolean }): Promise<{ launchId: string; line: string }> }`.
    It is filled only by Studio (Theme G). When it is absent, `prepareLaunch` returns
    `failure('Launching needs Midnite Studio.')`.
  - Export writes `{ version: 1, profile }` to the picked path. The default name is `<slug(name)>.agent.json`, where
    slug means lower-case with runs of characters outside `[a-z0-9]` turned into `-`.
  - Import:
    - It reads at most 1 MB; a larger file fails with `'That file is too large to be an agent.'`.
    - It validates `{ version: 1, profile }` with `AgentProfileSchema`. A file that fails fails with
      `'That file is not a Midnite agent.'`.
    - It assigns a new `id` and timestamps and sets `name = uniqueProfileName(\`${name} (imported)\`, names)`, then
      saves it as new.
- [ ] Studio wiring.
  - Add `"@midnite/studio-feature-agent-profiles": "workspace:*"` to `packages/desktop/package.json` and
    `packages/app/package.json`.
  - Add `{ "path": "../features/agent-profiles/tsconfig.main.json" }` to `packages/desktop/tsconfig.json`.
  - In `packages/desktop/moon.yml`, add the nine entries mirroring `feature-councils` at lines 93, 141, 211, 214,
    264, 340, 343, 445 and 448: one dependency, two `:build` deps and six input globs.
  - Add the net-new `packages/desktop/src/main/ipc/agent-profile-handlers.ts`, cribbed from `council-handlers.ts`.
    It builds `ctx`, binds `dialogs` with Electron `dialog`, cribbed from
    [`api-client-feature-handlers.ts`](../../../packages/desktop/src/main/ipc/api-client-feature-handlers.ts) lines
    32-46, and binds `launch` (Theme G). It is called from `main/index.ts` beside `registerCouncilHandlers()` (line 645).
  - Call `configureAgentProfiles(createAgentProfilesStore(userData))` beside `configureCouncils` (line 821).
  - In `preload/index.ts`, add `'agentProfile'` to the bridge-key union (line 133) and add the slice after `council`
    (line 552).
  - In `feature-gate-channels.ts`, add `agentProfiles: agentProfilesMain.channels`.
- [ ] Agents host wiring.
  - Add the dependency to `packages/modules/agents/package.json`.
  - Spread `...agentProfilesMain.channels` in `main/module.ts` (after `councilsMain.channels`, line 32).
  - In `main/context.ts`, configure and register with `dialogs` bound to the host's Electron dialog service (the
    `el` pattern at line 72) and **no `launch`**.
  - Add an `agentProfile` slice in `main/bridge.ts`.
  - Update the pinned key list in `main/bridge.test.ts` (lines 13-15) and the expected channels in
    `main/context.test.ts` (line 81).
- [ ] Repo registration.
  - Add `'agent-profiles'` to `STUDIO_FEATURES` ([`composition.ts`](../../../apps/studio/src/composition.ts)).
  - Add `'feature-agent-profiles'` to `NODE_PROJECTS`
    ([`gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs)). In the sorted pinned list in
    `gate-projects-check.test.mjs` it goes before `'feature-api-client'`.
  - Add it to the `gate-node` job list in `.github/workflows/ci.yml` if `gate-projects-check.mjs` line 75 still asks
    for that.
  - Add `"@midnite/studio-feature-agent-profiles/main"` to `tsconfig.base.json` beside councils (line 98).
  - Add `'agent-profiles'` to `apps/agents/tailwind.config.ts` (line 13).
- [ ] Tests.
  - `agent-profiles-store.test.ts` (temp dir):
    - A missing file and a malformed file each give `[]`.
    - A round trip works.
    - One invalid entry is dropped.
    - No `.tmp` file is left behind.
    - The prompt file is written with mode `0o600` and removed when the prompt is empty.
  - `agent-profiles-service.test.ts`:
    - Upsert keeps `createdAt`.
    - A stale `expectedUpdatedAt` returns `conflict` and leaves the file unchanged.
    - Two concurrent saves of different ids both land.
    - The 201st new agent fails with the copy above.
    - Delete removes the prompt file.
  - `main/index.test.ts`:
    - Import of a valid file gets a new id and an "(imported)" name.
    - A 2 MB file and a non-agent JSON each fail with their copy.
    - A dismissed dialog gives `profile: null` / `path: null`.
    - `prepareLaunch` without `launch` fails with `'Launching needs Midnite Studio.'`.

### C — Agents page and the Your agents tab (M)

- [ ] `renderer/host.tsx`: `AgentProfilesHost`, `AgentProfilesHostProvider` and `useAgentProfilesHost()`, cribbed
  from `councils/renderer/host.tsx`.
  - `useAgentRoster(): { agents: AgentDefinition[]; status: AgentStatus[] }`
  - `resolveAgentIcon(agent: { id: string; icon?: string }): IconComponent`
  - `useModelsFor(baseAgentId: string): AgentModelInfo[]`. Ollama models are excluded; see Not in this phase.
  - `useSkills(baseAgentId: string): { skills: ChatSkill[]; loading: boolean; error: string | null }`
  - `useMcpTools(): { id: McpToolId; title: string; description: string }[]`
  - `useLaunchProfile?: () => { launch(profile: AgentProfile): Promise<void>; disabledReason: string | null }`
  - `useLiveSessionCount?: (profileId: string) => number`
  - `openExternal(url: string): void`
  - There is no `Tooltip` member: the info icon is the feature's own (D).
- [ ] `renderer/use-agent-profiles.ts`.
  - `useAgentProfiles()` is `useQuery(['agent-profiles'])` over `bridge()?.agentProfile.list()`. It exposes
    `{ profiles, loading, error }`, where an envelope failure becomes `error`.
  - Mutation hooks: `useSaveAgentProfile()`, `useDeleteAgentProfile()`, `useImportAgentProfile()`,
    `useExportAgentProfile()`.
  - Every mutation invalidates `['agent-profiles']`. A failed envelope goes through `reportFailure`
    (`frame/src/bridge-result.ts`). A `conflict` result is returned to the caller, not reported.
- [ ] `renderer/agents-view.tsx` (`AgentsView`), with `data-testid="agents-view"`.
  - The header is cribbed from [`models-view.tsx`](../../../packages/features/models/renderer/models-view.tsx) lines
    85-140. It holds the literal `<PageDetachMark role="agents" />` (the detachable test greps for it), `LuBot`, and
    `<h1>` "Agents".
  - A `role="tablist"` with `aria-label="Agents"` holds the tabs `list` ("Your agents"), `builder` ("Builder") and
    `info` ("Info").
    - Each tab has `data-testid="agents-tab-<id>"`, `role="tab"`, `aria-selected` and `aria-controls`.
    - ArrowLeft/ArrowRight move between tabs, and Home/End jump to the ends.
  - State is `{ tab, editingId: string | null, draftIsNew: boolean }`; it is not persisted.
  - The view opens on `list`.
- [ ] `renderer/agents-list.tsx` (`AgentsList`).
  - Toolbar: "New agent", which opens the Builder on an unsaved `createBlankAgentProfile()`; "New from template", the
    feature's own `TemplateMenu`; and "Import".
  - `TemplateMenu` is a button with `aria-haspopup="menu"` and a `role="menu"` list of the three templates.
    ArrowUp/ArrowDown move, Enter picks, and Escape closes and refocuses the button. It is the feature's own because
    `FrameDialogs.openMenu` is optional and absent in some apps.
  - One card per profile, sorted by `updatedAt` descending, with `data-testid="agent-profile-<id>"`. Each card shows:
    - The icon, in the profile's accent.
    - The name, as a button that opens the Builder.
    - The description, clamped to two lines.
    - The base CLI label and the model label.
    - `blueprintSummary` chips, at most six, then `+N`.
    - The actions Launch, Edit, Duplicate, Export and Delete.
  - Launch:
    - It renders only when the host has `useLaunchProfile`.
    - It is disabled, with the reason as `title` and `aria-describedby` text, when any of these hold:
      `disabledReason` is non-null; the base CLI is not installed (`'<Label> is not installed'`); or the base is
      missing from the roster.
- [ ] States, with literal copy. Each state lives in an `aria-live="polite"` region.
  - Loading: "Loading your agents…" (skeleton cards with `aria-busy="true"`).
  - Failed load: "Couldn't load your agents." followed by the envelope message and a "Retry" button that refetches.
  - Empty:
    - Heading "No agents yet".
    - Body "An agent is one of your CLIs with its own model, instructions, tools and limits. Start from a template or
      from scratch."
    - The three templates as cards, then "Start from scratch".
  - Missing base: a warning chip "Base CLI not found" on the card; Launch disabled.
  - Import or export failure: shown through `reportFailure`, using the envelope message unchanged.
- [ ] Delete uses `useFrameChrome().useDialogs().confirm(...)`, cribbed from loops
  (`custom-loop-editor.tsx` line 542; councils has no confirm):

  ```ts
  { title: `Delete ${name}?`, body: 'This removes the agent and its saved prompt. It cannot be undone.',
    confirmLabel: 'Delete agent', danger: true, blastRadius: null,
    warnings: n > 0 ? [`${n} running session${n === 1 ? '' : 's'} keep going with the settings they started with.`] : [] }
  ```

  `n` comes from `useLiveSessionCount?.(id) ?? 0`.
- [ ] Focus rules.
  - After delete, focus the next card's name button, else the previous one's, else "New agent".
  - Duplicate saves the copy (`duplicateAgentProfile`) and focuses the copy's name button.
  - Import focuses the imported card.
  - Edit, and a click on the name, switch to the Builder and focus its name input.
- [ ] `renderer/templates.ts`: `AGENT_PROFILE_TEMPLATES: readonly { id; label; summary; apply(blank: AgentProfile): AgentProfile }[]`.
  - `reviewer` "Reviewer": reads diffs, reports findings by severity, writes nothing.
  - `researcher` "Researcher": reads and summarises with sources, no file writes.
  - `builder` "Builder": implements a spec in small commits and runs the tests.
  - Each sets name, description, accent, a 3-to-6-sentence `systemPrompt` and a blueprint. Templates leave `mcpTools`
    `null` (no restriction).
  - Picking a template opens the Builder on an **unsaved** draft.
- [ ] `renderer/index.ts` exports the manifest, the host, the hooks and
  `agentProfilesViews = { agents: () => import('./agents-view').then((m) => m.AgentsView) } satisfies Record<ViewIds, …>`.
  `renderer/testing.ts` exports `TEST_AGENT_PROFILES_HOST` and `profileFixture(overrides?)`.
- [ ] Studio view wiring, one entry each:
  - `VIEW_COMPONENT` in [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx), with
    `global: true`.
  - `VIEW_ICON` in `components/nav-icons.ts` (`LuBot`).
  - `VIEW_LABELS` "Agents" and `VIEW_KEYWORDS` `['custom agent', 'profile', 'builder', 'blueprint']` in
    `services/palette/providers.ts`.
  - `VIEW_LABELS` in `features/settings/settings-pages/sidebar-page.tsx` and `components/title-bar-nav.tsx`.
  - `VIEW_FILTERS` in `features/repos/view-sections.ts`.
  - `TEST_VIEW_LABELS` / `TEST_VIEW_KEYWORDS` in `features/companion/renderer/test-catalog.ts`.
  - `AGENT_NAV_ITEMS` in `components/nav-groups.ts`.
  - `RAIL_VIEW_IDS` in `components/nav-visibility.ts`.
  - `PAGE_ROLE_TITLE` "Agents" in `components/page-detach-mark.tsx`.
  - The window size `agents: { width: 1080, height: 800 }` in `desktop/src/main/window-manager.ts`.
  - The new view file added to the source glob in `components/agents-detachable.test.ts`.
  - No chord.
- [ ] Studio host adapter, net-new `packages/app/src/compose/agent-profiles-host.tsx`:
  `STUDIO_AGENT_PROFILES_HOST satisfies AgentProfilesHost`, installed in `studio-providers.tsx` beside
  `CouncilsHostProvider`.
  - `useAgentRoster: () => useAgents()`.
  - `resolveAgentIcon` comes from `components/icons`.
  - `useModelsFor: (id) => modelsForAgent(id)`, with no Ollama list.
  - `useSkills` is a `useQuery(['agent-profile-skills', id, repoId])` over
    `bridge()?.chats.skills({ engine: id, repoId: activeRepoId ?? null })`.
  - `useMcpTools` maps `listMcpToolIds(ALL_APPS_INSTALLED, <Studio's manifests, as passed to McpToolsView>)` to
    `MCP_TOOLS[id]`'s `title` and `description`.
  - `useLaunchProfile` and `useLiveSessionCount` come from Theme F; until F lands, leave both out.
- [ ] Agents module wiring.
  - In [`manifest.ts`](../../../packages/modules/agents/manifest.ts), add `'agent-profiles'` to `features` and
    `{ id: 'agents', global: false }` to `views`.
  - Add a row `{ id: 'agents', label: 'Agents', icon: LuBot }` to `AGENTS_NAV.views` and add the view to
    `AGENTS_APP` (`renderer/agents-manifest.ts`).
  - Add `LABEL` and `VIEWS` entries in `renderer/views/agents-home.tsx`.
  - Add `AGENTS_AGENT_PROFILES_HOST` in `renderer/compose/agents-hosts.tsx`, with the roster from the existing
    `['agents']` query and **no `useLaunchProfile` or `useLiveSessionCount`**.
  - Nest `AgentProfilesHostProvider` in both `AgentsApp` and `AgentsPane` (`renderer/agents-app.tsx`).
  - Add the package to the module's `package.json`.
- [ ] Tests.
  - `agents-view.test.tsx`:
    - Three tabs.
    - Arrow keys move between tabs.
    - Edit on a card selects Builder with that profile and focuses the name input.
  - `agents-list.test.tsx`:
    - Loading, failed-load (Retry refetches), empty and populated states show their literal copy.
    - Cards are sorted by `updatedAt`.
    - Duplicate calls save with a `copy` name and focuses the copy.
    - Delete opens a confirm whose warnings carry the live count (2 → "2 running sessions…").
    - Focus after delete.
    - Launch is absent without `useLaunchProfile` and disabled with the right reason in each of the three cases.
    - The missing-base chip.
    - `TemplateMenu` keyboard behaviour.
  - `templates.test.ts`: every template's `apply(createBlankAgentProfile())` parses with `AgentProfileSchema`.
  - Update `view-registry.test.ts` (the global set), `agents-detachable.test.ts`, `agents-app.test.tsx` (rail labels
    gain "Agents"), `agents-manifest.test.ts`, the module `manifest.test.ts`, `composition.test.ts` and
    `apps/studio/src/feature-toggles.test.ts`.
- [ ] Design: page shell and list styled per "Visual & UI/UX Design".
  - Covers the root, header, tabs and focus ring; the card grid, card, accent stripe and chips; and the skeleton,
    failed-load, empty and no-match layouts.
  - Add net-new `renderer/use-panel-width.ts` (`usePanelWidth(ref): number`, a `ResizeObserver`; returns `Infinity`
    in jsdom when the observer is unavailable). It drives the 720 / 560 / 480 px breakpoints.
  - Tests: `use-panel-width.test.ts` with a stubbed `ResizeObserver`. In `agents-list.test.tsx`:
    - The stripe's inline `background` equals the profile accent.
    - The seventh chip collapses into `+N` with the rest in `title`.
    - The filter shows only above 6 agents.
    - Every icon button has an `aria-label` naming the agent.

### D — Builder tab (L)

- [ ] `renderer/info-tip.tsx`: `InfoTip({ label, text, side = 'top' })`, the feature's own popover, identical in both
  apps.
  - It is a `button type="button"`, 18×18 px, `rounded-full`, holding `LuInfo` at 14 px in `text-muted-foreground`.
    It has `aria-label={\`About ${label}\`}` and `aria-expanded`.
  - When open, it sets `aria-describedby` to a `role="tooltip"` element holding `text`.
  - Open and close:
    - It opens on pointer enter after 300 ms, on focus at once, and on click (a toggle).
    - It closes on pointer leave after 150 ms (cancelled if the pointer enters the popover), on blur, and on Escape.
      Escape keeps focus on the button.
  - The popover is absolutely positioned against a `relative` wrapper, 280 px max width, using theme tokens
    (`bg-popover text-popover-foreground border-border`), with no flip logic.
  - It does not depend on either app's `Tooltip`, because the Agents app's tooltip is a native `title` that never
    shows on focus.
- [ ] `renderer/field.tsx`: `Field({ id, label, info, children })` renders `<label htmlFor={id}>`, then `InfoTip`, then
  the control.
- [ ] `renderer/info-copy.ts`: `FIELD_INFO: Record<FieldId, string>`, one or two plain sentences of at most 220
  characters each.
  - `FieldId` covers `name`, `description`, `accent`, `icon`, `baseAgent`, `model`, `systemPrompt`, `restrictTools`,
    `mcpTools`, `skills`, each `AGENT_LIMIT_KEYS` key, and `blueprint`.
  - Stage and option tips read `summary` from `AGENT_BLUEPRINT_STAGES`.
- [ ] `renderer/agent-builder.tsx` (`AgentBuilder({ profileId, isNew, onDone })`) edits a draft copy.
  - Save validates with `AgentProfileSchema`. Invalid fields get `aria-invalid` and an inline message under the field:
    - Name: "Give the agent a name."
    - Accent: "Pick a colour."
    - Too long: "Keep this under <n> characters."
  - Save calls `useSaveAgentProfile` with `expectedUpdatedAt` = the stored `updatedAt` the draft was opened from
    (`null` when new).
  - On `conflict`, a confirm opens: "This agent changed elsewhere." with "Reload" (replace the draft with `current`)
    and "Overwrite" (save again with `expectedUpdatedAt = current.updatedAt`).
  - Discard restores the stored copy, or for a new draft returns to the list.
  - While the draft differs from the stored copy (deep compare), the Builder tab shows a dot and its accessible name
    becomes "Builder, unsaved changes".
  - Switching tab, Edit on another card or detaching the page with unsaved changes opens a confirm:
    `Discard changes to ${name}?`, with confirmLabel "Discard" and `danger: true`.
  - After a save, when `useLiveSessionCount?.(id) > 0`, show an inline notice: "Saved. Running sessions keep their
    model, prompt and tools until relaunched; limits apply within a few seconds."
  - No keyboard chord for Save; the button is the last stop in tab order.
- [ ] Builder sections, in tab order, each a `Field`:
  - **Identity**: name, description, accent (`<input type="color">` plus a hex text input kept in step), and icon (a
    `select` of the roster's icon keys rendered through `resolveAgentIcon`).
  - **Base**:
    - Base CLI is a `select` of the roster, installed ones first. Uninstalled ones are disabled, with the roster's
      `install` hint as their description.
    - Model is a `select` of `useModelsFor(baseAgentId)`. It resets to `'default'` when the base changes and the
      current model is not offered, and says so in the `aria-live` line "Model reset to Default for <Label>."
  - **System prompt**:
    - A `textarea`, 8 rows and resizable, with a live counter "<n> / 20,000".
    - One delivery line from `promptDeliveryFor`:
      - "Passed to <Label> as a system prompt."
      - "Sent to <Label> as the first message of each new session."
      - "<Label> can't take a prompt from Midnite; this text is saved but not sent." (the field stays editable)
  - **Tools**:
    - A switch "Restrict midnite tools". Off maps to `mcpTools: null`. On with nothing ticked maps to `[]`, with
      the note "This agent can't use any midnite tools."
    - When on, a filterable checklist of `useMcpTools()` (the existing `FilterInput` from the frame), with
      "Select all" and "Select none". Each row shows the tool `title` and an `InfoTip` with its `description`.
    - When `enforcementFor(base).tools` is false, the warning "<Label> can't be restricted to these tools yet;
      the list is saved for when it can." is shown.
    - When true and the switch is on, the note "Sessions of this agent see only these midnite tools, and no other
      MCP servers you have set up." is shown (strict mode, Theme G).
  - **Skills**:
    - A filterable checklist from `useSkills(baseAgentId)`, with scope badges (`project`, `user`, `plugin`).
    - Loading shows "Loading skills…"; an error shows "Couldn't list skills: <message>"; none shows "No skills found
      for <Label>."
    - The note "Skills are suggested in the prompt, not enforced."
    - A saved skill no longer listed stays ticked with the badge "not found".
  - **Limits**:
    - One `type="number"` input per `AGENT_LIMIT_KEYS` key, labelled with `AGENT_LIMIT_LABELS`, minimum 1.
    - Empty means "use the repo's limit", with `DEFAULT_AGENT_LIMITS[key]` as the placeholder.
    - `spendTokensPerSession` also accepts "No cap".
    - When `enforcementFor(base).toolCallLimit` is false, the tool-call field is marked "Not enforced for <Label>".
- [ ] `renderer/blueprint-editor.tsx` (`BlueprintEditor({ value, onChange })`) is fully visible at once, with no
  hidden menus. It is a CSS grid: `minmax(200px, 1fr) 2fr` columns over a sticky bottom row.
  - **`Pipeline`** (left):
    - The five stages in a `role="tablist"` list with `aria-orientation="vertical"`. Each row shows its number
      badge, label, subtitle, and a count of chosen options in a pill.
    - It uses a roving `tabindex`: ArrowUp/ArrowDown move and activate, and Home/End jump to the ends.
  - **`Configurator`** (right, `role="tabpanel"`):
    - The active stage's options as toggle cards in a two-column grid. Each card is a `button` with `aria-pressed`,
      showing an icon, the label, an `InfoTip` and a "Docs" link through `openExternal`. `custom` has no link.
    - Below the cards, the stage note: a `textarea`, 3 rows, with a "<n> / 500" counter.
  - **`StackBar`** (bottom, `position: sticky; bottom: 0`, `bg-background/95` with a top border):
    - `blueprintSummary` as five labelled groups of chips, with "None chosen" for an empty stage.
    - Each group is a button that activates its stage.
    - It has `aria-live="polite"` with `aria-atomic="false"`, so a toggle announces only the changed group.
  - Active stage and pressed card: `border-primary bg-primary/10` with `transition-colors duration-150`;
    `motion-reduce:transition-none`. No other motion.
- [ ] `renderer/blueprint-icons.ts`: `BLUEPRINT_ICONS: Record<BlueprintStageId | BlueprintOptionId, IconComponent>`,
  from `react-icons/lu` only.
- [ ] Performance: no virtualisation. The tool checklist renders every listed tool (around 150 today), and the
  filter is a case-insensitive substring match over `title` and `id`. If `MCP_TOOL_IDS.length` passes 500, file a
  follow-up rather than optimising here.
- [ ] Tests.
  - `info-tip.test.tsx` (fake timers):
    - Hover opens after 300 ms; focus opens at once; click toggles.
    - Escape closes and keeps focus; blur closes.
    - `aria-describedby` points at the tooltip while open.
  - `agent-builder.test.tsx`:
    - Save sends the draft with `expectedUpdatedAt`.
    - An empty name blocks save and shows "Give the agent a name.".
    - A `conflict` result opens Reload/Overwrite, and each does what it says.
    - Changing the base to one without the current model resets it and announces it.
    - The restrict switch maps to `null`/`[]`.
    - The delivery line follows the base (claude, codex, aider).
    - The tools warning shows for aider.
    - The unsaved dot and the discard confirm.
    - The saved-with-live-sessions notice.
    - Every `Field` renders an `InfoTip`.
  - `blueprint-editor.test.tsx`:
    - Clicking a stage activates it; ArrowDown/Home/End move.
    - Options toggle independently.
    - The note counter.
    - The stack bar mirrors selections, and clicking a group activates its stage.
  - `blueprint-icons.test.ts`: every stage and option id has an icon.
  - `info-copy.test.ts`: every `FieldId` has non-empty copy of at most 220 characters.
- [ ] Design: Builder layout per "Visual & UI/UX Design".
  - The sticky section index, with an `IntersectionObserver` scroll-spy setting `aria-current`.
  - The chip-row index below 720 px.
  - The field grid, stacking below 560 px.
  - Invalid, counter and note styles.
  - The bordered checklists with their sticky header.
  - The sticky footer's three states (unsaved, saving, saved).
  - Tests:
    - Clicking an index entry calls `scrollIntoView` and focuses the section heading.
    - With a stubbed observer, the entry for the intersecting section gets `aria-current`.
    - The footer shows "Saving…" while the mutation is pending, then "Saved".
    - The counter turns destructive past 95%.
- [ ] Design: Blueprint styling per "Visual & UI/UX Design".
  - The two-column container, the timeline pipeline rows with number badges and connectors, the option cards'
    pressed state with `LuCheck`, and the stack bar's sticky offset from `--builder-footer-h`.
  - The compact horizontal pipeline below 720 px, with full labels in `aria-label`.
  - Tests:
    - A pressed card carries `aria-pressed="true"` and renders the check.
    - In the narrow layout each badge's `aria-label` is the full stage label.
    - The footer sets `--builder-footer-h` from its measured height (stubbed `ResizeObserver`).
- [ ] Design: `InfoTip` trigger and popover styled per "Visual & UI/UX Design".
  - The 18 px round trigger and its open state, and a 280 px `bg-popover` panel above or below.
  - Pipeline and stack-bar tips use `side="bottom"`.
  - Test: `side="bottom"` renders the `top-full` placement class.

### E — Info tab (S)

- [ ] `renderer/agents-info.tsx` (`AgentsInfo`): four sections, each an `h2` with an `id`, listed as in-page anchor
  links at the top.
  1. **The five stages**, rendered from `AGENT_BLUEPRINT_STAGES`: each stage's `summary`, then each option's
     `summary` and docs link.
  2. **How a custom agent runs**:
     - The base CLI and model flag.
     - Prompt delivery, as a table of base CLIs × `promptDeliveryFor`.
     - What is enforced, as a table of base CLIs × `enforcementFor`, plus a row saying the other limits apply to
       every CLI.
     - That restricting tools hides your other MCP servers from that agent's sessions.
     - That skills and the blueprint are guidance only.
     - That edits apply to new sessions, and limits within a few seconds.
  3. **Glossary**: `GLOSSARY` in `renderer/info-copy.ts`, sorted A–Z. It defines RAG, vector database, hybrid search,
     MCP, tool call, fine-tuning, open-weight model, evaluation, guardrails, observability, orchestration and system
     prompt, each in at most two sentences.
  4. **Links**: docs for each base CLI (`AgentDefinition.docsUrl`, skipped when absent) and each blueprint option,
     through `openExternal`.
- [ ] Tests (`agents-info.test.tsx`):
  - Every stage and option renders.
  - The delivery and enforcement tables cover every roster agent.
  - Glossary terms are sorted and unique.
  - Links call `openExternal`.
- [ ] Design: Info tab styled per "Visual & UI/UX Design".
  - `max-w-3xl` column, anchor chips, stage cards with definition lists, and yes/no tables using `LuCheck`/`LuMinus`
    plus `sr-only` text. The glossary is in two columns at 720 px and wider.
  - Test: each yes/no cell has its `sr-only` "Enforced" / "Not enforced" text.

### F — Launch (L)

- [ ] Main builds the line. In Studio, `agentProfilePrepareLaunch`'s `launch.prepare(profile, { cwd, resume })` does
  the following:
  - Resolves `base` from the roster; when missing, it throws `'The base CLI <id> is not in the roster.'`.
  - Reads `promptPath(profile.id)` if the file exists.
  - Asks Theme G's socket service for `{ launchId, mcpArgs }`.
  - Returns `{ launchId, line: buildProfileLaunchLine(...) }`.
  - The renderer never builds a profile line itself.
- [ ] The terminal host port ([`host.tsx`](../../../packages/features/terminal/renderer/host.tsx)) gains two optional
  members, filled in `STUDIO_TERMINAL_HOST` only (the Agents app has no terminal):
  - `useAgentProfiles?: () => AgentProfile[]`
  - `prepareProfileLaunch?: (req: { profileId: string; cwd: string; resume: boolean }) => Promise<{ launchId: string; line: string } | null>`
    (`null` on a failed envelope, reported through `reportFailure`)
- [ ] Session request.
  - Add `profileId?` and `profileLaunchId?` to `NewSessionRequest` (`features/terminal/renderer/terminal-store.ts:56`).
  - Copy `profileId` in `openSession`'s builder (line 570), using the same
    `...(request.x === undefined ? {} : { x })` pattern. Otherwise it is silently dropped.
  - Keep `profileLaunchId` in a non-persisted `launchIds: Record<sessionId, string>` map in the store, cleared after
    the pty binds.
- [ ] Fresh launch: `launchProfileSession(profile, { repoId, cwd })` in `features/terminal/renderer/profile-launch.ts`
  (net-new).
  1. `await prepareProfileLaunch({ profileId, cwd, resume: false })`; `null` stops here.
  2. `const s = openSession({ kind: 'agent', agentId: profile.baseAgentId, profileId: profile.id, title: profile.name, cwd, repoId })`.
  3. Store the launch id, then `queueInput(s.id, line + '\r')`.

  Steps 2 and 3 run in the same tick, so the view mounts with the input already queued. `agentInitialInput` returns
  `undefined` for a session with a `profileId`, so the base command is never typed first.
- [ ] Wake and Resume (`terminal-view.tsx` around lines 801 and 950), for a session with a `profileId`:
  - Waking a dead pane awaits `prepareProfileLaunch({ resume: false })` and starts with that line plus its launch id.
  - Resume awaits `prepareProfileLaunch({ resume: true })`.
  - If the profile no longer exists or prepare fails, both fall back to today's base-agent behaviour.
  - `start` gains an optional third argument `{ profileLaunchId?: string }`, which `use-terminal-ipc.ts` passes on
    `api.pty.create` and adds to the `start` callback's dependency list.
- [ ] New-session menu ([`new-session-menu.ts`](../../../packages/features/terminal/renderer/new-session-menu.ts)).
  - Widen `AgentSection.id` to `'custom' | 'proprietary' | 'open-source'` and add a row union:
    `ProfileRow = { kind: 'profile'; key: \`profile:${string}\`; profile; icon; iconStyle; disabled; disabledReason }`.
  - `buildAgentSections` takes `profiles?: AgentProfile[]` and puts a "Your agents" section first, sorted by name.
  - A row is disabled with `'<Label> is not installed'` or `'Base CLI not found'`.
  - `NewSessionPickerProps` and `PickerPanel`'s own prop type gain `profiles?` and
    `onNewProfile?(profile: AgentProfile)`. Rows are keyed by `key` in `indexByKey`.
  - Thread the props through all three call sites: `terminal-header.tsx`, `terminal-session-list.tsx` and
    `terminal-panel.tsx`.
- [ ] Session chrome, in net-new `features/terminal/renderer/session-agent.ts`:
  `resolveSessionAgent(session, agents, profiles)` returns the base `AgentDefinition` with `label`, `accent` and
  `icon` replaced by the profile's when `session.profileId` matches, else the base.
  - Use it everywhere a session's agent is looked up today: `terminal-header.tsx` (`HeaderMark`) and
    `terminal-session-list.tsx` (lines 450, 541 and 610).
  - `resolveAgentIcon` is unchanged; it never sees a profile.
- [ ] Studio adapters.
  - `STUDIO_AGENT_PROFILES_HOST.useLaunchProfile` returns
    `{ launch: (p) => launchProfileSession(p, activeRepo) then reveal the terminal panel, disabledReason: activeRepo ? null : 'Open a repo first.' }`.
  - `useLiveSessionCount(id)` counts sessions in the terminal store with `profileId === id` and a live pty.
- [ ] Tests.
  - Additions to `packages/app/src/features/terminal/new-session-menu.test.ts`:
    - A "Your agents" section comes first and is sorted.
    - Disabled rows show their reasons.
    - There is no section without profiles.
  - Additions to `new-session-picker.test.tsx`: picking a profile row calls `onNewProfile`, and keyboard order
    includes profile rows.
  - `profile-launch.test.ts`:
    - It opens a session carrying `profileId`.
    - It queues `line + '\r'` in the same tick.
    - A `null` prepare opens nothing.
    - `agentInitialInput` is `undefined` for a profile session.
  - `session-agent.test.ts`: the overlay, and the fallback when the profile is deleted.
  - A `terminal-view` wake/resume test with a mocked `prepareProfileLaunch`:
    - Wake uses `resume: false`, and Resume uses `resume: true`.
    - A failure falls back to the base command.
- [ ] Design: the "Your agents" menu rows.
  - Existing heading and `menuitem` classes, plus the 2 px accent stripe and the right-aligned base label.
  - Session chrome uses the profile's icon, accent and name with no extra badge.
  - Test (`new-session-picker.test.tsx`): a profile row shows its base label, and its stripe carries the profile
    accent.

### G — Enforcement (L)

- [ ] **G1 — precedence check (manual, before any other G work).** Register `midnite` globally
  (`claude mcp add midnite -- node <shim>`). Then launch
  `claude --mcp-config '<json with a midnite server pointed at a test socket>'` without `--strict-mcp-config`. Record
  which server answers `repo.list`. Do the same for `codex -c mcp_servers.midnite.*`. Write the result into Decision
  9.
  - If the per-launch server wins, unrestricted agents also get a private socket, non-strict.
  - If it does not, unrestricted agents launch with no MCP arguments. Their tool-call limit is then not enforced, and
    `enforcementFor` gains a `restrictedOnly` note that the Builder shows.
- [ ] Net-new `packages/desktop/src/main/agent-profiles/profile-mcp-sockets.ts`:
  `createProfileMcpSockets(seams)` with `{ prepare(profile, cwd): Promise<{ launchId; mcpArgs: string[] }>; bind(launchId, sessionId): void; closeForSession(sessionId): Promise<void>; closeAll(): Promise<void> }`.
  - For `enforcementFor(base).tools === false`, it returns `{ launchId, mcpArgs: [] }` and starts nothing.
  - Otherwise it starts `startMcpServer({ socketPath: <userData>/mcp-runs/p-<launchId>.sock, dispatch })`, cribbed
    from `iterative-host.ts` lines 40-58. The `launchId` is 12 random hex characters. Before binding, it checks
    `isSocketPathTooLong` and falls back to `os.tmpdir()`.
  - The shim launch is `{ command: process.execPath, args: [mcpShimScriptPath(), '--socket', socketPath, ...toolArgs], env: { ELECTRON_RUN_AS_NODE: '1' } }`.
  - `mcpArgs` for Claude are `['--mcp-config', shellQuote(JSON.stringify({ mcpServers: { midnite: launch } }))]`,
    plus `'--strict-mcp-config'` when `profile.mcpTools !== null`.
  - For Codex, they are the `-c mcp_servers.midnite.command=…` / `args` / `env` triplet built the way
    `iterative.ts` line 154 builds it. A same-name key replaces the global entry, so no strict flag is needed.
  - A prepared launch not `bind`-ed within 60 s is closed.
- [ ] Tool limit in the shim.
  - When `profile.mcpTools` is non-null, `toolArgs = ['--tools', ids.join(',')]`.
  - [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) reads `--tools` next to `--socket` (line 37
    pattern). When present, its `ListToolsRequestSchema` handler (lines 96-100) lists only those ids. Calls to other
    ids return the MCP error result `Tool "<id>" is not allowed for this agent.` without dialling the socket.
  - This mirrors `createRunShim`'s `toolIds` "second wall" in `run-shim.ts`.
- [ ] Server-side wall. The private socket's `dispatch(tool, input)`:
  - Refuses an id outside a non-null allowlist with `{ ok: false, kind: 'refused', message: 'Tool "<id>" is not allowed for agent "<name>".' }`,
    so a client that skips the shim is still refused.
  - Otherwise calls the same `dispatchMcpCall` Studio's global server uses (`desktop/src/main/mcp/server.ts` lines
    115-135), including its `listing.isListed` / `mcpToolOffMessage` checks.
  - Reads the allowlist from the profile captured at `prepare`; it does not re-read on each call.
- [ ] Attribution and audit.
  - Add `sessionId?: string` to `McpCallEntry` (`shared/src/mcp.ts`) and pass it through `asRecord` in
    [`mcp/audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts).
  - The private socket's `onCall` calls `recordMcpCall({ …, sessionId })` once bound. A call before `bind` is
    recorded without a session.
  - A refusal also calls `recordAudit({ kind: 'policy-decision', tool, decision: 'deny', rule: 'profile-allowlist', repoPath: cwd, sessionId })`.
    No audit schema change is needed: `summarizeAuditRecord` already renders it as `deny <tool> (profile-allowlist)`.
- [ ] Binding and lifecycle.
  - The `ptyCreate` path calls `profileMcpSockets.bind(req.profileLaunchId, req.sessionId)` when the request carries
    a `profileLaunchId`. This goes through a seam the terminal feature's main half receives from desktop; the feature
    imports nothing from desktop.
  - `onSessionExit(sessionId)` calls `closeForSession`, which closes the server and unlinks the socket and its token
    file.
  - App quit calls `closeAll()` beside `stopStudioAgentBreaker()` (`main/index.ts` line 1373).
  - A broker-surviving session that outlives an app restart has no socket after restart. The CLI then reports the
    midnite server as failed, which is acceptable, and the next wake re-prepares.
- [ ] Limits layer.
  - `resolveAgentLimits(settings, repoPath?, profileOverride?)` in
    [`agent-limits.ts`](../../../packages/shared/src/agent-limits.ts) pushes `profileOverride` after the repo layer.
  - Extract the inline session shape in `agent-breaker.ts` (used by both `session` and `usage`) into
    `BreakerSession = { id; agentId; title; cwd; agentConversationId?; profileId? }`.
  - `agentSessionDetail` (`features/terminal/main/terminal-service.ts` line 456) returns `profileId`.
  - Add a seam `profile: (id: string) => Promise<AgentProfile | null>`, bound in `agent-breaker-wiring.ts` beside
    `session: agentSessionDetail` (line 43) to `getAgentProfile`.
  - `limitsFor` passes `profile?.limits`. The existing 5 s cache is what makes limit edits apply "within a few
    seconds". A deleted profile means no override.
- [ ] Tests.
  - `agent-limits.test.ts`: the profile layer wins over the repo; `{}` changes nothing.
  - `desktop/src/main/agent-breaker.test.ts`:
    - A profile session with `toolCallsPerMinute: 3` trips on the 4th attributed `mcp-call` record.
    - A deleted profile falls back to the repo limit.
  - Net-new `profile-mcp-sockets.test.ts` (a real Unix socket in a temp dir):
    - An allowed tool dispatches.
    - A refused tool returns `refused`, never reaches `dispatchMcpCall`, and records a `policy-decision` deny with the
      session id.
    - `mcpArgs` contain `--strict-mcp-config` only when restricted.
    - An unbound launch closes after 60 s (fake timers).
    - `closeForSession` unlinks the socket.
    - aider gets `mcpArgs: []`.
  - `mcp-shim/shim.test.ts`: `--tools a,b` lists only `a` and `b` and refuses `c` locally.
  - `mcp/audit` test: `sessionId` survives `asRecord`.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/agent-profiles.ts` | A | net-new: schema, blueprint stages, factories, names |
| `packages/shared/src/agent-profile-launch.ts` | A | net-new: delivery and enforcement tables, launch line |
| [`packages/shared/src/agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts) | A F | (**unchanged**) `shellQuote`, `agentInvocationArgs` reused |
| [`packages/shared/src/ai-models.ts`](../../../packages/shared/src/ai-models.ts), [`loops.ts`](../../../packages/shared/src/loops.ts) | A | (**unchanged**) `modelsForAgent`, `modelArgsFor`, `loopModelArgs` reused |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | A | six channels, schemas, bridge slice, `profileLaunchId` |
| [`packages/shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) | A | `profileId` inline on `TerminalSessionSchema` |
| [`packages/shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts), [`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts) (+test), [`window.ts`](../../../packages/shared/src/domain/window.ts) | A | placement, view, view order, window role |
| [`packages/shared/src/feature-toggles.ts`](../../../packages/shared/src/feature-toggles.ts) | A | `agentProfiles` toggle |
| [`packages/shared/src/agent-limits.ts`](../../../packages/shared/src/agent-limits.ts) | G | profile layer |
| [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) | G | `sessionId?` on `McpCallEntry` |
| `packages/features/agent-profiles/**` | B C D E | net-new package |
| `packages/app/e2e/visual/agent-profiles.spec.ts` | C D | net-new: 2 crops × light/dark (4 baselines) |
| `packages/app/src/components/icons/icon-names.test.ts` | C | source glob covers the new feature, if it does not already |
| [`packages/features/capture/main/capture-store.ts`](../../../packages/features/capture/main/capture-store.ts) | B | (**unchanged**) atomic-write crib |
| [`packages/features/terminal/renderer/`](../../../packages/features/terminal/renderer/) `host.tsx`, `terminal-store.ts`, `terminal-view.tsx`, `use-terminal-ipc.ts`, `terminal-panel.tsx`, `new-session-menu.ts`, `new-session-picker.tsx`, `terminal-header.tsx`, `terminal-session-list.tsx` | F | profile launch, wake, resume, menu, chrome |
| `packages/features/terminal/renderer/profile-launch.ts`, `session-agent.ts` | F | net-new |
| [`packages/features/terminal/main/terminal-service.ts`](../../../packages/features/terminal/main/terminal-service.ts), `main/index.ts` | F G | `profileId` in `agentSessionDetail`; bind seam on pty create |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts), `ipc/agent-profile-handlers.ts` (net-new), [`feature-gate-channels.ts`](../../../packages/desktop/src/main/feature-gate-channels.ts), [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts), [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts), `moon.yml`, `tsconfig.json`, `package.json` | B C | wiring |
| `packages/desktop/src/main/agent-profiles/profile-mcp-sockets.ts` | G | net-new: private sockets |
| [`packages/desktop/src/main/agent-breaker.ts`](../../../packages/desktop/src/main/agent-breaker.ts), [`agent-breaker-wiring.ts`](../../../packages/desktop/src/main/agent-breaker-wiring.ts) | G | `BreakerSession`, `profile` seam |
| [`packages/desktop/src/main/mcp/audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts), [`mcp/server.ts`](../../../packages/desktop/src/main/mcp/server.ts) | G | session id on records; `dispatchMcpCall` reused |
| [`packages/desktop/src/mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) | G | `--tools` list and call wall |
| [`packages/desktop/src/main/media/iterative-host.ts`](../../../packages/desktop/src/main/media/iterative-host.ts), [`runtime/src/agent-run/run-shim.ts`](../../../packages/runtime/src/agent-run/run-shim.ts) | G | (**unchanged**) cribs |
| `packages/modules/agents/manifest.ts`, `main/{module,context,bridge}.ts` (+`bridge.test.ts`, `context.test.ts`), `renderer/{agents-manifest.ts,agents-app.tsx,views/agents-home.tsx,compose/agents-hosts.tsx}`, `package.json` | B C | Agents host: list and edit only |
| `packages/app/src/components/{view-registry.tsx,nav-icons.ts,nav-groups.ts,nav-visibility.ts,title-bar-nav.tsx,page-detach-mark.tsx,agents-detachable.test.ts}` | C | view maps |
| `packages/app/src/services/palette/providers.ts`, `features/settings/settings-pages/sidebar-page.tsx`, `features/repos/view-sections.ts`, `features/companion/renderer/test-catalog.ts` | C | view maps |
| `packages/app/src/compose/{agent-profiles-host.tsx (net-new),studio-providers.tsx,terminal-host.tsx}` | C F | host adapters |
| `packages/app/src/features/terminal/{new-session-menu.test.ts,new-session-picker.test.tsx}` | F | tests |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts), `scripts/gate-projects-check.{mjs,test.mjs}`, `.github/workflows/ci.yml`, `tsconfig.base.json`, `apps/agents/tailwind.config.ts` | B | registration |
| [`.midnite/tasks/outstanding.md`](../../outstanding.md) | — | tool-call limits for ordinary sessions |

## Verification

- [ ] Targeted checks green on every PR:
  - `tsc --noEmit` per touched package.
  - eslint on changed files.
  - vitest on the touched suites.
  - `scripts/layer-boundaries.test.mjs`, `tracker-check`, `e2e-budget` and `gate-projects-check`.
- [ ] **Gate — Studio, built app, throwaway `--user-data-dir`.**
  - Open Agents from the rail. The empty state shows the three templates.
  - Create a Reviewer from its template.
  - Edit the name, model and prompt (three lines).
  - Pick options in all five blueprint stages and watch the stack bar follow.
  - Save, then relaunch the app; the agent is still listed.
  - Shots go under `/tmp/midnite-shots-p154/`.
- [ ] **Gate — launch.**
  - On a Claude base, start the saved agent from the new-session menu. The typed line carries the model flag,
    `--append-system-prompt-file '<path>'` and `--mcp-config`. Asked, the agent repeats its three-line prompt
    faithfully.
  - On a Codex base, the prompt arrives as the first message, once. Resume does not resend it.
  - Close the session and wake it; the same flags are re-applied.
- [ ] **Gate — enforcement.**
  - With a restricted allowlist, the agent's `/mcp` view lists only the allowed midnite tools and no other user MCP
    server.
  - A disallowed tool, called directly against the socket, is refused, and the refusal shows in the Audit view as
    `deny <tool> (profile-allowlist)`.
  - Set `toolCallsPerMinute: 3` on the profile, edit it while the session runs, and see the breaker trip on the 4th
    call within a minute.
  - After the session exits, its `p-*.sock` file is gone.
- [ ] **Gate — Agents app.** Agents appears in its rail with the same three tabs. An agent saved in Studio is listed;
  Launch is absent. Import and export work there.
- [ ] **Gate — conflict.** Open the same agent in Studio's page and in a detached Agents window. Save in one, then
  save in the other; "This agent changed elsewhere." appears, and Reload and Overwrite each behave.
- [ ] **Visual baselines** (`docs/TESTING.md` rules), net-new `packages/app/e2e/visual/agent-profiles.spec.ts`.
  - It holds two locator crops, each in light and dark: 4 PNGs under `__screenshots__/linux/`, made with
    `MSTUDIO_CROSS_PLATFORM=1 moon run root:visual-regen`.
    1. One list card (`[data-testid="agent-profile-<id>"]`) for the Reviewer template, with three blueprint chips.
    2. The Blueprint editor, with stage 2 active, two options pressed and the stack bar.
  - Seed the data the way `kanban-card.spec.ts` seeds its fixture.
  - The header comment names "real CSS / theme tokens" as the browser capability.
  - `root:visual-budget` stays green.
- [ ] **Contrast and focus.**
  - Check in both themes, in Studio and the Agents app:
    - Every text token pair used (`muted-foreground` on `card`, `popover-foreground` on `popover`, `primary` on
      `primary/10`) meets WCAG AA (4.5:1 body, 3:1 for the 11 px meta treated as UI text).
    - The focus ring is visible on every control.
    - Tab order runs header → tabs → toolbar → cards (name, Launch, Edit, Duplicate, Export, Delete) → Builder index
      → fields → blueprint → footer.
  - Record the contrast ratios checked in the PR.
- [ ] **Narrow window.**
  - Detach the Agents page and resize it to 520 px wide: the grid is one column, the Builder index is a chip row, the
    pipeline is a horizontal badge row, and the stack bar wraps above the footer without overlapping it.
  - Shots go under `/tmp/midnite-shots-p154/`.
- [ ] **Open, for a human:**
  - Every builder field, tool row and blueprint option shows its info popover on hover, keyboard focus and click,
    and Escape closes it.
  - With VoiceOver, tabs, stages and option toggles announce their role and state.
  - The Info tab reads clearly to someone new to the terms.
- [ ] Clean up after each gate: every spawned agent session exited, the throwaway profile removed, no orphaned
  `claude`/`codex` or broker processes.

## Not in this phase

- **Scaffolding from a blueprint.** Generating a repo or config from stack choices is its own product; the blueprint
  stays notes.
- **Repo-level agents.** Profiles are user-level only. A committed `.midnite/` scope needs merge rules and is a later
  phase.
- **Launching or enforcing in the Agents app.** It has no terminal, breaker or MCP server to launch into.
- **`agents.json` in the Agents app.** Its roster stays `BUILTIN_AGENTS`, so profiles there can pick only builtin
  bases. The Studio-side override file is unchanged.
- **Ollama-backed models.** `resolveAgentLaunch`'s Ollama recipe also needs env and a key, which a typed line cannot
  carry cleanly. The Builder's model list omits Ollama models.
- **Enforced skills.** Skills are named in the prompt; nothing blocks another skill.
- **Tool restriction for CLIs other than Claude and Codex.** No per-launch MCP config is known for them; their
  allowlist is saved and labelled "not enforced".
- **Tool-call limits for ordinary (non-custom) agent sessions.** The same gap exists for every roster session today.
  It is recorded in `outstanding.md` rather than fixed here, because the fix changes how every agent session
  launches.
- **Profiles in councils, workflows, loops and chats.** Those keep picking roster agents.
- **A settings page, a keyboard chord for the view, autosave.** Each is easy to add later and none is needed to use
  the page.

## Decisions / open questions

1. **Resolved — a built agent is a runnable profile plus a blueprint** (agreed with the user). The profile launches;
   the blueprint is saved design notes.
2. **Resolved — rail view** in Studio and a view in the Agents app; no Settings page.
3. **Resolved — one user-level JSON file** (`agent-profiles.json`), zod-validated, behind IPC, written atomically,
   capped at 200. The cap keeps the list unvirtualised and the file small.
4. **Resolved — the profile carries** system prompt, model, MCP tool allowlist, skills and limits.
5. **Resolved — the blueprint is multi-select with a note per stage.** Hosting, guardrails and observability are not
   alternatives.
6. **Resolved — list actions**: launch, duplicate, import / export, starter templates.
7. **Resolved — Info tab**: the five stages, how profiles run, glossary, links out.
8. **Resolved — session binding is a private MCP socket per custom-agent session** (agreed in the refine; this
   replaces open question 12).
   - A session id read from the agent's environment was rejected. Any same-user process can read the shared socket
     token and claim any session.
   - Which socket was dialled is not forgeable that way, and the pattern already exists for headless runs.
   - Applies to Claude and Codex bases; other CLIs have no known per-launch MCP config.
9. **Resolved — strict MCP config only when tools are restricted.** Restricting tools must actually restrict them,
   which costs that agent's sessions the user's other MCP servers; the Builder says so beside the switch.
   - For unrestricted agents, G1's precedence check decides whether a non-strict private socket is used. *Record
     G1's result here when it runs.*
10. **Resolved — prompts are read from a file**, never typed: Claude via `--append-system-prompt-file` (verified in
    `claude --help` on 2026-11-19), others via `"$(cat '<file>')"` as the prompt argument.
    - This keeps newlines, which the existing `shellQuote` flattens.
    - It keeps the typed line short and avoids quoting arbitrary text (replaces open question 13).
11. **Resolved — no first-message timer.** Delivery is a command-line argument, matching `start-agent.ts`.
    - Activity detection was rejected: `awaitingInput` exists only for Claude and matches option sheets, not a ready
      prompt.
12. **Resolved — wake and Resume reapply the profile** through `prepareLaunch`. Resume adds the base CLI's `resume`
    args and drops an argument-delivered prompt, which the conversation already holds.
13. **Resolved — deleting an agent with live sessions is allowed.** The confirm shows the count. Those sessions keep
    their socket and tools, show the base CLI's chrome, and fall back to repo limits.
14. **Resolved — edits apply at next launch, except limits**, which apply within the breaker's 5 s cache. A running
    CLI cannot change its model, prompt or tool list mid-session.
15. **Resolved — conflicting saves are detected** by `expectedUpdatedAt` and offer Reload or Overwrite. Two windows
    are a supported layout (page detach, Agents app), so silent last-write-wins would lose edits.
16. **Resolved — explicit Save**, not autosave. A half-typed prompt must never launch, and conflict prompts must not
    appear mid-typing.
17. **Resolved — the info icon is the feature's own popover.** The Agents app's tooltip is a native `title` that never
    shows on keyboard focus.
18. **Resolved — house response envelopes** (`GitOpResultOf`, `ok`, `failure`), with save returning a
    `saved | conflict` union inside `ok`.
19. **Resolved — refusals are recorded as `policy-decision` denials** with `rule: 'profile-allowlist'`, which needs no
    audit schema change.
20. **Resolved — `profile.model` stores the model list id**; Claude maps through `loopModelArgs`, and `'default'` adds
    no flag.
21. **Resolved — package name `agent-profiles`, view `agents`**, to stay clear of the `agents` module and the `agent`
    placement folder.
22. **Resolved — the wider tool-call-limit gap is recorded, not fixed** (agreed with the user): one entry in
    `outstanding.md`.
