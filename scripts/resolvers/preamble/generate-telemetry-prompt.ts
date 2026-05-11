import type { TemplateContext } from '../types';

/**
 * Thanx fork: the telemetry opt-in prompt is disabled.
 *
 * Upstream gstack prompted the user once via AskUserQuestion to enable
 * telemetry to a public Supabase project. Accepting would POST
 * skill-usage events to a non-Thanx host. The sync binary
 * (bin/gstack-telemetry-sync) is also stubbed and supabase/config.sh
 * is deleted; this resolver returning '' keeps the foot-gun off the UI.
 *
 * Do not reintroduce a prompt that turns on remote telemetry without an
 * /upstream-sync security review.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateTelemetryPrompt(_ctx: TemplateContext): string {
  return '';
}
