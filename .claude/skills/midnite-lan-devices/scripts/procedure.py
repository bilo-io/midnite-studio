#!/usr/bin/env python3
"""Step-by-step device procedures, reported through the sitrep views.

The agent runs each step itself (the `how` line in references/procedures.json says what) and logs it
here; this script keeps the clock, works out which steps are ready, skipped or awaiting the user's
OK, and renders the four views the midnite-sitrep skills define: the step table, the fork graph, the
step-duration histogram and the run timeline.

  procedure.py plan    <playbook>                      # before running: table + graph + timeline (estimates)
  procedure.py init    <run.jsonl> <playbook> <device> # start a run log (keep it in the session scratchpad)
  procedure.py next    <run.jsonl>                     # what can run now, what awaits an OK
  procedure.py start   <run.jsonl> <step>
  procedure.py end     <run.jsonl> <step> <pass|warn|fail|declined|blocked> [--branch WHEN] [--note TEXT]
  procedure.py report  <run.jsonl> [--views table,graph,histogram,timeline]

Standard library only. Run with `python3 -I`.
"""
import argparse
import json
import os
import statistics
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PROCEDURES = os.path.join(HERE, '..', 'references', 'procedures.json')

KIND = {'probe': '🔍', 'read': '📖', 'decision': '🔀', 'prompt': '🔓', 'write': '✍️', 'manual': '👤'}
OUTCOME = {'pass': '✅', 'warn': '⚠️', 'fail': '🔴', 'declined': '👎', 'blocked': '⛔'}
STATE = {'waiting': '⬜', 'ready': '🟢', 'confirm': '⏳', 'running': '🟡', 'skipped': '⏭️'}
DONE_OUTCOMES = {'pass', 'warn', 'fail', 'declined'}  # a step that ran; `blocked` never ran
PARTIAL = ' ▏▎▍▌▋▊▉'


def load_playbook(name):
    with open(PROCEDURES, encoding='utf-8') as fh:
        books = json.load(fh)
    book = books.get(name) or books['generic']
    return (name if name in books else 'generic'), book


def fmt_s(sec):
    if sec is None:
        return '—'
    if sec < 60:
        return f'{sec:.1f}s'
    m, s = divmod(int(round(sec)), 60)
    return f'{m}m {s:02d}s'


# ── run log ──────────────────────────────────────────────────────────────────────────────────────

def read_run(path):
    header, events = None, []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get('type') == 'init':
                header = rec
            else:
                events.append(rec)
    if header is None:
        sys.exit(f'{path}: no init line — run `procedure.py init` first')
    return header, events


def append(path, rec):
    with open(path, 'a', encoding='utf-8') as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + '\n')


# ── state ────────────────────────────────────────────────────────────────────────────────────────

def compute(book, events, now=None):
    """Per step: status, outcome, start, end, branch, note. Order follows the playbook."""
    steps = book['steps']
    info = {s['id']: {'step': s, 'status': 'waiting', 'outcome': None, 'start': None, 'end': None,
                      'branch': None, 'note': ''} for s in steps}
    for ev in events:
        row = info.get(ev['step'])
        if row is None:
            continue
        if ev['type'] == 'start':
            row['start'] = ev['t']
            row['status'] = 'running'
        elif ev['type'] == 'end':
            row['end'] = ev['t']
            row['start'] = row['start'] if row['start'] is not None else ev['t']
            row['outcome'] = ev['outcome']
            row['branch'] = ev.get('branch')
            row['note'] = ev.get('note', '')
            row['status'] = 'done' if ev['outcome'] in DONE_OUTCOMES else 'blocked'

    def taken_target(dec_row):
        for br in dec_row['step'].get('branches', []):
            if br['when'] == dec_row['branch']:
                return br['next']
        return None

    def edge_live(need_id, child_id):
        need = info[need_id]
        if need['status'] != 'done':
            return False
        targets = [b['next'] for b in need['step'].get('branches', [])]
        if child_id not in targets:
            return True  # a plain child of this step
        return taken_target(need) == child_id

    changed = True
    while changed:  # settle ready/skipped until nothing moves
        changed = False
        for s in steps:
            row = info[s['id']]
            if row['status'] not in ('waiting', 'ready', 'confirm', 'skipped'):
                continue
            needs = s.get('needs', [])
            resolved = all(info[n]['status'] in ('done', 'skipped', 'blocked') for n in needs)
            if not resolved:
                new = 'waiting'
            elif not needs or any(edge_live(n, s['id']) for n in needs):
                new = 'confirm' if s.get('changesDevice') else 'ready'
            else:
                new = 'skipped'
            if new != row['status']:
                row['status'] = new
                changed = True
    return info


