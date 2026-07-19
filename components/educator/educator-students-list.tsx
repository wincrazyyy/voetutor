"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { EducatorStudentSummary } from "@/lib/queries/student-insights";

/**
 * Client name-search over the educator's deduped student list on the /students hub (mirrors the
 * admin StudentsList search pattern). Each row links to the cross-class student view at
 * /students/[studentId]; the class-code chips show which of the viewer's classes the student is in.
 * The empty "no students at all" state is rendered by the page — this component only handles the
 * populated list and the no-match state.
 */
export function EducatorStudentsList({ students }: { students: EducatorStudentSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => student.name.toLowerCase().includes(q));
  }, [query, students]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students by name…"
          aria-label="Search students"
          inputMode="search"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-input bg-background pl-10 pr-4 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
        />
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {query.trim()
          ? filtered.length === 0
            ? `No students match ${query.trim()}.`
            : `${filtered.length} of ${students.length} ${students.length === 1 ? "student" : "students"} shown.`
          : ""}
      </p>

      {query.trim() && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {students.length} {students.length === 1 ? "student" : "students"}
        </p>
      )}

      {filtered.length === 0 ? (
        <Card className="border border-dashed border-border bg-card/50 p-10 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-bold">No matches</h3>
          <p className="text-sm text-muted-foreground">
            No student matches &ldquo;{query.trim()}&rdquo;. Try a different name.
          </p>
        </Card>
      ) : (
        filtered.map((student) => (
          <Link key={student.student_id} href={`/students/${student.student_id}`}>
            <Card className="flex flex-row items-center gap-4 border-border bg-card p-4 shadow-sm transition-colors hover:border-primary hover:bg-primary/5">
              <UserAvatar
                avatarUrl={student.avatar_url}
                firstName={null}
                lastName={null}
                displayName={student.name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{student.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  {student.classes.map((cls) => (
                    <span
                      key={cls.class_id}
                      title={cls.title}
                      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {cls.code}
                    </span>
                  ))}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
