#!/usr/bin/env bash
# scripts/auditor-stack-fingerprint.sh — project-auditor Phase 1 Stack Fingerprinting.
#
# Usage:
#   bash scripts/auditor-stack-fingerprint.sh
#
# Prints, in order: manifest/lock files (all major ecosystems), CI/CD config
# presence, runtime versions (node/python/go), test file count, and the top
# 20 largest source files by line count (code volume / where core logic
# lives). Output feeds language, frameworks, infra stack, test coverage
# signal, and code volume into the audit report.

set -uo pipefail

# Manifests and lock files
find . -maxdepth 4 \( \
  -name "Cargo.toml" -o -name "Cargo.lock" \
  -o -name "go.mod" -o -name "go.sum" \
  -o -name "package.json" -o -name "package-lock.json" -o -name "yarn.lock" -o -name "pnpm-lock.yaml" \
  -o -name "requirements.txt" -o -name "pyproject.toml" -o -name "poetry.lock" -o -name "Pipfile.lock" \
  -o -name "*.tf" -o -name "*.tfvars" \
  -o -name "Gemfile" -o -name "Gemfile.lock" \
  -o -name "pom.xml" -o -name "build.gradle" -o -name "build.gradle.kts" \
  -o -name "composer.json" -o -name "composer.lock" \
  -o -name ".python-version" -o -name ".nvmrc" -o -name ".node-version" \
  -o -name "Dockerfile" -o -name "docker-compose*.yml" \
\) 2>/dev/null | grep -v node_modules | grep -v ".git/" | sort

# CI/CD
ls .github/workflows/ .gitlab-ci.yml .circleci/config.yml Jenkinsfile .buildkite/ 2>/dev/null

# Runtime versions
cat .nvmrc .node-version .python-version 2>/dev/null
node --version 2>/dev/null; python3 --version 2>/dev/null; go version 2>/dev/null

# Test count
find . \( -name "*.test.*" -o -name "*.spec.*" -o -name "*_test.go" -o -name "test_*.py" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l

# Code volume (top files by size — where the core logic lives)
find . -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" 2>/dev/null \
  | grep -v node_modules | grep -v ".git" | xargs wc -l 2>/dev/null | sort -rn | head -20