def ready_time(info, sid, run_start):
    ends = [info[n]['end'] for n in info[sid]['step'].get('needs', []) if info[n]['end'] is not None]
    return max(ends) if ends else run_start


def row_label(info, sid, idw):
    return f"{sid.ljust(idw)}  {info[sid]['step']['label']}"


def mark(row):
    if row['status'] in ('done', 'blocked'):
        return OUTCOME[row['outcome']]
    return STATE[row['status']]


# ── views ────────────────────────────────────────────────────────────────────────────────────────

def view_table(book, info, title, now):
    lines = [f'#### 🧭 Procedure · {title}', '',
             '| # | Step | Kind | Status | Took | Est | Branch | Notes |',
             '|---|---|---|---|---|---|---|---|']
    for i, s in enumerate(book['steps'], 1):
        row = info[s['id']]
        took = None
        if row['start'] is not None:
            took = (row['end'] if row['end'] is not None else now) - row['start']
        note = row['note'] or ('awaiting your OK' if row['status'] == 'confirm' else s.get('manualPath', '') if
                               s['kind'] == 'manual' and row['status'] == 'ready' else '')
        note = ' '.join(note.split()[:6]) or '—'
        lines.append(f"| {i} | `{s['id']}` {s['label']} | {KIND[s['kind']]} | {mark(row)} | {fmt_s(took)} | "
                     f"{fmt_s(s.get('expectedS'))} | {row['branch'] or '—'} | {note} |")
    live = [r for r in info.values() if r['status'] != 'skipped']
    done = [r for r in live if r['status'] in ('done', 'blocked')]
    pct = round(100 * len(done) / len(live)) if live else 0
    cells = round(pct / 10)
    started = [r['start'] for r in info.values() if r['start'] is not None]
    elapsed = (now - min(started)) if started else 0
    left = sum(r['step'].get('expectedS', 0) for r in live if r['status'] not in ('done', 'blocked'))
    lines += ['', f"`{'█' * cells}{'░' * (10 - cells)}` {pct}% · {len(done)}/{len(live)} steps · "
                  f"{fmt_s(elapsed)} elapsed · ~{fmt_s(left)} left (estimates)"]
    return '\n'.join(lines)


