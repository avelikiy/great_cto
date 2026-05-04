// Synthetic archetype detection test — 22 cases.
// Run: node packages/cli/test-archetypes.mjs

import { pickArchetype, suggestCompliance } from './dist/archetypes.js';

function mk(stack, readmeKeywords = [], pkgName = '') {
  return {
    stack,
    languages: ['typescript'],
    signals: {},
    packageManager: 'npm',
    hasTests: true,
    hasCI: true,
    hasExistingGreatCto: false,
    codeStructure: {
      hasRoutesDir: false, hasCliEntry: false, hasPublicHtml: false,
      hasServerEntry: false, hasMonorepo: false,
    },
    scripts: { hasStart: true, hasDev: true, hasBuild: true, hasPublish: false },
    projectSize: 'medium',
    readmeKeywords,
  };
}

const cases = [
  // existing
  { name: 'web-service',       expect: 'web-service',       d: mk(['nodejs','typescript','express','postgres']) },
  { name: 'agent-product',     expect: 'agent-product',     d: mk(['nodejs','typescript','anthropic-sdk','langgraph','pinecone']) },
  { name: 'ai-system',         expect: 'ai-system',         d: mk(['nodejs','typescript','anthropic-sdk','langchain']) },
  { name: 'commerce',          expect: 'commerce',          d: mk(['nodejs','typescript','stripe','next.js']) },
  { name: 'fintech',           expect: 'fintech',           d: mk(['nodejs','typescript','plaid','express']) },
  { name: 'healthcare',        expect: 'healthcare',        d: mk(['nodejs','typescript','fhir','express']) },
  { name: 'mobile-app',        expect: 'mobile-app',        d: mk(['nodejs','typescript','react-native','expo']) },
  { name: 'cli-tool',          expect: 'cli-tool',          d: { ...mk(['nodejs','typescript']), codeStructure: { hasRoutesDir:false, hasCliEntry:true, hasPublicHtml:false, hasServerEntry:false, hasMonorepo:false } } },
  { name: 'library',           expect: 'library',           d: { ...mk(['nodejs','typescript','library']), scripts: { hasStart:false,hasDev:false,hasBuild:true,hasPublish:true } } },
  { name: 'browser-extension', expect: 'browser-extension', d: mk(['nodejs','typescript','browser-extension']) },
  { name: 'game',              expect: 'game',              d: mk(['unity'], ['game']) },
  { name: 'web3',              expect: 'web3',              d: mk(['solidity']) },
  { name: 'iot-embedded',      expect: 'iot-embedded',      d: mk(['embedded']) },
  { name: 'data-platform',     expect: 'data-platform',     d: mk(['python','dbt','duckdb','data-pipeline']) },
  { name: 'devtools',          expect: 'devtools',          d: mk(['nodejs','typescript','graphql-schema','multi-sdk']) },
  { name: 'infra',             expect: 'infra',             d: mk(['terraform']) },
  { name: 'regulated',         expect: 'regulated',         d: mk(['nodejs'], ['regulated','compliance']) },

  // NEW — the 5 added in v1.0.180
  { name: 'enterprise-saas (WorkOS)',     expect: 'enterprise-saas', d: mk(['nodejs','typescript','next.js','workos','stripe','postgres'], ['multi-tenant','enterprise','sso']) },
  { name: 'enterprise-saas (Auth0+SAML)', expect: 'enterprise-saas', d: mk(['nodejs','typescript','express','auth0','samlify','scim','postgres'], ['b2b','saas']) },
  { name: 'mlops (PyTorch+MLflow)',       expect: 'mlops',           d: mk(['python','torch','mlflow','dvc','wandb','ml'], ['training','model']) },
  { name: 'mlops (Kubeflow+BentoML)',     expect: 'mlops',           d: mk(['python','tensorflow','kubeflow','bentoml','seldon','ml']) },
  { name: 'streaming (Kafka+Flink)',      expect: 'streaming',       d: mk(['java','kafkajs','flink','debezium'], ['streaming','event-driven','cdc']) },
  { name: 'streaming (Kinesis+Beam)',     expect: 'streaming',       d: mk(['python','kinesis','beam'], ['real-time']) },
  { name: 'marketplace (Connect+Persona)',expect: 'marketplace',     d: mk(['nodejs','typescript','next.js','stripe-connect','persona'], ['marketplace','seller','buyer']) },
  { name: 'marketplace (Adyen+Onfido)',   expect: 'marketplace',     d: mk(['nodejs','typescript','adyen-marketpay','onfido'], ['two-sided','platform']) },
  { name: 'cms (Sanity)',                 expect: 'cms',             d: mk(['nodejs','typescript','next.js','sanity'], ['cms','blog']) },
  { name: 'cms (Strapi)',                 expect: 'cms',             d: mk(['nodejs','typescript','strapi'], ['cms','publishing']) },
  { name: 'cms (Payload)',                expect: 'cms',             d: mk(['nodejs','typescript','payload'], ['cms']) },
];

let pass = 0, fail = 0;
const failures = [];

console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
console.log('│ Archetype detection test                                                │');
console.log('└─────────────────────────────────────────────────────────────────────────┘\n');

for (const c of cases) {
  const result = pickArchetype(c.d);
  const ok = result.primary === c.expect;
  const compliance = suggestCompliance(c.d, result.primary);

  const symbol = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`${color}${symbol}${reset} ${c.name.padEnd(36)} → ${result.primary.padEnd(20)} [${result.confidence}]  comp: ${compliance.slice(0, 4).join(',') || '-'}`);

  if (!ok) {
    failures.push({ name: c.name, expected: c.expect, got: result.primary, rationale: result.rationale });
    fail++;
  } else {
    pass++;
  }
}

console.log(`\n  Passed: ${pass}/${cases.length}   Failed: ${fail}/${cases.length}\n`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: expected=${f.expected}  got=${f.got}`);
    console.log(`    rationale: ${f.rationale}`);
  }
  process.exit(1);
}
