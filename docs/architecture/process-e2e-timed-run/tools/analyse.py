#!/usr/bin/env python3
"""Analyse the timed run (card t_1ccf624f). Inputs in the scratch dir; prints markdown-ish tables."""
import json, collections, statistics as st, sys, os
S = "/home/jdcc/.hermes/profiles/ss-architect/cache/scratch/timed"
def ms(x):  # uutils `date +%s%3N` prints seconds + UNPADDED nanoseconds; recover ms
    x = str(x).strip()
    if len(x) <= 13:
        return int(x)
    return int(x[:10]) * 1000 + int(x[10:]) // 1_000_000
meta = open(f"{S}/run.meta").read().split("\n")
t_start, t_end = ms(meta[1]), ms(meta[2])
wall = (t_end - t_start) / 1000

tests = []; steps = []
for line in open(f"{S}/steps.jsonl"):
    o = json.loads(line)
    if o["k"] == "test": tests.append(o)
    elif o["k"] == "step": steps.append(o)

runs = []
for line in open(f"{S}/convex-run.tsv"):
    a, b, fn, rc = line.rstrip("\n").split("\t")
    runs.append((ms(a), ms(b), fn, int(rc)))

print(f"wall (script) {wall/60:.2f} min; tests {len(tests)}; statuses {collections.Counter(t['status'] for t in tests)}")
ran = [t for t in tests if t["status"] != "skipped"]
sum_tests = sum(t["dur"] for t in ran) / 1000
print(f"sum of test durations {sum_tests/60:.2f} min; overhead {(wall-sum_tests)/60:.2f} min")
first_test = min(t["start"] for t in tests)
print(f"before first test (global setup + webServer check) {(first_test - t_start)/1000:.1f}s")

# convex run calls
durs = [(b - a) / 1000 for a, b, _, _ in runs]
print(f"\nconvex run calls {len(runs)}, total {sum(durs)/60:.2f} min, median {st.median(durs):.2f}s, p90 {sorted(durs)[int(.9*len(durs))]:.2f}s, max {max(durs):.2f}s, nonzero rc {sum(1 for r in runs if r[3])}")
byfn = collections.defaultdict(list)
for a, b, fn, rc in runs: byfn[fn].append((b - a) / 1000)
for fn, d in sorted(byfn.items(), key=lambda x: -sum(x[1])):
    print(f"  {fn:24s} n={len(d):3d} total {sum(d):6.1f}s median {st.median(d):.2f}s max {max(d):.2f}s")

# attribute calls to tests and to phase (inside test window vs global setup)
def owner(ts):
    for t in tests:
        if t["start"] <= ts <= t["start"] + t["dur"] + 50: return t
    return None
outside = [r for r in runs if owner(r[0]) is None]
print(f"  calls outside any test window: {len(outside)} ({sum((b-a)/1000 for a,b,_,_ in outside):.1f}s) {collections.Counter(r[2] for r in outside)}")
per_test_calls = collections.Counter()
per_test_secs = collections.defaultdict(float)
for r in runs:
    t = owner(r[0])
    if t:
        k = (t["test"], t["project"]); per_test_calls[k] += 1; per_test_secs[k] += (r[1]-r[0])/1000
cl = [r for r in runs if r[2] == "_e2e:cleanup"]
print(f"  cleanup calls {len(cl)} = {sum((b-a)/1000 for a,b,_,_ in cl):.1f}s")
vals = list(per_test_calls.values())
print(f"  calls per ran test: median {st.median(vals)}, max {max(vals)}; share of test time in convex run: {sum(per_test_secs.values())/sum_tests*100:.1f}%")
print("  top tests by convex-run seconds:")
for k, s in sorted(per_test_secs.items(), key=lambda x: -x[1])[:8]:
    print(f"    {s:5.1f}s {per_test_calls[k]:2d} calls  {k[0]} [{k[1]}]")

