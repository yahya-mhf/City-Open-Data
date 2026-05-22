"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";
import { Badge, Button, Card, Input, Modal, Select } from "@/components/ui";

interface UserItem { id: string; email: string; full_name: string; role: string; plan: string; created_at: string }
interface SensorItem { id: string; name: string; type: string; latitude: number; longitude: number; status: string }
interface HubItem { id: string; name: string; latitude: number; longitude: number; status: string }
interface AlertItem { id: string; sensor_id: string; severity: string; message: string; acknowledged: boolean; created_at: string }
interface ReportItem { id: string; user_id: string; category: string; description: string; status: string; created_at: string }

type AdminTab = "sensors" | "users" | "alerts" | "reports" | "hubs";

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "sensors", label: "Sensors" },
  { id: "users", label: "Users" },
  { id: "alerts", label: "Alerts" },
  { id: "reports", label: "Reports" },
  { id: "hubs", label: "Hubs" },
];

const PAGE_SIZE = 10;

function badgeTone(value: string): "success" | "warning" | "danger" | "info" | "default" {
  if (["active", "online", "admin", "enterprise", "resolved", "low"].includes(value)) return "success";
  if (["maintenance", "operator", "pro", "in_progress", "medium", "under_review"].includes(value)) return "warning";
  if (["inactive", "offline", "critical", "high", "rejected"].includes(value)) return "danger";
  if (["citizen", "free", "pending"].includes(value)) return "info";
  return "default";
}

