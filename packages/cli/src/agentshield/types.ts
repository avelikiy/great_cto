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