# per-spec time table
print("\nper spec (min, both projects):")
spec = collections.defaultdict(float); specc = collections.defaultdict(float)
for t in ran:
    f = t["test"].split(":")[0]; spec[f] += t["dur"] / 60000
    specc[f] += per_test_secs.get((t["test"], t["project"]), 0) / 60
for f, m in sorted(spec.items(), key=lambda x: -x[1]):
    print(f"  {f:42s} {m:5.2f}  convex-run {specc[f]:4.2f}")

# expect / step waits
print("\nslowest leaf steps (expect / pw:api) >= 2s:")
leaf = [s for s in steps if s["cat"] in ("expect", "pw:api")]
slow = sorted([s for s in leaf if s["dur"] >= 2000], key=lambda s: -s["dur"])
print(f"  count >=2s: {len(slow)}; >=4s: {sum(1 for s in leaf if s['dur']>=4000)}; >=7s: {sum(1 for s in leaf if s['dur']>=7000)}; total in >=2s steps {sum(s['dur'] for s in slow)/1000:.0f}s")
print(f"  expect steps: {sum(1 for s in leaf if s['cat']=='expect')}, max {max(s['dur'] for s in leaf if s['cat']=='expect')/1000:.1f}s")
for s in slow[:30]:
    print(f"  {s['dur']/1000:5.1f}s {s['cat']:7s} {s['test']} [{s['project']}] {s['title'][:110]}")

# categories totals
cat = collections.defaultdict(float)
for s in steps:
    if s["depth"] == 0: cat[s["cat"]] += s["dur"] / 1000
print("\ntop-level step time by category (s):", {k: round(v) for k, v in sorted(cat.items(), key=lambda x: -x[1])})

# fixture steps (teardown cleanup appears as fixture 'tag')
fx = collections.defaultdict(list)
for s in steps:
    if s["cat"] == "fixture": fx[s["title"]].append(s["dur"] / 1000)
print("fixture steps:", {k: (len(v), round(sum(v), 1)) for k, v in sorted(fx.items(), key=lambda x: -sum(x[1]))[:8]})

# expect steps on Clerk-dependent pages: navigation durations
nav = [s for s in steps if s["cat"] == "pw:api" and (s["title"].startswith("Navigate") or "reload" in s["title"].lower() or "Wait for" in s["title"])]
nd = [s["dur"]/1000 for s in nav]
print(f"\nnavigations {len(nav)}: total {sum(nd)/60:.2f} min, median {st.median(nd):.2f}s, p90 {sorted(nd)[int(.9*len(nd))]:.2f}s, max {max(nd):.2f}s")
byurl = collections.defaultdict(list)
import re
for s in nav:
    u = re.sub(r"[a-z0-9]{20,}", "<id>", s["title"]); u = re.sub(r"/run/[a-z0-9]+", "/run/<code>", u)
    byurl[u[:80]].append(s["dur"]/1000)
for u, d in sorted(byurl.items(), key=lambda x: -sum(x[1]))[:12]:
    print(f"  n={len(d):3d} total {sum(d):6.1f}s median {st.median(d):5.2f}s max {max(d):5.2f}s  {u}")

# probe
pr = [json.loads(l) for l in open(f"{S}/probe.jsonl")]
for k in ("clerk_fapi", "convex_http", "next_dev_home"):
    v = [p[k] for p in pr if p.get(k) is not None]
    print(f"probe {k}: n={len(v)} median {st.median(v)}ms p90 {sorted(v)[int(.9*len(v))]}ms max {max(v)}ms errors {sum(1 for p in pr if p.get(k) is None)}")
print("probe load1 median", st.median(p["load1"] for p in pr), "max", max(p["load1"] for p in pr),
      "mem_avail min", min(p["mem_avail_mb"] for p in pr), "swap_free min", min(p["swap_free_mb"] for p in pr))
json.dump({"per_test_calls": {f"{k[0]}|{k[1]}": v for k, v in per_test_calls.items()}}, open(f"{S}/per_test_calls.json", "w"))
