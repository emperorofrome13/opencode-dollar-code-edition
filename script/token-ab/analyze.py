#!/usr/bin/env python3
"""Tokenize the request bodies captured by run.ts and print the A/B delta.

Usage: python analyze.py [capture_dir] [tag]
Requires: pip install tiktoken
"""
import json
import os
import sys

import tiktoken

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
TAG = sys.argv[2] if len(sys.argv) > 2 else ""
enc = tiktoken.get_encoding("o200k_base")


def tok(s):
    return len(enc.encode(s))


def reqs(name):
    path = os.path.join(OUT, name)
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(json.loads(line)["body"]))
    return out


def is_title(b):
    return "Generate a title for this conversation" in json.dumps(b)


def system_text(b):
    parts = []
    for m in b.get("messages", []):
        if m.get("role") == "system":
            c = m.get("content")
            if isinstance(c, str):
                parts.append(c)
            elif isinstance(c, list):
                parts += [p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text"]
    return "\n".join(parts)


def tool_result(b):
    for m in b.get("messages", []):
        if m.get("role") == "tool":
            c = m.get("content")
            if isinstance(c, str):
                return c
            if isinstance(c, list):
                return "\n".join(p.get("text", "") for p in c if isinstance(p, dict))
    return None


def main_req(rs):
    for b in rs:
        if not is_title(b):
            return b
    return None


up = reqs(f"cap-upstream{TAG}.jsonl")
fk = reqs(f"cap-fork{TAG}.jsonl")
um, fm = main_req(up), main_req(fk)
if not um or not fm:
    raise SystemExit(f"missing captures in {OUT} (tag={TAG!r})")

print("===== FIRST REQUEST (system prompt + tool definitions) =====")
rows = [
    ("raw request body", tok(json.dumps(um)), tok(json.dumps(fm))),
    ("messages JSON", tok(json.dumps(um.get("messages", []))), tok(json.dumps(fm.get("messages", [])))),
    ("system prompt", tok(system_text(um)), tok(system_text(fm))),
    ("tools JSON", tok(json.dumps(um.get("tools", []))), tok(json.dumps(fm.get("tools", [])))),
]
for label, a, b in rows:
    print(f"  {label:<20} upstream={a:>7}  fork={b:>7}  delta={b - a:>7}")

ut, ft = {t["function"]["name"]: t for t in um.get("tools", [])}, {t["function"]["name"]: t for t in fm.get("tools", [])}
print("\n  per-tool:")
for name in sorted(set(ut) | set(ft)):
    a = tok(json.dumps(ut.get(name))) if name in ut else 0
    b = tok(json.dumps(ft.get(name))) if name in ft else 0
    if a != b:
        print(f"    {name:<14}{a:>7} -> {b:>7}  delta={b - a:>7}")

print("\n===== TOOL OUTPUT TRUNCATION (if a tool call was captured) =====")
utc, ftc = None, None
for b in up:
    if tool_result(b) is not None:
        utc = tool_result(b)
for b in fk:
    if tool_result(b) is not None:
        ftc = tool_result(b)
if utc is not None and ftc is not None:
    print(f"  upstream tool result: chars={len(utc):>7} bytes={len(utc.encode()):>7} tokens={tok(utc):>6}")
    print(f"  fork     tool result: chars={len(ftc):>7} bytes={len(ftc.encode()):>7} tokens={tok(ftc):>6}")
    print(f"  delta tokens: {tok(ftc) - tok(utc)}")
else:
    print("  (no tool call in this capture; set MOCK_TOOL or tool.json)")
