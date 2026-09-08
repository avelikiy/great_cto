# Witness registry

A fix keeps working because something fails when it stops. Most of ours do. The
ones that do not are the fixes whose load-bearing line sits inside a file that is
tested at a different altitude — and those are the ones that come back.

`witness.json` names, for each such fix, one file and one literal substring that
must still be in it. `tests/witness.test.mjs` fails when a marker is gone.

## When to add an entry

Add one when a fix ships and **no test would fail if you deleted the line**.
The check is mechanical: delete it, run the gate, see if anything goes red.

Do **not** add an entry for a fix that can be tested at its own altitude. Write
the test. An entry here is the weaker instrument and belongs where the stronger
one does not fit.

```json
{
  "id": "kebab-case, unique",
  "file": "path/from/the/repo/root",
  "marker": "a literal substring, distinctive, appearing exactly once",
  "why": "what breaks when it is gone, and why no test catches it",
  "fixed-in": "3.27.6"
}
```

The test refuses a marker under 20 characters, a marker that matches more than
one place in its file, and a `why` under 40 — a label is not a reason, and the
next reader deletes the line anyway if nothing tells them what it holds up.

## What this proves, and what it does not

It proves the line was not quietly removed. That is the failure this repository
keeps having: three regressions in 3.27.x passed every unit test on the broken
commit.

It does **not** prove the fix still works. A marker sitting in a file that no
longer runs proves nothing at all. Read an entry as "this was not deleted",
never as "this was verified".

## What was deliberately left out

Borrowed from [ruvnet/ruflo](https://github.com/ruvnet/ruflo)'s `verification/`,
whose motivating story is ours. Not borrowed: Ed25519 signing and per-OS
manifests written by CI runners. One maintainer, one machine — that is key
management with no threat model behind it, and an unused ceremony makes the
honest part look ceremonial too.
