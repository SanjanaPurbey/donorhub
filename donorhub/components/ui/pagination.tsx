"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPaginationRange } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPaginationRange(currentPage, totalPages);

  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 cursor-pointer",
          "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
          "transition-colors"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((page, index) => (
        <button
          key={index}
          onClick={() => typeof page === "number" && onPageChange(page)}
          disabled={page === "..."}
          className={cn(
            "flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-medium cursor-pointer",
            "transition-colors",
            page === currentPage
              ? "bg-rose-600 text-white"
              : page === "..."
              ? "cursor-default text-slate-400"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          {page}
        </button>
      ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 cursor-pointer",
          "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
          "transition-colors"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
