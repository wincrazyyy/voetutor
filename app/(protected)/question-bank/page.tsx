import { redirect } from "next/navigation";
import { Library } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { Card } from "@/components/ui/card";

export default async function QuestionBankPage() {
  /* Premium educator feature. Students keep their (stub) access; basic-tier educators are gated.
     Admins and premium educators pass. */
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator") {
    if (!profile.is_approved) redirect("/pending");
    const ep = await getEducatorProfile(profile.id);
    if ((ep?.tier ?? "basic") !== "premium") redirect("/dashboard");
  }

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Library className="w-7 h-7 text-primary" />
          Question Bank
        </h1>
        <p className="text-muted-foreground">
          Practice questions and past papers, organised by topic and difficulty.
        </p>
      </div>

      <Card className="p-8 sm:p-12 border border-dashed border-border bg-card/50 text-center">
        <Library className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" />
        <h2 className="text-lg font-bold mb-1">Coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The question bank is under construction. Once questions and past papers are added, they will appear here organised by topic and difficulty.
        </p>
      </Card>
    </div>
  );
}
