"use client";

import Link from "next/link";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { useState, useEffect } from "react";

export function Footer() {
  const [year, setYear] = useState<string>("");

  useEffect(() => {
    setYear(new Date().getFullYear().toString());
  }, []);

  return (
    <footer className="w-full flex flex-col md:flex-row items-center justify-between border-t px-8 py-8 bg-card text-muted-foreground text-sm">
      <p>
        &copy; {year} WSPortal. All rights reserved.
      </p>
      <div className="flex items-center gap-4 mt-4 md:mt-0">
        <Link href="#" className="hover:text-primary transition-colors">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-primary transition-colors">
          Privacy
        </Link>
        <div className="w-px h-4 bg-border mx-2"></div>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
