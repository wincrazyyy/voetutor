import "server-only";

/**
 * Class browsing (the student/educator marketplace at /classes and its public CTAs) is behind a
 * server-only env flag while onboarding is invite-only. Absence = disabled; set
 * CLASS_BROWSE_ENABLED=true to restore browsing when paid checkout lands. Mirrors the
 * MAINTENANCE_MODE === "true" pattern. Admin class management at /classes is never gated by this.
 */
export function isClassBrowseEnabled(): boolean {
  return process.env.CLASS_BROWSE_ENABLED === "true";
}
