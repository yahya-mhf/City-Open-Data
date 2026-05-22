"use client";

import type { AiState } from "@/lib/api";

interface AiStatusBadgeProps {
  state: Pick<AiState, "status" | "generated_at" | "cache_age_seconds" | "reason"> | null;
  className?: string;
}

function ageLabel(timestamp?: string, cacheAgeSeconds?: number): string {
  const seconds = cacheAgeSeconds ?? (timestamp ? Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)) : 0);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function AiStatusBadge({ state, className = "" }: AiStatusBadgeProps) {
  if (!state) return null;

  if (state.status === "unavailable") {
    const reason = state?.reason ?? "Groq not configured";
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300 ${className}`}>
        <span>🔴</span>
        <span>Unavailable · {reason}</span>
      </span>
    );
  }

  if (state.status === "cached") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ${className}`}>
        <span>🟡</span>
        <span>Cached · {ageLabel(state.generated_at, state.cache_age_seconds)}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300 ${className}`}>
      <span>🟢</span>
      <span>Live · {ageLabel(state.generated_at)}</span>
    </span>
  );
}
