import Link from "next/link";
import { VoeWordmark } from "@/components/brand/vault-mark";
import { AuthHeroPanel } from "@/components/auth/auth-hero-panel";

interface AuthShellProps {
  variant: "sign-up" | "login";
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ variant, title, description, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-svh w-full grid lg:grid-cols-2 bg-background">
      <AuthHeroPanel variant={variant} />

      <main className="flex flex-col">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-border">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <VoeWordmark />
          </Link>
        </header>

        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10 md:py-16">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h2 className="font-serif text-3xl font-bold tracking-tight">{title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>

            {children}

            {footer && <div className="pt-2 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
