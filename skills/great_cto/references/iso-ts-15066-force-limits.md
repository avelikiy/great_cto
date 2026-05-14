# ISO/TS 15066 — Cobot Biomechanical Force / Pressure Limits

> Reference for `robotics-safety-reviewer` (W6).
> Use during HARA + force-limit verification report. Values from ISO/TS 15066:2016 Annex A.

## What this is

ISO/TS 15066 specifies maximum permissible force and pressure for **quasi-static** (clamping / trapping) and **transient** (impact) contact between a collaborative robot and a human, **per body region**. Without these limits, you cannot certify "power-and-force limited" (PFL) cobot operation.

## How to use

1. Identify which body region(s) can be contacted in the cobot workspace given the task envelope (HARA Step 2).
2. Pick the lower of {quasi-static limit, transient limit} as the design constraint.
3. Measure force + pressure at end-effector with calibrated gauge (force gauge + pressure film e.g. Pliance / I-Scan).
4. If measured ≤ limit → PFL acceptable. Otherwise: speed-and-separation monitoring (SSM) or safety-rated stop.

## Biomechanical limit table (subset — most commonly applied)

| Body region | Quasi-static force [N] | Transient force [N] | Quasi-static pressure [N/cm²] |
|---|---:|---:|---:|
| Skull / forehead | 130 | 175 | 30 |
| Face | 65 | 90 | 20 |
| Neck (side) | 150 | 190 | 50 |
| Neck (front, larynx) | 35 | 35 | 10 |
| Back / shoulders | 210 | 250 | 70 |
| Chest | 140 | 170 | 70 |
| Abdomen | 110 | 140 | 40 |
| Pelvis / buttocks | 180 | 210 | 80 |
| Upper arm (incl. elbow joint) | 150 | 190 | 50 |
| Lower arm (incl. wrist) | 160 | 220 | 50 |
| Hand / fingers | 140 | 180 | 140 |
| Thigh / knee | 220 | 250 | 80 |
| Lower leg | 130 | 170 | 50 |

**Notes**
- Transient = contact ≤ 0.5 s (impact); quasi-static = contact > 0.5 s (clamp/trap).
- Pressure limits assume contact area ≥ 1 cm². For sharp tips, use lower of pressure × area or force limit.
- Values are **onset of pain** thresholds at 50th percentile — derate by ~50% if vulnerable populations (children, elderly) in workspace.

## Verification protocol (report template)

For each task pose where contact is plausible:

| Pose | Body region | Measured force [N] | Measured pressure [N/cm²] | Limit force | Limit pressure | Pass? |
|---|---|---:|---:|---:|---:|---|
| End-of-stroke insertion | Hand | … | … | 140 (quasi-static) | 140 | ✓ / ✗ |

Sign-off: licensed safety engineer (gate:hara-signoff + gate:functional-safety-test).

## Cross-refs

- `agents/robotics-safety-reviewer.md` § Mandatory deep-dives
- `skills/great_cto/packs/robotics-pack.md` § Required artefacts
- `tests/eval/EVAL-robot-policy-safety.md`

## Source

ISO/TS 15066:2016 "Robots and robotic devices — Collaborative robots", Annex A "Recommended limits for quasi-static and transient contact". Values are not normative — manufacturer must conduct a formal risk assessment per ISO 10218-2.
