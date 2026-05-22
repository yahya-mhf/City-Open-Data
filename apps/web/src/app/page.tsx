"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { Badge, Card, Skeleton } from "@/components/ui";

interface Marker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  latest: Record<string, unknown>;
}

interface CityStats {
  sensor_count: number;
  alert_count: number;
  timestamp?: string;
}

interface CityHealthSummary {
  aqi: {
    score: number | null;
    status: string;
  };
  updated_at: string;
}

interface BriefingState {
  paragraphs: string[];
  generated_at: string;
}

const HeroMap = dynamic(() => import("@/components/HeroMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gray-950" />,
});

function formatFreshness(timestamp?: string | null): string {
  if (!timestamp) return "Updated just now";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (elapsedSeconds < 60) return `Updated ${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `Updated ${elapsedHours}h ago`;
}

function metricTimestamp(markers: Marker[]): string | null {
  const timestamps = markers
    .map((marker) => marker.latest?.timestamp)
    .filter((value): value is string => typeof value === "string");
  if (timestamps.length === 0) return null;
  return timestamps.sort().at(-1) ?? null;
}

export default function Home() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [health, setHealth] = useState<CityHealthSummary | null>(null);
  const [briefing, setBriefing] = useState<BriefingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    const loadOperationsData = async () => {
      try {
        const [markerResult, statsResult, healthResult, briefingResult] = await Promise.allSettled([
          api.map.markers(),
          api.city.stats(),
          api.analytics.cityHealth(),
          api.intelligence.briefing(),
        ]);

        if (!active) return;
        if (markerResult.status === "fulfilled") setMarkers(markerResult.value);
        if (statsResult.status === "fulfilled") setStats(statsResult.value);
        if (healthResult.status === "fulfilled") setHealth(healthResult.value);
        if (briefingResult.status === "fulfilled") setBriefing(briefingResult.value);
        setLastUpdated(new Date());
        const failed = [markerResult, statsResult, healthResult].filter((result) => result.status === "rejected").length;
        setError(failed > 0 ? "Some live operations data is unavailable." : null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load live operations data");
      }
    };

    loadOperationsData();
    const interval = setInterval(loadOperationsData, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const markerFreshness = useMemo(() => metricTimestamp(markers), [markers]);
  const activeSensors = stats?.sensor_count ?? markers.filter((marker) => marker.status === "active").length;
  const activeAlerts = stats?.alert_count ?? 0;
  const aqiScore = health?.aqi.score;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <section className="relative min-h-[calc(100vh-5.5rem)] overflow-hidden">
        <HeroMap markers={markers} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />

        <div className="relative z-10 flex min-h-[calc(100vh-5.5rem)] flex-col justify-between px-4 py-6 sm:px-6 lg:px-10">
          <div className="flex items-start justify-between gap-4">
            <Card className="max-w-md border-white/15 bg-black/45 p-5 text-white shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-black/45">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">Marrakech Live Operations</p>
                  <h1 className="mt-2 text-3xl font-bold text-white">Urban Pulse</h1>
                </div>
                <Badge tone={error ? "danger" : "success"}>{error ? "Degraded" : "Live"}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                  <p className="text-xs text-white/60">Sensors</p>
                  <p className="mt-1 text-2xl font-semibold">{stats ? activeSensors : <Skeleton className="h-7 w-12 bg-white/20" />}</p>
                  <p className="mt-2 text-[11px] text-white/50">{formatFreshness(markerFreshness ?? stats?.timestamp)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                  <p className="text-xs text-white/60">Alerts</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-300">{stats ? activeAlerts : <Skeleton className="h-7 w-12 bg-white/20" />}</p>
                  <p className="mt-2 text-[11px] text-white/50">{formatFreshness(stats?.timestamp)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                  <p className="text-xs text-white/60">AQI</p>
                  <p className="mt-1 text-2xl font-semibold">{aqiScore !== undefined && aqiScore !== null ? Math.round(aqiScore) : <Skeleton className="h-7 w-12 bg-white/20" />}</p>
                  <p className="mt-2 text-[11px] text-white/50">{formatFreshness(health?.updated_at)}</p>
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-200">{error}</p>}

              <Link href="/map" className="mt-5 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600">
                Open Operations View
              </Link>
            </Card>

            <div className="hidden flex-wrap justify-end gap-2 md:flex">
              <Link href="/map" className="rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/15">
                Operations
              </Link>
              <Link href="/analytics" className="rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/15">
                Analytics
              </Link>
              <Link href="/developer" className="rounded-lg border border-white/15 bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/15">
                API
              </Link>
            </div>
          </div>

          <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,32rem)_1fr]">
            <Card className="border-white/15 bg-black/45 p-5 text-white shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-black/45">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">Daily Briefing</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Operator summary</h2>
                </div>
                <span className="text-xs text-white/50">{formatFreshness(briefing?.generated_at ?? lastUpdated?.toISOString())}</span>
              </div>
              {briefing ? (
                <div className="space-y-2 text-sm leading-6 text-white/80">
                  {briefing.paragraphs.slice(0, 2).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full bg-white/20" />
                  <Skeleton className="h-4 w-5/6 bg-white/20" />
                  <Skeleton className="h-4 w-2/3 bg-white/20" />
                </div>
              )}
            </Card>

            <div className="hidden justify-end lg:flex">
              <div className="rounded-lg border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/70 backdrop-blur">
                {markers.length > 0 ? `${markers.length} mapped live sensor locations` : "Loading live sensor locations"}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
