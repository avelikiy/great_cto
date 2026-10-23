/** Public candidate metadata only. Focus never admits a domain packet. */
import { listDomainPacks } from './domain-evidence.mjs';

const core = ['product-owner', 'architect', 'pm', 'senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer', 'devops'];
const directions = [
  ['fintech-crypto', 'Fintech + crypto', ['money', 'crypto-execution']],
  ['telemedicine', 'Telemedicine', ['telemedicine-workflow']],
  ['venture-pipeline', 'Venture Pipeline', ['venture-evidence']],
  ['mental-care', 'Mental Care', ['mental-wellbeing-safety']],
];

export function coreRoleIds() { return [...core]; }

export function focusRegistry() {
  const packs = listDomainPacks();
  return { schemaVersion: 1, registryVersion: 1, coreRoles: coreRoleIds(),
    directions: directions.map(([id, label, packIds]) => ({ id, label, packIds: [...packIds],
      packs: packIds.map(packId => {
        const { version, digest, maturity, activation, invariants } = packs.find(p => p.packId === packId);
        return { packId, version, digest, maturity, activation,
          invariants: invariants.map(({ invariantId, rule, counterexample }) => ({ invariantId, rule, counterexample })) };
      }),
    })),
  };
}

export function focusDirection(id) {
  return focusRegistry().directions.find(d => d.id === id) || { state: 'unavailable', reason: 'unsupported-focus' };
}
