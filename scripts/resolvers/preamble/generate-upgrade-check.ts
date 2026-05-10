import type { TemplateContext } from '../types';

/**
 * Thanx fork: this function used to bundle the inline UPGRADE_AVAILABLE flow
 * with the PROACTIVE / SKILL_PREFIX rules and the feature-discovery prompts.
 * The upgrade-related lines have been removed (no remote VERSION poll, no
 * inline auto-upgrade — see /upstream-sync). The non-upgrade rules remain
 * because they govern proactive skill behaviour and one-time onboarding,
 * which are unrelated to upstream sync.
 */
export function generateUpgradeCheck(ctx: TemplateContext): string {
  return `If \`PROACTIVE\` is \`"false"\`, do not auto-invoke or proactively suggest skills. If a skill seems useful, ask: "I think /skillname might help here — want me to run it?"

If \`SKILL_PREFIX\` is \`"true"\`, suggest/invoke \`/gstack-*\` names. Disk paths stay \`${ctx.paths.skillRoot}/[skill-name]/SKILL.md\`.

Feature discovery, max one prompt per session:
- Missing \`${ctx.paths.skillRoot}/.feature-prompted-continuous-checkpoint\`: AskUserQuestion for Continuous checkpoint auto-commits. If accepted, run \`${ctx.paths.binDir}/gstack-config set checkpoint_mode continuous\`. Always touch marker.
- Missing \`${ctx.paths.skillRoot}/.feature-prompted-model-overlay\`: inform "Model overlays are active. MODEL_OVERLAY shows the patch." Always touch marker.`;
}
