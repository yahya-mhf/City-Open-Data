"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";

interface ReportItem {
  id: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  resolved: "#22c55e",
  rejected: "#ef4444",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

export default function ReportsPage() {
  const { nightMode, toggleNightMode } = useTheme();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    document.title = "Citizen Reports | Urban Pulse";
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.reports.public(category || undefined);
      setReports(data);
    } catch {}
    setLoading(false);
  }, [category]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: nightMode ? DARK_STYLE : LIGHT_STYLE,
      center: [-7.9811, 31.6295],
      zoom: 11,
      maxZoom: 19,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.on("load", () => {
      map.addSource("reports", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "report-dots",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.on("click", "report-dots", (e) => {
        if (e.features?.[0]?.properties?.id) {
          const r = reports.find((r) => r.id === e.features![0].properties!.id);
          if (r) setSelectedReport(r);
        }
      });
      map.on("mouseenter", "report-dots", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "report-dots", () => { map.getCanvas().style.cursor = ""; });
      mapRef.current = map;
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [nightMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const features = reports.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] },
      properties: { id: r.id, color: statusColors[r.status] || "#6b7280" },
    }));
    (map.getSource("reports") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features,
    });
    if (features.length > 0) {
      const coords = features.map((f) => f.geometry.coordinates as [number, number]);
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  }, [reports]);

  const categories = [...new Set(reports.map((r) => r.category))];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <header className="bg-white dark:bg-night-secondary shadow-sm border-b border-gray-200 dark:border-night-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary-700">Citizen Reports</h1>
          <nav className="flex gap-4 items-center">
            <button onClick={toggleNightMode} className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg">
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/map" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Map</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Home</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          <div className="lg:w-1/3 space-y-4">
            <div className="flex items-center gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-night-border bg-white dark:bg-night-primary text-gray-900 dark:text-gray-100 rounded-lg text-sm"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500 dark:text-gray-400">{reports.length}</span>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-10 text-gray-400">Loading...</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-10 text-gray-400">No reports found</div>
              ) : (
                reports.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedReport(r);
                      mapRef.current?.flyTo({ center: [r.longitude, r.latitude], zoom: 14, duration: 800 });
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      selectedReport?.id === r.id
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-600"
                        : "border-gray-200 dark:border-night-border bg-white dark:bg-night-secondary hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{r.category}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                        style={{ backgroundColor: statusColors[r.status] || "#6b7280" }}
                      >
                        {statusLabels[r.status] || r.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{r.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="lg:w-2/3 space-y-4">
            <div ref={mapContainerRef} className="h-[500px] lg:h-[600px] rounded-xl overflow-hidden shadow" />

            {selectedReport && (
              <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">{selectedReport.category}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(selectedReport.created_at).toLocaleString()} &middot; Lat {selectedReport.latitude.toFixed(4)} &middot; Lng {selectedReport.longitude.toFixed(4)}
                    </p>
                  </div>
                  <span
                    className="text-sm px-3 py-1 rounded-full text-white font-medium"
                    style={{ backgroundColor: statusColors[selectedReport.status] || "#6b7280" }}
                  >
                    {statusLabels[selectedReport.status] || selectedReport.status}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300">{selectedReport.description}</p>
                {selectedReport.image_url && (
                  <img
                    src={selectedReport.image_url}
                    alt="Report"
                    className="mt-3 rounded-lg max-h-64 w-full object-cover"
                  />
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
