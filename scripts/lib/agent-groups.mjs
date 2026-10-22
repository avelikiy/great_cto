// One implementation for Node readers and the classic-script board. The
// side-effect import also works in the site's committed CommonJS snapshot.
import '../../packages/board/public/assets/agent-groups.js';
const api = globalThis.GctoAgentGroups;
export const agentGroups = api.groups;
export const classifyAgentGroup = api.classify;
export const agentGroupLabel = api.label;
export const agentGroupIcon = api.icon;
