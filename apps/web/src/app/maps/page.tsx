"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";

interface MetricItem {
  id: string;
  key: string;
  display_name: string;
  unit: string;
  category: string;
  min_value: number | null;
  max_value: number | null;
}

export default function MapsPage() {
  const { nightMode, toggleNightMode } = useTheme();
  const [metrics, setMetrics] = useState<MetricItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.maps.metrics()
      .then(setMetrics)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load metric layers"))
      .finally(() => setLoading(false));
  }, []);

  const categoryColors: Record<string, string> = {
    air_quality: "bg-green-50 border-green-200",
    weather: "bg-blue-50 border-blue-200",
    traffic: "bg-amber-50 border-amber-200",
    hydrology: "bg-cyan-50 border-cyan-200",
    radiation: "bg-red-50 border-red-200",
    energy: "bg-yellow-50 border-yellow-200",
    noise: "bg-purple-50 border-purple-200",
    safety: "bg-red-50 border-red-200",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Thematic Maps</h1>
          <nav className="flex gap-4">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/maps/future" className="text-gray-600 hover:text-primary-600">Future City</Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Sensor Map</Link>
            <Link href="/developer" className="text-gray-600 hover:text-primary-600">Developer</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {loading ? (
          <PageLoader message="Loading metrics..." />
        ) : error ? (
          <PageError message={error} retry={() => window.location.reload()} />
        ) : metrics.length === 0 ? (
          <EmptyState message="No metric layers are available." />
        ) : (
          <>
            <Link
              href="/maps/future"
              className="block rounded-xl border-2 border-primary-200 bg-gradient-to-r from-primary-50 to-blue-50 p-6 mb-8 hover:shadow-lg transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center text-2xl">
                  &#x1F52E;
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-primary-800">Future City Overview</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    AI-powered intelligence across all metrics. View opportunities, risks, and insights generated
                    from live sensor data in real time.
                  </p>
                </div>
                <span className="text-primary-700 font-medium text-sm whitespace-nowrap">
                  Open &rarr;
                </span>
              </div>
            </Link>

            <h2 className="text-lg font-semibold text-gray-800 mb-4">Individual Metric Maps</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {metrics.map((m) => {
              const borderColor = categoryColors[m.category] || "bg-gray-50 border-gray-200";
              return (
                <Link
                  key={m.key}
                  href={`/maps/${m.key}`}
                  className={`block rounded-xl border-2 p-6 hover:shadow-lg transition ${borderColor}`}
                >
                  <h3 className="text-lg font-semibold text-gray-900 capitalize">
                    {m.display_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-gray-500 capitalize">{m.category.replace(/_/g, " ")}</span>
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-sm font-mono text-gray-600">{m.unit}</span>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-primary-600 font-medium">
                    View Map &rarr;
                  </div>
                </Link>
              );
            })}
          </div>

            <section className="mt-12 rounded-xl border-2 border-primary-200 bg-gradient-to-r from-primary-50 to-blue-50 p-6">
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-primary-800">Access this data via API</h3>
                  <p className="text-sm text-gray-600 mt-1 mb-4">
                    Integrate real-time sensor data and analytics directly into your applications.
                    Get started with a free API key.
                  </p>
                  <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto mb-4">
                    <span className="text-gray-400"># Get all metric layers</span><br />
                    curl -H &quot;x-api-key: your_key_here&quot; \<br />
                    &nbsp;&nbsp;{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/maps/metrics
                  </div>
                </div>
                <div className="shrink-0">
                  <Link
                    href="/developer"
                    className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
                  >
                    Get API Key &rarr;
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
