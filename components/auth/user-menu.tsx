"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Settings } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getDisplayName } from "@/lib/utils/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  roleLabel: string;
}

export function UserMenu({ firstName, lastName, displayName, avatarUrl, roleLabel }: UserMenuProps) {
  const router = useRouter();
  const name = getDisplayName(firstName, lastName, displayName);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    /* Stay on the current public page; refresh so the server-rendered navbar flips to signed-out. */
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-muted data-[state=open]:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <UserAvatar
            avatarUrl={avatarUrl}
            firstName={firstName}
            lastName={lastName}
            displayName={displayName}
            size={28}
          />
          <span className="hidden max-w-[10rem] truncate font-medium text-foreground sm:inline">{name}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-0 outline-none shadow-lg">
        <DropdownMenuLabel className="flex items-center gap-2.5">
          <UserAvatar
            avatarUrl={avatarUrl}
            firstName={firstName}
            lastName={lastName}
            displayName={displayName}
            size="sm"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">{roleLabel}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
