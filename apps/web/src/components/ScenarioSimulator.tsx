"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  sensorId: string;
  metrics: { key: string; display_name: string }[];
  latest: Record<string, number> | null;
}

interface SimulationResult {
  impact: Record<string, { current: number; hypothetical: number; diff: number; percent_change: number; direction: string }>;
}

export default function ScenarioSimulator({ sensorId, metrics, latest }: Props) {
  const [open, setOpen] = useState(false);
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const initSliders = () => {
    if (!latest) return;
    const vals: Record<string, number> = {};
    for (const [k, v] of Object.entries(latest)) {
      vals[k] = v;
    }
    setAdjustments(vals);
    setResult(null);
    setError("");
  };

  const runSimulation = async () => {
    if (!latest) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.sensors.simulate(sensorId, adjustments);
      setResult({ impact: res.impact });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    }
    setLoading(false);
  };

  const resetAll = () => {
    initSliders();
    setResult(null);
  };

  if (!latest) return null;

  return (
    <div className="bg-white dark:bg-night-secondary rounded-xl shadow">
      <button
        onClick={() => { setOpen(!open); if (!open) initSliders(); }}
        className="w-full px-6 py-4 flex items-center justify-between text-left"
      >
        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Scenario Simulator
        </span>
        <span className="text-gray-400 text-xl">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Adjust metric values to simulate a what-if scenario and see the projected impact.
          </p>

          <div className="space-y-3">
            {metrics.map((m) => {
              const curr = latest[m.key] ?? 0;
              const adj = adjustments[m.key] ?? curr;
              const range = Math.max(Math.abs(curr) * 2, 10);
              const minVal = curr - range;
              const maxVal = curr + range;
              return (
                <div key={m.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">{m.display_name}</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">
                      {adj.toFixed(1)}
                      {result?.impact[m.key] && (
                        <span
                          className={`ml-2 text-xs ${
                            result.impact[m.key].direction === "up"
                              ? "text-red-500"
                              : result.impact[m.key].direction === "down"
                              ? "text-green-500"
                              : "text-gray-400"
                          }`}
                        >
                          {result.impact[m.key].direction === "up" ? "+" : ""}
                          {result.impact[m.key].diff.toFixed(1)} ({result.impact[m.key].percent_change > 0 ? "+" : ""}
                          {result.impact[m.key].percent_change.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={minVal}
                    max={maxVal}
                    step={(maxVal - minVal) / 100}
                    value={adj}
                    onChange={(e) => setAdjustments((prev) => ({ ...prev, [m.key]: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-night-border rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>{minVal.toFixed(1)}</span>
                    <span>Current: {curr.toFixed(1)}</span>
                    <span>{maxVal.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={runSimulation}
              disabled={loading}
              className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
            >
              {loading ? "Simulating..." : "Run Simulation"}
            </button>
            <button
              onClick={resetAll}
              className="px-4 py-2 border border-gray-300 dark:border-night-border text-gray-700 dark:text-gray-300 rounded-lg text-sm"
            >
              Reset
            </button>
          </div>

          {result && Object.keys(result.impact).length > 0 && (
            <div className="bg-gray-50 dark:bg-night-primary rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Projected Impact</h4>
              {Object.entries(result.impact).map(([key, imp]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{key}</span>
                  <span className="font-mono text-gray-900 dark:text-gray-100">
                    {imp.current.toFixed(1)} &rarr; {imp.hypothetical.toFixed(1)}
                    <span
                      className={`ml-2 ${
                        imp.direction === "up"
                          ? "text-red-500"
                          : imp.direction === "down"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      ({imp.percent_change > 0 ? "+" : ""}
                      {imp.percent_change.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