function pageRows<T>(rows: T[], page: number): T[] {
  return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

function AdminContent() {
  const { user, token, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("sensors");
  const [sensors, setSensors] = useState<SensorItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [hubs, setHubs] = useState<HubItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deleteSensorId, setDeleteSensorId] = useState<string | null>(null);
  const [sensorDraft, setSensorDraft] = useState({ name: "", type: "environmental", latitude: "", longitude: "", status: "active" });

  const loadAdminData = async () => {
    if (!token || user?.role !== "admin") return;
    setLoading(true);
    setLoadError(null);
    try {
      const [sensorRows, userRows, hubRows, alertRows, reportRows] = await Promise.all([
        api.admin.sensors.list(token),
        api.admin.users.list(token),
        api.admin.hubs.list(token),
        api.alerts.list(token),
        api.reports.list(token),
      ]);
      setSensors(sensorRows);
      setUsers(userRows);
      setHubs(hubRows);
      setAlerts(alertRows);
      setReports(reportRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load admin data";
      setLoadError(message.includes("403") ? "Permission denied. Admin role is required." : message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [token, user?.role]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, statusFilter]);

  const addSensor = async () => {
    if (!token || !sensorDraft.name.trim()) return;
    const latitude = parseFloat(sensorDraft.latitude);
    const longitude = parseFloat(sensorDraft.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;
    const sensor = await api.admin.sensors.create({
      name: sensorDraft.name.trim(),
      type: sensorDraft.type,
      latitude,
      longitude,
      status: sensorDraft.status,
    }, token);
    setSensors((prev) => [...prev, sensor]);
    setSensorDraft({ name: "", type: "environmental", latitude: "", longitude: "", status: "active" });
  };

  const updateSensor = async (id: string, data: Partial<SensorItem>) => {
    if (!token) return;
    const updated = await api.admin.sensors.update(id, data, token);
    setSensors((prev) => prev.map((sensor) => (sensor.id === id ? updated : sensor)));
  };

  const softDeleteSensor = async () => {
    if (!token || !deleteSensorId) return;
    await api.admin.sensors.delete(deleteSensorId, token);
    setSensors((prev) => prev.map((sensor) => (sensor.id === deleteSensorId ? { ...sensor, status: "inactive" } : sensor)));
    setDeleteSensorId(null);
  };

  const updateUser = async (id: string, data: Partial<UserItem>) => {
    if (!token) return;
    const updated = await api.admin.users.update(id, data, token);
    setUsers((prev) => prev.map((row) => (row.id === id ? updated : row)));
  };

  const acknowledgeAlert = async (id: string) => {
    if (!token) return;
    await api.alerts.acknowledge(id, token);
    setAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert)));
  };

  const updateReportStatus = async (id: string, status: string) => {
    if (!token) return;
    await api.reports.updateStatus(id, status, token);
    setReports((prev) => prev.map((report) => (report.id === id ? { ...report, status } : report)));
  };

  const activeRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = <T,>(rows: T[], text: (row: T) => string, status: (row: T) => string = () => "") =>
      rows.filter((row) => {
        const matchesQuery = !q || text(row).toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || status(row) === statusFilter;
        return matchesQuery && matchesStatus;
      });
    if (activeTab === "sensors") return filter(sensors, (row) => `${row.name} ${row.id} ${row.type}`, (row) => row.status);
    if (activeTab === "alerts") return filter(alerts, (row) => `${row.message} ${row.sensor_id} ${row.severity}`, (row) => row.acknowledged ? "acknowledged" : "open");
    if (activeTab === "reports") return filter(reports, (row) => `${row.category} ${row.description} ${row.user_id}`, (row) => row.status);
    if (activeTab === "hubs") return filter(hubs, (row) => `${row.name} ${row.id}`, (row) => row.status);
    return users.filter((row) => !q || `${row.full_name} ${row.email} ${row.role} ${row.plan}`.toLowerCase().includes(q));
  }, [activeTab, alerts, hubs, query, reports, sensors, statusFilter, users]);

  const statusOptions = useMemo(() => {
    if (activeTab === "users") return [];
    const values = activeRows.map((row) => {
      if (activeTab === "alerts") return (row as AlertItem).acknowledged ? "acknowledged" : "open";
      return "status" in row ? String(row.status) : "";
    }).filter((value): value is string => Boolean(value));
    return Array.from(new Set(values)).sort();
  }, [activeRows, activeTab]);

  if (authLoading) return <PageLoader message="Checking admin access..." />;

  if (!user || user.role !== "admin") {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <Card className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Permission denied</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Admin role is required for this console.</p>
          <Link href="/" className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Go home</Link>
        </Card>
      </div>
    );
  }

  if (loading) return <PageLoader message="Loading admin console..." />;
  if (loadError) return <PageError message={loadError} retry={loadAdminData} />;

  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-night-primary">
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-[14rem_1fr]">
        <Card className="h-fit p-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-night-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Console</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage sensors, users, alerts, reports, and hubs.</p>
              </div>
              <div className="flex gap-2">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeTab}`} />
                {activeTab !== "users" && (
                  <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-40">
                    <option value="all">All statuses</option>
                    {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                )}
              </div>
            </div>
          </Card>

          {activeTab === "sensors" && (
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Create Sensor</h2>
              <div className="grid gap-3 lg:grid-cols-[1fr_10rem_9rem_9rem_9rem_auto]">
                <Input value={sensorDraft.name} onChange={(event) => setSensorDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Sensor name" />
                <Input value={sensorDraft.type} onChange={(event) => setSensorDraft((prev) => ({ ...prev, type: event.target.value }))} placeholder="Type" />
                <Input type="number" step="any" value={sensorDraft.latitude} onChange={(event) => setSensorDraft((prev) => ({ ...prev, latitude: event.target.value }))} placeholder="Latitude" />
                <Input type="number" step="any" value={sensorDraft.longitude} onChange={(event) => setSensorDraft((prev) => ({ ...prev, longitude: event.target.value }))} placeholder="Longitude" />
                <Select value={sensorDraft.status} onChange={(event) => setSensorDraft((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </Select>
                <Button onClick={addSensor}>Create</Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden p-0">
            {activeRows.length === 0 ? (
              <div className="p-6"><EmptyState message="No records match the current filters." /></div>
            ) : activeTab === "sensors" ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-night-primary"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Location</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody>{pageRows(activeRows as SensorItem[], page).map((sensor) => (
                  <tr key={sensor.id} className="border-t border-gray-100 dark:border-night-border">
                    <td className="px-4 py-3"><Input value={sensor.name} onChange={(event) => updateSensor(sensor.id, { name: event.target.value })} /></td>
                    <td className="px-4 py-3"><Input value={sensor.type} onChange={(event) => updateSensor(sensor.id, { type: event.target.value })} /></td>
                    <td className="px-4 py-3"><Select value={sensor.status} onChange={(event) => updateSensor(sensor.id, { status: event.target.value })}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></Select></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{sensor.latitude.toFixed(4)}, {sensor.longitude.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right"><Button variant="danger" size="sm" onClick={() => setDeleteSensorId(sensor.id)}>Deactivate</Button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : activeTab === "users" ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-night-primary"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Plan</th><th className="px-4 py-3 text-left">Created</th></tr></thead>
                <tbody>{pageRows(activeRows as UserItem[], page).map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 dark:border-night-border">
                    <td className="px-4 py-3">{row.full_name}</td><td className="px-4 py-3">{row.email}</td>
                    <td className="px-4 py-3"><Select value={row.role} onChange={(event) => updateUser(row.id, { role: event.target.value })}><option value="citizen">Citizen</option><option value="operator">Operator</option><option value="admin">Admin</option></Select></td>
                    <td className="px-4 py-3"><Badge tone={badgeTone(row.plan)}>{row.plan}</Badge></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(row.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : activeTab === "alerts" ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-night-primary"><tr><th className="px-4 py-3 text-left">Severity</th><th className="px-4 py-3 text-left">Sensor</th><th className="px-4 py-3 text-left">Message</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
                <tbody>{pageRows(activeRows as AlertItem[], page).map((alert) => (
                  <tr key={alert.id} className="border-t border-gray-100 dark:border-night-border">
                    <td className="px-4 py-3"><Badge tone={badgeTone(alert.severity)}>{alert.severity}</Badge></td><td className="px-4 py-3 font-mono text-xs">{alert.sensor_id}</td><td className="px-4 py-3">{alert.message}</td><td className="px-4 py-3">{alert.acknowledged ? "Acknowledged" : "Open"}</td>
                    <td className="px-4 py-3 text-right"><Button variant="secondary" size="sm" onClick={() => acknowledgeAlert(alert.id)} disabled={alert.acknowledged}>Acknowledge</Button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : activeTab === "reports" ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-night-primary"><tr><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Created</th></tr></thead>
                <tbody>{pageRows(activeRows as ReportItem[], page).map((report) => (
                  <tr key={report.id} className="border-t border-gray-100 dark:border-night-border">
                    <td className="px-4 py-3">{report.category.replace(/_/g, " ")}</td><td className="px-4 py-3">{report.description.slice(0, 140)}</td>
                    <td className="px-4 py-3"><Select value={report.status} onChange={(event) => updateReportStatus(report.id, event.target.value)}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></Select></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(report.created_at).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-night-primary"><tr><th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Location</th></tr></thead>
                <tbody>{pageRows(activeRows as HubItem[], page).map((hub) => (
                  <tr key={hub.id} className="border-t border-gray-100 dark:border-night-border"><td className="px-4 py-3 font-mono text-xs">{hub.id}</td><td className="px-4 py-3">{hub.name}</td><td className="px-4 py-3"><Badge tone={badgeTone(hub.status)}>{hub.status}</Badge></td><td className="px-4 py-3 font-mono text-xs text-gray-500">{hub.latitude.toFixed(4)}, {hub.longitude.toFixed(4)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>

          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>{activeRows.length} records</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1}>Previous</Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page === totalPages}>Next</Button>
            </div>
          </div>
        </div>
      </main>

      <Modal open={Boolean(deleteSensorId)} title="Deactivate sensor" onClose={() => setDeleteSensorId(null)}>
        <p className="text-sm text-gray-600 dark:text-gray-300">This sets the sensor status to inactive. Historical readings remain available.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteSensorId(null)}>Cancel</Button>
          <Button variant="danger" onClick={softDeleteSensor}>Deactivate</Button>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminPage() {
  return <AdminContent />;
}
