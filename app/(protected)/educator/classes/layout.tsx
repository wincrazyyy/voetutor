import { requireEducatorPage } from "@/lib/tiers/gate";

/**
 * Gates the entire /educator/classes subtree behind the premium tier (admins bypass). Basic-tier
 * educators get profile + reviews only; classes are a premium feature. Redirects to the hub
 * (?upgrade=1) when not entitled.
 */
export default async function EducatorClassesLayout({ children }: { children: React.ReactNode }) {
  await requireEducatorPage({ premium: true });
  return <>{children}</>;
}
