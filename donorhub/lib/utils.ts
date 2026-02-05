import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format datetime to readable string
 */
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format blood group enum to display string
 */
export function formatBloodGroup(bloodGroup: string): string {
  const mapping: Record<string, string> = {
    A_POSITIVE: "A+",
    A_NEGATIVE: "A-",
    B_POSITIVE: "B+",
    B_NEGATIVE: "B-",
    AB_POSITIVE: "AB+",
    AB_NEGATIVE: "AB-",
    O_POSITIVE: "O+",
    O_NEGATIVE: "O-",
  };
  return mapping[bloodGroup] || bloodGroup;
}

/**
 * Parse blood group display string to enum value
 */
export function parseBloodGroup(display: string): string {
  const mapping: Record<string, string> = {
    "A+": "A_POSITIVE",
    "A-": "A_NEGATIVE",
    "B+": "B_POSITIVE",
    "B-": "B_NEGATIVE",
    "AB+": "AB_POSITIVE",
    "AB-": "AB_NEGATIVE",
    "O+": "O_POSITIVE",
    "O-": "O_NEGATIVE",
  };
  return mapping[display] || display;
}

/**
 * Format urgency level to display string
 */
export function formatUrgency(urgency: string): string {
  return urgency.charAt(0) + urgency.slice(1).toLowerCase();
}

/**
 * Format status to display string
 */
export function formatStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * Get urgency badge color classes
 */
export function getUrgencyColor(urgency: string): string {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-800 border-red-200",
    HIGH: "bg-orange-100 text-orange-800 border-orange-200",
    MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
    LOW: "bg-green-100 text-green-800 border-green-200",
  };
  return colors[urgency] || "bg-gray-100 text-gray-800 border-gray-200";
}

/**
 * Get status badge color classes
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: "bg-blue-100 text-blue-800 border-blue-200",
    MATCHED: "bg-purple-100 text-purple-800 border-purple-200",
    FULFILLED: "bg-green-100 text-green-800 border-green-200",
    CANCELLED: "bg-gray-100 text-gray-800 border-gray-200",
    CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    REJECTED: "bg-red-100 text-red-800 border-red-200",
    COMPLETED: "bg-teal-100 text-teal-800 border-teal-200",
  };
  return colors[status] || "bg-gray-100 text-gray-800 border-gray-200";
}

/**
 * Generate pagination range
 */
export function getPaginationRange(
  currentPage: number,
  totalPages: number,
  delta: number = 2
): (number | "...")[] {
  const range: (number | "...")[] = [];
  const left = Math.max(2, currentPage - delta);
  const right = Math.min(totalPages - 1, currentPage + delta);

  range.push(1);

  if (left > 2) {
    range.push("...");
  }

  for (let i = left; i <= right; i++) {
    range.push(i);
  }

  if (right < totalPages - 1) {
    range.push("...");
  }

  if (totalPages > 1) {
    range.push(totalPages);
  }

  return range;
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

/**
 * Calculate days until deadline
 */
export function daysUntilDeadline(deadline: Date | string): number {
  const now = new Date();
  const target = new Date(deadline);
  const diffTime = target.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if deadline is overdue
 */
export function isOverdue(deadline: Date | string): boolean {
  return new Date(deadline) < new Date();
}
