# Data Domain Pack

> Extends `data-platform` archetype with domain-specific depth for pipelines, warehouses, feature stores, analytics, and time-series systems.
> Loaded when `packs: [data-pack]` is in PROJECT.md or auto-loaded for `data-platform` archetype.

## QA Extras Reference

### `data-lineage` — End-to-End Lineage (data-warehouse, data-pipeline)
- **What**: Trace every output field to its source
- **Tool**: OpenLineage integration or manual lineage doc
- **Threshold**: 100% of output fields traced to source, no orphan transformations
- **Artifact**: Lineage graph in `docs/qa-reports/`

### `pii-classification` — PII Scan (data-warehouse, data-pipeline)
- **What**: Identify and classify PII in all data stores
- **Tool**: Schema scan + regex patterns (email, phone, SSN, credit card)
- **Threshold**: All PII fields tagged with classification level, no unclassified PII
- **Categories**: Public, Internal, Confidential, Restricted

### `schema-diff` — Schema Migration Safety (data-warehouse, db-migration)
- **What**: Compare schema before and after migration
- **Tool**: `schemadiff`, `alembic check`, or `prisma migrate diff`
- **Threshold**: No data loss columns dropped, no type narrowing without explicit migration
- **Report**: Schema diff in `docs/qa-reports/`

### `point-in-time` — Point-in-Time Correctness (feature-store)
- **What**: Verify features are computed using only data available at query time (no future leakage)
- **Tool**: Compare feature values at historical timestamp vs current computation
- **Threshold**: 0 future-leaked features
- **Edge cases**: Late-arriving data, timezone boundaries, DST transitions

### `online-offline-consistency` — Online/Offline Parity (feature-store)
- **What**: Verify online serving values match offline training values for same entity+timestamp
- **Tool**: Sample N entities, compare online API response vs offline table
- **Threshold**: Exact match for categorical features, ≤0.1% relative error for numeric

### `freshness-sla` — Data Freshness (data-pipeline, data-warehouse)
- **What**: Verify data arrives within SLA
- **Tool**: Compare latest partition timestamp vs current time
- **Threshold**: Freshness ≤ PROJECT.md `freshness-sla:` value (default: 1h for streaming, 24h for batch)
- **Alert**: If freshness exceeds 2× SLA, flag as P1

### `snapshot-regression` — Visual/Data Regression (data-visualization)
- **What**: Compare dashboard output before and after change
- **Tool**: Screenshot comparison or data hash comparison
- **Threshold**: 0 unintended visual changes, 0 data discrepancies

### `backtest-validation` — Historical Backtest (time-series-forecasting)
- **What**: Validate model on historical holdout data
- **Tool**: Walk-forward cross-validation (expanding or sliding window)
- **Threshold**: MAPE ≤ PROJECT.md `qa-MAPE-threshold:` value (default: 10%)
- **Anti-leakage**: Verify no future data in feature computation

### `rollback-dry-run` — Migration Rollback (db-migration)
- **What**: Verify down migration executes cleanly
- **Tool**: `alembic downgrade --dry-run` or `flyway undo -dryRun`
- **Threshold**: Exit 0, no data loss, schema returns to previous state
- **Mandatory for**: any production schema change

### `dbt-test` — dbt Model Testing (data-warehouse)
- **What**: Run dbt test suite (schema + data tests)
- **Tool**: `dbt test --select <changed_models>+`
- **Threshold**: 0 test failures, no untested models in changed set
- **Include**: unique, not_null, accepted_values, relationships tests at minimum

### `contract-validation` — Data Contract (data-pipeline)
- **What**: Verify data conforms to published contract (schema, SLA, quality)
- **Tool**: Great Expectations, Soda, or custom contract validator
- **Threshold**: 0 contract violations
- **Contract fields**: schema (types + nullability), freshness SLA, uniqueness constraints, allowed value ranges

## Compliance Extras

### `data-lineage-compliance` — Regulatory Lineage (SOX, GDPR)
- For SOX: every number in financial reports traceable to source system
- For GDPR: every PII field traceable to data subject consent
- Artifact: `docs/compliance/data-lineage-audit.md`

### `retention-policy` — Data Retention
- Document retention period per data category
- Verify automated deletion after retention expiry
- Verify right-to-erasure works end-to-end for PII
- Artifact: `docs/compliance/retention-policy.md`

### `data-residency` — Geographic Data Residency
- Identify data storage locations per dataset
- Verify compliance with geographic restrictions (EU data stays in EU, etc.)
- Document cross-border transfer mechanisms (SCCs, BCRs)
- Artifact: `docs/compliance/data-residency.md`
