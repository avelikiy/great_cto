# The gate that runs on a project, recorded as code.
#
# A terminal cannot be photographed by a browser, and a hand-made GIF goes stale
# the same way a hand-made screenshot does. This tape is the source; the GIF is
# built from it — see scripts/record-tapes.sh.
#
# $GCTO_FIXTURE is a seeded sample project (scripts/lib/screenshot-fixture.mjs),
# never the operator's own work, for the same reason the screenshots are not.

Output docs/tapes/ci.gif

Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 520
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "cd $GCTO_FIXTURE && clear" Enter
Sleep 400ms
Show

Type "npx great-cto register"
Sleep 400ms
Enter
Sleep 2500ms

Type "npx great-cto ci"
Sleep 600ms
Enter
Sleep 4s
