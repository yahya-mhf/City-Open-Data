"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  LineChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const TIERS: Record<string, { label: string; requestsPerMin: number; historyDays: number }> = {
  free: { label: "Free", requestsPerMin: 10, historyDays: 1 },
  basic: { label: "Basic", requestsPerMin: 60, historyDays: 7 },
  pro: { label: "Pro", requestsPerMin: 300, historyDays: 30 },
  enterprise: { label: "Enterprise", requestsPerMin: 3000, historyDays: 365 },
};

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  description: string;
  tier: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  total_requests: number;
}

interface UsageStats {
  daily: Array<{ date: string; count: number }>;
  endpoints: Array<{ path: string; count: number }>;
  error_rate: number;
  avg_response_time_ms: number;
  current_minute_requests: number;
}

interface DocEndpoint {
  method: string;
  path: string;
  description: string;
  headers: Array<{ name: string; value: string; required: boolean }>;
  params: Array<{ name: string; type: string; required: boolean; description: string }>;
  exampleRequest: string;
  exampleResponse: string;
}

const DOCS_ENDPOINTS: DocEndpoint[] = [
  {
    method: "GET",
    path: "/sensors",
    description: "List all sensors with their current status and location.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "status", type: "string", required: false, description: "Filter by status (active, inactive, maintenance)" },
      { name: "type", type: "string", required: false, description: "Filter by sensor type" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/sensors?status=active"`,
    exampleResponse: JSON.stringify([
      { id: "uuid", name: "AQ-01", type: "air_quality", latitude: 31.6295, longitude: -7.9811, status: "active", installed_at: "2026-01-15T10:00:00Z" },
    ], null, 2),
  },
  {
    method: "GET",
    path: "/sensors/{id}",
    description: "Get detailed information about a specific sensor.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "id", type: "string (path)", required: true, description: "Sensor UUID" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/sensors/uuid-here"`,
    exampleResponse: JSON.stringify({ id: "uuid", name: "AQ-01", type: "air_quality", latitude: 31.6295, longitude: -7.9811, status: "active", installed_at: "2026-01-15T10:00:00Z" }, null, 2),
  },
  {
    method: "GET",
    path: "/sensors/{id}/latest",
    description: "Get the latest readings for a sensor.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "id", type: "string (path)", required: true, description: "Sensor UUID" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/sensors/uuid-here/latest"`,
    exampleResponse: JSON.stringify({ sensor_id: "uuid", timestamp: "2026-05-21T12:00:00Z", metrics: { temperature: 24.5, humidity: 55 } }, null, 2),
  },
  {
    method: "GET",
    path: "/sensors/{id}/history",
    description: "Get historical data for a sensor. Supports time range and metric filtering.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "id", type: "string (path)", required: true, description: "Sensor UUID" },
      { name: "metric_key", type: "string", required: false, description: "Filter by metric key (e.g. temperature)" },
      { name: "hours", type: "integer", required: false, description: "Number of hours to look back (default: 24)" },
      { name: "start", type: "string (ISO)", required: false, description: "Start time (overrides hours)" },
      { name: "end", type: "string (ISO)", required: false, description: "End time" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/sensors/uuid-here/history?metric_key=temperature&hours=48"`,
    exampleResponse: JSON.stringify([
      { time: "2026-05-21T10:00:00Z", metric_key: "temperature", value_numeric: 24.5, quality_flag: "good" },
    ], null, 2),
  },
  {
    method: "GET",
    path: "/map/markers",
    description: "Get all sensor markers for the map view. No authentication required.",
    headers: [],
    params: [],
    exampleRequest: `curl "${API_URL}/map/markers"`,
    exampleResponse: JSON.stringify([
      { id: "uuid", name: "AQ-01", latitude: 31.6295, longitude: -7.9811, status: "active", latest: { temperature: 24.5 } },
    ], null, 2),
  },
  {
    method: "GET",
    path: "/maps/metrics",
    description: "List all available metric layers.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/maps/metrics"`,
    exampleResponse: JSON.stringify([
      { id: "uuid", key: "temperature", display_name: "Temperature", unit: "°C", category: "weather", min_value: -10, max_value: 50 },
    ], null, 2),
  },
  {
    method: "GET",
    path: "/maps/layers/{metric_key}",
    description: "Get the latest sensor values for a specific metric layer.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "metric_key", type: "string (path)", required: true, description: "Metric key (e.g. temperature)" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/maps/layers/temperature"`,
    exampleResponse: JSON.stringify([
      { sensor_id: "uuid", sensor_name: "AQ-01", lat: 31.6295, lon: -7.9811, value: 24.5, unit: "°C", quality_flag: "good", time: "2026-05-21T12:00:00Z" },
    ], null, 2),
  },
  {
    method: "GET",
    path: "/alerts",
    description: "List alerts. Requires authentication.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "acknowledged", type: "boolean", required: false, description: "Filter by acknowledged status" },
      { name: "sensor_id", type: "string", required: false, description: "Filter by sensor" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/alerts?acknowledged=false"`,
    exampleResponse: JSON.stringify([
      { id: "uuid", sensor_id: "uuid", severity: "high", message: "Temperature exceeded threshold", acknowledged: false, created_at: "2026-05-21T11:00:00Z" },
    ], null, 2),
  },
  {
    method: "GET",
    path: "/analytics/sensors/{id}/history",
    description: "Get analytics-grade historical data for a sensor.",
    headers: [{ name: "x-api-key", value: "scp_...", required: true }],
    params: [
      { name: "id", type: "string (path)", required: true, description: "Sensor UUID" },
      { name: "metric_key", type: "string", required: false, description: "Filter by metric key" },
      { name: "from", type: "string (ISO)", required: false, description: "Start time" },
      { name: "to", type: "string (ISO)", required: false, description: "End time" },
    ],
    exampleRequest: `curl -H "x-api-key: scp_xxxxxxxxxxxx" \\
  "${API_URL}/analytics/sensors/uuid-here/history?metric_key=temperature&from=2026-05-20T00:00:00Z&to=2026-05-21T00:00:00Z"`,
    exampleResponse: JSON.stringify([
      { time: "2026-05-20T12:00:00Z", metric_key: "temperature", value_numeric: 24.5, quality_flag: "good" },
    ], null, 2),
  },
];

const TESTABLE_ENDPOINTS = DOCS_ENDPOINTS.filter((e) => e.headers.length > 0);

function authFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string>),
  };
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }
  return fetch(`${API_URL}${path}`, { ...options, headers }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `API error: ${res.status}`);
    }
    return res.status === 204 ? undefined as T : res.json();
  });
}

