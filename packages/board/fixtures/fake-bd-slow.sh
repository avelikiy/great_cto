#!/bin/bash
# Test fixture: a `bd` stand-in that sleeps before answering, so the
# boot-responsiveness tests can prove the board stays answerable DURING a
# slow `bd list` — not just that the code calls the right function. Loaded
# only via GREAT_CTO_BD_BIN in packages/board/*.test.mjs; never used outside
# tests.
if [ "$1" = "--version" ]; then
  echo "bd-fake 0.0.0"
  exit 0
fi
sleep "${FAKE_BD_DELAY_SECS:-3}"
echo "[]"
