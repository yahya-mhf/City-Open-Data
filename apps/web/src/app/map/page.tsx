"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import SensorDrawer from "@/components/SensorDrawer";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";
import { Badge, Card, Input, Select, Skeleton } from "@/components/ui";

interface Marker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  latest: Record<string, unknown>;
  type?: string;
}

interface SensorMeta {
  id: string;
  type: string;
}

interface CityStats {
  sensor_count: number;
  alert_count: number;
  timestamp?: string;
}

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-night-secondary">
      <span className="text-gray-400">Loading map...</span>
    </div>
  ),
});

function markerMetrics(marker: Marker): string[] {
  const metrics = marker.latest?.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return [];
  return Object.keys(metrics);
}

function markerTimestamp(marker: Marker): string | null {
  const timestamp = marker.latest?.timestamp;
  return typeof timestamp === "string" ? timestamp : null;
}

function formatFreshness(timestamp?: Date | string | null): string {
  if (!timestamp) return "No live timestamp";
  const time = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const seconds = Math.max(0, Math.floor((Date.now() - time.getTime()) / 1000));
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "active") return "success";
  if (status === "maintenance" || status === "warning") return "warning";
  if (status === "critical" || status === "offline" || status === "inactive") return "danger";
  return "default";
}

function MapPageContent() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [metricFilter, setMetricFilter] = useState("all");

  const loadMarkers = useCallback(async () => {
    setError(null);
    try {
      const [markerData, sensorResult, statsResult] = await Promise.allSettled([
        api.map.markers(),
        api.sensors.list(),
        api.city.stats(),
      ]);

      if (markerData.status === "rejected") {
        throw markerData.reason instanceof Error ? markerData.reason : new Error("Failed to load map markers");
      }

      const sensorTypes = new Map<string, string>();
      if (sensorResult.status === "fulfilled") {
        sensorResult.value.forEach((sensor: SensorMeta) => sensorTypes.set(sensor.id, sensor.type));
      }

      setMarkers(markerData.value.map((marker) => ({
        ...marker,
        latitude: parseFloat(String(marker.latitude)),
        longitude: parseFloat(String(marker.longitude)),
        type: sensorTypes.get(marker.id),
      })));

      if (statsResult.status === "fulfilled") setStats(statsResult.value);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load map markers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarkers();
    const interval = setInterval(loadMarkers, 30000);
    return () => clearInterval(interval);
  }, [loadMarkers]);

  const metricOptions = useMemo(
    () => Array.from(new Set(markers.flatMap(markerMetrics))).sort(),
    [markers],
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(markers.map((marker) => marker.status))).filter(Boolean).sort(),
    [markers],
  );

  const typeOptions = useMemo(
    () => Array.from(new Set(markers.map((marker) => marker.type).filter((type): type is string => Boolean(type)))).sort(),
    [markers],
  );

  const filteredMarkers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return markers.filter((marker) => {
      const matchesSearch = !query || marker.name.toLowerCase().includes(query) || marker.id.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || marker.status === statusFilter;
      const matchesType = typeFilter === "all" || marker.type === typeFilter;
      const matchesMetric = metricFilter === "all" || markerMetrics(marker).includes(metricFilter);
      return matchesSearch && matchesStatus && matchesType && matchesMetric;
    });
  }, [markers, metricFilter, search, statusFilter, typeFilter]);

  const newestReading = useMemo(() => {
    const timestamps = filteredMarkers
      .map(markerTimestamp)
      .filter((timestamp): timestamp is string => Boolean(timestamp))
      .sort();
    return timestamps.at(-1) ?? null;
  }, [filteredMarkers]);

  const handleSensorClick = useCallback((sensorId: string) => {
    setSelectedSensorId(sensorId);
  }, []);

  if (loading) {
    return <PageLoader message="Loading operations map..." />;
  }

  if (error) {
    return <PageError message={error} retry={loadMarkers} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-night-primary">
      <main className="grid h-[calc(100vh-5.5rem)] grid-cols-1 grid-rows-[auto_1fr] gap-3 p-3 xl:grid-cols-[20rem_1fr]">
        <div className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-night-border dark:bg-night-secondary">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Operations Map</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatFreshness(newestReading ?? lastUpdated)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{filteredMarkers.length}/{markers.length} sensors</Badge>
            <Badge tone={(stats?.alert_count ?? 0) > 0 ? "warning" : "success"}>{stats?.alert_count ?? 0} active alerts</Badge>
            <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-night-primary">
              {["all", ...metricOptions.slice(0, 4)].map((metric) => (
                <button
                  key={metric}
                  onClick={() => setMetricFilter(metric)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    metricFilter === metric
                      ? "bg-white text-primary-700 shadow-sm dark:bg-night-secondary dark:text-primary-300"
                      : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {metric === "all" ? "All layers" : metric.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card className="hidden min-h-0 overflow-hidden p-0 xl:flex xl:flex-col">
          <div className="border-b border-gray-200 p-4 dark:border-night-border">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sensor Fleet</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Search and filter by operating state, type, or metric.</p>
          </div>
          <div className="space-y-3 border-b border-gray-200 p-4 dark:border-night-border">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sensor name or ID" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </Select>
              <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>{type.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </div>
            <Select value={metricFilter} onChange={(event) => setMetricFilter(event.target.value)}>
              <option value="all">All metrics</option>
              {metricOptions.map((metric) => (
                <option key={metric} value={metric}>{metric.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredMarkers.length === 0 ? (
              <div className="p-4">
                <EmptyState message="No sensors match the current filters." />
              </div>
            ) : (
              filteredMarkers.map((marker) => (
                <button
                  key={marker.id}
                  onClick={() => setSelectedSensorId(marker.id)}
                  className="block w-full border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50 dark:border-night-border dark:hover:bg-night-primary"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{marker.name}</span>
                    <Badge tone={statusTone(marker.status)}>{marker.status}</Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{marker.type?.replace(/_/g, " ") ?? "Unknown type"}</span>
                    <span>{formatFreshness(markerTimestamp(marker))}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="relative min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-night-border dark:bg-night-secondary">
          {markers.length === 0 ? (
            <div className="p-4">
              <EmptyState message="No active map markers are available." />
            </div>
          ) : (
            <MapView markers={filteredMarkers} onSensorClick={handleSensorClick} />
          )}
          {lastUpdated ? (
            <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] rounded-lg bg-black/70 px-3 py-2 text-xs text-white shadow-lg">
              {formatFreshness(lastUpdated)}
            </div>
          ) : (
            <Skeleton className="absolute bottom-4 left-4 z-[1000] h-8 w-32 bg-black/30" />
          )}
        </div>
      </main>

      {selectedSensorId && (
        <SensorDrawer
          sensorId={selectedSensorId}
          onClose={() => setSelectedSensorId(null)}
        />
      )}
    </div>
  );
}

export default function MapPage() {
  return <MapPageContent />;
}
