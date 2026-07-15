"use client";

import { Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ClassSearchField = "all" | "educator" | "title" | "code";

interface ClassSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  field: ClassSearchField;
  onFieldChange: (value: ClassSearchField) => void;
  totalCount: number;
  filteredCount: number;
  itemNoun?: string;
}

const PLACEHOLDERS: Record<ClassSearchField, string> = {
  all: "Search by educator, title, or code...",
  educator: "Search by educator name...",
  title: "Search by class title...",
  code: "Search by class code...",
};

export function ClassSearchBar({
  query,
  onQueryChange,
  field,
  onFieldChange,
  totalCount,
  filteredCount,
  itemNoun = "class",
}: ClassSearchBarProps) {
  const trimmed = query.trim();
  const noun = filteredCount === 1 ? itemNoun : `${itemNoun}es`;

  return (
    <Card className="p-4 border-border shadow-sm bg-card">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={PLACEHOLDERS[field]}
            className="pl-9"
          />
        </div>
        <Select value={field} onValueChange={(v) => onFieldChange(v as ClassSearchField)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Search field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fields</SelectItem>
            <SelectItem value="educator">Educator name</SelectItem>
            <SelectItem value="title">Class title</SelectItem>
            <SelectItem value="code">Class code</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {trimmed && (
        <p className="text-xs text-muted-foreground mt-3">
          {filteredCount} of {totalCount} {noun} match
        </p>
      )}
    </Card>
  );
}
