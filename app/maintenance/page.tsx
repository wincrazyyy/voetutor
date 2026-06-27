import type { Metadata } from "next";

import { MaintenanceScreen } from "@/components/auth/maintenance-screen";

export const metadata: Metadata = {
  title: "VOETutor — Maintenance",
  robots: { index: false, follow: false },
};

/**
 * Shown while MAINTENANCE_MODE is on — non-admins are redirected here by the proxy (lib/supabase/proxy.ts).
 * The maintenance copy + the admin sign-in (with the slide-up reveal) live in MaintenanceScreen.
 */
export default function MaintenancePage() {
  return <MaintenanceScreen />;
}
