"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, type BriefingResponse } from "@/lib/api";
import AiStatusBadge from "@/components/AiStatusBadge";
import { Badge, Button, Card, Skeleton, Tooltip } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

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

const HeroMap = dynamic(() => import("@/components/HeroMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gray-950" />,
});

function formatStat(n: number): string {
  if (n > 9999) return "9,999+";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

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
  const { user, token } = useAuth();
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [health, setHealth] = useState<CityHealthSummary | null>(null);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [markerFailed, setMarkerFailed] = useState(false);
  const [statsFailed, setStatsFailed] = useState(false);
  const [healthFailed, setHealthFailed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    const loadOperationsData = async () => {
      try {
        const [markerResult, statsResult, healthResult, briefingResult] = await Promise.allSettled([
          api.map.markers(),
          api.city.stats(),
          api.analytics.cityHealth(),
          api.intelligence.briefing(false, token ?? undefined),
        ]);

        if (!active) return;
        if (markerResult.status === "fulfilled") setMarkers(markerResult.value);
        if (statsResult.status === "fulfilled") setStats(statsResult.value);
        if (healthResult.status === "fulfilled") setHealth(healthResult.value);
        if (briefingResult.status === "fulfilled") setBriefing(briefingResult.value);
        setLastUpdated(new Date());
        setMarkerFailed(markerResult.status === "rejected");
        setStatsFailed(statsResult.status === "rejected");
        setHealthFailed(healthResult.status === "rejected");
      } catch {
        if (!active) return;
        setMarkerFailed(true);
        setStatsFailed(true);
        setHealthFailed(true);
      }
    };

    loadOperationsData();
    const interval = setInterval(loadOperationsData, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  const canRegenerate = user?.role === "operator" || user?.role === "admin";

  const regenerateBriefing = async () => {
    try {
      const next = await api.intelligence.briefing(true, token ?? undefined);
      setBriefing(next);
      setLastUpdated(new Date());
    } catch (err) {
      setStatsFailed(true);
    }
  };

  const markerFreshness = useMemo(() => metricTimestamp(markers), [markers]);
  const activeSensors = stats?.sensor_count ?? markers.filter((marker) => marker.status === "active").length;
  const activeAlerts = stats?.alert_count ?? 0;
  const aqiScore = health?.aqi.score;
  const anyFailed = markerFailed || statsFailed || healthFailed;
  const allFailed = markerFailed && statsFailed && healthFailed;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <section className="relative min-h-[calc(100vh-5.5rem)] overflow-hidden">
        <HeroMap markers={markers} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />

        <div className="relative z-10 flex min-h-[calc(100vh-5.5rem)] flex-col justify-between px-4 py-6 sm:px-6 lg:px-10">
          <div className="flex items-start justify-between gap-4">
            <Card className="max-w-md border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-night-border dark:bg-night-secondary/95">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Marrakech Live Operations</p>
                  <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Urban Pulse</h1>
                  {!anyFailed && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatFreshness(markerFreshness ?? stats?.timestamp)}</p>
                  )}
                </div>
                <Badge tone={anyFailed ? "warning" : "success"} className="text-xs px-2 py-0.5">{anyFailed ? "Degraded" : "Live"}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-night-border dark:bg-night-border/30">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Active Readings</p>
                  {statsFailed ? (
                    <Tooltip label="unavailable">
                      <p className="mt-1 text-2xl font-bold text-gray-400 dark:text-gray-500">&mdash;</p>
                    </Tooltip>
                  ) : (
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stats ? formatStat(activeSensors) : <Skeleton className="h-7 w-14 bg-gray-200 dark:bg-night-border" />}</p>
                  )}
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Sensors online</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-night-border dark:bg-night-border/30">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Active Alerts</p>
                  {statsFailed ? (
                    <Tooltip label="unavailable">
                      <p className="mt-1 text-2xl font-bold text-gray-400 dark:text-gray-500">&mdash;</p>
                    </Tooltip>
                  ) : (
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stats ? formatStat(activeAlerts) : <Skeleton className="h-7 w-14 bg-gray-200 dark:bg-night-border" />}</p>
                  )}
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Requiring attention</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-night-border dark:bg-night-border/30">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Air Quality</p>
                  {healthFailed ? (
                    <Tooltip label="unavailable">
                      <p className="mt-1 text-2xl font-bold text-gray-400 dark:text-gray-500">&mdash;</p>
                    </Tooltip>
                  ) : aqiScore !== undefined && aqiScore !== null ? (
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{Math.round(aqiScore)}</p>
                  ) : !health ? (
                    <Skeleton className="h-7 w-14 bg-gray-200 dark:bg-night-border" />
                  ) : (
                    <Tooltip label="No data">
                      <p className="mt-1 text-2xl font-bold text-gray-400 dark:text-gray-500">&mdash;</p>
                    </Tooltip>
                  )}
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">AQI index</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <Link href="/map" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700">
                  Open Operations View
                </Link>
                {allFailed && (
                  <span className="text-xs text-red-600 dark:text-red-400">Some data unavailable</span>
                )}
              </div>
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <AiStatusBadge state={briefing} className="bg-black/30 text-white dark:bg-black/30 dark:text-white" />
                  <span className="text-xs text-white/50">{formatFreshness(briefing?.generated_at ?? lastUpdated?.toISOString())}</span>
                  {canRegenerate && (
                    <Button size="sm" variant="secondary" onClick={regenerateBriefing} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                      Regenerate
                    </Button>
                  )}
                </div>
              </div>
              {briefing?.available && briefing.paragraphs?.length ? (
                <div className="space-y-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  {briefing.paragraphs.slice(0, 2).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              ) : briefing?.available && (!briefing.paragraphs?.length) ? (
                <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Briefing will be generated at 06:00 each morning.
                </p>
              ) : briefing && !briefing.available ? (
                <p className="text-sm leading-6 text-red-600 dark:text-red-400">
                  AI briefing unavailable: {briefing.reason ?? "Groq not configured"}.
                </p>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full bg-gray-200 dark:bg-night-border" />
                  <Skeleton className="h-4 w-5/6 bg-gray-200 dark:bg-night-border" />
                  <Skeleton className="h-4 w-2/3 bg-gray-200 dark:bg-night-border" />
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
