"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { ForumPostListItem } from "@/lib/queries/forum";
import { getDisplayName } from "@/lib/utils/format";
import { ForumPostList } from "@/components/forum/forum-post-list";

interface ForumSearchableListProps {
  posts: ForumPostListItem[];
  classId: string;
  classEducatorId: string | null;
  emptyHint?: string;
}

export function ForumSearchableList({ posts, classId, classEducatorId, emptyHint }: ForumSearchableListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => {
      const author = getDisplayName(
        p.author?.first_name ?? null,
        p.author?.last_name ?? null,
        p.author?.display_name ?? null,
      ).toLowerCase();
      return p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || author.includes(q);
    });
  }, [query, posts]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search discussions…"
          aria-label="Search discussions"
          className="h-11 w-full min-w-0 rounded-full border border-input bg-background pl-10 pr-4 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
        />
      </div>

      {query.trim() && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {posts.length} {posts.length === 1 ? "thread" : "threads"}
        </p>
      )}

      <ForumPostList
        posts={filtered}
        classId={classId}
        classEducatorId={classEducatorId}
        emptyHint={query.trim() ? `No threads match “${query.trim()}”.` : emptyHint}
      />
    </div>
  );
}
