# Autonomous npm board: public role data

Date: 2026-10-15.
PR: [191](https://github.com/avelikiy/great_cto/pull/191).
Base: `7f9febd8cebdd693e6e66b045f0de9c4a68ab653`.
Executable/test candidate: `04a798b0972291c647d708da227c46dc9a22142d`.
Status: focused archive verification and canonical R2 passed; independent review pending.

## Reproduction and scope

The release attempt following [cache-selection QA](QA-2026-10-14-board-cache-selection.md)
ran the actual extracted npm board in Chromium. The unpublished 3.63.5 archive
passed 15 browser cases and failed the Usage ownership assertion for `senior-dev`.
Archive SHA256: `b1dc0505262ac5b13f273cfb2171bbee3eecb824cab41567160837a2e4d56e91`.
It was not tagged, published or installed.

`boardAgentNames()` in `packages/board/lib/routes.mjs` reads a relative `agents/`
directory. Import closure packaged executable modules but not that data directory.
Ownership classification and roster-based dispatch/outcome aggregation therefore
lost their input in autonomous npm installations. Missing roster data is not proof
of zero agent activity.

The bundler now copies regular, top-level public role Markdown files into that
same relative layout. No nested directories, private overlays or sidecar markers
are copied. There is no classifier, resolver, host routing, permission, gate,
domain-default or production-CSS change. The role prompts are public source data;
their presence does not prove host loading, invocation, certification or quality.

## Focused and actual-archive evidence

- Before the bundler change, the new data-closure assertion failed with ENOENT
  for `board/agents`. The fixed resolver/bundle suite passed 17/17, zero skips.
  It compares the exact source role list and every role's bytes with the bundle.
- Bundle-import checks passed 5/5, zero skips. Resolver consumers in CLI main
  and `board-path.ts` were inspected; no signatures or selection behavior changed.
- Usage Chromium check passed 1/1, zero skips. In addition to the original
  known-role assertion, an unknown role with a plugin-like prefix remains unowned.
  An initial new assertion requested a different, uncached API scope and saw
  `computing`; the final assertion reads the actual rendered page's usage snapshot.
- Candidate archive SHA256:
  `8d4666cc91c795e5fe9e6c1c4ab586febe20402d2e87e7fc5e8b1abee9f9b14b`.
  It has 260 files, including 72 public roles. Its metadata remains 3.63.4 until
  a separately verified release bump; it is not the registry's 3.63.4 artifact.
- Pinned isolated consumer/controller smoke passed 12 construction cases and
  8 refusal cases. Provider calls, execution provenance and benchmark eligibility
  are not attested by this smoke.
- All 16 browser cases passed against the extracted archive server, zero skips.
  Source test drivers and Playwright were reused, but server/modules/assets came
  from the exact extracted tarball. No rebuild occurred inside this browser run.
  Browser log SHA256:
  `849764aafb5a58087efbb452fa73c2ef88102b36804899f21c4b345b4e12f125`.
- An initial `npm --prefix ... pack` selected the monorepo tools package. That
  wrong-identity archive was rejected and not used for any delivery evidence.

## Canonical history

R1 ran `bash scripts/ci-local.sh --e2e --serial`, exit 1. Root/hooks/board has 1,434
passes and one failure: the hung-tsc deadline fixture's `pids` file was absent.
The hook returned timeout/not-verified; the reason the fixture did not produce
its PID evidence is Unknown. The one-second budget and process-group assertions
are unchanged. This failure remains tracked separately; it is not called a load
failure or attributed to roster packaging without evidence.

The library document-link ratchet also found the previously merged cache QA
report orphaned. This report connects the actual follow-up to its predecessor;
the orphan limit is not raised. Focused document-link verification passed 5/5,
zero skips; artifact lint found no structural errors and one preexisting undated
brief warning.

| R1 suite | Passed | Failed | Not checked |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1434 | 1 | 0 |
| Libraries | 3421 | 1 | 6 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Browser | 16 | 0 | 0 |
| CLI | 375 | 0 | 0 |
| Archetypes | 34 | 0 | 0 |
| Pipeline | 36 | 0 | 9 |

R1 log SHA256: `b7ab37529c1196fa0d020b45f907519a02fdf4ec49d0ed11a87a4076163f3c71`.
Counts are per suite, not a deduplicated total. Pipeline checks used isolated
fixtures and installed operator 3.63.4, not an installed new release.

After R1 completed normally, the entire unchanged stop-typecheck test file
passed 16/16, zero skips. This does not explain the historical missing-PID
failure, retroactively clear R1, or justify a timeout increase. The next full
gate retains the same executable/test bytes; only this connected QA report
is added.

R2 at `3efec20dcb5c7e1527df27fa951c6ec60929c323` completed exit 0 with the same
`--e2e --serial` command: root 1,435; libraries 3,422 passed and 6 not checked;
eval 242; documentation 76; browser 16; CLI 375; archetypes 34; pipeline 36 passed
and 9 not checked. All executed suites had zero failures. The one-second hung-tsc
budget and its process-group assertions were unchanged and passed in this run.
The original missing-PID failure remains unexplained and separately tracked.
R2 log SHA256: `a161395029e9457c52e6c0bc7ce580fcf2055671be1078c0929dab375ba28811`.
Unchanged full lifecycle replay log SHA256:
`a1f1bee1519899a67c5eadea3b2981f167bf73632b3457a78700bbf8d7b32107`.

The final post-R2 delta updates only this evidence report and the resolver's
introductory comment: the npm board now carries public role data, while the full
plugin remains richer in skills/commands. No resolver function body changes.
This final delta is included in the exact-head independent review; it is not
represented as a new canonical execution of that later commit.

## Runtime and release boundary

During validation the existing operator board listener disappeared again. Its
cause remains Unknown in a separate issue. No forced gate termination or broad
process cleanup occurred. Restoration used the previously published, byte-pinned
3.63.4 archive; HTTP then reported running=installed=3.63.4 and stale=no. This is
restoration evidence, not installation or sustained verification of the candidate.

Independent review, release and installation have not occurred for this candidate.
No paid/native benchmark was launched. Domain packs remain opt-in. Published and
installed versions must be read again at actual release time.

VERDICT: BLOCKED reason="canonical R2 and autonomous archive checks passed; independent review and delivery are not yet verified"
