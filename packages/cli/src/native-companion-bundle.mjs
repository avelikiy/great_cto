/** Opaque release admission is required for publisher-vouched component inspection. */
import { getAdmissionInfo, inspectPluginPayload } from './release-trust.mjs';
import { validateNativeCompanionFiles, NATIVE_COMPANION_PROFILE } from './native-companion-policy.mjs';
export { NATIVE_COMPANIONS, NATIVE_COMPANION_PROFILE, isNativeCompanionRuntimePath, assertNativeCompanionRuntimeReferences } from './native-companion-policy.mjs';

export function inspectBundledNativeCompanions(admission) {
  const info = getAdmissionInfo(admission);
  if (!info.isProduction || info.authority !== 'ARTIFACT_ADMISSION') throw Error('production-artifact-admission-required');
  const { files } = inspectPluginPayload(admission);
  const components = validateNativeCompanionFiles(files);
  return { schema: 1, profile: NATIVE_COMPANION_PROFILE, state: 'COMPONENT_BYTES_VERIFIED', authority: 'NONE',
    evidence: 'PUBLISHER_VOUCHED_COMPONENT_BYTES', upstreamSignatures: 'NOT_CHECKED', securityReview: 'NOT_ATTESTED', artifactScan: 'NOT_ATTESTED', runtimeClosure: 'NOT_CHECKED',
    activationEligibility: 'NOT_ESTABLISHED', releaseEligibility: 'NOT_CHECKED', indexDigest: info.indexDigest, commit: info.commit, components };
}
