import "server-only";

import { randomInt } from "node:crypto";

import { validatePassword } from "@/lib/utils/password";

/**
 * Temporary-password generator for educator-provisioned student accounts. 16 chars from an
 * ambiguity-free alphabet (no I, i, l, 1, O, 0), constructed to guarantee at least one lowercase letter,
 * one uppercase letter, one digit, and one symbol from a copy-safe set, then Fisher-Yates shuffled
 * with crypto randomInt. The result is asserted against PASSWORD_RULES at the source so it always
 * satisfies the Supabase server-side password policy. Callers must never log or persist the value.
 */

const LOWER = "abcdefghjkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;
const LENGTH = 16;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

export function generateTempPassword(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < LENGTH) {
    chars.push(pick(ALL));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const password = chars.join("");
  if (validatePassword(password) !== null) {
    throw new Error("Generated temporary password failed the password policy.");
  }
  return password;
}
