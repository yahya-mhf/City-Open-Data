"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/api";
import { PageError } from "@/components/PageState";

interface UserItem { id: string; email: string; full_name: string; role: string; created_at: string }
interface SensorItem { id: string; name: string; type: string; latitude: number; longitude: number; status: string }
interface HubItem { id: string; name: string; latitude: number; longitude: number; status: string }
interface AlertItem { id: string; sensor_id: string; severity: string; message: string; acknowledged: boolean; created_at: string }
interface ReportItem { id: string; user_id: string; category: string; description: string; status: string; created_at: string }

function AdminContent() {
  const { user, token } = useAuth();
  const { nightMode, toggleNightMode } = useTheme();
  const [activeTab, setActiveTab] = useState("sensors");
  const [sensors, setSensors] = useState<SensorItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [hubs, setHubs] = useState<HubItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newSensorName, setNewSensorName] = useState("");
  const [newSensorLat, setNewSensorLat] = useState("");
  const [newSensorLng, setNewSensorLng] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoadError(null);
    Promise.all([
      api.admin.sensors.list(token),
      api.admin.users.list(token),
      api.admin.hubs.list(token),
      api.alerts.list(token),
      api.reports.list(token),
    ])
      .then(([sensorRows, userRows, hubRows, alertRows, reportRows]) => {
        setSensors(sensorRows);
        setUsers(userRows);
        setHubs(hubRows);
        setAlerts(alertRows);
        setReports(reportRows);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load admin data"));
  }, [token]);

  if (!user || (user.role !== "admin" && user.role !== "operator")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Access denied. <Link href="/" className="text-primary-600">Go home</Link></p>
      </div>
    );
  }

  if (loadError) {
    return <PageError message={loadError} retry={() => window.location.reload()} />;
  }

  const addSensor = async () => {
    if (!token || !newSensorName) return;
    const lat = parseFloat(newSensorLat);
    const lng = parseFloat(newSensorLng);
    if (isNaN(lat) || isNaN(lng)) return;
    const sensor = await api.admin.sensors.create({ name: newSensorName, latitude: lat, longitude: lng }, token);
    setSensors((prev) => [...prev, sensor as unknown as SensorItem]);
    setNewSensorName("");
    setNewSensorLat("");
    setNewSensorLng("");
  };

  const acknowledgeAlert = async (id: string) => {
    if (!token) return;
    await api.alerts.acknowledge(id, token);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const updateReportStatus = async (id: string, status: string) => {
    if (!token) return;
    await api.reports.updateStatus(id, status, token);
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const tabs = ["sensors", "users", "hubs", "alerts", "reports"];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Admin Panel</h1>
          <nav className="flex gap-4 items-center">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/maps" className="text-gray-600 hover:text-primary-600">Maps</Link>
            <Link href="/developer" className="text-gray-600 hover:text-primary-600">Developer</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                activeTab === tab ? "border-b-2 border-primary-600 text-primary-600" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "sensors" && (
          <div>
            <div className="flex gap-2 mb-4 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input
                  value={newSensorName}
                  onChange={(e) => setNewSensorName(e.target.value)}
                  placeholder="Sensor name"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="w-32">
                <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={newSensorLat}
                  onChange={(e) => setNewSensorLat(e.target.value)}
                  placeholder="31.6295"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="w-32">
                <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={newSensorLng}
                  onChange={(e) => setNewSensorLng(e.target.value)}
                  placeholder="-7.9811"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <button onClick={addSensor} className="px-4 py-2 bg-primary-600 text-white rounded-lg h-[42px]">
                Add Sensor
              </button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {sensors.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-4 py-3">{s.name}</td>
                      <td className="px-4 py-3">{s.type}</td>
                      <td className="px-4 py-3">{s.status}</td>
                      <td className="px-4 py-3 text-gray-500">{s.latitude.toFixed(2)}, {s.longitude.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-3">{u.full_name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.role}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "hubs" && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3">ID</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Location</th>
                </tr>
              </thead>
              <tbody>
                {hubs.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="px-4 py-3">{h.id}</td>
                    <td className="px-4 py-3">{h.name}</td>
                    <td className="px-4 py-3">{h.status}</td>
                    <td className="px-4 py-3 text-gray-500">{h.latitude.toFixed(2)}, {h.longitude.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="space-y-4">
            {alerts.filter((a) => !a.acknowledged).map((alert) => (
              <div key={alert.id} className="bg-white rounded-xl shadow p-6 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      alert.severity === "critical" ? "bg-red-100 text-red-800" :
                      alert.severity === "high" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    }`}>{alert.severity}</span>
                    <span className="text-sm text-gray-500">{new Date(alert.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2">{alert.message}</p>
                </div>
                <button
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Acknowledge
                </button>
              </div>
            ))}
            {alerts.filter((a) => !a.acknowledged).length === 0 && (
              <p className="text-gray-500 text-center py-8">No active alerts</p>
            )}
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="bg-white rounded-xl shadow p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{report.category.replace(/_/g, " ")}</h3>
                    <p className="text-gray-600 text-sm mt-1">{report.description.slice(0, 200)}</p>
                  </div>
                  <select
                    value={report.status}
                    onChange={(e) => updateReportStatus(report.id, e.target.value)}
                    className="px-3 py-1 border rounded-lg text-sm"
                  >
                    <option value="pending">Pending</option>
                    <option value="under_review">Under Review</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="text-xs text-gray-400 mt-3">{new Date(report.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminPage() {
  return <AdminContent />;
}
