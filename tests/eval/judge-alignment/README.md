# Judge alignment set

> An unaligned judge is a random number generator with good grammar.
> Measure its agreement with hand labels before trusting a single verdict.

Every number this repo reports about an agent comes from one model grading
another. That grader has never been checked against a human, and on 2026-08-03
it produced four verdicts of the same shape:

    "does not name the scoring order DESPITE correctly identifying anchoring
     and halo effects"                                          → FAIL
    "correctly identifies that arithmetic is objective while inputs are not,
     but fails to demonstrate this"                              → FAIL
    "correctly rejects determinism as a reason for one run but fails to state
     this upfront, burying it"                                   → FAIL
    "discusses account takeover risks and cooling-off periods but does not
     specifically name..."                                       → FAIL

In each the judge states the answer is right and marks it wrong. The response
satisfied the criterion in substance and failed on wording or placement.

That is not a small calibration error. It points the whole loop the wrong way:
the natural repair is to rewrite the criterion until the eval passes, and a gold
set edited after reading the outputs measures memory of those outputs rather
than the agent. It happened three times this session before it was named.

## What lives here

One file per disputed case: the question, the response, the judge's verdict and
reason, and a HAND label with the reasoning. These are the cases the judge and a
human disagreed on — the only ones that carry information about the judge.

Agreement is measured against these, not against the cases where both said yes:
two graders agreeing on an easy case says nothing about either.

## The rule this set exists to enforce

A criterion describes what the answer must ESTABLISH, never the words it must
use. When a verdict turns on phrasing, the defect is in the criterion or the
judge — fix one of those, and record which.

## Result, 2026-08-03

    20/20 labelled · agreement 45% · kappa 0.00
    11 cases the judge failed and a human passed

Kappa zero means that on these cases the judge's verdict carries no information
beyond what guessing at the same base rate would produce.

**Two things that number is not.**

It is not a verdict on the judge overall. The set was SELECTED for disagreement —
every row is a case where the judge's own reason confirms the substance and then
fails the answer. A sample chosen for disagreement cannot measure agreement in
general, and the judge is presumably fine on cases where the answer is plainly
right or plainly wrong.

It is also not an independent measurement. The hand labels were written by the
author of the criteria, so "the criterion was satisfied in substance" is being
judged by the person who decided what the substance was. A second labeller who
did not write them would be worth more than another twenty cases from this one.

**What it does establish**, and this is enough to act on: 11 of the 20 verdicts
that drove prompt edits today were false failures. In each, the response
established what the criterion asked and was failed for wording or placement.
The repair those verdicts invite is to soften the criterion — which is how a
suite quietly stops measuring, and it happened three times before it was named.

**The rule that follows.** A verdict whose reason contains "correctly
identifies… but does not name" is a judge finding, not an agent finding. Route
it here rather than into a prompt edit.
