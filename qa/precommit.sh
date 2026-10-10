#!/usr/bin/env bash
# Run before every commit: auto-format, then fail on real lint errors / type errors.
# (CRLF-vs-LF "format" noise from a Windows checkout is ignored — CI checks LF files.)
set -u
cd "$(dirname "$0")/.."
bunx biome check --write apps packages qa services >/dev/null 2>&1
out=$(bunx biome check . --diagnostic-level=error --max-diagnostics=100 2>&1 | grep -E "━━" | grep -v "^check")
real=$(echo "$out" | grep -v " format " | grep -v "^$")
if [ -n "$real" ]; then echo "LINT BLOCKED:"; echo "$real"; exit 1; fi
if bun run typecheck 2>&1 | grep -iE " error"; then echo "TYPECHECK BLOCKED"; exit 1; fi
echo "precommit ok"
