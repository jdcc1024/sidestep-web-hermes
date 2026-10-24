#!/usr/bin/env python3
"""Compare per-test durations across runs + list failures in .e2e-logs (card t_1ccf624f)."""
import re, json, glob, statistics as st, collections, os
S = "/home/jdcc/.hermes/profiles/ss-architect/cache/scratch/timed"
LINE = re.compile(r"[✓✘]\s+\d+\s+\[(desktop|mobile)\]\s+›\s+e2e/([^:]+):(\d+):\d+\s+›.*\(([\d.]+)(m?s)\)\s*$")
def parse_log(p):
    d = {}
    for l in open(p, errors="ignore"):
        m = LINE.search(l.rstrip())
        if m:
            v = float(m.group(4)) * (1 if m.group(5) == "s" else 0.001)
            d[(m.group(2), m.group(3), m.group(1))] = v
    return d
now = {}
for l in open(f"{S}/steps.jsonl"):
    o = json.loads(l)
    if o["k"] == "test" and o["status"] != "skipped":
        f, line = o["test"].split(":")
        now[(f, line, o["project"])] = o["dur"] / 1000
logs = {
    "10-18": "/home/jdcc/sidestep/logs/2026-10-18-0004-lightbox-e2e.log",
    "10-20": "/home/jdcc/sidestep/logs/2026-10-20-IMG-04-r2-e2e-full.log",
    "10-20b": "/home/jdcc/sidestep/logs/2026-10-20-IMG-04-r2-e2e-full3.log",
}
runs = {k: parse_log(p) for k, p in logs.items() if os.path.exists(p)}
for f in sorted(glob.glob("/home/jdcc/sidestep-web-hermes/.e2e-logs/*-full.log")):
    runs["21:" + os.path.basename(f)[:16]] = parse_log(f)
runs["10-24 now"] = now
print("runs:", {k: len(v) for k, v in runs.items()})
# match by file+title-ish: line numbers move; match on (file, project) + line, fall back to file median
base = runs.get("10-18", {})
common = [k for k in now if all(k in r for r in (runs.get("10-18", {}), runs.get("10-20", {})))]
print(f"tests with same file:line:project in 10-18, 10-20 and now: {len(common)}")
for name, r in runs.items():
    c = [k for k in common if k in r]
    if c:
        print(f"  {name:28s} sum over common {sum(r[k] for k in c)/60:5.2f} min  median {st.median(r[k] for k in c):5.1f}s  (n={len(c)})")
print("\nexamples:")
for k in sorted(common, key=lambda k: -runs['10-20'][k])[:10]:
    print("  ", f"{k[0]}:{k[1]} [{k[2]}]", " / ".join(f"{n} {runs[n].get(k, float('nan')):.1f}" for n in runs if k in runs[n]))
# per-spec totals per run (file level, robust to line moves)
print("\nper-file s/test (median) by run:")
files = sorted({k[0] for k in now})
hdr = [n for n in runs]
for f in files:
    row = []
    for n in hdr:
        v = [d for (ff, _, _), d in runs[n].items() if ff == f]
        row.append(f"{st.median(v):5.1f}" if v else "   - ")
    print(f"  {f:40s} " + " ".join(row))
print("  cols:", hdr)
