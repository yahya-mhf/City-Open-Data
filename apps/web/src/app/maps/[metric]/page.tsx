"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import { api, type AiState, type IntelligenceSuggestion } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import SensorDrawer from "@/components/SensorDrawer";
import IntelligencePanel from "@/components/IntelligencePanel";
import { PageError, PageLoader } from "@/components/PageState";
import FreshnessIndicator from "@/components/FreshnessIndicator";
import {
  LineChart, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface MetricInfo {
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

interface HistoryBucket {
  time: string;
  avg_value: number;
}

interface HistoryEntry {
  sensor_id: string;
  buckets: HistoryBucket[];
}

interface ForecastPoint {
  time: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

const ThematicMap = dynamic(() => import("@/components/ThematicMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl"><span className="text-gray-400">Loading map...</span></div>,
});

function toLocalISO(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatBucketLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MetricMapContent() {
  const { nightMode, toggleNightMode } = useTheme();
  const params = useParams();
  const metricKey = params.metric as string;

  const [metricInfo, setMetricInfo] = useState<MetricInfo | null>(null);
  const [markers, setMarkers] = useState<LayerMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"live" | "history" | "forecast">("live");
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [chartSensorId, setChartSensorId] = useState<string | null>(null);

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(toLocalISO(defaultFrom).slice(0, 16));
  const [toDate, setToDate] = useState(toLocalISO(now).slice(0, 16));
  const [interval, setInterval] = useState("1h");
  const [playing, setPlaying] = useState(false);
  const [currentBucketIndex, setCurrentBucketIndex] = useState(-1);
  const [bucketTimes, setBucketTimes] = useState<string[]>([]);
  const [bucketData, setBucketData] = useState<Map<string, Map<string, number | null>>>(new Map());
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const forecastHoursOptions = [6, 12, 24, 48, 72];
  const [forecastHours, setForecastHours] = useState(24);
  const [forecastData, setForecastData] = useState<Map<string, ForecastPoint[]>>(new Map());
  const [forecastValuesMap, setForecastValuesMap] = useState<Map<string, number | null>>(new Map());
  const [trendMap, setTrendMap] = useState<Map<string, "up" | "down" | "flat">>(new Map());
  const [forecastTypeMap, setForecastTypeMap] = useState<Map<string, string>>(new Map());
  const [forecastLoading, setForecastLoading] = useState(false);
  const playRef = useRef<number | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [intelOpen, setIntelOpen] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelSuggestions, setIntelSuggestions] = useState<IntelligenceSuggestion[]>([]);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [intelState, setIntelState] = useState<Pick<AiState, "status" | "generated_at" | "cache_age_seconds" | "reason"> | null>(null);
  const [intelAnalysisType, setIntelAnalysisType] = useState<string | null>(null);

  const { user, token } = useAuth();

  useEffect(() => {
    if (!metricKey) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const allMetrics = await api.maps.metrics();
        const found = allMetrics.find((m) => m.key === metricKey);
        if (!found) {
          if (!cancelled) { setError(`Metric "${metricKey}" not found`); setLoading(false); }
          return;
        }
        const layerData = await api.maps.layers(metricKey);
        if (!cancelled) { setMetricInfo(found); setMarkers(layerData); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "Failed to load map data"); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [metricKey]);

  const fetchHistory = useCallback(async () => {
    if (!metricKey) return;
    setHistoryLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      const url = `${API_URL}/maps/layers/${metricKey}/history?from=${encodeURIComponent(fromDate + ":00Z")}&to=${encodeURIComponent(toDate + ":00Z")}&interval=${encodeURIComponent(interval)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data: HistoryEntry[] = await res.json();
      setHistoryData(data);

      const buckets = new Set<string>();
      const bData = new Map<string, Map<string, number | null>>();

      (data as unknown as HistoryEntry[]).forEach((entry) => {
        entry.buckets.forEach((b) => {
          buckets.add(b.time);
          if (!bData.has(b.time)) bData.set(b.time, new Map());
          bData.get(b.time)!.set(entry.sensor_id, b.avg_value);
        });
      });

      const allSensorIds = new Set(markers.map((m) => m.sensor_id));
      const sortedBuckets = Array.from(buckets).sort();

      bData.forEach((sensorMap, bucketTime) => {
        allSensorIds.forEach((sid) => {
          if (!sensorMap.has(sid)) sensorMap.set(sid, null);
        });
      });

      setBucketTimes(sortedBuckets);
      setBucketData(bData);
      setCurrentBucketIndex(-1);
      setChartSensorId(null);
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  }, [metricKey, fromDate, toDate, interval, markers]);

  const fetchForecast = useCallback(async () => {
    if (!metricKey) return;
    setForecastLoading(true);
    try {
      const data = await api.maps.forecast(metricKey, forecastHours);
      const fMap = new Map<string, ForecastPoint[]>();
      const vMap = new Map<string, number | null>();
      const tMap = new Map<string, "up" | "down" | "flat">();

      const typeM = new Map<string, string>();
      data.forEach((entry) => {
        fMap.set(entry.sensor_id, entry.forecast);
        typeM.set(entry.sensor_id, entry.type || "single-sensor");
        if (entry.forecast.length > 0) {
          const lastVal = entry.forecast[entry.forecast.length - 1].value;
          vMap.set(entry.sensor_id, lastVal);

          const first = entry.forecast[0].value;
          const last = entry.forecast[entry.forecast.length - 1].value;
          if (last > first * 1.01) tMap.set(entry.sensor_id, "up");
          else if (last < first * 0.99) tMap.set(entry.sensor_id, "down");
          else tMap.set(entry.sensor_id, "flat");
        }
      });

      setForecastData(fMap);
      setForecastValuesMap(vMap);
      setTrendMap(tMap);
      setForecastTypeMap(typeM);
    } catch {
    } finally {
      setForecastLoading(false);
    }
  }, [metricKey, forecastHours]);

  useEffect(() => {
    if ((mode === "history" || mode === "forecast") && markers.length > 0) {
      fetchHistory();
    }
  }, [mode, fromDate, toDate, interval, markers.length > 0]);

  useEffect(() => {
    if (playing && bucketTimes.length > 0) {
      playRef.current = window.setInterval(() => {
        setCurrentBucketIndex((prev) => {
          const next = prev + 1;
          if (next >= bucketTimes.length) {
            setPlaying(false);
            return bucketTimes.length - 1;
          }
          return next;
        });
      }, 1500);
    }

    return () => {
      if (playRef.current != null) {
        window.clearInterval(playRef.current);
        playRef.current = null;
      }
    };
  }, [playing, bucketTimes.length]);

  useEffect(() => {
    if (mode === "forecast" && markers.length > 0) {
      fetchForecast();
    }
  }, [mode, forecastHours, markers.length > 0]);

  const handleToggleMode = useCallback((newMode: "live" | "history" | "forecast") => {
    setMode(newMode);
    if (newMode === "live") {
      setPlaying(false);
      setCurrentBucketIndex(-1);
      setSelectedSensorId(null);
      setChartSensorId(null);
    }
  }, []);

  const currentBucketTime = currentBucketIndex >= 0 && currentBucketIndex < bucketTimes.length
    ? bucketTimes[currentBucketIndex]
    : null;

  const historyValues = currentBucketTime && bucketData.has(currentBucketTime)
    ? bucketData.get(currentBucketTime)!
    : new Map<string, number | null>();

  const handleMarkerClick = useCallback((sensorId: string) => {
    if (mode === "live") {
      setSelectedSensorId(sensorId);
    } else {
      setChartSensorId(sensorId);
    }
  }, [mode]);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

  const handleSelectAnalysisType = useCallback(async (analysisType: string) => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const bbox = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };

    setIntelLoading(true);
    setIntelError(null);
    setIntelSuggestions([]);
    setIntelAnalysisType(analysisType);

    try {
      const results = await api.intelligence.analyze({
        metric_keys: [metricKey],
        bbox,
        analysis_type: analysisType,
      });
      setIntelState(results);
      setIntelSuggestions(results.suggestions);
      if (!results.available) {
        setIntelError(results.reason ?? "AI analysis unavailable");
      }
    } catch (err) {
      setIntelError(err instanceof Error ? err.message : "Analysis failed");
      setIntelState({
        status: "unavailable",
        generated_at: new Date().toISOString(),
        reason: err instanceof Error ? err.message : "Analysis failed",
      });
    } finally {
      setIntelLoading(false);
    }
  }, [metricKey]);

  const handleFlyTo = useCallback((lat: number, lon: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lon, lat], zoom: 15 });
    }
  }, []);

  const chartData = chartSensorId
    ? (historyData.find((e) => e.sensor_id === chartSensorId)?.buckets ?? []).map((b) => ({
        time: formatBucketLabel(b.time),
        value: b.avg_value,
      }))
    : [];

  const forecastChartData = useMemo(() => {
    if (!chartSensorId || mode !== "forecast") return [];
    const sensorHistory = historyData.find((e) => e.sensor_id === chartSensorId);
    const sensorForecast = forecastData.get(chartSensorId);
    const combined: Array<{
      time: string;
      actual: number | null;
      forecast_value: number | null;
      lower_bound: number | null;
      upper_bound: number | null;
    }> = [];
    sensorHistory?.buckets.forEach((b) => {
      combined.push({
        time: formatBucketLabel(b.time),
        actual: b.avg_value,
        forecast_value: null,
        lower_bound: null,
        upper_bound: null,
      });
    });
    sensorForecast?.forEach((f) => {
      combined.push({
        time: formatBucketLabel(f.time),
        actual: null,
        forecast_value: f.value,
        lower_bound: f.lower_bound,
        upper_bound: f.upper_bound,
      });
    });
    return combined;
  }, [chartSensorId, mode, historyData, forecastData]);
  const layerFreshness = useMemo(() => {
    const times = markers.map((marker) => marker.time).filter((time): time is string => Boolean(time)).sort();
    return times.at(-1) ?? null;
  }, [markers]);

  const progress = bucketTimes.length > 0
    ? ((currentBucketIndex + 1) / bucketTimes.length) * 100
    : 0;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-primary-700">Thematic Map</h1>
            <nav className="flex gap-4">
              <button
                onClick={toggleNightMode}
                className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
                title={nightMode ? "Switch to day mode" : "Switch to night mode"}
              >
                {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
              </button>
              <Link href="/maps" className="text-gray-600 hover:text-primary-600">All Maps</Link>
              <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <PageError message={error} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <Link href="/maps" className="text-gray-500 hover:text-gray-700 text-sm">&larr; All Maps</Link>
            <h1 className="text-lg md:text-2xl font-bold text-primary-700 capitalize">
              {metricInfo?.display_name ?? metricKey}
            </h1>
            {metricInfo && (
              <span className="text-sm text-gray-500 font-mono">{metricInfo.unit}</span>
            )}
          </div>
          <nav className="flex gap-2 md:gap-4 text-sm md:text-base">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/maps/future" className="hidden md:inline text-gray-600 hover:text-primary-600">Future City</Link>
            <Link href="/dashboard" className="hidden sm:inline text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/developer" className="hidden lg:inline text-gray-600 hover:text-primary-600">Developer</Link>
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Sensor Map</Link>
          </nav>
        </div>
      </header>

      <div className="bg-white border-b px-3 md:px-4 py-2 flex flex-wrap items-center gap-2 md:gap-4">
        <FreshnessIndicator timestamp={layerFreshness} label="Layer" />
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => handleToggleMode("live")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              mode === "live" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Live
          </button>
          <button
            onClick={() => handleToggleMode("history")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              mode === "history" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            History
          </button>
          <button
            onClick={() => handleToggleMode("forecast")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              mode === "forecast" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Forecast
          </button>
        </div>

        {mode === "history" && (
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-1.5 text-sm">
              <label className="text-gray-500">From</label>
              <input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPlaying(false); }}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <label className="text-gray-500">To</label>
              <input
                type="datetime-local"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPlaying(false); }}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <label className="text-gray-500">Interval</label>
              <select
                value={interval}
                onChange={(e) => { setInterval(e.target.value); setPlaying(false); }}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="1d">1d</option>
              </select>
            </div>

            <button
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  if (currentBucketIndex >= bucketTimes.length - 1) {
                    setCurrentBucketIndex(-1);
                  }
                  setPlaying(true);
                }
              }}
              disabled={bucketTimes.length === 0 || historyLoading}
              className="px-4 py-1.5 text-sm font-medium rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              {playing ? "Pause" : "Play"}
            </button>

            {currentBucketTime && (
              <span className="text-sm font-semibold text-gray-700 ml-2">
                {formatBucketLabel(currentBucketTime)}
              </span>
            )}

            {bucketTimes.length > 0 && (
              <div className="flex-1 max-w-xs ml-auto">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {historyLoading && <span className="text-xs text-gray-400">Loading...</span>}
          </div>
        )}

        {mode === "forecast" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Forecast</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {forecastHoursOptions.map((h) => (
                <button
                  key={h}
                  onClick={() => setForecastHours(h)}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition ${
                    forecastHours === h ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
            {forecastLoading && <span className="text-xs text-gray-400">Loading...</span>}
          </div>
        )}

        <div className="ml-auto">
          <button
            onClick={() => setIntelOpen((v) => !v)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
              intelOpen ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Intelligence
          </button>
        </div>
      </div>

      <main className="flex-1 p-4 relative">
        {loading ? (
          <PageLoader message="Loading map data..." />
        ) : (
          <div className="h-[50vh] md:h-[calc(100vh-12rem)] rounded-xl overflow-hidden shadow-lg relative">
              {metricInfo && (
                <ThematicMap
                  metricKey={metricKey}
                  metricInfo={metricInfo}
                  markers={markers}
                  mode={mode}
                  historyValues={historyValues}
                  currentBucketTime={currentBucketTime}
                  forecastValues={forecastData.size > 0 ? forecastValuesMap : undefined}
                  forecastTrends={forecastData.size > 0 ? trendMap : undefined}
                  onMarkerClick={handleMarkerClick}
                  intelligenceSuggestions={intelSuggestions}
                  intelligenceVisible={intelOpen}
                  onMapReady={handleMapReady}
                />
              )}
            {markers.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 z-[1000] pointer-events-none">
                <p className="text-gray-500 text-lg">No sensors reporting this metric</p>
              </div>
            )}

            {chartSensorId && mode === "history" && chartData.length > 0 && (
              <div className="absolute inset-x-2 md:inset-x-auto md:top-4 md:right-4 z-[2000] bg-white rounded-xl shadow-2xl border p-4 md:w-80">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold capitalize">
                    {markers.find((m) => m.sensor_id === chartSensorId)?.sensor_name ?? chartSensorId}
                  </h4>
                  <button
                    onClick={() => setChartSensorId(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartSensorId && mode === "forecast" && forecastChartData.length > 0 && (
              <div className="absolute inset-x-2 md:inset-x-auto md:top-4 md:right-4 z-[2000] bg-white rounded-xl shadow-2xl border p-4 md:w-96">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold capitalize">
                      {markers.find((m) => m.sensor_id === chartSensorId)?.sensor_name ?? chartSensorId}
                    </h4>
                    {forecastTypeMap.get(chartSensorId) === "multi-sensor" && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded font-medium">
                        Multi-regressor
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setChartSensorId(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={forecastChartData}>
                    <defs>
                      <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="upper_bound" fill="url(#bandGrad)" stroke="none" />
                    <Area type="monotone" dataKey="lower_bound" fill="#fff" fillOpacity={1} stroke="none" />
                    <Line type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="forecast_value" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </main>

      {mode === "live" && selectedSensorId && (
        <SensorDrawer
          sensorId={selectedSensorId}
          onClose={() => setSelectedSensorId(null)}
        />
      )}

      {intelOpen && (
        <IntelligencePanel
          loading={intelLoading}
          suggestions={intelSuggestions}
          error={intelError}
          aiState={intelState}
          analysisType={intelAnalysisType}
          onClose={() => setIntelOpen(false)}
          onSelectAnalysisType={handleSelectAnalysisType}
          onFlyTo={handleFlyTo}
        />
      )}
    </div>
  );
}

export default function MetricMapPage() {
  return <MetricMapContent />;
}
