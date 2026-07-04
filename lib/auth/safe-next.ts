/**
 * Only allow redirects to same-origin relative paths. Rejects absolute URLs
 * ("https://evil.com"), protocol-relative ("//evil.com"), and backslash
 * variants ("/\\evil.com") so a crafted ?next= value cannot open-redirect.
 * Shared by the auth confirm route, verify page, and the sign-up/login forms.
 */
export function safeNext(raw: string | null, fallback: string = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
