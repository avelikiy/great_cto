/**
 * Core types for @great-cto/agentshield.
 *
 * A scan produces a list of `Finding` objects. Each finding cites a `Rule`
 * (loaded from rules/*.yaml) and locates the offending code via `Location`.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ScannerName =
  | 'prompt-injection'
  | 'secrets-in-prompts'
  | 'ssrf-in-tools'
  | 'rag-poisoning'
  | 'cost-runaway';

/** Action taken when a user-defined guardrail rule matches. */
export type GuardrailAction = 'block' | 'audit' | 'redact';

export interface Rule {
  /** kebab-case stable id, e.g. "PI-001" or "RAG-005" */
  id: string;
  /** scanner that owns this rule */
  scanner: ScannerName;
  /** short human-readable title */
  title: string;
  /** severity bucket */
  severity: Severity;
  /** OWASP-LLM mapping, if any (e.g. "LLM01:2025 — Prompt Injection") */
  owasp?: string;
  /** longer description (1-3 sentences) */
  description: string;
  /** how to fix it (1-2 sentences, action-oriented) */
  remediation: string;
  /** regex(es) that fire the rule. Implicit /m flag added by loader. */
  patterns: string[];
  /** optional file extension allowlist; if absent, all text files match */
  file_globs?: string[];
  /** patterns that, if also present, suppress the finding (false-positive guards) */
  negate?: string[];
  /**
   * User-defined guardrail action (from ~/.great_cto/guardrails.yml).
   * Built-in rules leave this undefined; user rules set it explicitly.
   * - block:  scan fails (same as finding with critical severity)
   * - audit:  finding is reported but does not fail the scan
   * - redact: reported as audit (content redaction is a runtime concern)
   */
  action?: GuardrailAction;
  /** True for rules loaded from ~/.great_cto/guardrails.yml */
  userDefined?: boolean;
}

export interface Location {
  file: string;
  line: number;
  column?: number;
  snippet: string;
}

export interface Finding {
  rule: Rule;
  location: Location;
  /** matched text from the regex */
  match: string;
  /** scanner-specific context (e.g. surrounding 3 lines) */
  context?: string;
}

export interface ScanOptions {
  /** explicit list of files to scan; if absent, walk root */
  files?: string[];
  /** scanners to run (default: all) */
  scanners?: ScannerName[];
  /** minimum severity to report */
  minSeverity?: Severity;
  /** path globs to ignore */
  exclude?: string[];
  /** stop after N findings (default: unlimited) */
  maxFindings?: number;
}

export interface ScanReport {
  startedAt: string;
  durationMs: number;
  filesScanned: number;
  rulesEvaluated: number;
  findings: Finding[];
  errors: string[];
}

export const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}
