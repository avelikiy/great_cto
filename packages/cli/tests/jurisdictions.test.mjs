import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestJurisdictions,
  suggestJurisdictionReviewers,
  suggestJurisdictionGates,
  listJurisdictions,
} from "../dist/jurisdictions.js";

function mkDetection(readmeKeywords = [], infraKeywords = []) {
  return { stack: [], readmeKeywords, infraKeywords };
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

test("ca: 'pipeda' triggers Canada jurisdiction", () => {
  const d = mkDetection(["pipeda"]);
  const ca = suggestJurisdictions(d).find((m) => m.jurisdiction === "ca");
  assert.ok(ca, "ca should be detected from 'pipeda' keyword");
  assert.ok(ca.humanGates.includes("gate:pipeda-pia"), "gate:pipeda-pia must be included");
  assert.ok(ca.humanGates.includes("gate:quebec-law25-consent"), "gate:quebec-law25-consent must be included");
  assert.ok(ca.laws.some((l) => l.includes("PIPEDA")), "laws must mention PIPEDA");
});

test("ca: 'canadian users' triggers Canada jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["canadian users"])).find((m) => m.jurisdiction === "ca"));
});

test("ca: infra ca-central-1 region triggers Canada jurisdiction", () => {
  const d = mkDetection([], ["ca-central"]);
  assert.ok(suggestJurisdictions(d).find((m) => m.jurisdiction === "ca"), "ca-central region should trigger ca");
});

test("jp: 'appi' triggers Japan jurisdiction", () => {
  const d = mkDetection(["appi"]);
  const jp = suggestJurisdictions(d).find((m) => m.jurisdiction === "jp");
  assert.ok(jp, "jp should be detected from 'appi' keyword");
  assert.ok(jp.humanGates.includes("gate:appi-third-party-transfer"));
  assert.ok(jp.humanGates.includes("gate:appi-ppc-registration"));
  assert.ok(jp.laws.some((l) => l.includes("APPI")), "laws must mention APPI");
});

test("jp: 'japan users' triggers Japan jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["japan users"])).find((m) => m.jurisdiction === "jp"));
});

test("jp: infra ap-northeast-1 triggers Japan jurisdiction", () => {
  const d = mkDetection([], ["ap-northeast-1"]);
  assert.ok(suggestJurisdictions(d).find((m) => m.jurisdiction === "jp"), "ap-northeast-1 should trigger jp");
});

test("cn: 'pipl' triggers China jurisdiction", () => {
  const d = mkDetection(["pipl"]);
  const cn = suggestJurisdictions(d).find((m) => m.jurisdiction === "cn");
  assert.ok(cn, "cn should be detected from 'pipl' keyword");
  assert.ok(cn.humanGates.includes("gate:pipl-consent-framework"));
  assert.ok(cn.humanGates.includes("gate:mlps-classification"));
  assert.ok(cn.humanGates.includes("gate:pipl-data-localisation"));
  assert.ok(cn.laws.some((l) => l.includes("PIPL")), "laws must mention PIPL");
});

test("cn: 'china users' triggers China jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["china users"])).find((m) => m.jurisdiction === "cn"));
});

test("cn: 'mlps' triggers China jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["mlps"])).find((m) => m.jurisdiction === "cn"));
});

test("cn: infra cn-north region triggers China jurisdiction", () => {
  const d = mkDetection([], ["cn-north"]);
  assert.ok(suggestJurisdictions(d).find((m) => m.jurisdiction === "cn"), "cn-north should trigger cn");
});

test("kr: 'pipa korea' triggers South Korea jurisdiction", () => {
  const d = mkDetection(["pipa korea"]);
  const kr = suggestJurisdictions(d).find((m) => m.jurisdiction === "kr");
  assert.ok(kr, "kr should be detected from 'pipa korea' keyword");
  assert.ok(kr.humanGates.includes("gate:pipa-isms-p"));
  assert.ok(kr.humanGates.includes("gate:pipa-consent-framework"));
  assert.ok(kr.laws.some((l) => l.includes("PIPA")), "laws must mention PIPA");
});

test("kr: 'isms-p' triggers South Korea jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["isms-p"])).find((m) => m.jurisdiction === "kr"));
});

test("kr: 'korea users' triggers South Korea jurisdiction", () => {
  assert.ok(suggestJurisdictions(mkDetection(["korea users"])).find((m) => m.jurisdiction === "kr"));
});

test("kr: infra ap-northeast-2 triggers South Korea jurisdiction", () => {
  const d = mkDetection([], ["ap-northeast-2"]);
  assert.ok(suggestJurisdictions(d).find((m) => m.jurisdiction === "kr"), "ap-northeast-2 should trigger kr");
});

test("word-boundary: 'india' does NOT match Indiana references", () => {
  const d = mkDetection(["indianapolis", "indiana state"]);
  const matches = suggestJurisdictions(d);
  assert.ok(!matches.find((m) => m.jurisdiction === "in"), "indiana/indianapolis must not trigger India jurisdiction");
});

test("word-boundary: 'pipa' in 'pipa korea' matches kr but not standalone 'pipa' matching kr with phrase", () => {
  // 'pipa korea' is a phrase match → works; bare 'pipa' token should also work with word boundary
  const d = mkDetection([], ["pipa"]);
  const matches = suggestJurisdictions(d);
  // pipa alone is a signal — verify it hits kr (not just pipa korea)
  // Note: bare 'pipa' without 'korea' is still in kr signals list
  assert.ok(matches.find((m) => m.jurisdiction === "kr"), "bare 'pipa' token should trigger kr via word-boundary match");
});

test("infra-keywords: infraKeywords supplement readmeKeywords", () => {
  const d = mkDetection([], ["eu-west", "ap-northeast-2"]);
  const matches = suggestJurisdictions(d);
  assert.ok(matches.find((m) => m.jurisdiction === "eu"), "eu-west infra signal should trigger eu");
  assert.ok(matches.find((m) => m.jurisdiction === "kr"), "ap-northeast-2 infra signal should trigger kr");
});

test("listJurisdictions returns all 12 codes sorted", () => {
  const codes = listJurisdictions();
  assert.equal(codes.length, 12);
  for (const code of ["au", "br", "ca", "cn", "eu", "in", "jp", "kr", "sg", "uk", "us", "us-ca"]) {
    assert.ok(codes.includes(code), `${code} should be in listJurisdictions`);
  }
  assert.deepEqual(codes, [...codes].sort());
});
