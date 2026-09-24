# AGENTIC SOFTWARE ENGINEERING


## Harness Engineering: How to Build AI Agents That Don't Fall Apart

![harness-engineering](../images/agentic_enginneering_harness.webp)
[rari@0xwhrrari]()
[x.com - 29 Aug 2026](https://x.com/0xwhrrari/status/2093685107534000560)

Most people respond to a failing agent by changing the prompt.

Then they change the model.

Then they add a larger context window.

The agent still forgets decisions.

It still uses the wrong tool.

It still skips verification.

It still gets stuck in the same loop.

The problem is not always the intelligence.

The problem is the environment around it.

That environment is the harness.

And designing it is harness engineering.

Dario Amodei, CEO of Anthropic, said it directly while explaining how Claude Code emerged.

> "Of course, you need an interface, you need a harness to use them."

---

### The Model Is Only The Reasoning Engine

A model can suggest the next action.

It cannot create a reliable operating environment by itself.

The harness decides what the model can see, what it can touch, what survives between sessions, what counts as evidence, and when the run must stop.

```plaintext
MODEL
reasons and proposes actions

HARNESS
selects context
exposes tools
stores state
enforces permissions
checks results
records traces
recovers from failure
```

The prompt is one component inside this system.

The model is another.

The product is what happens when every surrounding component works together.

> Prompt engineering improves the instruction. Harness engineering improves the conditions under which the instruction is executed.

---

### The Same Model Can Become A Completely Different Agent

Put the same model inside a chat box and it answers questions.

Put it inside a repository with terminal access, tests, browser tools, project memory, isolated worktrees, and a review loop and it can ship software.

The weights did not change.

The harness did.

OpenAI described the same shift while building an agent-first codebase with Codex.

Their early progress was slow because the environment was underspecified, not because the model lacked raw capability.

The response was not to tell the agent to try harder.

It was to ask what capability was missing and make that capability both legible and enforceable.

> "The environment was underspecified."
>
> OpenAI, Harness engineering: leveraging Codex in an agent-first world

This is the central idea.

When an agent fails repeatedly, stop editing adjectives in the prompt.

Inspect the system around the model.

A production harness has seven jobs.

---

### 1. Turn The Request Into A Contract

Before the agent acts, convert the request into a bounded object.

```json
{
  "goal": "ship the feature",
  "inputs": ["issue", "repository", "design"],
  "output": "reviewable pull request",
  "constraints": ["no schema changes", "preserve public API"],
  "done_when": ["tests pass", "visual check passes", "review passes"]
}
```

The contract protects the task from silent redefinition.

Without it, the agent can complete a different job and still declare success.

---

### 2. Give The Agent A Map

Agents need project knowledge.

They do not need every document in every context window.

Use a small root guide that tells the agent where to look.

```plaintext
AGENTS.md
  -> architecture map
  -> testing map
  -> product rules
  -> security rules
  -> task-specific guides
```

A map preserves context.

A giant manual consumes it.

Keep the detailed knowledge close to the code, tool, or workflow it governs.

Load it only when the current task needs it.

---

### 3. Expose The Right Tools Inside The Right Environment

Tool access is not a list of buttons.

It is an interface between the model and the real world.

Every tool needs a clear purpose, predictable output, explicit failure state, and a permission boundary.

```plaintext
READ FILES       allowed by default
RUN TESTS        allowed inside sandbox
WRITE FILES      allowed inside workspace
ACCESS NETWORK   scoped by task
DEPLOY           requires approval
DELETE DATA      requires approval
```

Good tools reduce ambiguity before the model has a chance to reason badly.

Bad tools force the model to guess what happened.

---

### 4. Externalize Memory Into Durable State

The conversation is not the system of record.

Store decisions, artifacts, failures, and open risks outside the context window.

```json
{
  "task_id": "task_042",
  "current_step": "verify_ui",
  "artifacts": ["build.zip", "report.md", "screenshot.png"],
  "decisions": ["keep existing schema"],
  "failures": ["mobile overflow at 390px"],
  "pending": ["human approval"]
}
```

The next session should inherit the state of the work, not a lossy retelling of the conversation.

This is how an agent survives context resets, crashes, and handoffs.

---

### 5. Add Sensors Before Adding Autonomy

An agent cannot correct what it cannot observe.

Tests, linters, screenshots, logs, metrics, and schema validators turn vague quality into evidence.

```plaintext
CODE       -> tests + type checks + lint
UI         -> render + screenshot + visual inspection
RESEARCH   -> source check + contradiction check
DATA       -> schema + range + freshness checks
```

The model creates an artifact.

The environment produces evidence about the artifact.

The harness decides whether that evidence is enough to continue.

---

### 6. Enforce Permissions Outside The Model

The model can recommend an action.

The harness must authorize it.

```plaintext
MODEL SUGGESTS -> POLICY CHECKS -> TOOL EXECUTES
```

This separation matters most when the action is expensive, irreversible, or touches another person.

Do not ask the same probabilistic system to invent the plan, approve the risk, and execute the side effect.

---

### 7. Record Traces And Recover Locally

Every run should leave a readable trail.

```plaintext
request
selected context
tool calls
state changes
verification results
retries
cost
final artifact
rollback point
```

Without traces, failure becomes a mystery.

With traces, failure becomes input for the next harness improvement.

---

### Instructions Should Become Infrastructure

Most teams keep important rules in prose.

The agent reads them.

Then eventually ignores one.

The stronger pattern is to encode the important rule twice.

First as guidance the agent can understand.

Then as a mechanical check the agent cannot bypass.

```plaintext
GUIDE
"UI code may not query the database directly"

CHECK
lint fails when UI imports the repository layer
```

The guide explains the reason.

The check enforces the boundary.

This turns a past failure into a permanent system improvement.

The next agent does not need to remember the incident.

The harness remembers for it.

---

### The Loop Belongs To The Harness

Long-running work needs iteration.

But "keep trying until it works" is not a control system.

A useful loop has evidence, bounded retries, a budget, and an escalation path.

```js
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const artifact = await build(state)
  const evidence = await verify(artifact)

  if (evidence.pass) return artifact

  state.failures.push(evidence.gap)
  state.repair = evidence.repair
}

return requestHumanReview(state)
```

The model should decide how to repair the local gap.

The harness should decide whether another attempt is allowed.

Anthropic reached a similar conclusion in its work on long-running agents.

Structured artifacts preserve continuity across sessions, while a separate evaluator gives the builder concrete feedback instead of letting it approve its own work.

> "Find the simplest solution possible, and only increase complexity when needed."
>
> Anthropic, Harness design for long-running application development

---

### Failure Should Upgrade The System

Most people repair the current output.

Harness engineers repair the class of failure.

```plaintext
MISSING CONTEXT   -> add a map or retrieval rule
WRONG TOOL        -> improve tool description or routing
BAD OUTPUT        -> add a validator or stronger contract
REPEATED LOOP     -> add a retry cap and escalation
UNSAFE ACTION     -> add a permission gate
LOST DECISION     -> store it in durable state
UNKNOWN FAILURE   -> add tracing and evidence capture
```

The immediate patch fixes one run.

The harness change improves every run after it.

That is the compounding advantage.

> A good harness converts agent mistakes into infrastructure.

---

### Separate The Brain, The Hands, And The History

A reliable agent is easier to reason about when three components are separate.

```plaintext
BRAIN
the model that reasons

HANDS
the sandbox and tools that act

HISTORY
the append-only record of what happened
```

If the sandbox dies, the history survives.

If the model changes, the tools and policy remain inspectable.

If a task resumes, a new session can reconstruct the state from artifacts and traces.

Anthropic's Managed Agents architecture makes this separation explicit through the session, harness, and sandbox.

> **Claude** ([@claudeai](https://x.com/claudeai)) · 8 Apr
>
> Introducing Claude Managed Agents: everything you need to build and deploy agents at scale.
>
> It pairs an agent harness tuned for performance with production infrastructure, so you can go from prototype to launch in days.
>
> Now in public beta on the Claude Platform.

The important part is not the vendor.

It is the architecture.

The reasoning engine should not also be the filesystem, permission system, memory database, and audit log.

---

### Give Every Run A Change Receipt

When the agent finishes, do not keep only the final output.

Keep a compact receipt that explains how the output was produced.

```json
{
  "context_sources": ["issue", "repo_map", "design_spec"],
  "policy_version": "v12",
  "model_route": "complex_coding",
  "tools_used": ["shell", "browser", "tests"],
  "tests": { "passed": 42, "failed": 0 },
  "human_corrections": 1,
  "retries": 2,
  "cost_usd": 3.84,
  "accepted_artifact": "pr_1842",
  "rollback_point": "commit_7f3a"
}
```

This makes model upgrades comparable.

It makes regressions attributable.

It makes audits possible.

And it prevents the final answer from hiding a broken process.

---

### Start With The Smallest Harness That Closes The Loop

Harness engineering does not mean building a platform before the first task.

Start with the smallest system that can observe, verify, and recover.

```plaintext
LEVEL 0
prompt + model

LEVEL 1
project guide + tools

LEVEL 2
structured state + tests + bounded loop

LEVEL 3
permissions + traces + recovery + human gates
```

Move up only when the task earns the complexity.

A short low-risk task may need one prompt and one review.

A six-hour coding run that can edit files, access the network, and open a pull request needs a real harness.

The harness should be smaller than the failure surface it controls.

---

### The Harness Engineering Checklist

Before you trust an agent with real work, ask:

- [ ] Is success defined before execution begins?
- [ ] Can the agent find the right project knowledge without loading everything?
- [ ] Does every tool have a clear contract and failure state?
- [ ] Is execution isolated from production systems?
- [ ] Are important decisions stored outside the conversation?
- [ ] Does every risky transition have evidence?
- [ ] Are irreversible actions protected by approval?
- [ ] Does every loop have a retry cap and budget?
- [ ] Can the run resume after interruption?
- [ ] Can you explain every tool call and state change?
- [ ] Does failure update a guide, test, tool, or policy?
- [ ] Can the final artifact be rolled back?

If several answers are no, a stronger model will not make the system reliable.

It will only make the failure more expensive.

---

### The Real Shift

Prompt engineering tells the model what to do.

Context engineering decides what the model sees.

Harness engineering builds the world in which the model acts.

```plaintext
PROMPT      -> instruction
CONTEXT     -> working view
HARNESS     -> operating system
LOOP        -> local improvement
GRAPH       -> coordination
```

The model may change next month.

The tools, tests, state, policies, and traces can keep improving.

That is why the durable advantage is moving out of the prompt and into the system around it.

The best builders will not only ask which model is smartest.

They will ask which environment makes that intelligence reliable.

That is harness engineering.

---

If you read this far:

- Bookmark the article so you can use the checklist when you build your next agent.
- Follow @0xwhrrari for more practical breakdowns of agent systems.
- Join my Telegram.
- Subscribe to my Substack.

---

Also you can read other articles:

- [Loop Engineering: The AI skill every builder needs in 2026](./Loop%20Engineering.md)
- [Graph Engineering: How to Build AI Agent Systems That Don't Break at Scale](./Graph%20Engineering.md)
