import Link from "next/link";
import { Suspense } from "react";
import { VoeWordmark } from "@/components/brand/vault-mark";
import { AuthButton } from "@/components/auth/auth-button";

export function Navbar() {
  return (
    <nav className="w-full flex justify-center border-b h-16 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
        <div className="flex gap-5 items-center font-bold text-lg">
          <Link href={"/"} className="hover:opacity-80 transition-opacity">
            <VoeWordmark />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={<div className="h-8 w-20 bg-muted animate-pulse rounded-md" />}>
            <AuthButton />
          </Suspense>
        </div>
      </div>
    </nav>
  );
}