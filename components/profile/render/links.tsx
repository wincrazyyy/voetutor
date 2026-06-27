import { ArrowUpRight } from "lucide-react";
import type { LinkItem } from "@/lib/types/profile-doc";

const HTTPS = /^https:\/\//i;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** Labelled external links as a ruled "Elsewhere" list. Re-validates https and fails closed. */
export function LinksBlock({ links }: { links: LinkItem[] }) {
  const safe = links.filter((l) => HTTPS.test((l.url ?? "").trim()));
  if (!safe.length) return null;
  return (
    <ul className="divide-y divide-border">
      {safe.map((l) => {
        const url = l.url.trim();
        const host = hostOf(url);
        return (
          <li key={l.id}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex items-center justify-between gap-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground transition-colors group-hover:text-primary">
                  {l.label || host || url}
                </span>
                {host && l.label ? (
                  <span className="block truncate text-xs text-muted-foreground">{host}</span>
                ) : null}
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
