import { redirect } from "next/navigation";
import { Store } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getPublishedClasses } from "@/lib/queries/marketplace";
import { isClassBrowseEnabled } from "@/lib/config/features";
import { Card } from "@/components/ui/card";
import { MarketplaceList } from "@/components/classes/marketplace-list";
import { AdminClassesList } from "@/components/admin/admin-classes-list";
import { getAllClassesForAdmin } from "@/lib/queries/admin-classes";

/**
 * The classes catalog, role-resolved: students/educators browse the published marketplace; admins get
 * the platform-wide management list (every class, search, delete). Replaces /classes/browse + the
 * old /admin/classes.
 */
export default async function ClassesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "admin" && !isClassBrowseEnabled()) redirect("/dashboard");

  if (profile.role === "admin") {
    const classes = await getAllClassesForAdmin();
    return (
      <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
            <Store className="w-7 h-7 text-primary" />
            All Classes
          </h1>
          <p className="text-muted-foreground">
            Every class on the platform. Search, review, and remove classes.
          </p>
        </div>
        <AdminClassesList classes={classes} />
      </div>
    );
  }

  const classes = await getPublishedClasses(profile.id);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
          <Store className="w-7 h-7 text-primary" />
          Browse Classes
        </h1>
        <p className="text-muted-foreground">
          Discover classes from our educators. Enrol in a free class instantly; paid checkout is coming soon.
        </p>
      </div>

      {classes.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <Store className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No classes available yet</h3>
          <p className="text-sm text-muted-foreground">
            Check back soon — educators are preparing new classes.
          </p>
        </Card>
      ) : (
        <MarketplaceList classes={classes} />
      )}
    </div>
  );
}
