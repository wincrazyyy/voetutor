"use client";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface IconActionButtonProps {
  /** The lucide icon to render — pass the state-appropriate glyph for a toggle. */
  icon: LucideIcon;
  /** Accessible name + resting tooltip; the sole label since the control is textless. */
  label: string;
  /** The call site's existing handler — fired on click. */
  onClick: () => void;
  /** In-flight state — shows an icon-only spinner and disables the button. */
  loading?: boolean;
  disabled?: boolean;
  /** Icon size token: icon 40→36px, icon-sm 36→32px, icon-xs 32→24px. Match the cluster's Delete. */
  size?: "icon" | "icon-sm" | "icon-xs";
  variant?: "ghost" | "outline" | "secondary";
  /** On-state emphasis for toggle buttons — swaps the resting muted tint for `activeClassName`. */
  active?: boolean;
  /** Theme-tokened tint applied while `active`; defaults to the primary accent. */
  activeClassName?: string;
  className?: string;
}

/**
 * The non-destructive twin of ConfirmDeleteButton: an ICON-ONLY tooltip button for row
 * actions (resolve, pin, edit, reply). Mirrors the delete control's ghost variant, size,
 * shrink-0 and tooltip composition so a cluster mixing these with a ConfirmDeleteButton reads
 * as one uniform row of icons. `label` drives both the tooltip and the aria-label; for toggles
 * the label already flips with state (e.g. "Pin" ↔ "Unpin"), so it also announces the state.
 */
export function IconActionButton({
  icon: Icon,
  label,
  onClick,
  loading = false,
  disabled = false,
  size = "icon-sm",
  variant = "ghost",
  active = false,
  activeClassName = "text-primary",
  className,
}: IconActionButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            className={cn(
              "shrink-0",
              active ? activeClassName : "text-muted-foreground hover:text-foreground",
              className,
            )}
            loading={loading}
            loadingText={null}
            disabled={disabled}
            aria-label={label}
            onClick={onClick}
          >
            <Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