def view_graph(book, info, title):
    steps = book['steps']
    order = {s['id']: i for i, s in enumerate(steps)}
    children = {s['id']: [c['id'] for c in steps if s['id'] in c.get('needs', [])] for s in steps}
    # A join node is drawn in full under its last parent; elsewhere it is a bare reference.
    def live(parent, child):
        prow = info[parent]
        if prow['status'] != 'done':
            return False
        targets = {b['next']: b['when'] for b in prow['step'].get('branches', [])}
        return child not in targets or targets[child] == prow['branch']

    # Draw a join node under the last need on the path the run took, else under its last need.
    home = {}
    for s in steps:
        if s.get('needs'):
            taken = [n for n in s['needs'] if live(n, s['id'])]
            home[s['id']] = max(taken or s['needs'], key=order.get)
    used = set()
    out = []

    def label(sid):
        row = info[sid]
        took = ''
        if row['end'] is not None and row['start'] is not None:
            took = f" · {fmt_s(row['end'] - row['start'])}"
        return f"{mark(row)} {sid} · {row['step']['label']}{took}"

    def edge(parent, child):
        prow = info[parent]
        br = next((b for b in prow['step'].get('branches', []) if b['next'] == child), None)
        if br is None:
            return '──▶ '
        used.add('fork')
        if prow['status'] != 'done' or prow['branch'] is None:
            return f"─ {br['when']} ──▶ "
        return f"─ {br['when']} ━━▶ " if prow['branch'] == br['when'] else f"─ {br['when']} ┄┄▶ "

    def walk(sid, prefix):
        kids = children[sid]
        for i, kid in enumerate(kids):
            last = i == len(kids) - 1
            branch = '└' if last else '├'
            if home.get(kid) == sid:
                out.append(f'{prefix}{branch}{edge(sid, kid)}{label(kid)}')
                walk(kid, prefix + ('     ' if last else '│    '))
            else:
                used.add('ref')
                out.append(f'{prefix}{branch}{edge(sid, kid)}{kid}')

    for s in steps:
        if not s.get('needs'):
            out.append(label(s['id']))
            walk(s['id'], '')
    rank = list(OUTCOME) + list(STATE)
    seen = {(r['outcome'] if r['status'] in ('done', 'blocked') else r['status']) for r in info.values()}
    names = {'confirm': 'awaiting OK'}
    legend = '  '.join(f"{(OUTCOME | STATE)[k]} {names.get(k, k)}" for k in rank if k in seen)
    legend += '   ──▶ needs'
    if 'fork' in used:
        legend += '   ━━▶ branch taken   ┄┄▶ branch not taken'
    if 'ref' in used:
        legend += '   bare id = drawn in full elsewhere'
    bar = '─' * min(len(legend), 100)
    return '\n'.join([f'#### 🔀 Fork graph · {title}', '', '```', legend, bar, ''] + out + ['```'])


def view_histogram(book, info, title):
    rows = [(sid, r['end'] - r['start']) for sid, r in info.items()
            if r['start'] is not None and r['end'] is not None]
    if not rows:
        return f'#### 📊 Histogram · step duration · {title}\n\nNo step has finished yet.'
    rows.sort(key=lambda kv: -kv[1])
    shown, extra = (rows[:12], len(rows) - 12) if len(rows) > 15 else (rows, 0)
    top = max(v for _, v in rows) or 1
    med = statistics.median(v for _, v in rows)
    idw = max(len(sid) for sid, _ in shown)
    width = max(len(row_label(info, sid, idw)) for sid, _ in shown)

    def bar(v):
        units = 30 * v / top
        whole, frac = int(units), units - int(units)
        s = '█' * whole + (PARTIAL[int(frac * 8)] if frac * 8 >= 1 else '')
        return s or '▏'

    vals = [fmt_s(v) for _, v in shown]
    vw = max(len(v) for v in vals)
    lines = []
    for (sid, v), vs in zip(shown, vals):
        flag = ' ⚠️' if med and v > 2 * med else ''
        lab = row_label(info, sid, idw).ljust(width)
        lines.append(f'{lab}  {bar(v).ljust(30)}  {vs.rjust(vw)}{flag}')
    if extra:
        lines.append(f'… {extra} more')
    col = width + 2 + min(29, int(30 * med / top))
    lines.append(' ' * col + f'┊ median {fmt_s(med)}')
    skipped = sum(1 for r in info.values() if r['status'] == 'skipped')
    tail = f'\n{skipped} steps skipped on untaken branches.' if skipped else ''
    return '\n'.join([f'#### 📊 Histogram · step duration · {title}', '', '```'] + lines + ['```']) + tail


