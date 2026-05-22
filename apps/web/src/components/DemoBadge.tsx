"use client";

import { useTheme } from "@/lib/theme-context";

export default function DemoBadge() {
  const { demoMode, toggleDemoMode } = useTheme();
  if (!demoMode) return null;
  return (
    <button
      onClick={toggleDemoMode}
      className="fixed bottom-6 left-6 z-[9999] bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5 hover:bg-amber-600 transition"
      title="Click to exit demo mode"
    >
      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
      DEMO
    </button>
  );
}
