#!/usr/bin/env bash
# scripts/auditor-architectural-debt-scan.sh — project-auditor Phase 4
# Architectural Debt scan (sections 4A.0, 4A, 4B, 4C — 4D AI cost-cap is a
# separate script, see auditor-ai-cost-cap-check.sh).
#
# Usage:
#   bash scripts/auditor-architectural-debt-scan.sh
#
# Runs, in order (each section labeled in stdout):
#   4A.0 Hot-spot identification — intersects the top-20 largest source
#        files with the top-20 most-git-churned files (last 6 months).
#        Every file in the intersection MUST receive concrete file:line
#        citations in the findings table — these are the most expensive
#        places to leave debt unaddressed. Writes scratch files to
#        /tmp/audit-{largest,churn,hotspots}.txt.
#   4A   Code structure signals — god files (>500 lines), circular-import
#        risk count, dead-code marker count (TODO/FIXME/HACK/XXX/DEPRECATED),
#        duplicated-basename files.
#   4B   Infrastructure & ops debt — Docker base image lines, k8s/Helm
#        apiVersion usage, health-check presence count, hardcoded IP/domain
#        matches (excludes loopback/broadcast/test).
#   4C   Observability gaps — raw logging call count, structured-logging
#        library presence count, metrics/tracing tool presence count.

set -uo pipefail

echo "=== 4A.0. Hot-spot identification (size x churn intersection) ==="

# Top 20 largest source files
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" \
  -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.kt" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" \
  -exec wc -l {} \; 2>/dev/null | sort -rn | head -20 > /tmp/audit-largest.txt

# Top 20 most-modified files (last 6 months)
git log --since="6 months ago" --name-only --pretty=format: 2>/dev/null \
  | grep -E '\.(ts|tsx|js|py|go|rs|java|kt)$' \
  | sort | uniq -c | sort -rn | head -20 > /tmp/audit-churn.txt

# Intersection — these are the worst architectural offenders, focus 4B/4C/4D here
awk 'NR==FNR{a[$2];next} ($2 in a)' /tmp/audit-largest.txt /tmp/audit-churn.txt \
  > /tmp/audit-hotspots.txt
cat /tmp/audit-hotspots.txt

echo ""
echo "=== 4A. Code structure signals ==="

# God files (>500 lines = architectural smell)
find . -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.java" 2>/dev/null \
  | grep -v node_modules | grep -v ".git" \
  | xargs wc -l 2>/dev/null | awk '$1>500' | sort -rn | head -15

# Circular dependency risk: cross-module imports
grep -rn "from \.\." --include="*.ts" --include="*.py" . 2>/dev/null \
  | grep -v node_modules | grep -v test | wc -l

# Dead code signals
grep -rn "TODO\|FIXME\|HACK\|XXX\|DEPRECATED\|@deprecated" \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.go" \
  . 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l

# Duplicated logic (files with similar names)
find . -name "*.ts" -o -name "*.py" | grep -v node_modules \
  | xargs basename -a 2>/dev/null | sort | uniq -d | head -10

echo ""
echo "=== 4B. Infrastructure & ops debt ==="

# Docker image age signals
grep -rn "FROM " Dockerfile* docker-compose*.yml 2>/dev/null | grep -v "#"

# Kubernetes / Helm: deprecated API versions
grep -rn "apiVersion:" k8s/ helm/ manifests/ 2>/dev/null | head -20

# Missing health checks
grep -rn "healthcheck\|health_check\|/health\|/ready" \
  Dockerfile* docker-compose*.yml . 2>/dev/null | grep -v node_modules | wc -l

# Hardcoded IPs / domains (should be env vars)
grep -rn "[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}" \
  --include="*.ts" --include="*.py" --include="*.go" --include="*.yaml" \
  . 2>/dev/null | grep -v node_modules | grep -v ".git" \
  | grep -v "127\.0\.0\.1\|0\.0\.0\.0\|255\.255\|test\|spec" | head -10

echo ""
echo "=== 4C. Observability gaps ==="

# Logging
grep -rn "console\.log\|print(\|fmt\.Print\|log\." \
  --include="*.ts" --include="*.py" --include="*.go" \
  . 2>/dev/null | grep -v node_modules | grep -v test | wc -l

# Structured logging vs raw
grep -rn "winston\|pino\|structlog\|zerolog\|zap\|slog" \
  . 2>/dev/null | grep -v node_modules | wc -l

# Metrics / tracing
grep -rn "prometheus\|datadog\|opentelemetry\|jaeger\|honeycomb\|grafana" \
  . 2>/dev/null | grep -v node_modules | wc -l