function MyApiKeysTab({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTier, setNewTier] = useState("free");
  const [newRestrictions, setNewRestrictions] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState<ApiKey & { full_key: string } | null>(null);
  const [showRevoke, setShowRevoke] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = () => {
    setLoading(true);
    authFetch<ApiKey[]>("/auth/api-keys", token)
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeys(); }, [token]);

  const createKey = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      let restrictions: string[] | undefined;
      if (newRestrictions.trim()) {
        restrictions = newRestrictions.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const key = await authFetch<ApiKey & { full_key: string }>("/auth/api-keys", token, {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          tier: newTier,
          metric_restrictions: restrictions,
        }),
      });
      setCreatedKey(key);
      setNewName("");
      setNewDesc("");
      setNewTier("free");
      setNewRestrictions("");
      setShowCreate(false);
      fetchKeys();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create API key");
    }
    setCreating(false);
  };

  const revokeKey = async (id: string) => {
    try {
      await authFetch(`/auth/api-keys/${id}`, token, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setShowRevoke(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke API key");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">My API Keys</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          + Create New Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
      )}

      {createdKey && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-6">
          <p className="text-lg font-bold text-amber-900 mb-1">API Key Created</p>
          <p className="text-sm text-amber-800 font-medium mb-4">
            This key will never be shown again. Copy it now.
          </p>
          <div className="bg-white border-2 border-amber-400 rounded-lg p-4 font-mono text-sm break-all select-all mb-4">
            {createdKey.full_key}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(createdKey.full_key);
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
              }}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              {copied ? "Copied!" : "Copy Key"}
            </button>
            <button
              onClick={() => setCreatedKey(null)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30 z-[1999]" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 z-[2000]">
            <h3 className="text-lg font-semibold mb-4">Create API Key</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. My App"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
                <select
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {Object.entries(TIERS).map(([key, t]) => (
                    <option key={key} value={key}>
                      {t.label} ({t.requestsPerMin} req/min, {t.historyDays}-day history)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metric Restrictions <span className="text-gray-400 font-normal">(optional, comma-separated)</span>
                </label>
                <input
                  value={newRestrictions}
                  onChange={(e) => setNewRestrictions(e.target.value)}
                  placeholder="e.g. temperature, humidity"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevoke && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30 z-[1999]" onClick={() => setShowRevoke(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 z-[2000]">
            <h3 className="text-lg font-semibold mb-2">Revoke API Key</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to revoke this API key? This action cannot be undone. Any services using this key will immediately lose access.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRevoke(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeKey(showRevoke)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading API keys...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow">
          <p className="text-gray-500 mb-4">No API keys yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {keys.map((key) => {
            const tier = TIERS[key.tier] || TIERS.free;
            return (
              <div
                key={key.id}
                className={`bg-white rounded-xl shadow p-5 border-l-4 ${key.is_active ? "border-green-500" : "border-red-400"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{key.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        key.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {key.is_active ? "Active" : "Revoked"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium capitalize">
                        {tier.label}
                      </span>
                    </div>
                    {key.description && (
                      <p className="text-sm text-gray-500 mb-2">{key.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                      <span>{key.key_prefix}...</span>
                      <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                      {key.last_used_at && <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>}
                      <span>{key.total_requests.toLocaleString()} requests</span>
                    </div>
                  </div>
                  {key.is_active && (
                    <button
                      onClick={() => setShowRevoke(key.id)}
                      className="ml-4 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 whitespace-nowrap"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsageAnalyticsTab({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    authFetch<ApiKey[]>("/auth/api-keys", token).then(setKeys).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!selectedKeyId) return;
    setLoadingStats(true);
    authFetch<UsageStats>(`/auth/api-keys/${selectedKeyId}/usage`, token)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, [selectedKeyId, token]);

  const selectedKey = keys.find((k) => k.id === selectedKeyId);
  const tier = selectedKey ? TIERS[selectedKey.tier] || TIERS.free : null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Usage Analytics</h2>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select API Key</label>
        <select
          value={selectedKeyId}
          onChange={(e) => setSelectedKeyId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">-- Select a key --</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.key_prefix}...)
            </option>
          ))}
        </select>
      </div>

      {!selectedKeyId && (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl shadow">
          Select an API key to view its usage analytics.
        </div>
      )}

      {selectedKeyId && loadingStats && (
        <div className="text-center py-12 text-gray-500">Loading analytics...</div>
      )}

      {selectedKeyId && !loadingStats && stats && (
        <div className="space-y-6">
          {tier && (
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Tier Limits</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Requests / Minute</span>
                    <span className="font-medium">{stats.current_minute_requests} / {tier.requestsPerMin}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        stats.current_minute_requests / tier.requestsPerMin > 0.8
                          ? "bg-red-500"
                          : stats.current_minute_requests / tier.requestsPerMin > 0.5
                          ? "bg-amber-500"
                          : "bg-primary-500"
                      }`}
                      style={{ width: `${Math.min(100, (stats.current_minute_requests / tier.requestsPerMin) * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">History Retention</span>
                    <span className="font-medium">{tier.historyDays} days</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-primary-500" style={{ width: `${Math.min(100, (tier.historyDays / 365) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Requests Over Time (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} name="Requests" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Requests by Endpoint</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.endpoints} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="path" tick={{ fontSize: 11 }} width={160} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Requests" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Error Rate</h3>
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none"
                        stroke={stats.error_rate > 5 ? "#ef4444" : stats.error_rate > 2 ? "#f59e0b" : "#22c55e"}
                        strokeWidth="3"
                        strokeDasharray={`${(stats.error_rate / 10) * 100} ${100 - (stats.error_rate / 10) * 100}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                      {stats.error_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Error rate over the last 7 days</p>
                    <p className="text-xs text-gray-400 mt-1">Threshold: 2% warning, 5% critical</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Average Response Time</h3>
                <p className="text-3xl font-bold text-gray-900">{stats.avg_response_time_ms.toFixed(0)} <span className="text-lg font-normal text-gray-500">ms</span></p>
                <p className="text-xs text-gray-400 mt-1">Average over the last 7 days</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiDocsTab({ token }: { token: string }) {
  const [activeEndpoint, setActiveEndpoint] = useState<string>(DOCS_ENDPOINTS[0].path);
  const [testerEndpoint, setTesterEndpoint] = useState<string>(TESTABLE_ENDPOINTS[0]?.path || "");
  const [testerKeyId, setTesterKeyId] = useState<string>("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [testerParams, setTesterParams] = useState<Record<string, string>>({});
  const [testerResult, setTesterResult] = useState<string>("");
  const [testerLoading, setTesterLoading] = useState(false);
  const [testerError, setTesterError] = useState("");

  useEffect(() => {
    authFetch<ApiKey[]>("/auth/api-keys", token).then(setKeys).catch(() => {});
  }, [token]);

  const selectedDoc = DOCS_ENDPOINTS.find((e) => e.path === activeEndpoint);
  const testerDoc = TESTABLE_ENDPOINTS.find((e) => e.path === testerEndpoint);
  const selectedKey = keys.find((k) => k.id === testerKeyId);

  const runTester = async () => {
    if (!testerDoc || !selectedKey) return;
    setTesterLoading(true);
    setTesterError("");
    setTesterResult("");

    let path = testerDoc.path;
    for (const [key, val] of Object.entries(testerParams)) {
      if (val) path = path.replace(`{${key}}`, val);
    }

    const queryParams = new URLSearchParams();
    for (const [key, val] of Object.entries(testerParams)) {
      if (val && !testerDoc.path.includes(`{${key}}`)) {
        queryParams.set(key, val);
      }
    }
    const qs = queryParams.toString();
    const url = `${API_URL}${path}${qs ? "?" + qs : ""}`;

    try {
      const headers: Record<string, string> = { "x-api-key": selectedKey.key_prefix };
      const res = await fetch(url, { headers });
      const body = await res.text();
      let formatted = body;
      try {
        formatted = JSON.stringify(JSON.parse(body), null, 2);
      } catch {}
      if (!res.ok) {
        setTesterError(`HTTP ${res.status}: ${body.slice(0, 500)}`);
      } else {
        setTesterResult(formatted);
      }
    } catch (e: unknown) {
      setTesterError(e instanceof Error ? e.message : "Request failed");
    }
    setTesterLoading(false);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">API Documentation</h2>

      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-xl shadow overflow-hidden">
            {DOCS_ENDPOINTS.map((ep) => (
              <button
                key={ep.path}
                onClick={() => setActiveEndpoint(ep.path)}
                className={`w-full text-left px-4 py-3 text-sm border-l-2 transition ${
                  activeEndpoint === ep.path
                    ? "border-primary-600 bg-primary-50 text-primary-700 font-medium"
                    : "border-transparent hover:bg-gray-50 text-gray-600"
                }`}
              >
                <span className={`inline-block w-14 text-xs font-bold uppercase ${
                  ep.method === "GET" ? "text-green-600" : ep.method === "POST" ? "text-blue-600" : "text-amber-600"
                }`}>
                  {ep.method}
                </span>
                <span className="block text-xs font-mono mt-0.5 truncate">{ep.path}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {selectedDoc && (
            <div className="bg-white rounded-xl shadow p-6 space-y-6">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                  selectedDoc.method === "GET" ? "bg-green-100 text-green-700" :
                  selectedDoc.method === "POST" ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                }`}>
                  {selectedDoc.method}
                </span>
                <code className="text-sm font-mono text-gray-800">{selectedDoc.path}</code>
              </div>
              <p className="text-sm text-gray-600">{selectedDoc.description}</p>

              {selectedDoc.headers.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Required Headers</h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Name</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDoc.headers.map((h) => (
                          <tr key={h.name} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{h.name}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-500">{h.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedDoc.params.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Parameters</h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Name</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Type</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Required</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDoc.params.map((p) => (
                          <tr key={p.name} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2 font-mono text-xs">{p.name}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{p.type}</td>
                            <td className="px-3 py-2 text-xs">{p.required ? <span className="text-red-500">Yes</span> : <span className="text-gray-400">No</span>}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Example Request</h4>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto"><code>{selectedDoc.exampleRequest}</code></pre>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Example Response</h4>
                <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-x-auto border"><code>{selectedDoc.exampleResponse}</code></pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Live API Tester</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint</label>
            <select
              value={testerEndpoint}
              onChange={(e) => { setTesterEndpoint(e.target.value); setTesterParams({}); setTesterResult(""); setTesterError(""); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {TESTABLE_ENDPOINTS.map((ep) => (
                <option key={ep.path} value={ep.path}>{ep.method} {ep.path}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <select
              value={testerKeyId}
              onChange={(e) => setTesterKeyId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">-- Select a key --</option>
              {keys.filter((k) => k.is_active).map((k) => (
                <option key={k.id} value={k.id}>{k.name} ({k.key_prefix}...)</option>
              ))}
            </select>
          </div>
        </div>

        {testerDoc && testerDoc.params.length > 0 && (
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {testerDoc.params.map((p) => (
              <div key={p.name}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {p.name} {p.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  value={testerParams[p.name] || ""}
                  onChange={(e) => setTesterParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                  placeholder={p.description}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={runTester}
          disabled={testerLoading || !selectedKey || !testerDoc}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {testerLoading ? "Sending..." : "Try It"}
        </button>

        {testerError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            <pre className="whitespace-pre-wrap font-mono text-xs">{testerError}</pre>
          </div>
        )}

        {testerResult && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Response</h4>
            <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-x-auto border max-h-96 overflow-y-auto"><code>{testerResult}</code></pre>
          </div>
        )}
      </div>
    </div>
  );
}

function DeveloperContent() {
  const { user, token, loading } = useAuth();
  const { nightMode, toggleNightMode } = useTheme();
  const [activeTab, setActiveTab] = useState("keys");
  const tabs = [
    { id: "keys", label: "My API Keys" },
    { id: "usage", label: "Usage Analytics" },
    { id: "docs", label: "API Documentation" },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please <Link href="/login" className="text-primary-600">login</Link> to access the developer portal.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Developer Portal</h1>
          <nav className="flex gap-4 items-center">
            <button
              onClick={toggleNightMode}
              className="text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 text-lg transition"
              title={nightMode ? "Switch to day mode" : "Switch to night mode"}
            >
              {nightMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/map" className="text-gray-600 hover:text-primary-600">Map</Link>
            <Link href="/account" className="text-gray-600 hover:text-primary-600">Account</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
            <span className="text-sm text-gray-500">{user.full_name}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-2 border-b mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-b-2 border-primary-600 text-primary-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "keys" && <MyApiKeysTab token={token!} />}
        {activeTab === "usage" && <UsageAnalyticsTab token={token!} />}
        {activeTab === "docs" && <ApiDocsTab token={token!} />}
      </main>
    </div>
  );
}

export default function DeveloperPage() {
  return (
    <AuthProvider>
      <DeveloperContent />
    </AuthProvider>
  );
}
