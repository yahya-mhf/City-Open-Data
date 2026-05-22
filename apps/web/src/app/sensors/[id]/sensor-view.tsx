"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, createWebSocket } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import SensorQRCode from "@/components/SensorQRCode";
import SensorCharts from "@/components/SensorCharts";
import { PageError, PageLoader } from "@/components/PageState";
import { Badge, Button, Card, Select, Textarea } from "@/components/ui";
import FreshnessIndicator from "@/components/FreshnessIndicator";

const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl"><span className="text-gray-400">Loading map...</span></div>,
});

export default function SensorPage({ params }: { params: Promise<{ id: string }> }) {
  const { token } = useAuth();
  const { id } = use(params);
  const [sensor, setSensor] = useState<{ name: string; type: string; status: string; latitude: number; longitude: number } | null>(null);
  const [latest, setLatest] = useState<{ timestamp?: string; metrics: Record<string, number> } | null>(null);
  const [alerts, setAlerts] = useState<Array<{ id: string; severity: string; message: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = sensor ? `Sensor: ${sensor.name} | Urban Pulse` : "Sensor | Urban Pulse";
  }, [sensor]);

  const fetchSensor = useCallback(async () => {
    try {
      setLoadError(null);
      const [s, l] = await Promise.all([
        api.sensors.get(id),
        api.sensors.latest(id),
      ]);
      setSensor(s);
      setLatest(l);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load sensor");
    }
  }, [id]);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const sensorAlerts = await api.alerts.bySensor(id, token);
      setAlerts(sensorAlerts);
    } catch {
      setAlerts([]);
    }
  }, [id, token]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSensor(), fetchAlerts()]).finally(() => setLoading(false));
  }, [id, fetchAlerts, fetchSensor]);

  useEffect(() => {
    const interval = setInterval(fetchSensor, 10000);
    return () => clearInterval(interval);
  }, [fetchSensor]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

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
              if (key.includes(id)) {
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
  }, [id, fetchSensor]);

  const submitReport = async () => {
    if (!token) {
      window.location.href = "/login";
      return;
    }
    if (!sensor || !reportCategory || !reportDesc.trim()) return;
    setSubmitting(true);
    setReportMsg("");
    try {
      const formData = new FormData();
      formData.append("category", reportCategory);
      formData.append("description", reportDesc);
      formData.append("sensor_id", id);
      formData.append("latitude", String(sensor.latitude));
      formData.append("longitude", String(sensor.longitude));
      await api.reports.create(formData, token);
      setReportMsg("Report submitted.");
      setReportForm(false);
    } catch (e: unknown) {
      setReportMsg(e instanceof Error ? e.message : "Failed to submit");
    }
    setSubmitting(false);
  };

  const metricKeys = latest?.metrics ? Object.keys(latest.metrics) : [];

  const metricInfos = metricKeys.map((k) => ({
    key: k,
    display_name: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    unit: "",
  }));
  const lastSeen = latest?.timestamp ? new Date(latest.timestamp).toLocaleString() : "No recent reading";
  const statusTone = sensor?.status === "active" ? "success" : sensor?.status === "maintenance" ? "warning" : "danger";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <PageLoader message="Loading sensor data..." />
        ) : loadError ? (
          <PageError message={loadError} retry={() => window.location.reload()} />
        ) : !sensor ? (
          <div className="text-center py-20 text-red-600 dark:text-red-300">Sensor not found</div>
        ) : (
          <div className="space-y-6">
            <Card>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sensor.name}</h1>
                    <Badge tone="info">{sensor.type.replace(/_/g, " ")}</Badge>
                    <Badge tone={statusTone}>{sensor.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">ID: {id}</p>
                </div>
                <div className="grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-3 lg:min-w-[34rem]">
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-night-border">
                    <p className="text-xs uppercase text-gray-400">Coordinates</p>
                    <p className="mt-1 font-mono">{sensor.latitude.toFixed(5)}, {sensor.longitude.toFixed(5)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-night-border">
                    <p className="text-xs uppercase text-gray-400">Last seen</p>
                    <p className="mt-1">{lastSeen}</p>
                    <FreshnessIndicator timestamp={latest?.timestamp} label="Sensor" />
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-night-border">
                    <p className="text-xs uppercase text-gray-400">Metrics</p>
                    <p className="mt-1">{metricKeys.length} live readings</p>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-2 space-y-6">
              {metricInfos.length > 0 && (
                <SensorCharts
                  sensorId={id}
                  metrics={metricInfos}
                  latest={latest?.metrics ?? null}
                  status={sensor.status}
                />
              )}

              <Card>
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Recent Alerts</h2>
                {alerts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-300">No active alerts for this sensor.</p>
                ) : (
                  <div className="space-y-3">
                    {alerts.slice(0, 5).map((alert) => (
                      <div key={alert.id} className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <div className="flex items-center justify-between gap-3">
                          <Badge tone="danger">{alert.severity}</Badge>
                          <span className="text-xs text-red-500 dark:text-red-300">{new Date(alert.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 text-sm text-red-800 dark:text-red-200">{alert.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Report an Issue</h2>
                {!token ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-center">
                    <p className="text-yellow-800 dark:text-yellow-300 text-sm mb-2">You need to log in to submit a report.</p>
                    <Link href="/login" className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                      Log in &rarr;
                    </Link>
                  </div>
                ) : reportForm ? (
                  <div className="space-y-3">
                    <Select
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                    >
                      <option value="">Select category</option>
                      <option value="air_quality">Air Quality</option>
                      <option value="noise_complaint">Noise</option>
                      <option value="other">Other</option>
                    </Select>
                    <Textarea
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      placeholder="Describe the issue..."
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      This report will be submitted at {sensor.latitude.toFixed(5)}, {sensor.longitude.toFixed(5)}.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={submitReport}
                        disabled={submitting || !reportCategory || !reportDesc.trim()}
                      >
                        {submitting ? "Submitting..." : "Submit"}
                      </Button>
                      <Button variant="secondary" onClick={() => setReportForm(false)}>
                        Cancel
                      </Button>
                    </div>
                    {reportMsg && <p className="text-sm text-green-700 dark:text-green-300">{reportMsg}</p>}
                  </div>
                ) : (
                  <Button onClick={() => setReportForm(true)}>
                    Report an issue with this sensor
                  </Button>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Sensor Info</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Type</dt><dd className="text-gray-900 dark:text-gray-100">{sensor.type}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                    <dd>
                      <Badge tone={statusTone}>{sensor.status}</Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Lat</dt><dd className="text-gray-900 dark:text-gray-100">{sensor.latitude.toFixed(4)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Lng</dt><dd className="text-gray-900 dark:text-gray-100">{sensor.longitude.toFixed(4)}</dd></div>
                </dl>
              </Card>

              <div className="h-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-night-border dark:bg-night-secondary">
                <MiniMap latitude={sensor.latitude} longitude={sensor.longitude} name={sensor.name} />
              </div>

              <Card>
                <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">QR Code</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Print and attach to the sensor hardware.</p>
                <div className="flex justify-center">
                  <SensorQRCode sensorId={id} size={160} showDownload={true} />
                </div>
              </Card>
            </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
