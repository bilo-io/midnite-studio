# Graphify Knowledge Graph — Midnite Studio

[Graphify](https://github.com/Graphify-Labs/graphify) provides a multimodal code knowledge graph engine with AST structural extraction, community detection, GraphRAG querying, and interactive visualization outputs.

This document records the installation, extraction topology, generated artifacts, tri-agent integration, and operational workflows for **Midnite Studio**.

---

## 1. Setup & Toolchain

### Prerequisites & Packages
- **Python**: 3.10+ (using Python 3.13)
- **Pip packages**:
  ```bash
  pip install graphifyy "graphifyy[mcp]"
  ```
  *(Note: The PyPI distribution is named `graphifyy`, providing the `graphify` CLI and `graphify.serve` MCP server).*

### Worktree Workflow
Per repo conventions, setup and experimentation was conducted in an isolated git worktree:
```bash
git worktree add .worktrees/graphify-setup -b feature/graphify-setup
```

---

## 2. Codebase Extraction & Graph Topology

Headless AST extraction was executed across the Midnite Studio monorepo (`packages/shared`, `packages/git-engine`, `packages/desktop`, `packages/app`):

```bash
graphify extract . --code-only
```

### Metrics
| Metric | Value |
|---|---|
| **Code files analyzed** | 1,336 files |
| **Non-code files bypassed** | 602 files (docs, images) |
| **Total graph nodes** | 7,886 nodes |
| **Total graph edges** | 20,500 relationships |
| **Architectural communities** | 308 clusters |
| **Import cycles** | **0 detected** |
| **LLM / Token cost** | 0 tokens (pure AST parsing) |

---

## 3. Core Architectural Hubs ("God Nodes")

The graph topology identifies the top ten most interconnected abstraction hubs across the repository:

| Rank | Symbol | Inbound/Outbound Edges | Architectural Responsibility |
|:---:|---|:---:|---|
| **1** | `useUiStore` | 256 | Global renderer UI state and tab navigation coordination |
| **2** | `bridge()` | 250 | Type-safe IPC bridge boundary connecting renderer to Electron main |
| **3** | `installMockBridge()` | 175 | Test harness IPC bridge mock implementation |
| **4** | `fixtures` | 96 | Core test repository structures and fixtures |
| **5** | `execGit()` | 90 | Low-level NUL-delimited Git CLI execution layer in `git-engine` |
| **6** | `failure()` | 87 | IPC failure response envelope constructor |
| **7** | `MockFixtures` | 80 | End-to-end and component mock scenarios |
| **8** | `useTerminalStore` | 77 | Integrated terminal and PTY session lifecycle state |
| **9** | `ok()` | 73 | IPC success response envelope constructor |
| **10** | `useDialogs()` | 67 | Global modal, prompt, and confirmation dialog management |

---

## 4. Generated Artifacts Inventory

Extraction and clustering outputs live in `graphify-out/` (configured in `.gitignore`):

```
graphify-out/
├── graph.html              # Interactive 2D/3D web visualization (force-directed layout)
├── GRAPH_TREE.html         # Collapsible D3 v7 hierarchical tree
├── GRAPH_REPORT.md         # Full architecture report with communities and God nodes
├── graph.json              # 11.5 MB persistent GraphRAG database for sub-second queries
├── .graphify_analysis.json # Degree, betweenness, and connectivity analysis cache
├── .graphify_labels.json   # Community auto-labels and signatures
├── manifest.json           # Content hashes for fast incremental rebuilds
├── wiki/                   # 318 Wikipedia-style markdown articles (index.md entry point)
└── obsidian/               # 8,194 markdown notes + graph.canvas for Obsidian vault view
```

### Viewing Visualizations
```bash
# Open interactive community graph in default browser
open graphify-out/graph.html

# Open collapsible hierarchy tree
open graphify-out/GRAPH_TREE.html
```

---

## 5. Agent Integration (Claude Code, Codex, Antigravity)

Midnite Studio maintains strict multi-agent parity across **Claude Code**, **Codex**, and **Antigravity**. The Graphify skills, hooks, and guidelines are mirrored identically.

### 1. Mirrored Skill Definitions
Full skill instructions and reference guides (`references/`):
- `.claude/skills/graphify/`
- `.agents/skills/graphify/`
- `.codex/skills/graphify/`

### 2. Pre-Tool Hooks & Always-On Rules
- **Claude Code**: `.claude/settings.json` runs `graphify hook-guard` before search and read operations to suggest relevant subgraphs.
- **Codex**: `.codex/hooks.json` registers `graphify hook-check`.
- **Antigravity**:
  - Rule: `.agents/rules/graphify.md` instructs agents to query `graphify-out/` before broad file greps.
  - Workflow: `.agents/workflows/graphify.md` provides `/graphify` workflow support.

### 3. Guidelines Sync
[`CLAUDE.md`](../CLAUDE.md), [`AGENTS.md`](../AGENTS.md), and [`GEMINI.md`](../GEMINI.md) share identical guidance:
```markdown
## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- Dirty `graphify-out/` files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
```

---

## 6. Daily Usage & Commands

### Fast CLI Subgraph Queries
```bash
# Query connections by concept
graphify query "how does the write queue interact with repo-watcher?"

# Shortest path between two symbols
graphify path "RepoWatcher" "WriteQueue"

# Plain-language explanation of a specific symbol
graphify explain "QueuedSocketWriter"
```

### Incremental Updates (AST only, 1-2s)
After adding or modifying files in your branch:
```bash
graphify update .
```

### Re-exporting Visualizations
```bash
graphify export html         # Rebuild graph.html
graphify export wiki         # Rebuild wiki/
graphify export obsidian     # Rebuild obsidian/
graphify tree                # Rebuild GRAPH_TREE.html
```

### Model Context Protocol (MCP) Server
To expose the knowledge graph directly to MCP-compatible clients:
```bash
python3 -m graphify.serve graphify-out/graph.json
```
Registered MCP tools:
- `query_graph`: Natural language search across graph nodes.
- `get_node`: Retrieve symbol metadata and definitions.
- `get_neighbors`: Inbound/outbound edges for a node.
- `get_community`: Full members of an architectural cluster.
- `shortest_path`: Trace relationship pathways between two concepts.
- `god_nodes`: Inspect the highest degree abstractions.
- `graph_stats`: Summary metrics and clustering health.

---

## 7. Replicating to Other Repositories (`midnite`, `synthsurf`)

To set up Graphify on `~/Dev/midnite` or `~/Dev/synthsurf`:

1. **Create a worktree**:
   ```bash
   cd ~/Dev/<repo>
   git worktree add .worktrees/graphify-setup -b feature/graphify-setup
   cd .worktrees/graphify-setup
   ```
2. **Run extraction**:
   ```bash
   graphify extract . --code-only
   graphify cluster-only .
   graphify export html
   graphify export wiki
   graphify tree
   ```
3. **Configure agents**:
   ```bash
   graphify claude install
   graphify codex install
   graphify antigravity install
   ```
4. **Ignore output directory**:
   Add `graphify-out/` to `.gitignore`.
