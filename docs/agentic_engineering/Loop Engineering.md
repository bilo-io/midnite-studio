# AGENTIC SOFTWARE ENGINEERING


## Loop Engineering: The AI skill every builder needs in 2026

![loop-engineering](../images/agentic_engineering_loops.webp)
[rari@0xwhrrari]()
[x.com - 12 Jun 2026](https://x.com/0xwhrrari/article/2065539680146182270)

Most people are still prompting agents manually.

They type one task.

Wait for one answer.

Review it themselves.

Fix the mistakes themselves.

Then prompt again.

That means the human is still the loop.

The next step is different.

You do not just prompt the agent.

You design the loop that prompts the agent, checks the result, decides the next move, and keeps running until the work passes.

That is loop engineering.

> "You should not be prompting coding agents anymore. You should be designing loops that prompt your agents."
Then Boris Cherny, head of Claude Code at Anthropic, said the same thing differently:

> "I do not prompt Claude anymore. I have loops running that prompt Claude and figure out what to do. My job is to write loops."


## Why Most People Never Build Real Loops

Loops sound amazing until you look at the token bill.

A normal agent loop can burn a lot of context fast:

- One medium coding loop can use 50K-200K tokens
- A fleet loop with one orchestrator and several specialist agents can use 500K-2M tokens
- A scheduled daily loop can reach millions of tokens per week

Every retry costs tokens.

Every self-correction costs tokens.

Every verification step costs tokens.

Every subagent costs tokens.

That is the hidden problem nobody talks about enough.

Loop engineering is not hard because the idea is complicated.

It is hard because most people cannot afford to let agents run freely for long.

> "Easy for you to say, you have unlimited OpenAI access."
That reaction is fair.

This is why cheaper long-context models matter.

If you want loops to run every day, you need:

- Cheap input tokens
- Cheap output tokens
- Large context windows
- Tool calling
- JSON output
- High concurrency
- Enough context to remember what happened earlier in the loop
- Without that, loops become expensive experiments.

With that, loops become practical workflows.

---

### The Old Way vs The New Way

For the last two years, most people used agents like this:

You prompt.

The agent answers.

You review.

You find the mistake.

You prompt again.

That works, but it does not scale.

The old way:

- You give a prompt
- The agent gives an output
- You review the output
- You fix the weak parts
- You repeat manually

The new way:

- You define the goal
- The loop discovers what is needed
- The loop plans the work
- The agent executes
- A checker verifies the result
- The loop fixes failures
- The system stops when the goal is reached

Prompting gives an agent an instruction.

Loop engineering gives an agent a job.

---

### What Loop Engineering Actually Is

Loop engineering is the practice of designing repeatable feedback cycles for AI agents.

The goal is simple:

Get from attempt to verified result without needing a human to manually drive every step.

The basic cycle has five stages:

1. Discover
2. Plan
3. Execute
4. Verify
5. Iterate

If the output passes, ship it.

If it fails, send it back into the loop.

That is the whole idea.

Not one perfect prompt.

A system that keeps improving the output until it meets the standard.

---

### Single Agent vs Fleet

There are two basic sizes of loops.

#### Single-Agent Loop

One agent runs the whole cycle.

It discovers what is needed, plans the work, executes the task, checks the result, and improves it if something fails.

This is like one person rewriting their own draft.

Good for:

- Focused tasks
- Small scopes
- Simple goals
- Content drafts
- Bug fixes
- Research summaries

One brain.

One loop.

Self-improvement.

---

Fleet Loop

A fleet loop is bigger.

You give one orchestrator agent the main goal.

It breaks the work into pieces.

Then it sends those pieces to specialist agents.

Each specialist can also use smaller subagents for narrow tasks.

Example:

```plaintext
Example: "Build a productivity app"

Orchestrator owns the mission
    ↓              ↓              ↓
Research      Engineering        QA
Specialist    Specialist         Specialist
    ↓              ↓              ↓
Web           Code Writer        Test Writer
Researcher    + Debugger         + Bug Tracker
```

This is not one agent working alone.

It is closer to a small team running a project end to end.

---

### Open Loops vs Closed Loops

This is the most important practical distinction.

Not all loops are equal.

### Open Loops

Open loops are exploratory.

You give the agent a broad goal and let it search for the path.

This is powerful because the agent can discover things you did not specify.

But it is also expensive and messy.

Open loops can:

- Try too many paths
- Burn too many tokens
- Create low-quality output fast
- Drift away from the real goal
- Become hard to control
- Open loops are exciting.

But for most people, they are not the best place to start.

---

### Closed Loops

Closed loops are bounded.

The human designs the path first.

The loop still runs on its own, but inside clear rules.

A closed loop has:

- Clear goal
- Defined steps
- Evaluation after each step
- Stop condition
- Hand-off point if it gets stuck
- This is the version that actually pays off today.

It is cheaper.

It is more reliable.

It produces cleaner output.

Start with closed loops.

Open them up later when your checks are strong.

---

### The 6 Building Blocks Of A Good Loop
Conceptually, every loop has five stages.

But practically, you need six building blocks to make the loop work.

#### 1. Automations

This is the heartbeat.

The automation starts the loop without you manually remembering to run it.

Examples:

- Run every morning
- Run when a PR opens
- Run when a file changes
- Run when a new ticket appears
- Run until all tests pass

If you still need to start everything manually, the loop is not really doing enough work.

#### 2. Worktrees

Worktrees matter when multiple agents are editing code.

Without separation, agents collide.

Two agents can edit the same file.

One can overwrite the other.

A worktree gives each agent its own clean workspace and branch.

That lets multiple agents work in parallel without turning the repo into a mess.

#### 3. Skills

Skills are reusable project knowledge.

Instead of explaining your project every time, you write the important context once.

Good skill files include:

- Vision
- Architecture
- Rules
- Build steps
- Testing steps
- Things the agent must never do

Without skills, every loop starts cold.

With skills, every loop starts with accumulated context.

#### 4. Plugins And Connectors

A loop that only sees files is limited.

Connectors let the loop touch your real tools.

Examples:

- GitHub
- Slack
- Linear
- Jira
- Gmail
- Google Drive
- Database
- Staging API

This is the difference between "here is a suggested fix" and "I opened the PR, linked the ticket, watched CI, and posted the update."

#### 5. Subagents

The maker and checker should not always be the same model.

The agent that wrote the code will often be too generous when reviewing it.

The agent that wrote the article will miss its own weak sections.

Use separate agents for:

- Exploration
- Implementation
- Review
- Testing
- Fact-checking
- Final summary

Quality improves when the reviewer is not the same agent that made the work.

#### 6. Memory

Memory is what lets a loop continue across runs.

The model forgets.

The repo does not.

The notes do not.

The project log does not.

Memory can live in:

- Markdown files
- Project logs
- Linear tickets
- GitHub issues
- Obsidian vaults
- Databases
- Claude Projects

A long-running loop needs to know what was tried, what passed, what failed, and what still needs to happen.

Without memory, it starts from zero every time.

---

### Real Loop Examples

Here are the loops that make the idea concrete.

#### Coding Loop
The loop:

```plaintext
Read VISION.md + ARCHITECTURE.md
↓
Plan next change
↓
Edit code
↓
Run tests
↓
If tests fail → read error → fix → test again
↓
If tests pass → summarize changes
↓
Stop
```

No human needs to push every step.

The agent writes, tests, fixes, and verifies.

#### Research Loop

The loop:

```plaintext
Define research question
↓
Search for sources
↓
Summarize findings
↓
Verify claims against sources
↓
Compare conflicting information
↓
Synthesize final answer
↓
Stop when confidence threshold met
```

This is much better than asking for one quick summary.

#### Content Loop

The loop:

```plaintext
Topic + audience + goal defined
↓
Draft created
↓
Critique agent reviews draft
↓
Rewrite based on critique
↓
Score against success criteria
↓
If score passes → publish
↓
If score fails → rewrite again
The loop turns one idea into a content system.
```

#### Sales Outreach Loop

The loop:

```plaintext
ICP (Ideal Customer Profile) defined
↓
Find leads matching profile
↓
Enrich with company data
↓
Qualify against criteria
↓
Personalize message
↓
Quality review
↓
Send or escalate to human
```

Same skeleton:

Goal.

Action.

Check.

Fix.

Repeat until done.

### Prompt Engineer vs Loop Engineer

This is the skill gap opening in 2026

#### Prompt Engineer
A prompt engineer focuses on better instructions.

They improve the wording.

They get a better single output.

But the human still reviews everything after the run.

The human is still the feedback loop.

### Loop Engineer
A loop engineer designs the feedback system.

They decide:

- What starts the loop
- What context the agent needs
- What tools it can use
- What counts as success
- Who checks the work
- When the loop should stop
- Where the result should be saved

A prompt engineer says:

_"Write me a function."_

A loop engineer says:

_"Write it, test it, fix it until it passes, then summarize the change."_

Same tools.

Different mindset.

The highest-leverage AI builders are not just writing better English prompts.

They are designing systems that discover, plan, execute, verify, and stop correctly.

### The Short Version

Loop engineering is the shift from manual prompting to automated feedback cycles.

The shift:

- Old way: Prompt agents one task at a time
- New way: Design loops that run the full cycle

The 6 things you actually build:

- Automations: The heartbeat that starts the loop
- Worktrees: Parallel agents without file conflicts
- Skills: Project knowledge reused every run
- Plugins and connectors: Access to real tools
- Subagents: Makers and checkers separated
- Memory: The loop remembers across runs

The 2 sizes:

- Single-agent loop: One agent improves its own work
- Fleet loop: Orchestrator plus specialists plus subagents

The 2 types:

- Open loop: Powerful, exploratory, expensive
- Closed loop: Bounded, reliable, affordable

The 5 stages:

1. Discover
2. Plan
3. Execute
4. Verify
5. Iterate

The real cost problem:

- Loops burn tokens fast
- Cheap long-context models make loops practical
- Without affordable tokens, most people never get past experiments

The mindset shift:

- Prompt engineers ask AI for outputs
- Loop engineers design systems that produce verified outcomes

That is the real unlock.

Stop trying to write one perfect prompt.

Start building the loop that makes imperfect outputs better.

A reliable loop beats a perfect prompt.

---

If you read this far:

- BOOKMARK THIS.
- Follow @0xwhrrari
- Follow my Private Telegram Channel

---

Also you can read other articles:

- [How I set up Obsidian + Claude as my second brain](https://x.com/0xwhrrari/status/2063231716974584157)
- [How I set up Claude to actually get work done](https://x.com/0xwhrrari/status/2060017822172864745)
- [How I set up Claude projects so they actually work](https://x.com/0xwhrrari/status/2064288737442365925)
- [30 Claude system prompts I actually use](https://x.com/0xwhrrari/status/2065012527864430730)

