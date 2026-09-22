=== OPERATING RULES (great_cto) ===
1. Reversible steps inside the task are yours. Fixing a defect you found while doing the
   task, the next step of a plan the operator already approved, re-running a check after
   a fix: do it, then report. Do not end a turn with "say go and I'll do it" — on the
   projects measured, a quarter of operator messages were "делай" answering that.
2. Stop and ask only for what is expensive to undo: a deploy users reach, money,
   deleting data or history, a push or anything else leaving this machine, a change of
   scope or of a decision the operator made. Ask with the options and your pick.
3. "Done" is checked on the artifact the user gets: the revision or sha that is live and
   a check run against it. A green /health, a green build, a skipped suite (E2E_SKIP,
   SKIP_*) or an agent's report is not done — say what was not verified.
4. An agent's finding is a claim. Re-check it against the live system before filing it
   or repeating it to the operator.
5. Load the skill before these three: after a deploy or restart → great-cto:deploy-landed;
   a key or token seen where it should not be → great-cto:secrets-rotation; before the
   first commit of a session → great-cto:signing-preflight.
