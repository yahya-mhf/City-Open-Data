"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, createWebSocket } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import SensorQRCode from "@/components/SensorQRCode";
import SensorCharts from "@/components/SensorCharts";
import ScenarioSimulator from "@/components/ScenarioSimulator";

const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl"><span className="text-gray-400">Loading map...</span></div>,
});

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export default function SensorPage({ params }: { params: Promise<{ id: string }> }) {
  const { nightMode, toggleNightMode } = useTheme();
  const { id } = use(params);
  const [sensor, setSensor] = useState<{ name: string; type: string; status: string; latitude: number; longitude: number } | null>(null);
  const [latest, setLatest] = useState<{ timestamp?: string; metrics: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportForm, setReportForm] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const token = typeof window !== "undefined" ? getToken() : null;

  useEffect(() => {
    document.title = sensor ? `Sensor: ${sensor.name} | Urban Pulse` : "Sensor | Urban Pulse";
  }, [sensor]);

  const fetchSensor = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.sensors.get(id),
        api.sensors.latest(id),
      ]);
      setSensor(s);
      setLatest(l);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchSensor().finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const interval = setInterval(fetchSensor, 10000);
    return () => clearInterval(interval);
  }, [fetchSensor]);

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
    const t = getToken();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    if (!reportCategory || !reportDesc.trim()) return;
    setSubmitting(true);
    setReportMsg("");
    try {
      const formData = new FormData();
      formData.append("category", reportCategory);
      formData.append("description", reportDesc);
      formData.append("latitude", "0");
      formData.append("longitude", "0");
      await api.reports.create(formData, t);
      setReportMsg("Report submitted.");
      setReportForm(false);
    } catch (e: unknown) {
      setReportMsg(e instanceof Error ? e.message : "Failed to submit");
    }
    setSubmitting(false);
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    inactive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  const metricKeys = latest?.metrics ? Object.keys(latest.metrics) : [];

  const metricInfos = metricKeys.map((k) => ({
    key: k,
    display_name: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    unit: "",
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-primary">
      <header className="bg-white dark:bg-night-secondary shadow-sm border-b border-gray-200 dark:border-night-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-700">{sensor?.name ?? "Sensor"}</h1>
            {sensor && <p className="text-xs text-gray-400">ID: {id}</p>}
          </div>
          <nav className="flex gap-4 items-center">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/map" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Map</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Home</Link>
            {token ? (
              <>
              <Link href="/dashboard" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Dashboard</Link>
              <Link href="/developer" className="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400">Developer</Link>
              </>
            ) : (
              <Link href="/login" className="text-primary-600 hover:text-primary-800 font-medium text-sm">Login</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading sensor data...</div>
        ) : !sensor ? (
          <div className="text-center py-20 text-red-600">Sensor not found</div>
        ) : (
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

              {latest?.metrics && (
                <ScenarioSimulator
                  sensorId={id}
                  metrics={metricInfos}
                  latest={latest.metrics}
                />
              )}

              <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Report an Issue</h2>
                {!getToken() ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-center">
                    <p className="text-yellow-800 dark:text-yellow-300 text-sm mb-2">You need to log in to submit a report.</p>
                    <Link href="/login" className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                      Log in &rarr;
                    </Link>
                  </div>
                ) : reportForm ? (
                  <div className="space-y-3">
                    <select
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-night-border bg-white dark:bg-night-primary text-gray-900 dark:text-gray-100 rounded-lg text-sm"
                    >
                      <option value="">Select category</option>
                      <option value="air_quality">Air Quality</option>
                      <option value="noise_complaint">Noise</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      placeholder="Describe the issue..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-night-border bg-white dark:bg-night-primary text-gray-900 dark:text-gray-100 rounded-lg text-sm"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={submitReport}
                        disabled={submitting || !reportCategory || !reportDesc.trim()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
                      >
                        {submitting ? "Submitting..." : "Submit"}
                      </button>
                      <button onClick={() => setReportForm(false)} className="px-4 py-2 border border-gray-300 dark:border-night-border text-gray-700 dark:text-gray-300 rounded-lg text-sm">
                        Cancel
                      </button>
                    </div>
                    {reportMsg && <p className="text-sm text-green-700 dark:text-green-400">{reportMsg}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setReportForm(true)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
                  >
                    Report an issue with this sensor
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Sensor Info</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Type</dt><dd className="text-gray-900 dark:text-gray-100">{sensor.type}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                    <dd>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[sensor.status] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        {sensor.status}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Lat</dt><dd className="text-gray-900 dark:text-gray-100">{sensor.latitude.toFixed(4)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500 dark:text-gray-400">Lng</dt><dd className="text-gray-900 dark:text-gray-100">{sensor.longitude.toFixed(4)}</dd></div>
                </dl>
              </div>

              <div className="bg-white dark:bg-night-secondary rounded-xl shadow overflow-hidden h-64">
                <MiniMap latitude={sensor.latitude} longitude={sensor.longitude} name={sensor.name} />
              </div>

              <div className="bg-white dark:bg-night-secondary rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">QR Code</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Print and attach to the sensor hardware.</p>
                <div className="flex justify-center">
                  <SensorQRCode sensorId={id} size={160} showDownload={true} />
                </div>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
