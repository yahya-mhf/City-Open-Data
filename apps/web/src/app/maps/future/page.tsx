"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import { api, type AiState, type IntelligenceSuggestion } from "@/lib/api";
import AiStatusBadge from "@/components/AiStatusBadge";
import { useTheme } from "@/lib/theme-context";
import { PageError, PageLoader } from "@/components/PageState";

const FutureCityMap = dynamic(() => import("@/components/FutureCityMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl"><span className="text-gray-400">Loading map...</span></div>,
});

interface CategorySensor {
  sensor_id: string;
  name: string;
  lat: number;
  lon: number;
}

interface CategoryEntry {
  color: string;
  label: string;
  sensors: CategorySensor[];
}

const CATEGORY_COLORS: Record<string, string> = {
  air_quality: "#22c55e",
  weather: "#3b82f6",
  traffic: "#f97316",
  environment: "#06b6d4",
  energy: "#eab308",
  water: "#0ea5e9",
  infrastructure: "#78716c",
  hydrology: "#0891b2",
  radiation: "#ef4444",
  health: "#ec4899",
  default: "#6b7280",
};

function getCategoryLabel(key: string): string {
  return key.replace(/_/g, " ");
}

export default function FutureCityPage() {
  const { nightMode, toggleNightMode } = useTheme();
  const [categories, setCategories] = useState<Record<string, CategoryEntry>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [intelSuggestions, setIntelSuggestions] = useState<IntelligenceSuggestion[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [intelState, setIntelState] = useState<Pick<AiState, "status" | "generated_at" | "cache_age_seconds" | "reason"> | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  const [allMetricKeys, setAllMetricKeys] = useState<string[]>([]);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadError(null);
        const metrics = await api.maps.metrics();
        if (cancelled) return;

        const keys = metrics.map((m) => m.key);
        setAllMetricKeys(keys);

        const layersResults = await Promise.all(
          keys.map((key) => api.maps.layers(key).catch(() => [] as never[]))
        );
        if (cancelled) return;

        const categoryMap: Record<
          string,
          { color: string; label: string; sensors: Map<string, CategorySensor> }
        > = {};

        metrics.forEach((metric, i) => {
          const cat = metric.category || "default";
          if (!categoryMap[cat]) {
            categoryMap[cat] = {
              color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.default,
              label: getCategoryLabel(cat),
              sensors: new Map(),
            };
          }

          const layerData = (layersResults[i] || []) as Array<{
            sensor_id: string;
            sensor_name: string;
            lat: number;
            lon: number;
          }>;
          layerData.forEach((s) => {
            if (!categoryMap[cat].sensors.has(s.sensor_id)) {
              categoryMap[cat].sensors.set(s.sensor_id, {
                sensor_id: s.sensor_id,
                name: s.sensor_name,
                lat: s.lat,
                lon: s.lon,
              });
            }
          });
        });

        const result: Record<string, CategoryEntry> = {};
        Object.entries(categoryMap).forEach(([key, entry]) => {
          result[key] = {
            color: entry.color,
            label: entry.label,
            sensors: Array.from(entry.sensors.values()),
          };
        });

        if (!cancelled) {
          setCategories(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Failed to load future city data");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

  const triggerAnalysis = useCallback(async () => {
    const map = mapRef.current;
    if (!map || allMetricKeys.length === 0) return;

    const bounds = map.getBounds();
    const bbox = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };

    setIntelLoading(true);
    setIntelError(null);
    try {
      const results = await api.intelligence.analyze({
        metric_keys: allMetricKeys,
        bbox,
        analysis_type: "opportunities",
      });
      setIntelState(results);
      setIntelSuggestions(results.suggestions);
      if (!results.available) {
        setIntelError(results.reason ?? "AI analysis unavailable");
      }
      setLastAnalyzed(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI analysis unavailable";
      setIntelError(message);
      setIntelState({
        status: "unavailable",
        generated_at: new Date().toISOString(),
        reason: message,
      });
    } finally {
      setIntelLoading(false);
    }
  }, [allMetricKeys]);

  useEffect(() => {
    if (
      mapRef.current &&
      Object.keys(categories).length > 0 &&
      !hasTriggeredRef.current
    ) {
      hasTriggeredRef.current = true;
      triggerAnalysis();
    }
  }, [categories, triggerAnalysis]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-700">City Intelligence Overview</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              AI-generated insights based on live sensor data
              {lastAnalyzed && (
                <span className="ml-2 text-gray-400">
                  &mdash; Last analysis: {lastAnalyzed.toLocaleTimeString()}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AiStatusBadge state={intelState} />
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                Analysis type: opportunities
              </span>
            </div>
            {intelError && <p className="mt-2 text-sm text-red-600">{intelError}</p>}
          </div>
          <nav className="flex items-center gap-4">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <button
              onClick={triggerAnalysis}
              disabled={intelLoading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {intelLoading ? "Analyzing..." : "Refresh Analysis"}
            </button>
            <Link href="/maps" className="text-gray-600 hover:text-primary-600 text-sm">
              Thematic Maps
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600 text-sm">
              Dashboard
            </Link>
            <Link href="/developer" className="text-gray-600 hover:text-primary-600 text-sm">
              Developer
            </Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600 text-sm">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 p-4 relative">
        {loading ? (
          <PageLoader message="Loading sensor data..." />
        ) : loadError ? (
          <PageError message={loadError} retry={() => window.location.reload()} />
        ) : (
          <div className="h-[calc(100vh-10rem)] rounded-xl overflow-hidden shadow-lg relative">
            <FutureCityMap
              categories={categories}
              intelligenceSuggestions={intelSuggestions}
              onMapReady={handleMapReady}
            />

            {intelLoading && (
              <div className="absolute top-4 right-4 z-[2000] bg-white/90 backdrop-blur rounded-xl shadow-2xl border px-5 py-3 flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" style={{ animationDelay: "200ms" }} />
                  <span className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" style={{ animationDelay: "400ms" }} />
                </div>
                <span className="text-sm text-gray-600">Analyzing city data...</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
