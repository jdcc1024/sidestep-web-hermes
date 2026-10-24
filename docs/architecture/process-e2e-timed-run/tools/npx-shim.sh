#!/usr/bin/env bash
# Timing shim for `npx convex run` (card t_1ccf624f). Everything else passes through.
REAL=/home/jdcc/.local/bin/npx
LOG="${CONVEX_RUN_LOG:-/home/jdcc/.hermes/profiles/ss-architect/cache/scratch/timed/convex-run.tsv}"
if [[ "$1" == "convex" && "$2" == "run" ]]; then
  t0=$(date +%s%3N)
  "$REAL" "$@"
  rc=$?
  t1=$(date +%s%3N)
  printf '%s\t%s\t%s\t%s\n' "$t0" "$t1" "$3" "$rc" >> "$LOG"
  exit $rc
fi
exec "$REAL" "$@"