def view_timeline(book, info, title, run_start, now, plan=False):
    steps = book['steps']
    sched = {}
    if plan:  # expected schedule along the first branch of every fork
        sim = []
        for _ in steps:  # settle: every pass adds the steps that became ready
            cur = compute(book, sim)
            for s in steps:
                if cur[s['id']]['status'] in ('ready', 'confirm'):
                    br = s.get('branches', [{}])[0].get('when')
                    sim += [{'type': 'start', 'step': s['id'], 't': 0},
                            {'type': 'end', 'step': s['id'], 'outcome': 'pass', 'branch': br, 't': 0}]
        info = compute(book, sim)
        t = {}
        for s in steps:
            row = info[s['id']]
            if row['status'] == 'skipped':
                continue
            st = max([t[n] for n in s.get('needs', []) if n in t] or [0])
            t[s['id']] = st + s.get('expectedS', 0)
            sched[s['id']] = (st, st, None, t[s['id']])  # ready, start, end(actual), est end
        horizon = max(t.values() or [1])
    else:
        for s in steps:
            row = info[s['id']]
            if row['start'] is None:
                continue
            rdy = ready_time(info, s['id'], run_start) - run_start
            st = row['start'] - run_start
            en = (row['end'] - run_start) if row['end'] is not None else None
            est = None if en is not None else max(now - run_start, st + s.get('expectedS', 0))
            sched[s['id']] = (min(rdy, st), st, en, est)
        horizon = max([max(v[2] or 0, v[3] or 0) for v in sched.values()] + [now - run_start, 1])
    slice_s = next(x for x in (1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800) if horizon / x <= 48)
    ncol = int(horizon // slice_s) + 1
    rows = sorted(sched.items(), key=lambda kv: kv[1][1])
    if not rows:
        return f'#### 🗓 Timeline · {title}\n\nNothing has started yet.'
    idw = max(len(sid) for sid, _ in rows[:16])
    width = max(len(row_label(info, sid, idw)) for sid, _ in rows[:16])
    ticks = ''.join(('│' if c % 6 == 0 else ' ') for c in range(ncol)).rstrip()
    labels = ''
    for c in range(0, ncol, 6):
        sec = int(c * slice_s)
        lab = f'+{sec}s' if sec < 60 else f'+{sec // 60}m{sec % 60:02d}'
        labels = labels.ljust(c) + lab
    lines = [' ' * (width + 2) + labels, ' ' * (width + 2) + ticks]
    nowc = int((now - run_start) // slice_s) if not plan else -1
    for sid, (rdy, st, en, est) in rows[:16]:
        cells = []
        for c in range(ncol):
            a, b = c * slice_s, (c + 1) * slice_s
            if en is not None and st < b and a < max(en, st + 1e-9) or (en is None and not plan and st < b and a <= now - run_start):
                cells.append('▓')
            elif est is not None and (plan or c > nowc) and st < b and a < est:
                cells.append('▒')
            elif rdy < b and a < st:
                cells.append('·')
            else:
                cells.append(' ')
        lab = row_label(info, sid, idw).ljust(width)
        lines.append(f"{lab}  {''.join(cells).rstrip()}")
    if len(rows) > 16:
        lines.append(f'… {len(rows) - 16} later steps')
    # critical path: back from the latest-ending step through its latest-ending need
    end_of = {sid: (v[2] if v[2] is not None else v[3]) for sid, v in sched.items()}
    cur = max(end_of, key=lambda k: end_of[k] or 0)
    path = [cur]
    while True:
        needs = [n for n in info[cur]['step'].get('needs', []) if n in end_of]
        if not needs:
            break
        cur = max(needs, key=lambda k: end_of[k] or 0)
        path.append(cur)
    total = max(v or 0 for v in end_of.values())
    legend = ('▒ estimated' if plan else '▓ ran  ▒ estimated  · ready, not started (a confirm or a manual step)')
    head = f'#### 🗓 Timeline · {title} · {slice_s}s columns' + ('' if plan else f' · started {time.strftime("%H:%M:%S", time.localtime(run_start))}')
    return '\n'.join([head, '', '```'] + lines + ['```',
                     f"{legend} · critical path: {' → '.join(reversed(path))}",
                     (f'Estimated length {fmt_s(total)} (from references/procedures.json, first branch of each fork)' if plan
                      else f'Run length {fmt_s(total)} (measured; ▒ rows from the estimates)')])


# ── commands ─────────────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan'); p.add_argument('playbook')
    p = sub.add_parser('init'); p.add_argument('run'); p.add_argument('playbook'); p.add_argument('device')
    p = sub.add_parser('next'); p.add_argument('run')
    p = sub.add_parser('start'); p.add_argument('run'); p.add_argument('step')
    p = sub.add_parser('end'); p.add_argument('run'); p.add_argument('step')
    p.add_argument('outcome', choices=sorted(DONE_OUTCOMES | {'blocked'}))
    p.add_argument('--branch'); p.add_argument('--note', default='')
    p = sub.add_parser('report'); p.add_argument('run')
    p.add_argument('--views', default='table,graph,histogram,timeline')
    a = ap.parse_args()
    now = time.time()

    if a.cmd == 'plan':
        name, book = load_playbook(a.playbook)
        info = compute(book, [])
        title = f"{book['label']} · plan"
        print(view_table(book, info, title, now), view_graph(book, info, title),
              view_timeline(book, info, title, now, now, plan=True), sep='\n\n')
        return
    if a.cmd == 'init':
        name, book = load_playbook(a.playbook)
        if os.path.exists(a.run):
            sys.exit(f'{a.run} exists — pick a new run file')
        append(a.run, {'type': 'init', 'playbook': name, 'device': a.device, 't': now})
        print(f'run {a.run} · {book["label"]} · {a.device}')
        return

    header, events = read_run(a.run)
    _, book = load_playbook(header['playbook'])
    ids = {s['id']: s for s in book['steps']}
    title = f"{book['label']} · {header['device']}"
    if a.cmd in ('start', 'end') and a.step not in ids:
        sys.exit(f"unknown step {a.step!r}; steps: {', '.join(ids)}")
    info = compute(book, events, now)

    if a.cmd == 'start':
        st = info[a.step]['status']
        if st == 'confirm':
            print(f"⏳ {a.step} changes the device — logged as started; make sure the user said OK for this step.")
        elif st not in ('ready',):
            sys.exit(f'{a.step} is {st}, not ready')
        append(a.run, {'type': 'start', 'step': a.step, 't': now})
        print(f'🟡 {a.step} started')
    elif a.cmd == 'end':
        s = ids[a.step]
        if s['kind'] == 'decision' and a.outcome in DONE_OUTCOMES:
            whens = [b['when'] for b in s.get('branches', [])]
            if a.branch not in whens:
                sys.exit(f"{a.step} is a fork: pass --branch one of {', '.join(whens)}")
        append(a.run, {'type': 'end', 'step': a.step, 'outcome': a.outcome, 'branch': a.branch,
                       'note': a.note, 't': now})
        took = now - (info[a.step]['start'] or now)
        print(f'{OUTCOME[a.outcome]} {a.step} · {fmt_s(took)}' + (f' · branch {a.branch}' if a.branch else ''))
        a.cmd = 'next'
        info = compute(book, read_run(a.run)[1], now)
    if a.cmd == 'next':
        ready = [s for s in book['steps'] if info[s['id']]['status'] == 'ready']
        confirm = [s for s in book['steps'] if info[s['id']]['status'] == 'confirm']
        running = [s for s in book['steps'] if info[s['id']]['status'] == 'running']
        for s in running:
            print(f"🟡 running  {s['id']} · {s['label']}")
        for s in ready:
            how = s.get('how') or s.get('manualPath') or ''
            print(f"🟢 ready    {s['id']} · {s['label']} · {KIND[s['kind']]}" + (f' · {how}' if how else ''))
        for s in confirm:
            print(f"⏳ needs OK {s['id']} · {s['label']} · {s.get('how', '')}")
        if not (ready or confirm or running):
            print('🏁 nothing left to run — `report` it')
    elif a.cmd == 'report':
        run_start = header['t']
        out = []
        for v in [x.strip() for x in a.views.split(',') if x.strip()]:
            if v == 'table':
                out.append(view_table(book, info, title, now))
            elif v == 'graph':
                out.append(view_graph(book, info, title))
            elif v == 'histogram':
                out.append(view_histogram(book, info, title))
            elif v == 'timeline':
                out.append(view_timeline(book, info, title, run_start, now))
            else:
                sys.exit(f'unknown view {v!r}')
        print('\n\n'.join(out))


if __name__ == '__main__':
    main()
