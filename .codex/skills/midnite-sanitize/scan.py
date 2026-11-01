#!/usr/bin/env python3
"""midnite-sanitize mechanical scanner.

Reads a directory (a skill, plugin, MCP server or repo) and reports what an agent should look at
before trusting it. Stdlib only, read-only: it never imports, executes or writes anything from the
target. Run it with `python3 -I scan.py <dir>` so nothing in the target can shadow a module.

Exit codes: 0 no HIGH findings, 1 at least one HIGH finding, 2 bad input.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}
MAX_BYTES = 2_000_000
PROSE_EXT = {".md", ".markdown", ".txt", ".mdx", ".rst", ".yaml", ".yml", ".json", ".toml"}
CODE_EXT = {
    ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sh", ".bash", ".zsh", ".fish", ".rb",
    ".go", ".rs", ".ps1", ".bat", ".cmd", ".cmake", ".cpp", ".c", ".h", ".hpp", ".java", ".kt",
    ".php", ".pl", ".lua", ".swift",
}
CODE_NAMES = {"Makefile", "CMakeLists.txt", "Dockerfile", "justfile", "Rakefile"}

INVISIBLE = re.compile("[\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\u2066-\\u2069\\ufeff\\u00ad\\U000e0000-\\U000e007f]")

INJECTION = [
    (r"\bignore (all |any )?(the )?(previous|prior|above|earlier|other) (instructions|prompts?|rules)", "HIGH"),
    (r"\b(disregard|override|forget) (all |any )?(your |the )?(previous |prior |system )?(instructions|rules|guidelines|prompt)", "HIGH"),
    (r"\b(do not|don't|never) (tell|inform|mention|reveal|show|disclose)( this)? (to )?(the )?user", "HIGH"),
    (r"\bwithout (telling|informing|notifying) (the )?user", "HIGH"),
    (r"\b(you are now|from now on you are|act as (an? )?(unrestricted|jailbroken))", "HIGH"),
    (r"\bsystem prompt\b", "MED"),
    (r"\bwithout (asking|confirmation|confirming|permission|the user's (ok|approval))", "LOW"),
    (r"\b(rather|instead) than asking (the )?user", "LOW"),
    (r"\b(secretly|covertly)\b", "MED"),
    (r"\b(silently|quietly)\b", "LOW"),
    (r"(dangerously-?skip-?permissions|--dangerously|bypassPermissions|--no-verify)", "MED"),
    (r"(\.claude/settings|\.mcp\.json|claude mcp add|(edit|modify|append to|write to|update) [^\n]{0,30}(CLAUDE|AGENTS|GEMINI)\.md)", "MED"),
    (r"(~/\.claude\b|CLAUDE\.md|AGENTS\.md|GEMINI\.md)", "LOW"),
    (r"\b(api[_ -]?key|access[_ -]?token|password|credential|secret)s?\b", "LOW"),
    (r"\b(upload|exfiltrat|send (it|them|this|the \w+) to|post (it|them) to|webhook)", "LOW"),
    (r"\bcurl\b[^\n|]*\|\s*(ba|z)?sh\b", "HIGH"),
    (r"(\.ssh/|id_rsa|id_ed25519|\.aws/credentials|\.netrc|gh auth token|security find-\w+-password|Keychains?/|\.git-credentials)", "HIGH"),
]

CODE_RULES = [
    ("network", "MED", r"\b(urllib\.request|urlopen|requests\.(get|post|put)|http\.client|httpx|aiohttp|"
                       r"socket\.(create_connection|connect)|\.connect\(\(|fetch\(|axios|XMLHttpRequest|"
                       r"net\.(connect|createConnection)|WebSocket\(|https?\.request\()"),
    ("network", "MED", r"\b(curl|wget|nc|ncat|telnet|scp|rsync|ftp)\s+[-\w\"'$]"),
    ("exec", "MED", r"(shell\s*=\s*True|os\.system\(|os\.popen\(|\beval\(|\bexec\(|child_process|execSync|"
                    r"spawnSync|new Function\(|Invoke-Expression|\biex\b|`[^`]*\$\()"),
    ("remote-exec", "HIGH", r"\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b|iwr\b[^\n|]*\|\s*iex"),
    ("exec", "INFO", r"\b(subprocess\.(run|Popen|call|check_output|check_call)|os\.exec\w*\(|os\.spawn\w*\(|execute_process\()"),
    ("obfuscation", "HIGH", r"(b64decode|base64\s+-d|atob\(|Buffer\.from\([^)]*base64)[\s\S]{0,120}(exec|eval|Function|sh\b|bash\b)"),
    ("obfuscation", "HIGH", r"(zlib\.decompress|marshal\.loads|pickle\.loads)[\s\S]{0,80}(exec|eval)"),
    ("obfuscation", "MED", r"(chr\(\d+\)\s*\+\s*){6,}|(\\x[0-9a-fA-F]{2}){24,}"),
    ("sensitive-read", "HIGH", r"(\.ssh/|id_rsa|id_ed25519|\.aws/credentials|\.netrc|\.npmrc|\.pypirc|"
                               r"\.config/gh|gh auth token|security find-(generic|internet)-password|"
                               r"Library/Keychains|login\.keychain|Cookies\b|Login Data|\.bash_history|"
                               r"\.zsh_history|\.git-credentials|\.docker/config\.json|\.kube/config)"),
    ("sensitive-read", "MED", r"(\.claude/|\.codex/|\.gemini/|\.cursor/|(?<![\w.])\.env\b)"),
    ("sensitive-read", "LOW", r"(os\.environ\b(?!\.get\(|\[)|process\.env\b(?!\.\w))"),
    ("persistence", "HIGH", r"(crontab\b|LaunchAgents|LaunchDaemons|launchctl\s+(load|bootstrap)|systemctl\s+enable|"
                            r"\.(bash|zsh)rc\b|\.profile\b|\.bash_profile|git config --global|core\.hooksPath|"
                            r"/etc/(sudoers|hosts|profile))"),
    ("destructive", "MED", r"(rm\s+-rf\s+[~/$]|Remove-Item\s+-Recurse|git\s+(reset --hard|clean -f|push --force))"),
    ("destructive", "INFO", r"shutil\.rmtree\("),
]

AGENT_SURFACE = [
    (re.compile(r"(^|/)hooks\.json$"), "HIGH", "hooks file: runs commands on agent events"),
    (re.compile(r"(^|/)\.mcp\.json$"), "MED", "MCP server config: adds tools the agent can call"),
    (re.compile(r"(^|/)\.claude/settings(\.local)?\.json$"), "MED", "Claude settings: hooks, permissions, env"),
    (re.compile(r"(^|/)(CLAUDE|AGENTS|GEMINI)\.md$"), "MED", "agent convention file: loads as instructions when this folder is the working directory"),
    (re.compile(r"(^|/)\.githooks/|(^|/)\.husky/|(^|/)\.git/hooks/"), "MED", "git hooks"),
    (re.compile(r"(^|/)(setup\.py|setup\.cfg|conftest\.py|\.envrc|\.npmrc)$"), "MED", "runs or configures on install/test/cd"),
    (re.compile(r"(^|/)\.github/workflows/"), "INFO", "CI workflow"),
]

GENERIC_TRIGGERS = {
    "run it", "where are we", "status", "sitrep", "review", "fix it", "test it", "deploy", "ship it",
    "package it", "does it work", "does it boot", "continue", "what's next", "what do i fix next",
    "clean up", "check yourself", "help", "build it", "commit", "push", "release",
}


def rel(root, path):
    return os.path.relpath(path, root)


SELF_DIR = os.path.dirname(os.path.realpath(__file__))


def walk(root):
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        # The scanner's own folder is full of the patterns it hunts for; auditing it is a manual read.
        dirnames[:] = [d for d in dirnames
                       if d not in SKIP_DIRS and os.path.realpath(os.path.join(dirpath, d)) != SELF_DIR]
        for name in filenames:
            yield os.path.join(dirpath, name)
        for name in list(dirnames):
            full = os.path.join(dirpath, name)
            if os.path.islink(full):
                yield full


def read_text(path):
    try:
        if os.path.getsize(path) > MAX_BYTES:
            return None, "large"
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError:
        return None, "unreadable"
    if b"\0" in data[:8192]:
        return None, "binary"
    try:
        return data.decode("utf-8"), None
    except UnicodeDecodeError:
        return data.decode("latin-1"), "non-utf8"


def line_of(text, index):
    return text.count("\n", 0, index) + 1


def frontmatter(text):
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end]
    out, key = {}, None
    for line in block.splitlines():
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if m:
            key = m.group(1)
            out[key] = m.group(2).strip()
        elif key and line.startswith((" ", "\t")):
            out[key] = (out[key] + " " + line.strip()).strip()
    for k, v in out.items():
        if v.startswith((">-", ">", "|")):
            out[k] = v.lstrip(">|-").strip()
    return out


def quoted_phrases(text):
    return {p.lower().strip() for p in re.findall(r"[\"“]([^\"”]{3,60})[\"”]", text)}


def installed_triggers(dirs, exclude_root):
    found = {}
    for d in dirs:
        d = os.path.expanduser(d)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            skill = os.path.join(d, name, "SKILL.md")
            if os.path.commonpath([os.path.abspath(skill), exclude_root]) == exclude_root:
                continue
            text, _ = read_text(skill) if os.path.isfile(skill) else (None, None)
            if text:
                for phrase in quoted_phrases(frontmatter(text).get("description", "")):
                    found.setdefault(phrase, set()).add(name)
    return found


def scan(root, skills_dirs):
    root = os.path.abspath(root)
    findings, urls, inventory = [], Counter(), Counter()
    skills = []

    seen = set()

    def add(sev, area, path, line, msg):
        key = (area, path, line, msg if line is None else sev)
        if key in seen:
            return
        seen.add(key)
        findings.append({"severity": sev, "area": area, "file": rel(root, path), "line": line, "detail": msg})

    for path in walk(root):
        r = rel(root, path)
        inventory["files"] += 1
        if os.path.islink(path):
            target = os.path.realpath(path)
            inside = os.path.commonpath([target, root]) == root
            add("HIGH" if not inside else "INFO", "inventory", path, None,
                "symlink -> %s%s" % (os.readlink(path), "" if inside else " (points OUTSIDE the tree)"))
            continue
        for pattern, sev, why in AGENT_SURFACE:
            if pattern.search(r):
                add(sev, "agent-surface", path, None, why)
        if os.access(path, os.X_OK):
            inventory["executable"] += 1
        text, problem = read_text(path)
        if problem in ("binary", "large", "unreadable"):
            inventory[problem] += 1
            add("MED" if problem == "binary" else "INFO", "inventory", path, None, "%s file, not scanned" % problem)
            continue
        base = os.path.basename(path)
        ext = os.path.splitext(base)[1].lower()
        inventory["lines"] += text.count("\n") + 1

        for m in INVISIBLE.finditer(text):
            add("HIGH", "hidden-text", path, line_of(text, m.start()), "invisible/bidi/tag character U+%04X" % ord(m.group()))
            break
        for m in re.finditer(r"[A-Za-z0-9+/]{120,}={0,2}|\b[0-9a-fA-F]{160,}\b", text):
            add("MED", "hidden-text", path, line_of(text, m.start()), "long encoded blob (%d chars)" % len(m.group()))
        for m in re.finditer(r"data:[\w/+.-]+;base64,", text):
            add("MED", "hidden-text", path, line_of(text, m.start()), "data: URI")
        for m in re.finditer(r"https?://[^\s)\]>\"'`]+", text):
            urls[re.sub(r"^https?://([^/:]+).*$", r"\1", m.group())] += 1

        if ext in PROSE_EXT or base in ("SKILL.md", "README"):
            if ext in (".md", ".markdown", ".mdx"):
                for m in re.finditer(r"<!--([\s\S]*?)-->", text):
                    add("MED", "hidden-text", path, line_of(text, m.start()), "HTML comment (invisible when rendered): %r" % m.group(1).strip()[:100])
                m = re.search(r"\n{25,}\S", text)
                if m:
                    add("MED", "hidden-text", path, line_of(text, m.end()), "text after a long run of blank lines")
            for pattern, sev in INJECTION:
                for m in re.finditer(pattern, text, re.IGNORECASE):
                    start = text.rfind("\n", 0, m.start()) + 1
                    end = text.find("\n", m.end())
                    snippet = text[start:end if end > 0 else None].strip()[:160]
                    add(sev, "prompt-injection", path, line_of(text, m.start()), snippet)
            if base == "package.json":
                try:
                    scripts = json.loads(text).get("scripts", {})
                except (ValueError, AttributeError):
                    scripts = {}
                for hook in ("preinstall", "install", "postinstall", "prepare", "prepublish"):
                    if hook in scripts:
                        add("HIGH", "agent-surface", path, None, "lifecycle script %s: %s" % (hook, scripts[hook]))
            if base in ("plugin.json", "marketplace.json") or r.endswith("settings.json"):
                for key in ("hooks", "mcpServers", "permissions", "env", "apiKeyHelper", "statusLine"):
                    if re.search(r'"%s"\s*:' % key, text):
                        add("HIGH" if key in ("hooks", "apiKeyHelper") else "MED", "agent-surface", path, None,
                            'manifest declares "%s"' % key)

        if base == "SKILL.md":
            fm = frontmatter(text)
            skills.append({"file": r, "name": fm.get("name", ""), "description": fm.get("description", "")})
            tools = fm.get("allowed-tools", "")
            if tools:
                broad = re.search(r"\bBash\b(?!\()|Bash\(\*\)|\*", tools)
                add("MED" if broad else "INFO", "frontmatter", path, None, "allowed-tools: %s" % tools)
            for key in ("model", "disable-model-invocation", "hooks"):
                if key in fm:
                    add("MED" if key == "hooks" else "INFO", "frontmatter", path, None, "%s: %s" % (key, fm[key]))
            if len(fm.get("description", "")) > 1024:
                add("LOW", "frontmatter", path, None, "description is %d chars (wide auto-trigger surface)" % len(fm["description"]))

        if ext in CODE_EXT or base in CODE_NAMES or text.startswith("#!"):
            for area, sev, pattern in CODE_RULES:
                for m in re.finditer(pattern, text):
                    start = text.rfind("\n", 0, m.start()) + 1
                    end = text.find("\n", m.end())
                    add(sev, area, path, line_of(text, m.start()), text[start:end if end > 0 else None].strip()[:160])

    others = installed_triggers(skills_dirs, root) if skills_dirs else {}
    for s in skills:
        phrases = quoted_phrases(s["description"])
        for p in sorted(phrases):
            owners = others.get(p)
            if owners:
                add("MED", "trigger-collision", os.path.join(root, s["file"]), None,
                    '"%s" also triggers installed skill(s): %s' % (p, ", ".join(sorted(owners))))
            elif p in GENERIC_TRIGGERS:
                add("LOW", "trigger-collision", os.path.join(root, s["file"]), None, 'generic trigger phrase "%s"' % p)

    order = {"HIGH": 0, "MED": 1, "LOW": 2, "INFO": 3}
    findings.sort(key=lambda f: (order[f["severity"]], f["area"], f["file"], f["line"] or 0))
    return {"root": root, "inventory": dict(inventory), "skills": skills,
            "domains": dict(urls.most_common()), "findings": findings}


def render(report):
    out = ["## midnite-sanitize scan: `%s`" % report["root"], ""]
    inv = report["inventory"]
    out.append("Files %d · lines %d · executable %d · binary %d · skills %d" % (
        inv.get("files", 0), inv.get("lines", 0), inv.get("executable", 0), inv.get("binary", 0), len(report["skills"])))
    counts = Counter(f["severity"] for f in report["findings"])
    out.append("Findings: HIGH %d · MED %d · LOW %d · INFO %d" % tuple(counts.get(k, 0) for k in ("HIGH", "MED", "LOW", "INFO")))
    out.append("")
    if report["findings"]:
        out += ["| Sev | Area | Where | Detail |", "|---|---|---|---|"]
        for f in report["findings"]:
            where = f["file"] + (":%d" % f["line"] if f["line"] else "")
            out.append("| %s | %s | `%s` | %s |" % (f["severity"], f["area"], where, " ".join(f["detail"].split()).replace("|", "\\|")))
        out.append("")
    if report["domains"]:
        out.append("**Domains referenced:** " + ", ".join("%s (%d)" % kv for kv in report["domains"].items()))
        out.append("")
    if report["skills"]:
        out.append("**Skills:** " + ", ".join("`%s`" % (s["name"] or s["file"]) for s in report["skills"]))
    out.append("")
    out.append("_A clean scan is necessary, not sufficient: read every SKILL.md and spawn site before a verdict._")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("target", help="directory to scan")
    ap.add_argument("--json", action="store_true", help="print JSON instead of markdown")
    ap.add_argument("--skills-dir", action="append", default=[],
                    help="a directory of installed skills to check trigger collisions against (repeatable)")
    args = ap.parse_args(argv)
    if not os.path.isdir(args.target):
        print("not a directory: %s" % args.target, file=sys.stderr)
        return 2
    report = scan(args.target, args.skills_dir)
    print(json.dumps(report, indent=2) if args.json else render(report))
    return 1 if any(f["severity"] == "HIGH" for f in report["findings"]) else 0


if __name__ == "__main__":
    sys.exit(main())
