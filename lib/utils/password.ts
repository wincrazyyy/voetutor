/**
 * Shared password-strength policy for new passwords (sign-up and password reset).
 * Mirrors the server-side rule enforced by Supabase Auth
 * (minimum_password_length = 8, password_requirements =
 * "lower_upper_letters_digits_symbols") so the client gives immediate
 * feedback and the server is the backstop. Existing accounts are unaffected —
 * the rule only runs when a password is set or changed.
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/**
 * Returns null when the password satisfies every rule, otherwise a single
 * user-facing message summarising what is still missing.
 */
export function validatePassword(value: string): string | null {
  const unmet = PASSWORD_RULES.filter((rule) => !rule.test(value));
  if (unmet.length === 0) return null;
  return `Password must include: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`;
}
