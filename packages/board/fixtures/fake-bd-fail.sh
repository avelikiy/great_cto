#!/bin/bash
# Test fixture: a `bd` stand-in that always exits non-zero, for testing the
# failure path of warmTasksAsync (packages/board/beads-warm-async.test.mjs).
if [ "$1" = "--version" ]; then
  echo "bd-fake 0.0.0"
  exit 0
fi
echo "dolt: database is locked" >&2
exit 1
