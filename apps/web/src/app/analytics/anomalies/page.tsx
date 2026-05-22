"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";
import { Badge, Card, Input, Select } from "@/components/ui";

interface Anomaly {
  id: string;
  sensor_id: string;
  sensor_name: string;
  sensor_type: string;
  metric_key: string;
  metric_name: string;
  z_score: number;
  method: string;
  time: string;
}

function severityFor(zScore: number): "low" | "medium" | "high" {
  const magnitude = Math.abs(zScore);
  if (magnitude >= 4) return "high";
  if (magnitude >= 3) return "medium";
  return "low";
}

function severityTone(severity: string): "success" | "warning" | "danger" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "success";
}

export default function AnomaliesPage() {
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorType, setSensorType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [dateRange, setDateRange] = useState("24h");
  const [query, setQuery] = useState("");

  const since = useMemo(() => {
    const hours = dateRange === "7d" ? 24 * 7 : dateRange === "72h" ? 72 : 24;
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }, [dateRange]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.anomalies.list({ since, sensor_type: sensorType === "all" ? undefined : sensorType, limit: 200 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load anomalies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [since, sensorType]);

  const sensorTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.sensor_type))).sort(), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const rowSeverity = severityFor(row.z_score);
      const matchesSeverity = severity === "all" || rowSeverity === severity;
      const matchesQuery = !q || `${row.sensor_name} ${row.metric_key} ${row.method}`.toLowerCase().includes(q);
      return matchesSeverity && matchesQuery;
    });
  }, [query, rows, severity]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-night-primary">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Anomalies</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">Unusual sensor readings detected by z-score and statistical methods.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
              <Select value={sensorType} onChange={(event) => setSensorType(event.target.value)}>
                <option value="all">All types</option>
                {sensorTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
              </Select>
              <Select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="all">All severity</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
              <Select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                <option value="24h">24 hours</option>
                <option value="72h">72 hours</option>
                <option value="7d">7 days</option>
              </Select>
            </div>
          </div>
        </Card>

        {loading ? (
          <PageLoader message="Loading anomalies..." />
        ) : error ? (
          <PageError message={error} retry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState message="No anomalies match the selected filters." />
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-night-secondary">
                <tr>
                  <th className="px-4 py-3 text-left">Sensor</th>
                  <th className="px-4 py-3 text-left">Metric</th>
                  <th className="px-4 py-3 text-left">Value</th>
                  <th className="px-4 py-3 text-left">Z-score</th>
                  <th className="px-4 py-3 text-left">Method</th>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const severityValue = severityFor(row.z_score);
                  return (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-night-border">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{row.sensor_name}</div>
                        <div className="text-xs text-gray-500">{row.sensor_type.replace(/_/g, " ")}</div>
                      </td>
                      <td className="px-4 py-3">{row.metric_name || row.metric_key}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">Recorded in event stream</td>
                      <td className="px-4 py-3"><Badge tone={severityTone(severityValue)}>{row.z_score.toFixed(2)}</Badge></td>
                      <td className="px-4 py-3">{row.method}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(row.time).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/sensors/${row.sensor_id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700">Open sensor</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
