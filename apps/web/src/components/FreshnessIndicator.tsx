"use client";

interface FreshnessIndicatorProps {
  timestamp?: string | Date | null;
  label?: string;
}

function freshness(timestamp?: string | Date | null): { text: string; tone: string } {
  if (!timestamp) return { text: "No timestamp", tone: "text-red-600 dark:text-red-300" };
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 30) return { text: `Updated ${seconds}s ago`, tone: "text-green-600 dark:text-green-300" };
  if (seconds < 120) return { text: `Updated ${seconds}s ago`, tone: "text-amber-600 dark:text-amber-300" };
  const minutes = Math.floor(seconds / 60);
  return { text: `Updated ${minutes}m ago`, tone: "text-red-600 dark:text-red-300" };
}

export default function FreshnessIndicator({ timestamp, label = "Data" }: FreshnessIndicatorProps) {
  const state = freshness(timestamp);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${state.tone}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {label} · {state.text}
    </span>
  );
}
