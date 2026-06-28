import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";

import { requireEducatorPage } from "@/lib/tiers/gate";
import { Button } from "@/components/ui/button";
import { ClassForm } from "@/components/educator/class-form";

export default async function NewClassPage() {
  await requireEducatorPage({ premium: true });

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <div>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
          <GraduationCap className="w-7 h-7 text-primary" />
          Create a Class
        </h1>
        <p className="text-muted-foreground">
          New classes start unpublished. Once you&apos;re happy with the details you can publish to the student marketplace.
        </p>
      </div>

      <ClassForm mode="create" />
    </div>
  );
}
