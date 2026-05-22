"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui";

interface ToolCard {
  title: string;
  href: string;
  description: string;
  badge: string;
}

const TOOLS: ToolCard[] = [
  { title: "Correlations", href: "/analytics/correlations", description: "Find metric pairs that move together across aligned hourly readings.", badge: "Matrix" },
  { title: "Anomalies", href: "/analytics/anomalies", description: "Review unusual sensor readings and related alerts.", badge: "Detection" },
  { title: "Export", href: "/export", description: "Download sensor readings with plan-aware formats and limits.", badge: "Data" },
  { title: "City Health", href: "/", description: "Track AQI, heat stress, and livability from live city metrics.", badge: "KPI" },
];

function freshness(timestamp?: string): string {
  if (!timestamp) return "Last updated unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `Updated ${minutes}m ago` : `Updated ${Math.floor(minutes / 60)}h ago`;
}

export default function AnalyticsPage() {
  const [cityUpdatedAt, setCityUpdatedAt] = useState<string | undefined>();
  const [metricCount, setMetricCount] = useState<number | null>(null);

  useEffect(() => {
    api.analytics.cityHealth().then((data) => setCityUpdatedAt(data.updated_at)).catch(() => undefined);
    api.metrics.list(true).then((metrics) => setMetricCount(metrics.length)).catch(() => setMetricCount(null));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-night-primary">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Operational analytics tools for sensor relationships, anomalies, exports, and city health.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="info">{metricCount ?? "--"} active metrics</Badge>
            <Badge tone="default">{freshness(cityUpdatedAt)}</Badge>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className="block">
              <Card className="h-full transition hover:border-primary-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{tool.title}</h2>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{tool.description}</p>
                  </div>
                  <Badge tone="info">{tool.badge}</Badge>
                </div>
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">{tool.title === "City Health" ? freshness(cityUpdatedAt) : "Open tool"}</p>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
