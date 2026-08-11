// A holdout read enough times stops being one.
//
// The loop's step 6: an approved prompt costs a rotation. This is the part that
// is easy to skip and expensive to skip, so it is worth being exact about the
// mechanism.
//
// The improver never sees holdout failures — step 4 is deliberately blind, and
// that blindness is what stopped the last campaign turning a holdout into tuning
// data. But it does see the NUMBER, once per candidate. A number is a channel.
// Ten rounds of "holdout went from 0.61 to 0.66 to 0.59" is ten bits about a
// fixed set of cases, and a search process with ten bits about the answer is
// fitting the answer. Slowly, through a straw, but fitting it.
//
// Rotation is what keeps the straw from ever draining the glass: after a prompt
// lands, some holdout cases move to tuning and an equal number move back, so the
// set the next candidate is measured against is not the set the last one was
// fitted to.
//
// Determinism is the guard, not a nicety
// --------------------------------------
// A rotation that can be re-rolled is a way to reshuffle until the number is
// favourable. So the seed is the approved prompt's own hash: the same approval
// always produces the same rotation, a different approval always produces a
// different one, and neither the improver nor the operator can choose it. And
// the move is recorded — which cases went where, under which seed — because a
// rotation nobody can audit is indistinguishable from a rotation nobody did.

import { createHash } from 'node:crypto';

/** How much of the holdout moves per approved prompt. */
export const DEFAULT_FRACTION = 0.25;

/**
 * A deterministic 32-bit stream from a seed string.
 *
 * Not for cryptography — for reproducibility. `Math.random()` would make the
 * rotation unauditable, which is the whole thing this must not be.
 */
function* stream(seed) {
  let i = 0;
  for (;;) {
    const h = createHash('sha256').update(`${seed}:${i++}`).digest();
    for (let b = 0; b + 4 <= h.length; b += 4) yield h.readUInt32BE(b);
  }
}

/** Fisher-Yates, driven by the seeded stream rather than by chance. */
export function seededShuffle(items, seed) {
  const out = [...items];
  const rnd = stream(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd.next().value % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Move a slice of the holdout into tuning, and the same number back.
 *
 * Equal exchange rather than a reshuffle of everything: the point is that the
 * next candidate faces cases the last one was not measured against, not that the
 * split is randomised afresh each time. Keeping the sizes fixed also keeps the
 * thresholds comparable across rotations — a holdout that shrinks makes every
 * later interval wider, which would read as the agent getting less certain.
 *
 * @param {object} o
 *   tuning    case identifiers currently in tuning
 *   holdout   case identifiers currently in holdout
 *   seed      the approved prompt's hash — never a timestamp, never random
 *   fraction  how much of the holdout moves
 * @returns {{tuning:string[], holdout:string[], moved:{toTuning:string[], toHoldout:string[]}, seed:string, why:string}}
 */
export function rotate({ tuning = [], holdout = [], seed, fraction = DEFAULT_FRACTION } = {}) {
  if (!seed) throw new Error('rotate() needs a seed — an unseeded rotation cannot be audited or reproduced');

  const n = Math.floor(holdout.length * fraction);
  if (n < 1 || tuning.length < n) {
    // Too small to rotate honestly. Say so rather than doing something token:
    // moving one case out of four is not a rotation, it is a gesture.
    return {
      tuning: [...tuning], holdout: [...holdout], moved: { toTuning: [], toHoldout: [] }, seed,
      why: `too small to rotate — ${holdout.length} holdout and ${tuning.length} tuning case(s) at fraction ${fraction} moves ${n}`,
    };
  }

  const outOfHoldout = seededShuffle(holdout, `${seed}:holdout`).slice(0, n);
  const outOfTuning = seededShuffle(tuning, `${seed}:tuning`).slice(0, n);

  return {
    tuning: [...tuning.filter((c) => !outOfTuning.includes(c)), ...outOfHoldout],
    holdout: [...holdout.filter((c) => !outOfHoldout.includes(c)), ...outOfTuning],
    moved: { toTuning: outOfHoldout, toHoldout: outOfTuning },
    seed,
    why: `${n} case(s) exchanged at fraction ${fraction}`,
  };
}

/**
 * The seed for an approved prompt.
 *
 * The prompt's own content, so the same approval always rotates the same way and
 * nobody — improver or operator — gets to choose the roll.
 */
export function seedForPrompt(promptText) {
  return createHash('sha256').update(String(promptText ?? '')).digest('hex').slice(0, 16);
}

/**
 * One line for the eval file, so a reader can see what moved and when.
 *
 * A rotation nobody can audit is indistinguishable from a rotation nobody did —
 * which is the failure mode this whole mechanism exists to prevent, applied to
 * itself.
 */
export function rotationRecord(result, { at, agent } = {}) {
  const { moved, seed, why } = result;
  return `<!-- holdout-rotation ${at ?? ''} agent=${agent ?? '?'} seed=${seed} ${why}`
    + ` | to-tuning: ${moved.toTuning.join(',') || '-'}`
    + ` | to-holdout: ${moved.toHoldout.join(',') || '-'} -->`;
}
