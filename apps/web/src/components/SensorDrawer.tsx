"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { api, createWebSocket } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import SensorQRCode from "./SensorQRCode";
import FreshnessIndicator from "@/components/FreshnessIndicator";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface SensorData {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface LatestData {
  sensor_id: string;
  timestamp?: string;
  metrics: Record<string, number>;
}

interface HistoryPoint {
  time: string;
  metric_key: string;
  value_numeric?: number;
  value_text?: string;
}

interface AlertItem {
  id: string;
  sensor_id: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

interface SensorDrawerProps {
  sensorId: string;
  onClose: () => void;
}

type TimeRange = "1h" | "24h" | "7d";

function toISO(d: Date): string {
  return d.toISOString();
}

export default function SensorDrawer({ sensorId, onClose }: SensorDrawerProps) {
  const { user, token } = useAuth();
  const { nightMode } = useTheme();
  const isPaid = user?.plan === "pro" || user?.plan === "enterprise";

  const [sensor, setSensor] = useState<SensorData | null>(null);
  const [latest, setLatest] = useState<LatestData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [loading, setLoading] = useState(true);
  const [csvLoading, setCsvLoading] = useState(false);

  const hoursMap: Record<TimeRange, number> = { "1h": 1, "24h": 24, "7d": 168 };

  const fetchSensor = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.sensors.get(sensorId),
        api.sensors.latest(sensorId),
      ]);
      setSensor(s);
      setLatest(l);
    } catch { /* ignore */ }
  }, [sensorId]);

  const fetchHistory = useCallback(async () => {
    if (!isPaid) return;
    try {
      const h = await api.sensors.history(sensorId, undefined, hoursMap[timeRange]);
      setHistory(h);
    } catch { /* ignore */ }
  }, [sensorId, timeRange, isPaid]);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const a = await api.alerts.bySensor(sensorId, token);
      setAlerts(a);
    } catch { /* ignore */ }
  }, [sensorId, token]);

  useEffect(() => {
    setLoading(true);
    setHistory([]);
    setAlerts([]);
    Promise.all([fetchSensor(), fetchHistory(), fetchAlerts()]).finally(() => setLoading(false));
  }, [sensorId]);

  useEffect(() => {
    if (!isPaid) return;
    fetchHistory();
  }, [timeRange]);

  useEffect(() => {
    if (!token) return;
    fetchAlerts();
  }, [token]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let backoffRef = 1000;

    const connect = () => {
      try {
        ws = createWebSocket("sensors");
        ws.onopen = () => {
          backoffRef = 1000;
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "sensor_update") {
              const key = msg.data?.key || "";
              if (key.includes(sensorId)) {
                fetchSensor();
              }
            }
          } catch { /* ignore */ }
        };
        ws.onclose = () => {
          const delay = Math.min(backoffRef, 30000);
          backoffRef = Math.min(backoffRef * 2, 30000);
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch { /* ignore */ }
    };

    backoffRef = 1000;
    connect();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [sensorId, fetchSensor]);

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    inactive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  };

  const metricKeys = latest?.metrics ? Object.keys(latest.metrics) : [];

  const chartDataByMetric = (metricKey: string) => {
    const points = history.filter((h) => h.metric_key === metricKey);
    return points.map((p) => ({
      time: new Date(p.time).toLocaleString(),
      value: p.value_numeric ?? 0,
    }));
  };

  const handleCsvDownload = async (metricKey: string) => {
    if (!isPaid || !token) return;
    setCsvLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - hoursMap[timeRange] * 60 * 60 * 1000);
      const result = await api.analytics.exportCsv(sensorId, metricKey, from.toISOString(), now.toISOString(), token);
      const blob = new Blob([(result.data as string[]).join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sensorId}_${metricKey}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setCsvLoading(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end md:items-stretch md:justify-end">
      <div className="fixed inset-0 bg-black/30 z-[1999]" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl max-h-[80vh] md:max-h-none bg-white dark:bg-night-secondary shadow-2xl overflow-y-auto z-[2000] rounded-t-2xl md:rounded-none">
        <div className="sticky top-0 bg-white dark:bg-night-secondary border-b dark:border-night-border z-10 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{sensor?.name ?? "Loading..."}</h2>
            {sensor && (
              <p className="text-sm text-gray-500 dark:text-gray-300">
                {sensor.latitude.toFixed(4)}, {sensor.longitude.toFixed(4)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {sensor && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor[sensor.status] || "bg-gray-100 text-gray-800 dark:bg-night-border dark:text-gray-200"}`}>
                {sensor.status}
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <p className="text-gray-500 dark:text-gray-300 text-center py-12">Loading sensor data...</p>
          ) : !sensor ? (
            <p className="text-red-600 dark:text-red-300 text-center py-12">Sensor not found</p>
          ) : (
            <>
              {alerts.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">Active Alerts ({alerts.length})</p>
                  {alerts.slice(0, 3).map((a) => (
                    <p key={a.id} className="text-xs text-red-600 dark:text-red-400 mt-1">
                      [{a.severity}] {a.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(latest?.metrics ?? {}).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 dark:bg-night-border/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">{key}</div>
                    <div className="text-lg font-bold mt-1 text-gray-900 dark:text-gray-100">{value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Historical Data</h3>
                  <div className="flex gap-1 bg-gray-100 dark:bg-night-border rounded-lg p-1">
                    {(["1h", "24h", "7d"] as TimeRange[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setTimeRange(r)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                          timeRange === r ? "bg-white dark:bg-night-primary shadow text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {!isPaid ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
                    <p className="text-yellow-800 dark:text-yellow-300 font-medium text-sm mb-1">Historical data requires Pro</p>
                    <Link href="/account" className="text-yellow-700 dark:text-yellow-400 text-xs underline">Upgrade plan</Link>
                  </div>
                ) : metricKeys.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-300 text-sm">No metrics available</p>
                ) : (
                  <div className="space-y-6">
                    {metricKeys.map((metricKey) => {
                      const data = chartDataByMetric(metricKey);
                      if (data.length === 0) return null;
                      return (
                        <div key={metricKey} className="bg-gray-50 dark:bg-night-border/50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{metricKey}</h4>
                            <button
                              onClick={() => handleCsvDownload(metricKey)}
                              disabled={csvLoading}
                              className="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 disabled:text-gray-400"
                            >
                              {csvLoading ? "..." : "Download CSV"}
                            </button>
                          </div>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke={nightMode ? "#374151" : "#e5e7eb"} />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: nightMode ? "#d1d5db" : "#6b7280" }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: nightMode ? "#d1d5db" : "#6b7280" }} />
                              <Tooltip />
                              <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-2 border-t">
                <SensorQRCode sensorId={sensorId} size={120} showDownload={true} />
              </div>

              <div className="flex items-center justify-between">
                <Link
                  href={`/sensors/${sensorId}`}
                  className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                >
                  Open full page &rarr;
                </Link>
                <FreshnessIndicator timestamp={latest?.timestamp} label="Sensor" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
