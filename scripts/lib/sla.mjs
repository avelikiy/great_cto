// scripts/lib/sla.mjs — per-vertical turnaround SLAs (the regulatory / operational clock).
//
// A case waiting on a human signature has a real deadline, not just an elapsed timer:
//   prior-auth → CMS turnaround (72h expedited), pharma → 15-day expedited ICSR (360h),
//   aml → 30-day SAR (720h), soc → containment is hours, freight/msp → same-day, etc.
// dueAt = createdAt + slaHours; the console counts DOWN to it and flags at-risk / breached.

export const SLA_HOURS = Object.freeze({
  'prior-auth': 72, pharma: 360, aml: 720, rcm: 120, mortgage: 240, insurance: 240,
  title: 120, credentialing: 720, collections: 168, freight: 24, cro: 168, soc: 4,
  customs: 48, audit: 720, legaltech: 120, accounting: 168, tax: 360, procurement: 120, msp: 24,
  immigration: 240, appraisal: 168, payroll: 72,
});

export function slaHours(vertical) { return SLA_HOURS[vertical] || 168; }

/** dueAt ISO string for a run created at `createdAtIso`. */
export function dueAt(vertical, createdAtIso) {
  return new Date(new Date(createdAtIso).getTime() + slaHours(vertical) * 3600 * 1000).toISOString();
}
