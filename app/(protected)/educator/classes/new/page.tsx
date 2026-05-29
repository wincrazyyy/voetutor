import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { Button } from "@/components/ui/button";
import { ClassForm } from "@/components/educator/class-form";

export default async function NewClassPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <div>
        <Link href="/educator">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Hub
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
