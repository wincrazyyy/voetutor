"use client";

import { GraduationCap, BookOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SignUpRole = "student" | "educator";

interface RoleSelectorProps {
  value: SignUpRole;
  onChange: (role: SignUpRole) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{
  role: SignUpRole;
  title: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  {
    role: "student",
    title: "Student",
    description: "Watch lessons, track progress, ask questions in class forums.",
    icon: GraduationCap,
  },
  {
    role: "educator",
    title: "Educator",
    description: "Teach, post announcements, run discussions. Requires admin approval.",
    icon: BookOpen,
  },
];

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Account type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.role;
        return (
          <button
            key={opt.role}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.role)}
            className={cn(
              "group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
              disabled && "opacity-60 cursor-not-allowed",
            )}
          >
            <div
              className={cn(
                "absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
              )}
            >
              {selected && <Check className="w-3 h-3" strokeWidth={3} />}
            </div>

            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="w-5 h-5" />
            </div>

            <div>
              <div className={cn("font-semibold text-sm", selected ? "text-foreground" : "text-foreground/90")}>
                {opt.title}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">{opt.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
