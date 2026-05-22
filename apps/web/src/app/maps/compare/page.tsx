"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { PageError, PageLoader } from "@/components/PageState";

const ThematicMap = dynamic(() => import("@/components/ThematicMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl">
      <span className="text-gray-400">Loading map...</span>
    </div>
  ),
});

interface MetricInfo {
  id: string;
  key: string;
  display_name: string;
  unit: string;
  category: string;
  min_value: number | null;
  max_value: number | null;
}

interface LayerMarker {
  sensor_id: string;
  sensor_name: string;
  lat: number;
  lon: number;
  value: number | null;
  unit: string;
  quality_flag: string | null;
  time: string | null;
}

export default function CompareMapsPage() {
  const { nightMode, toggleNightMode } = useTheme();
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [leftMetric, setLeftMetric] = useState("");
  const [rightMetric, setRightMetric] = useState("");
  const [leftMarkers, setLeftMarkers] = useState<LayerMarker[]>([]);
  const [rightMarkers, setRightMarkers] = useState<LayerMarker[]>([]);
  const [leftInfo, setLeftInfo] = useState<MetricInfo | null>(null);
  const [rightInfo, setRightInfo] = useState<MetricInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncing = useRef(false);
  const mapsRef = useRef<{ left?: maplibregl.Map; right?: maplibregl.Map }>({});

  useEffect(() => {
    document.title = "Compare Metrics | Urban Pulse";
  }, []);

  useEffect(() => {
    api.maps.metrics()
      .then((list) => {
        setError(null);
        setMetrics(list);
        if (list.length >= 2) {
          setLeftMetric(list[0].key);
          setRightMetric(list[1].key);
        } else if (list.length === 1) {
          setLeftMetric(list[0].key);
          setRightMetric(list[0].key);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load metrics"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!leftMetric) return;
    const mi = metrics.find((m) => m.key === leftMetric);
    if (mi) setLeftInfo(mi);
    api.maps.layers(leftMetric).then(setLeftMarkers).catch((err) => setError(err instanceof Error ? err.message : "Failed to load left map layer"));
  }, [leftMetric, metrics]);

  useEffect(() => {
    if (!rightMetric) return;
    const mi = metrics.find((m) => m.key === rightMetric);
    if (mi) setRightInfo(mi);
    api.maps.layers(rightMetric).then(setRightMarkers).catch((err) => setError(err instanceof Error ? err.message : "Failed to load right map layer"));
  }, [rightMetric, metrics]);

  const handleLeftReady = useCallback((map: maplibregl.Map) => {
    mapsRef.current.left = map;
    map.on("moveend", () => {
      if (syncing.current) return;
      const right = mapsRef.current.right;
      if (!right) return;
      syncing.current = true;
      right.setCenter(map.getCenter());
      right.setZoom(map.getZoom());
      right.setPitch(map.getPitch());
      right.setBearing(map.getBearing());
      requestAnimationFrame(() => { syncing.current = false; });
    });
  }, []);

  const handleRightReady = useCallback((map: maplibregl.Map) => {
    mapsRef.current.right = map;
    map.on("moveend", () => {
      if (syncing.current) return;
      const left = mapsRef.current.left;
      if (!left) return;
      syncing.current = true;
      left.setCenter(map.getCenter());
      left.setZoom(map.getZoom());
      left.setPitch(map.getPitch());
      left.setBearing(map.getBearing());
      requestAnimationFrame(() => { syncing.current = false; });
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-night-primary flex items-center justify-center">
        <PageLoader message="Loading comparison..." />
      </div>
    );
  }

  if (error) {
    return <PageError message={error} retry={() => window.location.reload()} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary flex flex-col">
      <header className="bg-white dark:bg-night-secondary shadow-sm border-b border-gray-200 dark:border-night-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary-700">Compare Metrics</h1>
          <nav className="flex gap-4 items-center">
            <button onClick={toggleNightMode} className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg" title={nightMode ? "Day mode" : "Night mode"}>
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/maps" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Maps</Link>
            <Link href="/map" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Map</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Home</Link>
          </nav>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        <div className="bg-white dark:bg-night-secondary border-b border-gray-200 dark:border-night-border px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Left:</label>
              <select
                value={leftMetric}
                onChange={(e) => setLeftMetric(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-night-border bg-white dark:bg-night-primary text-gray-900 dark:text-gray-100 rounded-lg text-sm"
              >
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>{m.display_name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Right:</label>
              <select
                value={rightMetric}
                onChange={(e) => setRightMetric(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-night-border bg-white dark:bg-night-primary text-gray-900 dark:text-gray-100 rounded-lg text-sm"
              >
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>{m.display_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row">
          <div className="flex-1 relative min-h-[400px] md:min-h-0 border-r border-gray-200 dark:border-night-border">
            <div className="absolute top-2 left-2 z-20 bg-black/60 text-white px-3 py-1 rounded-lg text-sm font-medium pointer-events-none">
              {leftInfo?.display_name ?? leftMetric}
            </div>
            {leftInfo && (
              <ThematicMap
                metricKey={leftMetric}
                metricInfo={leftInfo}
                markers={leftMarkers}
                mode="live"
                onMapReady={handleLeftReady}
              />
            )}
          </div>
          <div className="flex-1 relative min-h-[400px] md:min-h-0">
            <div className="absolute top-2 left-2 z-20 bg-black/60 text-white px-3 py-1 rounded-lg text-sm font-medium pointer-events-none">
              {rightInfo?.display_name ?? rightMetric}
            </div>
            {rightInfo && (
              <ThematicMap
                metricKey={rightMetric}
                metricInfo={rightInfo}
                markers={rightMarkers}
                mode="live"
                onMapReady={handleRightReady}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
