import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils/format";

type AvatarSize = "sm" | "md" | "lg";

const SIZE_TOKENS: Record<AvatarSize, { box: string; text: string }> = {
  sm: { box: "h-9 w-9", text: "text-xs" },
  md: { box: "h-11 w-11", text: "text-sm" },
  lg: { box: "h-14 w-14", text: "text-base" },
};

export interface UserAvatarProps {
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  /** A token ("sm" | "md" | "lg") or an explicit pixel size. Defaults to "md". */
  size?: AvatarSize | number;
  className?: string;
}

/**
 * The single identity chip for the whole app: renders the user's `avatar_url` as a circular image
 * when present, else an initials circle. Avatars are public storage URLs (getPublicUrl) — trusted, so
 * no signing or origin-pin is needed here (the stricter pin lives only on the anon public profile
 * masthead). Any user can now have one: an account avatar set in Settings (public `avatars` bucket)
 * coalesced with the educator masthead photo; users with neither fall back to initials.
 * Server-component-safe: no hooks, no "use client".
 */
export function UserAvatar({
  avatarUrl,
  firstName,
  lastName,
  displayName,
  size = "md",
  className,
}: UserAvatarProps) {
  const isToken = typeof size === "string";
  const boxClass = isToken ? SIZE_TOKENS[size].box : undefined;
  const textClass = isToken ? SIZE_TOKENS[size].text : undefined;
  const style = isToken ? undefined : { width: size, height: size, fontSize: Math.round(size * 0.42) };

  const base = cn("shrink-0 overflow-hidden rounded-full border border-border", boxClass, className);

  if (avatarUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={avatarUrl} alt="" style={style} className={cn(base, "object-cover")} />
    );
  }

  return (
    <div
      style={style}
      className={cn(base, "flex items-center justify-center bg-primary/10 font-bold text-primary", textClass)}
      aria-hidden
    >
      {getInitials(firstName, lastName, displayName)}
    </div>
  );
}
