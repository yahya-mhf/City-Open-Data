"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface CorrelationPair {
  metric_a: string;
  metric_b: string;
  correlation: number;
}

interface ScatterPoint {
  time: string;
  a_value: number;
  b_value: number;
}

interface HistoryPoint {
  time: string;
  value_numeric?: number;
}

function getAccessToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("access_token") ?? undefined;
}

function correlationColor(r: number, nightMode: boolean): string {
  if (r > 0) {
    const intensity = Math.min(Math.abs(r), 1);
    if (nightMode) {
      const g = Math.round(255 - intensity * 200);
      const b = Math.round(255 - intensity * 200);
      return `rgb(255, ${g}, ${b})`;
    }
    const g = Math.round(255 - intensity * 180);
    const b = Math.round(255 - intensity * 180);
    return `rgb(255, ${g}, ${b})`;
  }
  if (r < 0) {
    const intensity = Math.min(Math.abs(r), 1);
    if (nightMode) {
      const g = Math.round(255 - intensity * 200);
      const rv = Math.round(255 - intensity * 200);
      return `rgb(${rv}, ${g}, 255)`;
    }
    const g = Math.round(255 - intensity * 180);
    const rv = Math.round(255 - intensity * 180);
    return `rgb(${rv}, ${g}, 255)`;
  }
  return nightMode ? "#374151" : "#f3f4f6";
}

