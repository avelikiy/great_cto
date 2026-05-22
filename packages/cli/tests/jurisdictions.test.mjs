import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestJurisdictions,
  suggestJurisdictionReviewers,
  suggestJurisdictionGates,
  listJurisdictions,
} from "../dist/jurisdictions.js";

function mkDetection(readmeKeywords = []) {
  return { stack: [], readmeKeywords };
}

test("eu: 'gdpr' keyword triggers EU jurisdiction", () => {
  const d = mkDetection(["gdpr"]);
  const matches = suggestJurisdictions(d);
  const eu = matches.find((m) => m.jurisdiction === "eu");
  assert.ok(eu, "eu should be detected from 'gdpr' keyword");
  assert.ok(eu.reviewers.includes("gdpr-reviewer"), "gdpr-reviewer must be included");
  assert.ok(eu.humanGates.includes("gate:gdpr-dpia"), "gate:gdpr-dpia must be included");
  assert.ok(eu.laws.some((l) => l.includes("GDPR")), "laws must mention GDPR");
});

test("eu: 'eu users' triggers EU jurisdiction", () => {
  const d = mkDetection(["eu users"]);
  assert.ok(suggestJurisdictions(d).find((m) => m.jurisdiction === "eu"));
});

test("eu: 'eu ai act' triggers EU and eu-ai-act-classification gate", () => {
  const d = mkDetection(["eu ai act"]);
  const eu = suggestJurisdictions(d).find((m) => m.jurisdiction === "eu");
  assert.ok(eu);
  assert.ok(eu.humanGates.includes("gate:eu-ai-act-classification"));
});

test("eu: 'nis2' triggers EU jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["nis2"])).find((m) => m.jurisdiction === "eu"));
});

test("us-ca: 'ccpa' triggers California jurisdiction", () => {
  const d = mkDetection(["ccpa"]);
  const usca = suggestJurisdictions(d).find((m) => m.jurisdiction === "us-ca");
  assert.ok(usca);
  assert.ok(usca.humanGates.includes("gate:ccpa-dsrp"));
});

test("us-ca: 'cpra' triggers California jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["cpra"])).find((m) => m.jurisdiction === "us-ca"));
});

test("us-ca: 'do not sell' triggers California jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["do not sell"])).find((m) => m.jurisdiction === "us-ca"));
});

test("uk: 'uk gdpr' triggers UK jurisdiction", () => {
  const d = mkDetection(["uk gdpr"]);
  const uk = suggestJurisdictions(d).find((m) => m.jurisdiction === "uk");
  assert.ok(uk);
  assert.ok(uk.humanGates.includes("gate:uk-gdpr-dpia"));
});

test("uk: 'information commissioner' triggers UK jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["information commissioner"])).find((m) => m.jurisdiction === "uk"));
});

test("in: 'dpdpa' triggers India jurisdiction", () => {
  const d = mkDetection(["dpdpa"]);
  const india = suggestJurisdictions(d).find((m) => m.jurisdiction === "in");
  assert.ok(india);
  assert.ok(india.reviewers.includes("dpdpa-reviewer"));
  assert.ok(india.humanGates.includes("gate:dpdpa-consent-framework"));
});

test("in: 'india users' triggers India jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["india users"])).find((m) => m.jurisdiction === "in"));
});

test("in: 'rbi data localisation' triggers India jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["rbi data localisation"])).find((m) => m.jurisdiction === "in"));
});

test("br: 'lgpd' triggers Brazil jurisdiction", () => {
  const d = mkDetection(["lgpd"]);
  const br = suggestJurisdictions(d).find((m) => m.jurisdiction === "br");
  assert.ok(br);
  assert.ok(br.humanGates.includes("gate:lgpd-dpia"));
});

test("au: 'privacy act 1988' triggers Australia jurisdiction", () => {
  const d = mkDetection(["privacy act 1988"]);
  const au = suggestJurisdictions(d).find((m) => m.jurisdiction === "au");
  assert.ok(au);
  assert.ok(au.humanGates.includes("gate:au-privacy-act-assessment"));
});

test("sg: 'pdpa' triggers Singapore jurisdiction", () => {
  const d = mkDetection(["pdpa"]);
  const sg = suggestJurisdictions(d).find((m) => m.jurisdiction === "sg");
  assert.ok(sg);
  assert.ok(sg.humanGates.includes("gate:pdpa-dpo"));
});

test("multi: gdpr + ccpa triggers both eu and us-ca", () => {
  const d = mkDetection(["gdpr", "ccpa"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "eu"));
  assert.ok(matches.find((m) => m.jurisdiction === "us-ca"));
  assert.ok(matches.length >= 2);
});

test("multi: suggestJurisdictionReviewers deduplicates (eu+br both use gdpr-reviewer)", () => {
  const d = mkDetection(["gdpr", "lgpd"]);
  const reviewers = suggestJurisdictionReviewers(d);
  const count = reviewers.filter((r) => r === "gdpr-reviewer").length;
  assert.equal(count, 1);
});

test("multi: suggestJurisdictionGates returns sorted unique gates", () => {
  const d = mkDetection(["gdpr", "ccpa", "dpdpa"]);
  const gates = suggestJurisdictionGates(d);
  assert.equal(gates.length, new Set(gates).size, "gates must be unique");
  assert.deepEqual(gates, [...gates].sort(), "gates must be sorted");
});

test("no-match: generic SaaS project triggers no jurisdiction", () => {
  const d = mkDetection(["react", "typescript", "postgres", "redis", "stripe"]);
  assert.equal(suggestJurisdictions(d).length, 0);
});

test("listJurisdictions returns all 8 codes sorted", () => {
  const codes = listJurisdictions();
  assert.equal(codes.length, 8);
  for (const code of ["au", "br", "eu", "in", "sg", "uk", "us", "us-ca"]) {
    assert.ok(codes.includes(code), `${code} should be in listJurisdictions`);
  }
  assert.deepEqual(codes, [...codes].sort());
});
