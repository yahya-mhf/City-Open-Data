"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/api";
import {
  LineChart, ComposedChart, BarChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface MetricInfo {
  key: string;
  display_name: string;
  unit: string;
}

interface SensorChartsProps {
  sensorId: string;
  metrics: MetricInfo[];
  latest: Record<string, number> | null;
  status: string;
}

interface MetricStat {
  metric_key: string;
  display_name: string;
  unit: string;
  current_value?: number;
  avg_24h?: number;
  monthly_avg?: number;
  monthly_min?: number;
  monthly_max?: number;
  monthly_count: number;
}

interface ForecastPoint {
  time: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

interface HistoryPoint {
  time: string;
  value: number;
}

interface CombinedChartPoint {
  time: string;
  actual: number | null;
  forecast_value: number | null;
  lower_bound: number | null;
  upper_bound: number | null;
}

interface HeatmapCell {
  hour: number;
  weekday: number;
  avg_value: number;
  metric_key: string;
}

interface DistributionBucket {
  range_min: number;
  range_max: number;
  count: number;
  metric_key: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatBucketLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-gray-200 dark:bg-night-border rounded-lg animate-pulse ${className}`} />
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-gray-200 dark:bg-night-border rounded-lg p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <div className={`w-full rounded-lg`} style={{ height }}>
        <div className="w-full h-full bg-gray-200 dark:bg-night-border rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

function getHeatmapColor(value: number, min: number, max: number, nightMode: boolean): string {
  if (max === min) return nightMode ? "#1f2937" : "#f3f4f6";
  const ratio = (value - min) / (max - min);
  if (ratio < 0.25) return nightMode ? "#1e3a5f" : "#dbeafe";
  if (ratio < 0.5) return nightMode ? "#1e40af" : "#93c5fd";
  if (ratio < 0.75) return nightMode ? "#1d4ed8" : "#60a5fa";
  return nightMode ? "#3b82f6" : "#2563eb";
}

export default function SensorCharts({ sensorId, metrics, latest, status }: SensorChartsProps) {
  const { nightMode } = useTheme();
  const [stats, setStats] = useState<MetricStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [historyData, setHistoryData] = useState<Map<string, HistoryPoint[]>>(new Map());
  const [forecastData, setForecastData] = useState<Map<string, ForecastPoint[]>>(new Map());
  const [forecastMeta, setForecastMeta] = useState<Map<string, { type: string; regressors: string[]; regressor_importance: Record<string, number> }>>(new Map());
  const [chartsLoading, setChartsLoading] = useState(true);
  const [heatmap, setHeatmap] = useState<Map<string, HeatmapCell[]>>(new Map());
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [distribution, setDistribution] = useState<Map<string, DistributionBucket[]>>(new Map());
  const [distLoading, setDistLoading] = useState(true);

  useEffect(() => {
    if (metrics.length === 0) return;
    let cancelled = false;

    async function load() {
      setStatsLoading(true);
      setChartsLoading(true);
      setHeatmapLoading(true);
      setDistLoading(true);

      try {
        const [statsRes, heatmapRes] = await Promise.all([
          api.sensors.stats(sensorId),
          api.sensors.heatmap(sensorId),
        ]);

        if (cancelled) return;
        setStats(statsRes.metrics);

        const hmByMetric = new Map<string, HeatmapCell[]>();
        heatmapRes.forEach((cell) => {
          if (!hmByMetric.has(cell.metric_key)) hmByMetric.set(cell.metric_key, []);
          hmByMetric.get(cell.metric_key)!.push(cell);
        });
        setHeatmap(hmByMetric);
        setStatsLoading(false);
        setHeatmapLoading(false);

        const metricKeys = metrics.map((m) => m.key);
        const historyPromises = metricKeys.map((mk) =>
          api.sensors.history(sensorId, mk, 168).then((data) => ({ mk, data }))
        );
        const forecastPromises = metricKeys.map((mk) =>
          api.maps.forecastSensor(mk, sensorId, 24)
            .then((data) => ({ mk, forecast: data.forecast, meta: { type: data.type, regressors: data.regressors, regressor_importance: data.regressor_importance } }))
            .catch(() => ({ mk, forecast: [] as ForecastPoint[], meta: { type: "single-sensor", regressors: [], regressor_importance: {} } }))
        );
        const distPromises = metricKeys.map((mk) =>
          api.sensors.distribution(sensorId, mk, 15).then((data) => ({ mk, data }))
        );

        const [historyResults, forecastResults, distResults] = await Promise.all([
          Promise.all(historyPromises),
          Promise.all(forecastPromises),
          Promise.all(distPromises),
        ]);

        if (cancelled) return;

        const hMap = new Map<string, HistoryPoint[]>();
        historyResults.forEach(({ mk, data }) => {
          hMap.set(mk, data.map((p) => ({
            time: p.time,
            value: p.value_numeric ?? 0,
          })));
        });
        setHistoryData(hMap);

        const fMap = new Map<string, ForecastPoint[]>();
        const fmMap = new Map<string, { type: string; regressors: string[]; regressor_importance: Record<string, number> }>();
        forecastResults.forEach(({ mk, forecast, meta }) => {
          fMap.set(mk, forecast);
          fmMap.set(mk, meta);
        });
        setForecastData(fMap);
        setForecastMeta(fmMap);

        const dMap = new Map<string, DistributionBucket[]>();
        distResults.forEach(({ mk, data }) => dMap.set(mk, data));
        setDistribution(dMap);
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
          setChartsLoading(false);
          setDistLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sensorId, metrics]);

  const combinedChartData = useCallback((mk: string): CombinedChartPoint[] => {
    const history = historyData.get(mk) ?? [];
    const forecast = forecastData.get(mk) ?? [];
    const combined: CombinedChartPoint[] = [];

    history.forEach((p) => {
      combined.push({
        time: formatBucketLabel(p.time),
        actual: p.value,
        forecast_value: null,
        lower_bound: null,
        upper_bound: null,
      });
    });

    forecast.forEach((p) => {
      combined.push({
        time: formatBucketLabel(p.time),
        actual: null,
        forecast_value: p.value,
        lower_bound: p.lower_bound,
        upper_bound: p.upper_bound,
      });
    });

    return combined;
  }, [historyData, forecastData]);

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    inactive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  const tooltipContentStyle = useMemo(() => ({
    backgroundColor: nightMode ? "#1f2937" : "#fff",
    border: `1px solid ${nightMode ? "#374151" : "#e5e7eb"}`,
    borderRadius: 8,
    fontSize: 12,
  }), [nightMode]);

  if (metrics.length === 0 && !statsLoading) {
    return (
      <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No metrics available for this sensor</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Live Stats</h2>
        {statsLoading ? (
          <StatsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.metric_key} className="bg-gray-50 dark:bg-night-border/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{s.display_name}</div>
                <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">
                  {s.current_value?.toFixed(1) ?? "--"}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{s.unit}</div>
                <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>24h avg</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{s.avg_24h?.toFixed(1) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>30d avg</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{s.monthly_avg?.toFixed(1) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>30d max</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{s.monthly_max?.toFixed(1) ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>30d min</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{s.monthly_min?.toFixed(1) ?? "--"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">7-Day History & Forecast</h2>
        </div>
        {chartsLoading ? (
          <div className="space-y-6">
            {metrics.map((m) => <ChartSkeleton key={m.key} height={200} />)}
          </div>
        ) : metrics.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No data available</p>
        ) : (
          <div className="space-y-6">
            {metrics.map((mk) => {
              const combined = combinedChartData(mk.key);
              if (combined.length === 0) return null;
              return (
                <div key={mk.key} className="bg-gray-50 dark:bg-night-border/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">
                      {mk.display_name}
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 font-normal">({mk.unit})</span>
                    </h4>
                    <div className="flex items-center gap-1.5">
                      {forecastMeta.get(mk.key)?.type === "multi-sensor" && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                          Multi-regressor
                        </span>
                      )}
                      {forecastData.get(mk.key)?.length ? (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          +{forecastData.get(mk.key)!.length}h forecast
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={combined}>
                      <defs>
                        <linearGradient id={`bandGrad-${mk.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={nightMode ? "#374151" : "#e5e7eb"} />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 9, fill: nightMode ? "#9ca3af" : "#6b7280" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis tick={{ fontSize: 9, fill: nightMode ? "#9ca3af" : "#6b7280" }} />
                      <Tooltip contentStyle={tooltipContentStyle} />
                      <Area type="monotone" dataKey="upper_bound" fill={`url(#bandGrad-${mk.key})`} stroke="none" />
                      <Area type="monotone" dataKey="lower_bound" fill={nightMode ? "#1f2937" : "#fff"} fillOpacity={1} stroke="none" />
                      <Line type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="forecast_value" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">24-Hour Heatmap</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Average value by hour and weekday (last 30 days)</p>
        {heatmapLoading ? (
          <ChartSkeleton height={180} />
        ) : heatmap.size === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No heatmap data available</p>
        ) : (
          <div className="space-y-6">
            {metrics.map((mk) => {
              const cells = heatmap.get(mk.key) ?? [];
              if (cells.length === 0) return null;
              const values = cells.map((c) => c.avg_value);
              const min = Math.min(...values);
              const max = Math.max(...values);
              const cellMap = new Map<string, number>();
              cells.forEach((c) => cellMap.set(`${c.weekday}-${c.hour}`, c.avg_value));
              return (
                <div key={mk.key}>
                  <h4 className="text-sm font-semibold capitalize mb-2 text-gray-900 dark:text-gray-100">
                    {mk.display_name}
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 font-normal">({mk.unit})</span>
                  </h4>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-[repeat(24,minmax(24px,1fr))] gap-0.5 min-w-[600px]">
                      {HOURS.map((hour) => (
                        <div key={hour} className="text-center text-[9px] text-gray-400 dark:text-gray-500 font-medium pb-1">
                          {hour}
                        </div>
                      ))}
                      {WEEKDAYS.map((day, wi) =>
                        HOURS.map((hour) => {
                          const val = cellMap.get(`${wi}-${hour}`);
                          return (
                            <div
                              key={`${wi}-${hour}`}
                              className="aspect-square rounded-sm"
                              title={`${day} ${hour}:00 — ${val?.toFixed(1) ?? "N/A"} ${mk.unit}`}
                              style={{
                                backgroundColor: val !== undefined
                                  ? getHeatmapColor(val, min, max, nightMode)
                                  : (nightMode ? "#111827" : "#f9fafb"),
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                      <span>Low</span>
                      <div className="flex gap-0.5">
                        {[0.1, 0.3, 0.5, 0.75, 1].map((r) => (
                          <div
                            key={r}
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: getHeatmapColor(r, 0, 1, nightMode) }}
                          />
                        ))}
                      </div>
                      <span>High</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Distribution</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Value distribution for the current month</p>
        {distLoading ? (
          <ChartSkeleton height={200} />
        ) : distribution.size === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No distribution data available</p>
        ) : (
          <div className="space-y-6">
            {metrics.map((mk) => {
              const dist = distribution.get(mk.key) ?? [];
              if (dist.length === 0) return null;
              const chartData = dist.map((b) => ({
                range: `${b.range_min.toFixed(1)}-${b.range_max.toFixed(1)}`,
                count: b.count,
              }));
              return (
                <div key={mk.key}>
                  <h4 className="text-sm font-semibold capitalize mb-2 text-gray-900 dark:text-gray-100">
                    {mk.display_name}
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 font-normal">({mk.unit})</span>
                  </h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={nightMode ? "#374151" : "#e5e7eb"} />
                      <XAxis
                        dataKey="range"
                        tick={{ fontSize: 8, fill: nightMode ? "#9ca3af" : "#6b7280" }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 9, fill: nightMode ? "#9ca3af" : "#6b7280" }} />
                      <Tooltip contentStyle={tooltipContentStyle} />
                      <Bar dataKey="count" fill="#2563eb" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
