"use client";

import { useTheme } from "@/lib/theme-context";
import { Badge } from "@/components/ui";

export default function DemoBadge() {
  const { demoMode, toggleDemoMode } = useTheme();
  if (!demoMode) return null;
  return (
    <button
      onClick={toggleDemoMode}
      className="fixed bottom-6 left-6 z-[9999] transition hover:opacity-90"
      title="Click to exit demo mode"
    >
      <Badge tone="amber" className="gap-1.5 shadow-lg">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        DEMO
      </Badge>
    </button>
  );
}
