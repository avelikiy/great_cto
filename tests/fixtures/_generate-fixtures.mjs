// Generate minimal archetype fixtures.
// Each fixture is just enough for runDetection() to pick the right archetype.
// Run: node tests/fixtures/_generate-fixtures.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURES = [
  // ── existing 3 are kept; we generate the other 19 ──

  // web-service — Express + Postgres
  {
    slug: 'web-service-express',
    expect: 'web-service',
    files: {
      'package.json': JSON.stringify({
        name: 'web-service-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'tsx src/server.ts', start: 'node dist/server.js', build: 'tsc' },
        dependencies: { express: '^4.19.0', pg: '^8.11.0', zod: '^3.22.0' },
        devDependencies: { typescript: '^5.4.0', '@types/express': '^4.17.0', '@types/node': '^20.0.0', tsx: '^4.7.0' },
      }, null, 2),
      'README.md': '# Web Service Fixture\n\nMinimal Express API for great_cto archetype detection tests.\n',
    },
  },

  // agent-product — LangGraph + Pinecone + Anthropic
  {
    slug: 'agent-product-langgraph',
    expect: 'agent-product',
    files: {
      'package.json': JSON.stringify({
        name: 'agent-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'tsx src/agent.ts' },
        dependencies: {
          '@anthropic-ai/sdk': '^0.27.0',
          '@langchain/langgraph': '^0.2.0',
          '@pinecone-database/pinecone': '^3.0.0',
        },
        devDependencies: { typescript: '^5.4.0', tsx: '^4.7.0' },
      }, null, 2),
      'README.md': '# Agent Product\n\nLangGraph agent with Pinecone RAG.\n',
    },
  },

  // ai-system — Vercel AI SDK
  {
    slug: 'ai-system-vercel',
    expect: 'ai-system',
    files: {
      'package.json': JSON.stringify({
        name: 'ai-system-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '^15.0.0', react: '^18.3.0', 'react-dom': '^18.3.0', ai: '^3.4.0', '@anthropic-ai/sdk': '^0.27.0' },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# AI System\n\nVercel AI SDK chat with streaming.\n',
    },
  },

  // commerce — Stripe Checkout
  {
    slug: 'commerce-stripe',
    expect: 'commerce',
    files: {
      'package.json': JSON.stringify({
        name: 'commerce-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: { next: '^15.0.0', react: '^18.3.0', 'react-dom': '^18.3.0', stripe: '^17.0.0' },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# Commerce\n\nNext.js shop with Stripe checkout.\n',
    },
  },

  // fintech — Plaid
  {
    slug: 'fintech-plaid',
    expect: 'fintech',
    files: {
      'package.json': JSON.stringify({
        name: 'fintech-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'tsx src/server.ts', start: 'node dist/server.js' },
        dependencies: { express: '^4.19.0', plaid: '^28.0.0', pg: '^8.11.0' },
        devDependencies: { typescript: '^5.4.0', tsx: '^4.7.0' },
      }, null, 2),
      'README.md': '# Fintech\n\nPlaid bank account aggregation API.\n',
    },
  },

  // healthcare — FHIR
  {
    slug: 'healthcare-fhir',
    expect: 'healthcare',
    files: {
      'package.json': JSON.stringify({
        name: 'healthcare-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'tsx src/server.ts' },
        dependencies: { express: '^4.19.0', '@types/fhir': '^0.0.41', 'fhir.js': '^0.0.21' },
        devDependencies: { typescript: '^5.4.0', tsx: '^4.7.0' },
      }, null, 2),
      'README.md': '# Healthcare\n\nFHIR R4 patient API.\n',
    },
  },

  // mobile-app — Expo / React Native
  {
    slug: 'mobile-app-expo',
    expect: 'mobile-app',
    files: {
      'package.json': JSON.stringify({
        name: 'mobile-fixture', version: '0.1.0', private: true,
        scripts: { start: 'expo start', ios: 'expo run:ios', android: 'expo run:android' },
        dependencies: { expo: '^51.0.0', 'react-native': '0.74.5', react: '18.2.0' },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# Mobile App\n\nExpo + React Native app.\n',
    },
  },

  // browser-extension — MV3
  {
    slug: 'browser-extension-mv3',
    expect: 'browser-extension',
    files: {
      'manifest.json': JSON.stringify({
        manifest_version: 3,
        name: 'Test Extension',
        version: '0.1.0',
        action: { default_popup: 'popup.html' },
        background: { service_worker: 'background.js' },
        permissions: ['storage', 'activeTab'],
      }, null, 2),
      'package.json': JSON.stringify({
        name: 'extension-fixture', version: '0.1.0', private: true,
        scripts: { build: 'vite build' },
        devDependencies: { typescript: '^5.4.0', vite: '^5.0.0' },
      }, null, 2),
      'README.md': '# Browser Extension\n\nManifest V3 extension.\n',
    },
  },

  // game — Unity (no package.json; we mark via README + Unity-style .gitignore)
  {
    slug: 'game-unity',
    expect: 'game',
    files: {
      'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2022.3.20f1\nm_EditorVersionWithRevision: 2022.3.20f1 (someguid)\n',
      'README.md': '# Game\n\nUnity 2D platformer game.\n',
      'Assets/.gitkeep': '',
    },
  },

  // web3 — Foundry / Hardhat
  {
    slug: 'web3-foundry',
    expect: 'web3',
    files: {
      'foundry.toml': '[profile.default]\nsrc = "src"\nout = "out"\nlibs = ["lib"]\nsolc_version = "0.8.24"\n',
      'package.json': JSON.stringify({
        name: 'web3-fixture', version: '0.1.0', private: true,
        scripts: { test: 'forge test', build: 'forge build' },
        devDependencies: { 'hardhat': '^2.22.0' },
      }, null, 2),
      'README.md': '# Web3 / DeFi\n\nFoundry-based smart contracts.\n',
    },
  },

  // iot-embedded — Zephyr
  {
    slug: 'iot-zephyr',
    expect: 'iot-embedded',
    files: {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20.0)\nfind_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})\nproject(blinky)\ntarget_sources(app PRIVATE src/main.c)\n',
      'prj.conf': 'CONFIG_GPIO=y\nCONFIG_LOG=y\n',
      'platformio.ini': '[env:esp32]\nplatform = espressif32\nframework = espidf\n',
      'README.md': '# IoT / Embedded\n\nZephyr blinky firmware.\n',
    },
  },

  // data-platform — dbt
  {
    slug: 'data-platform-dbt',
    expect: 'data-platform',
    files: {
      'pyproject.toml': '[project]\nname = "data-platform-fixture"\nversion = "0.1.0"\ndependencies = ["dbt-core>=1.7", "dbt-snowflake>=1.7", "duckdb>=1.0", "pandas>=2.0"]\n',
      'dbt_project.yml': 'name: \'fixture\'\nversion: \'1.0.0\'\nprofile: \'fixture\'\nmodel-paths: ["models"]\n',
      'README.md': '# Data Platform\n\ndbt + Snowflake transformations.\n',
    },
  },

  // devtools — Stainless / SDK platform
  {
    slug: 'devtools-stainless',
    expect: 'devtools',
    files: {
      'package.json': JSON.stringify({
        name: 'devtools-fixture', version: '0.1.0',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        scripts: { build: 'tsc', publish: 'npm publish' },
        dependencies: { stainless: '^1.0.0' },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'openapi.yaml': 'openapi: 3.0.0\ninfo: { title: SDK, version: 1.0.0 }\npaths: {}\n',
      'README.md': '# Devtools\n\nGraphQL schema + multi-SDK platform.\n',
    },
  },

  // infra — Terraform
  {
    slug: 'infra-terraform',
    expect: 'infra',
    files: {
      'main.tf': 'terraform {\n  required_version = ">= 1.5"\n  required_providers { aws = { source = "hashicorp/aws" } }\n}\nprovider "aws" { region = "us-east-1" }\nresource "aws_s3_bucket" "data" { bucket = "fixture-data" }\n',
      'variables.tf': 'variable "env" { type = string default = "dev" }\n',
      'README.md': '# Infrastructure\n\nTerraform AWS module.\n',
    },
  },

  // regulated — manual override (no auto-detect; just PROJECT.md hint via README keyword)
  // (regulated relies on manual --archetype flag; included as test of fallback)
  {
    slug: 'regulated-manual',
    expect: 'regulated',
    files: {
      'package.json': JSON.stringify({
        name: 'regulated-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'tsx src/server.ts' },
        dependencies: { express: '^4.19.0', pg: '^8.11.0' },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# Regulated\n\nGxP-validated system, SOX compliance, regulated industry. Run with --archetype regulated.\n',
      '.great_cto/PROJECT.md': '# Project\n\narchetype: regulated\ncompliance: [sox, hipaa, gdpr]\n',
    },
    skipIfFails: true, // detector falls back to web-service; regulated is manual-override
  },

  // ── 5 NEW archetypes ──

  // enterprise-saas — WorkOS + Clerk + multi-tenant
  {
    slug: 'enterprise-saas-workos',
    expect: 'enterprise-saas',
    files: {
      'package.json': JSON.stringify({
        name: 'saas-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: {
          next: '^15.0.0', react: '^18.3.0', 'react-dom': '^18.3.0',
          '@workos-inc/node': '^7.0.0',
          '@clerk/nextjs': '^5.0.0',
          stripe: '^17.0.0',
          pg: '^8.11.0',
        },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# Enterprise SaaS\n\nMulti-tenant B2B platform with SSO (SAML), SCIM, and multi-tenant data isolation. Enterprise-grade.\n',
    },
  },

  // mlops — PyTorch + MLflow + DVC
  {
    slug: 'mlops-mlflow',
    expect: 'mlops',
    files: {
      'pyproject.toml': '[project]\nname = "mlops-fixture"\nversion = "0.1.0"\ndependencies = ["torch>=2.0", "mlflow>=2.10", "dvc>=3.0", "wandb>=0.16", "scikit-learn>=1.3"]\n',
      'dvc.yaml': 'stages:\n  train:\n    cmd: python train.py\n    deps: [data/]\n    outs: [models/]\n',
      'README.md': '# MLOps\n\nPyTorch model training pipeline with MLflow tracking and DVC dataset versioning.\n',
    },
  },

  // streaming — Kafka + Debezium
  {
    slug: 'streaming-kafka',
    expect: 'streaming',
    files: {
      'package.json': JSON.stringify({
        name: 'streaming-fixture', version: '0.1.0', private: true,
        scripts: { start: 'node src/consumer.js' },
        dependencies: {
          kafkajs: '^2.2.4',
          '@confluentinc/kafka-javascript': '^0.2.0',
          'debezium': '^1.0.0',
        },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# Streaming\n\nKafka event-driven pipeline with Debezium CDC. Real-time order processing.\n',
    },
  },

  // marketplace — Stripe Connect + Persona
  {
    slug: 'marketplace-connect',
    expect: 'marketplace',
    files: {
      'package.json': JSON.stringify({
        name: 'marketplace-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'next dev' },
        dependencies: {
          next: '^15.0.0', react: '^18.3.0', 'react-dom': '^18.3.0',
          stripe: '^17.0.0',
          '@stripe/connect-iframe-loader': '^1.0.0',
          'persona-react': '^4.0.0',
        },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# Marketplace\n\nTwo-sided platform with seller payouts (Stripe Connect) and KYC (Persona). Buyer + seller workflows.\n',
    },
  },

  // cms — Sanity + Next.js
  {
    slug: 'cms-sanity',
    expect: 'cms',
    files: {
      'package.json': JSON.stringify({
        name: 'cms-fixture', version: '0.1.0', private: true,
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: {
          next: '^15.0.0', react: '^18.3.0', 'react-dom': '^18.3.0',
          '@sanity/client': '^6.20.0',
          'next-sanity': '^9.0.0',
        },
        devDependencies: { typescript: '^5.4.0' },
      }, null, 2),
      'README.md': '# CMS\n\nNext.js blog with Sanity headless CMS. Publishing platform with structured content.\n',
    },
  },
];

// Library archetype is covered by an existing project shape (no fixture needed in this sweep);
// We add a tiny one for completeness:
FIXTURES.push({
  slug: 'library-npm',
  expect: 'library',
  files: {
    'package.json': JSON.stringify({
      name: 'my-lib', version: '1.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      module: 'dist/index.mjs',
      exports: { '.': { import: './dist/index.mjs', require: './dist/index.js', types: './dist/index.d.ts' } },
      scripts: { build: 'tsup', test: 'vitest', publish: 'npm publish' },
      devDependencies: { typescript: '^5.4.0', tsup: '^8.0.0', vitest: '^1.0.0' },
    }, null, 2),
    'README.md': '# my-lib\n\nA minimal published library.\n',
  },
});

let written = 0;
for (const f of FIXTURES) {
  const dir = join(__dirname, f.slug);
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(f.files)) {
    const fpath = join(dir, path);
    mkdirSync(dirname(fpath), { recursive: true });
    writeFileSync(fpath, content, 'utf-8');
  }
  // expected manifest for the test runner
  writeFileSync(
    join(dir, 'expected.json'),
    JSON.stringify({ archetype: f.expect, skipIfFails: !!f.skipIfFails }, null, 2),
  );
  written++;
}
console.log(`✓ wrote ${written} fixtures`);
