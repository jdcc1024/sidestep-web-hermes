# Issue: DAG Viewer Server Shells Out Unsanitized Input

## Status: pending

## Phase: 3

## Type: bug

## Description

`scripts/serve-dag.js` gained a `POST /api/node-status` endpoint in `a278c48`
so the viewer's buttons could block, park, and unblock nodes. It builds a shell
command as a **string** and runs it:

```js
const safeReason = (reason || 'Blocked via DAG Viewer UI').replace(/"/g, '\\"');
cmd = `node scripts/dag-update.js fail ${nodeId} "${safeReason}"`;
execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
```

Four things compound here:

1. **`nodeId` is interpolated raw and unquoted.** `{"nodeId":"x & calc",
   "action":"unblock"}` runs `calc`. `execSync` goes through `cmd.exe` on
   Windows and `/bin/sh` elsewhere, so `&`, `;`, backticks and `$()` are all
   live metacharacters.
2. **`safeReason` / `safeQuestion` escape only the double quote.** Backticks and
   `$(…)` survive on POSIX, and backslash-escaping a quote isn't a cmd.exe
   concept at all.
3. **`server.listen(PORT)` passes no host**, so Node binds `0.0.0.0` — the
   endpoint is reachable from anything on the same network, not just loopback.
4. **No authentication, `Access-Control-Allow-Origin: *`, and an OPTIONS
   handler that allows `Content-Type`** — so a preflighted `application/json`
   POST from any web page the developer happens to have open also succeeds.

Net effect: while `node scripts/serve-dag.js` is running, any device on the
network — or any website open in the developer's browser — can execute
arbitrary commands as the developer. This is local dev tooling that never
ships, so the blast radius is one laptop; that laptop is also where the Convex
and Clerk keys live.

Found in the `/review-batch` pass over `a278c48`, whose commit message —
"docs: adjust some planned tasks" — describes none of this.

## Acceptance Criteria

- [ ] No shell is involved: the endpoint uses `execFileSync`/`spawnSync` with an
      argument array, never an interpolated command string
- [ ] `nodeId` is validated against an allowlist pattern (`/^[A-Za-z0-9-]+$/`)
      and rejected with 400 otherwise
- [ ] Reason/question text reaches `dag-update.js` as a single argv element with
      no escaping logic of its own
- [ ] The server binds `127.0.0.1`, not every interface
- [ ] `Access-Control-Allow-Origin` is not `*` for the POST route
- [ ] A test (or a documented manual check) proves an injected `nodeId` such as
      `x & echo pwned` is rejected rather than executed

## Dependencies

- Blocked by: none

## Notes

- `scripts/serve-dag.js` is **not** on the list of files
  `scripts/ralph-prompt.md` forbids the loop from touching (that list is
  `verify.mjs`, `dag-update.js`, `snap.mjs`, `ralph-prompt.md`), so an agent may
  fix this. Do not "fix" it by editing `dag-update.js`.
- `execFileSync('node', [path.join(ROOT,'scripts/dag-update.js'), 'fail', nodeId,
  reason], { cwd: ROOT })` removes the injection surface completely — there is no
  string for a metacharacter to live in. The allowlist and the loopback bind are
  belt-and-braces on top.
- Binding loopback costs nothing: the viewer is opened at
  `http://localhost:3100/dag-viewer.html` by design.
- Worth checking `dag-viewer.html`'s own fetch call at the same time — it posts
  `application/json` to `/api/node-status`, which is fine once the server side
  stops shelling out.
