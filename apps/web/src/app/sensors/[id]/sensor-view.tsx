"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, createWebSocket } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import SensorQRCode from "@/components/SensorQRCode";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-night-secondary rounded-xl"><span className="text-gray-400">Loading map...</span></div>,
});

interface MetricValue {
  time: string;
  metric_key: string;
  value_numeric?: number;
  value_text?: string;
}

type TimeRange = "1h" | "24h" | "7d";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export default function SensorPage({ params }: { params: Promise<{ id: string }> }) {
  const { nightMode, toggleNightMode } = useTheme();
  const { id } = use(params);
  const [sensor, setSensor] = useState<{ name: string; type: string; status: string; latitude: number; longitude: number } | null>(null);
  const [latest, setLatest] = useState<{ timestamp?: string; metrics: Record<string, number> } | null>(null);
  const [history, setHistory] = useState<MetricValue[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [loading, setLoading] = useState(true);
  const [reportForm, setReportForm] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const token = typeof window !== "undefined" ? getToken() : null;
  const isPaid = false; // public page doesn't gate charts behind paid

  const hoursMap: Record<TimeRange, number> = { "1h": 1, "24h": 24, "7d": 168 };

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

  const fetchHistory = useCallback(async () => {
    try {
      const h = await api.sensors.history(id, undefined, hoursMap[timeRange]);
      setHistory(h);
    } catch { /* ignore */ }
  }, [id, timeRange]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSensor(), fetchHistory()]).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchHistory();
  }, [timeRange]);

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
    active: "bg-green-100 text-green-800",
    inactive: "bg-red-100 text-red-800",
    maintenance: "bg-amber-100 text-amber-800",
  };

  const metricKeys = latest?.metrics ? Object.keys(latest.metrics) : [];

  const chartDataByMetric = (mk: string) =>
    history.filter((h) => h.metric_key === mk).map((p) => ({
      time: new Date(p.time).toLocaleString(),
      value: p.value_numeric ?? 0,
    }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
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
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Map</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
            {token ? (
              <>
              <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
              <Link href="/developer" className="text-gray-600 hover:text-primary-600">Developer</Link>
              </>
            ) : (
              <Link href="/login" className="text-primary-600 hover:text-primary-800 font-medium text-sm">Login</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-20 text-gray-500">Loading sensor data...</div>
        ) : !sensor ? (
          <div className="text-center py-20 text-red-600">Sensor not found</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Latest Readings</h2>
                {latest && Object.keys(latest.metrics).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(latest.metrics).map(([key, value]) => (
                      <div key={key} className="bg-gray-50 rounded-lg p-4 text-center">
                        <div className="text-sm text-gray-500 uppercase">{key}</div>
                        <div className="text-2xl font-bold mt-1">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No data available</p>
                )}
                {latest?.timestamp && (
                  <p className="mt-3 text-sm text-gray-500">
                    Last update: {new Date(latest.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">History</h2>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(["1h", "24h", "7d"] as TimeRange[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setTimeRange(r)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                          timeRange === r ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                {metricKeys.length === 0 ? (
                  <p className="text-gray-500 text-sm">No metrics available</p>
                ) : (
                  <div className="space-y-5">
                    {metricKeys.map((mk) => {
                      const data = chartDataByMetric(mk);
                      if (data.length === 0) return null;
                      return (
                        <div key={mk} className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-semibold capitalize mb-2">{mk}</h4>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                              <YAxis tick={{ fontSize: 10 }} />
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

              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Report an Issue</h2>
                {!getToken() ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <p className="text-yellow-800 text-sm mb-2">You need to log in to submit a report.</p>
                    <Link href="/login" className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                      Log in &rarr;
                    </Link>
                  </div>
                ) : reportForm ? (
                  <div className="space-y-3">
                    <select
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={submitReport}
                        disabled={submitting || !reportCategory || !reportDesc.trim()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300"
                      >
                        {submitting ? "Submitting..." : "Submit"}
                      </button>
                      <button onClick={() => setReportForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                        Cancel
                      </button>
                    </div>
                    {reportMsg && <p className="text-sm text-green-700">{reportMsg}</p>}
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
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Sensor Info</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">Type</dt><dd>{sensor.type}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Status</dt>
                    <dd>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[sensor.status] || "bg-gray-100 text-gray-800"}`}>
                        {sensor.status}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between"><dt className="text-gray-500">Lat</dt><dd>{sensor.latitude.toFixed(4)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Lng</dt><dd>{sensor.longitude.toFixed(4)}</dd></div>
                </dl>
              </div>

              <div className="bg-white rounded-xl shadow overflow-hidden h-64">
                <MiniMap latitude={sensor.latitude} longitude={sensor.longitude} name={sensor.name} />
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-lg font-semibold mb-3">QR Code</h2>
                <p className="text-xs text-gray-500 mb-3">Print and attach to the sensor hardware.</p>
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
