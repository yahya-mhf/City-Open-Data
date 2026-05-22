"use client";

import { createPortal } from "react-dom";
import AiStatusBadge from "@/components/AiStatusBadge";
import type { AiState, IntelligenceSuggestion } from "@/lib/api";

interface IntelligencePanelProps {
  loading: boolean;
  suggestions: IntelligenceSuggestion[];
  error: string | null;
  aiState: Pick<AiState, "status" | "generated_at" | "cache_age_seconds" | "reason"> | null;
  analysisType: string | null;
  onClose: () => void;
  onSelectAnalysisType: (type: string) => void;
  onFlyTo: (lat: number, lon: number) => void;
}

const ANALYSIS_TYPES = [
  { key: "opportunities", label: "Opportunities" },
  { key: "risks", label: "Risks" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "environment", label: "Environment" },
];

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

const typeBadge: Record<string, string> = {
  opportunity: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  risk: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  recommendation: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  alert: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const severityBadge: Record<string, string> = {
  low: "bg-gray-100 text-gray-700 dark:bg-night-border dark:text-gray-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const typeIcon: Record<string, string> = {
  opportunities: "\uD83D\uDCA1",
  risks: "\u26A0\uFE0F",
  infrastructure: "\uD83C\uDFD7\uFE0F",
  environment: "\uD83C\uDF3F",
};

export default function IntelligencePanel({
  loading,
  suggestions,
  error,
  aiState,
  analysisType,
  onClose,
  onSelectAnalysisType,
  onFlyTo,
}: IntelligencePanelProps) {
  const sorted = [...suggestions].sort(
    (a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
  );

  const handleExport = () => {
    const date = new Date().toISOString().split("T")[0];
    const blob = new Blob([JSON.stringify(suggestions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `city-intelligence-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex justify-end">
      <div className="fixed inset-0 bg-black/30 z-[1999]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-night-secondary shadow-2xl overflow-y-auto z-[2000]">
        <div className="sticky top-0 bg-white dark:bg-night-secondary border-b dark:border-night-border z-10 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">City Intelligence</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AiStatusBadge state={aiState} />
              {analysisType && (
                <span className="rounded-full bg-gray-100 dark:bg-night-border px-2.5 py-1 text-xs font-medium capitalize text-gray-700 dark:text-gray-300">
                  {analysisType}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {ANALYSIS_TYPES.map((at) => (
              <button
                key={at.key}
                onClick={() => onSelectAnalysisType(at.key)}
                disabled={loading}
                className="flex flex-col items-center gap-2 p-4 border border-gray-200 dark:border-night-border rounded-xl hover:bg-gray-50 dark:hover:bg-night-border transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl">{typeIcon[at.key]}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{at.label}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-primary-600 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                <span className="w-2.5 h-2.5 bg-primary-600 rounded-full animate-pulse" style={{ animationDelay: "200ms" }} />
                <span className="w-2.5 h-2.5 bg-primary-600 rounded-full animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
              <p className="text-sm text-gray-500">Analyzing city data...</p>
            </div>
          )}

          {!loading && !error && sorted.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">Select an analysis type to get started</p>
          )}

          {!loading && sorted.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Suggestions ({sorted.length})</h3>
                <button
                  onClick={handleExport}
                  className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                >
                  Export JSON
                </button>
              </div>

              <div className="space-y-3">
                {sorted.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onFlyTo(s.lat, s.lon)}
                    className="w-full text-left bg-white dark:bg-night-secondary border border-gray-200 dark:border-night-border rounded-xl p-4 hover:shadow-md transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadge[s.type]}`}>
                        {s.type}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityBadge[s.severity]}`}>
                        {s.severity.toUpperCase()}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{s.title}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{s.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Confidence: {(s.confidence * 100).toFixed(0)}%</span>
                      <span>Metrics: {s.metrics_involved.join(", ")}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
