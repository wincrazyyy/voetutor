"use client";

import { Check, Trash2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useArmedConfirm } from "@/components/shared/buttons/use-armed-confirm";

interface ConfirmDeleteButtonProps {
  /** Accessible name + resting tooltip, e.g. "Delete review". */
  label: string;
  /** Armed-state name + tooltip; carries any cascade context. Defaults to "Confirm <label>". */
  confirmLabel?: string;
  /** The call site's existing action — fired on the confirming (second) click. */
  onConfirm: () => void;
  /** Resting icon (Trash2 by default; Unlink for unplace, Ban for revoke, UserMinus for roster…). */
  icon?: LucideIcon;
  /** Armed icon (Check by default). */
  confirmIcon?: LucideIcon;
  /** The call site's in-flight state — shows an icon-only spinner and holds the armed styling. */
  pending?: boolean;
  disabled?: boolean;
  /** Button icon size token: icon 40→36px, icon-sm 36→32px, icon-xs 32→24px. */
  size?: "icon" | "icon-sm" | "icon-xs";
  disarmMs?: number;
  /**
   * When false the first click fires immediately (e.g. deleting an already-empty section).
   * A predicate is evaluated lazily on click, so expensive checks don't run per render.
   */
  requireConfirm?: boolean | (() => boolean);
  /** Observe arm state, e.g. to reveal an adjacent cascade-warning panel while armed. */
  onArmedChange?: (armed: boolean) => void;
  className?: string;
}

/**
 * The canonical tier-1 destructive control: an ICON-ONLY arm-then-confirm button. Click one
 * arms it (ghost muted → solid destructive, icon morphs to a confirm check, tooltip + aria
 * name swap); click two fires `onConfirm`. Auto-disarms after `disarmMs`, on blur, and on
 * Escape. Catastrophic cascade deletes (whole class / whole account) must NOT use this —
 * they keep their type-to-confirm modals.
 */
export function ConfirmDeleteButton({
  label,
  confirmLabel,
  onConfirm,
  icon: Icon = Trash2,
  confirmIcon: ConfirmIcon = Check,
  pending = false,
  disabled = false,
  size = "icon-sm",
  disarmMs = 4000,
  requireConfirm = true,
  onArmedChange,
  className,
}: ConfirmDeleteButtonProps) {
  const { armed, arm, disarm } = useArmedConfirm({ disarmMs, pending, onArmedChange });

  const armedLabel =
    confirmLabel ?? `Confirm ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const currentLabel = armed ? armedLabel : label;

  const handleClick = () => {
    if (armed) {
      /* Disarm BEFORE firing so the control can never sit armed-and-enabled after a confirm:
         double-fire is impossible even for a call site that neither wires `pending` nor
         unmounts the item on success. The destructive styling still persists during the
         action because it keys off `pending` too (see variant below). */
      disarm();
      onConfirm();
      return;
    }
    const needsConfirm =
      typeof requireConfirm === "function" ? requireConfirm() : requireConfirm;
    if (needsConfirm) arm();
    else onConfirm();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={armed || pending ? "destructive" : "ghost"}
            size={size}
            className={cn(
              "shrink-0",
              !armed && !pending && "text-muted-foreground hover:text-destructive",
              className,
            )}
            loading={pending}
            loadingText={null}
            disabled={disabled}
            aria-label={currentLabel}
            onClick={handleClick}
            onBlur={() => {
              if (!pending) disarm();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && armed && !pending) disarm();
            }}
          >
            {armed ? <ConfirmIcon /> : <Icon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{currentLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
