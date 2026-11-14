---
name: midnite-lan-devices
description: Discover and explore the devices on the local network (TVs, speakers, routers, printers, Macs, smart-home gear). Lists every device in a sitrep table as soon as it's called, works out what can be done with each, then uses option sheets to pick device(s) and what to explore before the deep dive. Read-only by default, and confirms before anything changes a device. Use when the user asks what's on their Wi-Fi or network, asks to find or inspect a device ("is my TV on the network", "why is the TV slow", "what's this unknown device"), or says "midnite-lan-devices" or "lan-devices".
---

Discover the devices on the network this machine is on, show them in a sitrep table, work out
what each one allows, then let the user pick device(s) and what to explore through option
sheets. Work from evidence: every claim about a device comes from something it answered.

## 0 · Guardrails (apply throughout)

- **This network only.** Stay inside the local subnet the script detects. Never probe a public
  address, and never sweep more than a /24.
- **Light probing only.** Use connect-only TCP probes on known ports, ping, SSDP, mDNS and plain
  HTTP GETs of description endpoints. Never run a full 65k-port scan, a vulnerability scanner or
  an exploit.
- **No credential guessing**, no default-password tries and no login brute force. If a device needs
  credentials or a token, say so and ask the user for them.
- **No traffic interception.** No ARP spoofing, MITM or packet capture of other devices' traffic.
- **Read-only by default.** Anything that changes a device needs the user's explicit OK *for that
  action*, given in this session: settings, power, volume, inputs, launching apps, port mappings.
  The same goes for anything that pops a prompt on the device's screen (a pairing request). Before
  asking, say what will happen on the device.
- **Private data stays local.** Never send MACs, serials, hostnames or IPs to an external service.
  That rules out online MAC-vendor lookups. A web search may use a public model number such as
  `50UR73006LA`, nothing else.
- **Honest outcomes.** Keep "not applied", "applied" and "applied and verified" (re-read after
  writing) apart. Never report a saving, a speed-up or an effect you didn't measure. If something
  can't be measured from the network, such as a TV's RAM or CPU, say so.

## 1 · Discover and show the table (do this immediately)

Run the bundled script with no preamble, and print its markdown output as your first visible
output, verbatim:

```sh
python3 -I "$SKILL_DIR/scripts/discover.py"            # ~20 s, markdown tables
python3 -I "$SKILL_DIR/scripts/discover.py" --format json > "$SCRATCH/lan.json"   # full detail
```

Run both in parallel (`$SCRATCH` = the session scratchpad; `$SKILL_DIR` = this skill's base
directory, printed when the skill loads — `~/.claude/skills/midnite-lan-devices` for the user copy). The markdown is the sitrep:
- a `📡 LAN devices` table (one row per device, with an emoji kind, an `Identified` 10-cell bar,
  the evidence, status and notes)
- a 20-cell batch line
- a `🧭 What can be done` first pass

The JSON holds the SSDP headers, UPnP descriptions, mDNS records with TXT, open ports and MACs
that the deep dive needs.

If an argument names a device, still show the full table, then highlight that row in one line
under it.

## 2 · Work out what can be done (before any deep dive)

The script's capability column is a guess from signatures. Firm it up:

1. For each playbook id present, read its section in
   [`references/playbooks.md`](references/playbooks.md).
2. Run each device's **confirm** probes (cheap, read-only, a few seconds, in parallel Bash
   calls). Examples: is the control port reachable, does the info endpoint answer, does the
   router speak UPnP IGD?
3. Replace the first-pass table with a confirmed one:

| # | Device | Can do now | Needs something | Not possible remotely |
|---|---|---|---|---|
| 2 | 📺 LG TV | ✅ identify · ✅ UPnP info | 🔓 control (pair on TV) | ⛔ RAM/CPU, processes |

Keep unknown devices in the table: a "port and service fingerprint" is still something to offer.

## 3 · Option sheet 1: which device(s)

