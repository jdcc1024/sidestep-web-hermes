#!/usr/bin/env python3
"""Side probe during the timed run (card t_1ccf624f): every 15 s, time one Clerk FAPI
call, one Convex HTTP call, one dev-server page, plus load and swap. Prints no secrets."""
import base64, json, os, sys, time, urllib.request, ssl

env = {}
for line in open("/home/jdcc/sidestep-web-hermes/.env.local"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
pk = env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"].split("_", 2)[2]
fapi = base64.b64decode(pk + "=" * (-len(pk) % 4)).decode().rstrip("$")
convex = env["NEXT_PUBLIC_CONVEX_URL"].rstrip("/")
targets = {
    "clerk_fapi": f"https://{fapi}/v1/environment",
    "convex_http": f"{convex}/version",
    "next_dev_home": "http://localhost:8080/",
}
out = open(sys.argv[1], "a")
stop = sys.argv[2]
ctx = ssl.create_default_context()
while not os.path.exists(stop):
    row = {"t": int(time.time() * 1000)}
    for name, url in targets.items():
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(url, timeout=30, context=ctx if url.startswith("https") else None) as r:
                r.read()
                row[name] = round((time.monotonic() - t0) * 1000)
        except Exception as e:
            row[name] = None
            row[name + "_err"] = type(e).__name__ + ":" + str(getattr(e, "code", ""))
    row["load1"] = float(open("/proc/loadavg").read().split()[0])
    mem = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
    row["mem_avail_mb"] = mem["MemAvailable"] // 1024
    row["swap_free_mb"] = mem["SwapFree"] // 1024
    out.write(json.dumps(row) + "\n"); out.flush()
    time.sleep(15)
