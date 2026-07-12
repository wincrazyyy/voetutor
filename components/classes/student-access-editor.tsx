"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeySquare, Ticket, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { EnrollmentAccess } from "@/lib/types/database";
import { setStudentAccessAction } from "@/app/actions/class-passes";

export interface StudentAccessVM {
  scope: EnrollmentAccess;
  passes: Array<{ id: string; name: string }>;
}

/**
 * The roster "Access" editor: radio Full / Scoped plus a pass checklist when scoped, one Save.
 * This IS the manual upgrade action — trial-to-full is two clicks, and nothing else about the
 * student changes (progress, forum history, receipts, and sidebar order survive because the
 * enrollment row is updated in place).
 */
export function StudentAccessEditor({
  classId,
  studentId,
  studentName,
  access,
  passes,
}: {
  classId: string;
  studentId: string;
  studentName: string;
  access: StudentAccessVM;
  passes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<EnrollmentAccess>(access.scope);
  const [selected, setSelected] = useState<Set<string>>(new Set(access.passes.map((p) => p.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openDialog = () => {
    setScope(access.scope);
    setSelected(new Set(access.passes.map((p) => p.id)));
    setError(null);
    setOpen(true);
  };

  const togglePass = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setStudentAccessAction(
        classId,
        studentId,
        scope === "full" ? { scope: "full" } : { scope: "scoped", passIds: [...selected] },
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={openDialog}>
        <KeySquare className="h-3.5 w-3.5" />
        Access
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <KeySquare className="w-5 h-5 text-primary shrink-0" />
              Content access
            </h2>
            <p className="text-sm text-muted-foreground truncate mt-1">{studentName}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm cursor-pointer hover:border-primary/40 transition-colors">
              <input
                type="radio"
                name="access-scope"
                className="mt-0.5 accent-[hsl(var(--primary))]"
                checked={scope === "full"}
                disabled={pending}
                onChange={() => setScope("full")}
              />
              <span>
                <span className="block font-semibold text-foreground">Full course</span>
                <span className="block text-muted-foreground">
                  The whole curriculum, including everything added later.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm cursor-pointer hover:border-primary/40 transition-colors">
              <input
                type="radio"
                name="access-scope"
                className="mt-0.5 accent-[hsl(var(--primary))]"
                checked={scope === "scoped"}
                disabled={pending}
                onChange={() => setScope("scoped")}
              />
              <span>
                <span className="block font-semibold text-foreground">Restricted (passes)</span>
                <span className="block text-muted-foreground">
                  Only the content granted by the passes ticked below. Announcements and the class
                  forum stay available.
                </span>
              </span>
            </label>

            {scope === "scoped" ? (
              passes.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  This class has no passes yet — create one on the Access passes tab first. Saving
                  now leaves the student with no content access.
                </p>
              ) : (
                <div className="space-y-1 pl-1">
                  {passes.map((pass) => (
                    <label
                      key={pass.id}
                      className="flex items-center gap-2.5 py-1 text-sm cursor-pointer hover:text-primary transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(pass.id)}
                        disabled={pending}
                        onCheckedChange={() => togglePass(pass.id)}
                      />
                      <Ticket className="h-3.5 w-3.5 shrink-0 text-gold" />
                      <span className="truncate">{pass.name}</span>
                    </label>
                  ))}
                </div>
              )
            ) : null}
          </div>

          {error && <p className="px-6 text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} loadingText="Saving…">
              Save access
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