Use `AskUserQuestion`:
- **`multiSelect: true`**, since several devices can be explored at once.
- **Up to 4 options**, from the devices with the most confirmed capabilities, or the ones the
  user's question points at.
- **Labels** like `#2 LG TV`. The description says in a few words what's possible.
- **Free text** is the tool's automatic "Other". Never add your own "Other" option. Say in the
  question text that the user can type row numbers or a name there, e.g. *"Which device(s) should
  I explore? (Other: type row numbers, e.g. 3, 8)"*. That's how devices beyond the four get
  picked.
- With fewer than 2 explorable devices, fill the sheet with `Re-scan` and `Done`.

## 4 · Option sheet 2: what to explore, per device

One `AskUserQuestion` call with **one question per chosen device** (the tool allows up to 4; batch
further devices into a second call). Options come from that device's playbook, up to 4, best
first, and the best one gets `(Recommended)`.

- **Checkboxes (`multiSelect: true`)** when the options are independent read-only checks that
  can all run (identify, status, audit, list apps).
- **Radio (`multiSelect: false`)** when the options exclude each other: a single control action, a
  depth choice (quick vs full), or anything that changes the device. One state change per sheet.
- Free text is again the automatic "Other". Mention it in the question: *"…or describe something
  else"*.
- Header chip: the device's short name (≤12 chars), e.g. `LG TV`.

## 5 · Deep dive

- **A device with a procedure** (`lg-webos`, `cast`, `router`, and `generic` for the rest): when
  the user picks more than one check, or the full dive, run it as the §6 procedure, so every step is
  timed and every fork shows up in the report. Offer `Full procedure` as the first option in §4.
