"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES } from "@/lib/utils/password";

interface PasswordRequirementsProps {
  value: string;
  className?: string;
}

/**
 * Live checklist of the password policy. Each rule turns green as the typed
 * password satisfies it. Rendered under the new-password field on sign-up and
 * password reset.
 */
export function PasswordRequirements({ value, className }: PasswordRequirementsProps) {
  return (
    <ul className={cn("grid gap-1 text-xs", className)} aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5 transition-colors",
              met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {met ? (
              <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
            ) : (
              <X className="w-3.5 h-3.5 shrink-0 opacity-50" strokeWidth={3} />
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
