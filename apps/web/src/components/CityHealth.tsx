"use client";

import { useEffect, useState, useMemo } from "react";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/api";
import FreshnessIndicator from "@/components/FreshnessIndicator";
import {
  AreaChart, Area, ResponsiveContainer,
} from "recharts";

interface HealthMetric {
  name: string;
  score: number | null;
  previous_score: number | null;
  trend: string | null;
  status: string;
  sparkline: (number | null)[];
  data_available?: boolean;
}

interface HealthData {
  aqi: HealthMetric;
  heat_stress: HealthMetric;
  livability: HealthMetric;
  updated_at: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "good": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800";
    case "moderate": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    case "critical": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

function trendIcon(trend: string | null): string {
  switch (trend) {
    case "up": return "\u2191";
    case "down": return "\u2193";
    default: return "\u2192";
  }
}

function trendColor(trend: string | null, status: string): string {
  if (status === "critical") {
    return trend === "up" ? "text-green-500" : "text-red-500";
  }
  return trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-gray-400 dark:text-gray-500";
}

function sparkColor(status: string, nightMode: boolean): string {
  if (nightMode) {
    return status === "good" ? "#4ade80" : status === "critical" ? "#f87171" : "#fbbf24";
  }
  return status === "good" ? "#16a34a" : status === "critical" ? "#dc2626" : "#d97706";
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-5 animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 dark:bg-night-border rounded w-24" />
      <div className="h-10 bg-gray-200 dark:bg-night-border rounded w-16" />
      <div className="h-3 bg-gray-200 dark:bg-night-border rounded w-32" />
      <div className="h-8 bg-gray-200 dark:bg-night-border rounded w-full" />
    </div>
  );
}

export default function CityHealth() {
  const { nightMode } = useTheme();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await api.analytics.cityHealth();
        if (!cancelled) setData(d);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 300000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <section className="relative z-10 px-4 mb-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">City Health Dashboard</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const cards: HealthMetric[] = [data.aqi, data.heat_stress, data.livability];

  return (
    <section className="relative z-10 px-4 -mt-8 mb-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">City Health Dashboard</h2>
          <FreshnessIndicator timestamp={data.updated_at} label="City health" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((card) => {
            const chartData = card.sparkline.map((v, i) => ({ i, v }));
            return (
              <div
                key={card.name}
                className="bg-white dark:bg-night-secondary rounded-xl shadow p-5 border border-gray-100 dark:border-night-border"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{card.name}</h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(card.status)}`}>
                    {card.status}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{card.score ?? "--"}</span>
                  {card.score !== null && card.previous_score !== null && (
                    <span className={`text-sm font-medium ${trendColor(card.trend, card.status)}`}>
                      {trendIcon(card.trend)} {Math.abs(card.score - card.previous_score).toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                  {card.previous_score !== null ? `vs yesterday: ${card.previous_score.toFixed(1)}` : "data unavailable"}
                </div>
                {chartData.length > 0 && (
                  <div className="h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id={`sparkGrad-${card.name.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={sparkColor(card.status, nightMode)} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={sparkColor(card.status, nightMode)} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke={sparkColor(card.status, nightMode)}
                          strokeWidth={1.5}
                          fill={`url(#sparkGrad-${card.name.replace(/\s/g, "")})`}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