- **Read-only checks:** run them straight away, in parallel where independent.
- **State changes or on-device prompts:** say exactly what will happen ("a pairing prompt
  appears on the TV; accept it with the remote") and wait for the user's OK first. After a write,
  re-read the value to verify.
- **Heavy multi-device dives:** use a subagent per device only when the work is genuinely long. It
  gets a tight brief (device row, playbook section, guardrails above) and follows the global
  subagent cap.
- **Unknown device:** use the `generic` playbook's fingerprint. A web search may use the public
  model number only.

**Report each device as a sitrep table**, then succinct bullets:

```
#### 🩺 <Device> · <YYYY-MM-DD HH:MM>

| # | Check | Coverage | Status | Notes |
|---|---|---|---|---|
| 1 | 📺 Model | ✅ 100% | ✅ 50UR73006LA | entry-level line |
| 2 | ⏱️ Latency | ✅ 100% | 🟡 avg 19 ms · max 94 ms | jittery |
| 3 | 🐛 Malware | `███░░░░░░░` 30% | ✅ no sign from outside | can't see processes |

`██████████████░░░░░░ 70% overall · 2 suspects`
```

- `Coverage` is how much of the question the evidence covers, not how good the result is.
- `Notes` are 6 words at most. Status uses the house emoji (✅ 🟡 ⚠️ 🔴 ⏳ ⛔ 🚩).
- Under the table: 3–6 bullets of findings, with the emoji marker leading each. Then a fixes table
  if one fits (# · action · where), and **one** closing line: ❓ a decision the user owes, or ➡️
  the next step.

## 6 · Procedure: step by step, reported through the sitrep views

A deep dive on a device with a procedure in
[`references/procedures.json`](references/procedures.json) (`lg-webos`, `cast`, `router`; any
other playbook falls back to `generic`) runs as a **procedure**: a graph of steps with forks, where
each step is run, timed and logged, and the report uses the same views as the sitrep family. The
playbook section in `playbooks.md` says *what* each check means; the procedure says *in what
order*, *what forks it*, and *how long it took*.

**Step kinds**: 🔍 probe · 📖 read · 🔀 decision (a fork) · 🔓 prompt (raises something on the
device) · ✍️ write · 👤 manual (the user does it on the device). A 🔓 or ✍️ step is
`changesDevice`: it shows ⏳ until the user has said OK for *that* step (§0).

**1. Plan it.** Show the plan before running anything:

```sh
python3 -I "$SKILL_DIR/scripts/procedure.py" plan lg-webos
```

It prints three views: the step table (all ⬜), the **fork graph** and the **timeline** of
estimates (first branch of each fork). Show all three, so the user can see the forks and how long
the whole thing should take before saying go.

**2. Run it, one step at a time.** Keep the run log in the scratchpad, one per device:

```sh
R="$SCRATCH/lan-run-tv.jsonl"
python3 -I "$SKILL_DIR/scripts/procedure.py" init  "$R" lg-webos "LG TV · $IP"
python3 -I "$SKILL_DIR/scripts/procedure.py" next  "$R"            # 🟢 ready · ⏳ needs OK · 🟡 running
python3 -I "$SKILL_DIR/scripts/procedure.py" start "$R" ports
#   … run the step's `how` (from `next`) …
python3 -I "$SKILL_DIR/scripts/procedure.py" end   "$R" ports pass --note "12 open, all stock"
python3 -I "$SKILL_DIR/scripts/procedure.py" end   "$R" ssap-port pass --branch open   # a fork needs --branch
```

- **Order.** Always run what `next` lists as 🟢. Steps listed together are independent: run the
  read-only ones in parallel (start each, run them in one batch of Bash calls, end each).
- **Outcomes.** `pass`, `warn` (it ran and found something), `fail` (it ran and broke), `declined`
  (the user said no to a 🔓/✍️ step, or declined it on the device), `blocked` (it could not run).
  `--note` is ≤6 words of evidence. It becomes the table's Notes cell.
- **Forks.** A 🔀 step must end with `--branch <when>`. Steps reachable only through the untaken
  branch become ⏭️ skipped by themselves. Never run a skipped step.
- **⏳ steps.** Before `start`, say exactly what will happen on the device, ask (single-select
  option sheet: `Go` / `Skip`), and log `declined` on `Skip`. The wait for the user stays inside
  the step's time, so the histogram shows what a confirm costs.
- **👤 manual steps.** Show the `manualPath` as a checklist, and end the step once it's handed
  over. A manual fix is reported as "listed", never as "applied", unless a later step re-reads it.
- **Progress while it runs.** After every 2–3 steps, or whenever a fork resolves, post
  `report "$R" --views table` (only the table, to keep it short).

**3. Report it.** When `next` says 🏁, post the full report, which is all four views in this
order:

```sh
python3 -I "$SKILL_DIR/scripts/procedure.py" report "$R"     # table, graph, histogram, timeline
```

| View | Sitrep skill it follows | Answers |
|---|---|---|
| 🧭 Step table | [`midnite-sitrep-table`](../midnite-sitrep-table/SKILL.md) | What ran, what it found, what was skipped |
| 🔀 Fork graph | [`midnite-sitrep-graph`](../midnite-sitrep-graph/SKILL.md) | Which way each fork went (━━▶ taken, ┄┄▶ not) |
| 📊 Duration histogram | [`midnite-sitrep-histogram`](../midnite-sitrep-histogram/SKILL.md) | Which step cost the time (⚠️ over 2× median) |
| 🗓 Timeline | [`midnite-sitrep-timeline`](../midnite-sitrep-timeline/SKILL.md) | When each step ran, waits (`·`), critical path |

Print the script's output verbatim. Put the §5 findings bullets, the fixes table and the one
closing line under it. Several devices give one report per device; with more than one, a 🧭
summary table goes first (one row per device: steps done / total, outcome marks, total time).

**When the `midnite` MCP server is connected** (Midnite Studio Phase 146 Theme F), prefer
`lan_discover` and `lan_procedure_run`. They run the same DAGs inside Studio and return the same
four views. Fall back to the scripts when the server is absent or the tools are not listed.

## 7 · Loop

Finish with another option sheet (single select), so the session can keep going:

- `More on <device>`
- `Another device`
- `Re-scan`
- `Done`

On `Re-scan`, go back to §1 and mark the rows that changed since the last table (🆕 new, 💤 gone).