function formatMetricName(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CorrelationsPage() {
  const { nightMode } = useTheme();
  const { token, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<string[]>([]);
  const [pairs, setPairs] = useState<CorrelationPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string; r: number } | null>(null);
  const [scatterData, setScatterData] = useState<ScatterPoint[]>([]);
  const [scatterLoading, setScatterLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setError("Login required to compute correlations.");
      setLoading(false);
      return;
    }
    const authToken = token;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.analytics.correlations(30, authToken);
        if (!cancelled) {
          setMetrics(data.metrics);
          setPairs(data.pairs);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load correlations");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authLoading, token]);

  const pairMap = useMemo(() => {
    const map = new Map<string, number>();
    pairs.forEach((p) => {
      const key = [p.metric_a, p.metric_b].sort().join("::");
      map.set(`${p.metric_a}::${p.metric_b}`, p.correlation);
      map.set(`${p.metric_b}::${p.metric_a}`, p.correlation);
    });
    return map;
  }, [pairs]);

  const handleCellClick = async (a: string, b: string) => {
    if (a === b) return;
    const pair = pairs.find(
      (p) => (p.metric_a === a && p.metric_b === b) || (p.metric_a === b && p.metric_b === a)
    );
    if (!pair) return;
    setSelectedPair({ a, b, r: pair.correlation });
    setScatterLoading(true);
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const token = getAccessToken();
      const sensors = await api.sensors.list(token);
      let histA: HistoryPoint[] = [];
      let histB: HistoryPoint[] = [];

      for (const sensor of sensors.slice(0, 20)) {
        try {
          const [candidateA, candidateB] = await Promise.all([
            api.analytics.history(sensor.id, a, since, undefined, token),
            api.analytics.history(sensor.id, b, since, undefined, token),
          ]);
          if (candidateA.length > 1 && candidateB.length > 1) {
            histA = candidateA;
            histB = candidateB;
            break;
          }
        } catch {
          continue;
        }
      }

      if (Array.isArray(histA) && Array.isArray(histB)) {
        const mapA = new Map<string, number>();
        const mapB = new Map<string, number>();
        histA.forEach((p) => {
          if (p.value_numeric != null) {
            const t = new Date(p.time).toISOString().slice(0, 13);
            mapA.set(t, (mapA.get(t) ?? 0) + p.value_numeric);
          }
        });
        histB.forEach((p) => {
          if (p.value_numeric != null) {
            const t = new Date(p.time).toISOString().slice(0, 13);
            mapB.set(t, (mapB.get(t) ?? 0) + p.value_numeric);
          }
        });

        const times = new Set([...mapA.keys(), ...mapB.keys()]);
        const scatter: ScatterPoint[] = [];
        times.forEach((t) => {
          const va = mapA.get(t);
          const vb = mapB.get(t);
          if (va != null && vb != null) {
            scatter.push({ time: t, a_value: va, b_value: vb });
          }
        });
        setScatterData(scatter);
      }
    } catch {
      setScatterData([]);
    } finally {
      setScatterLoading(false);
    }
  };

  const tooltipContentStyle = useMemo(() => ({
    backgroundColor: nightMode ? "#1f2937" : "#fff",
    border: `1px solid ${nightMode ? "#374151" : "#e5e7eb"}`,
    borderRadius: 8,
    fontSize: 12,
  }), [nightMode]);

  const strongPairs = useMemo(
    () => pairs.filter((p) => Math.abs(p.correlation) > 0.5).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
    [pairs]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <header className="bg-white dark:bg-night-secondary shadow-sm border-b border-gray-200 dark:border-night-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/analytics" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm">
              &larr; Analytics
            </Link>
            <h1 className="text-2xl font-bold text-primary-700">Correlation Matrix</h1>
          </div>
          <nav className="flex gap-4 items-center">
            <Link href="/map" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Map</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Home</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <PageLoader message="Computing correlations..." />
        ) : error ? (
          <PageError message={error} retry={() => window.location.reload()} />
        ) : metrics.length < 2 ? (
          <EmptyState message="Need at least two metrics with data to compute correlations." />
        ) : (
          <div className="space-y-8">
            <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">N&times;N Correlation Grid</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                Blue = negative correlation, White = no correlation, Red = positive correlation. Click a cell to view scatter plot.
              </p>
              <div className="inline-block min-w-full">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `120px repeat(${metrics.length}, 48px)`,
                    gridTemplateRows: `auto repeat(${metrics.length}, 48px)`,
                  }}
                >
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium px-2 py-1">Metric</div>
                  {metrics.map((m) => (
                    <div
                      key={m}
                      className="text-[9px] text-gray-500 dark:text-gray-400 font-medium text-center self-end pb-1 truncate"
                      title={formatMetricName(m)}
                    >
                      {formatMetricName(m)}
                    </div>
                  ))}
                  {metrics.map((rowMetric, ri) => (
                    <>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium flex items-center px-2 truncate" title={formatMetricName(rowMetric)}>
                        {formatMetricName(rowMetric)}
                      </div>
                      {metrics.map((colMetric, ci) => {
                        const r = pairMap.get(`${rowMetric}::${colMetric}`);
                        const isDiagonal = ri === ci;
                        const displayR = isDiagonal ? 1 : (r ?? 0);
                        return (
                          <button
                            key={`${ri}-${ci}`}
                            onClick={() => handleCellClick(rowMetric, colMetric)}
                            disabled={isDiagonal}
                            className={`aspect-square rounded-md text-[10px] font-mono font-bold transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                              isDiagonal ? "cursor-default" : "cursor-pointer"
                            }`}
                            style={{
                              backgroundColor: isDiagonal
                                ? (nightMode ? "#1e3a5f" : "#dbeafe")
                                : correlationColor(displayR, nightMode),
                              color: Math.abs(displayR) > 0.6
                                ? "#fff"
                                : (nightMode ? "#d1d5db" : "#374151"),
                            }}
                            title={`${formatMetricName(rowMetric)} vs ${formatMetricName(colMetric)}: ${displayR.toFixed(3)}`}
                          >
                            {displayR.toFixed(2)}
                          </button>
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 text-xs text-gray-400 dark:text-gray-500">
                <span>Strong -</span>
                <div className="flex gap-0.5">
                  {[-1, -0.5, 0, 0.5, 1].map((r) => (
                    <div
                      key={r}
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: correlationColor(r, nightMode) }}
                    />
                  ))}
                </div>
                <span>Strong +</span>
              </div>
            </div>

            {strongPairs.length > 0 && (
              <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Strongest Correlations</h2>
                <div className="space-y-2">
                  {strongPairs.slice(0, 10).map((p) => (
                    <button
                      key={`${p.metric_a}-${p.metric_b}`}
                      onClick={() => handleCellClick(p.metric_a, p.metric_b)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 dark:bg-night-border/50 hover:bg-gray-100 dark:hover:bg-night-border transition text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatMetricName(p.metric_a)}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">&times;</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatMetricName(p.metric_b)}</span>
                      </div>
                      <span
                        className={`text-sm font-bold font-mono ${
                          p.correlation > 0 ? "text-red-500" : "text-blue-500"
                        }`}
                      >
                        {p.correlation > 0 ? "+" : ""}{p.correlation.toFixed(3)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedPair && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-night-secondary rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {formatMetricName(selectedPair.a)} vs {formatMetricName(selectedPair.b)}
                    </h3>
                    <button
                      onClick={() => { setSelectedPair(null); setScatterData([]); }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="text-center mb-4">
                    <span className={`text-2xl font-bold font-mono ${
                      selectedPair.r > 0 ? "text-red-500" : "text-blue-500"
                    }`}>
                      r = {selectedPair.r > 0 ? "+" : ""}{selectedPair.r.toFixed(4)}
                    </span>
                  </div>
                  {scatterLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mr-3" />
                      Loading scatter data...
                    </div>
                  ) : scatterData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke={nightMode ? "#374151" : "#e5e7eb"} />
                        <XAxis
                          dataKey="a_value"
                          name={formatMetricName(selectedPair.a)}
                          tick={{ fontSize: 10, fill: nightMode ? "#d1d5db" : "#6b7280" }}
                          label={{ value: formatMetricName(selectedPair.a), position: "bottom", fontSize: 10, fill: nightMode ? "#d1d5db" : "#6b7280" }}
                        />
                        <YAxis
                          dataKey="b_value"
                          name={formatMetricName(selectedPair.b)}
                          tick={{ fontSize: 10, fill: nightMode ? "#d1d5db" : "#6b7280" }}
                          label={{ value: formatMetricName(selectedPair.b), angle: -90, position: "insideLeft", fontSize: 10, fill: nightMode ? "#d1d5db" : "#6b7280" }}
                        />
                        <Tooltip contentStyle={tooltipContentStyle} cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter data={scatterData} fill="#2563eb" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      Not enough aligned data points for scatter plot
                    </div>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
                    Each point represents one hour of aligned readings. {scatterData.length} data points.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
