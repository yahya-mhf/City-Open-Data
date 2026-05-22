"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { EmptyState, PageError, PageLoader } from "@/components/PageState";
import { Badge, Button, Card, Input, Select, Tabs, Textarea } from "@/components/ui";

interface ApiKey {
  id: string;
  name: string;
  description?: string | null;
  key_prefix: string;
  tier: string;
  rate_limit: number;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
  total_requests?: number;
}

interface CreatedKey {
  id: string;
  name: string;
  key: string;
  tier: string;
  rate_limit: number;
  created_at: string;
}

interface PublicEndpoint {
  method: "GET";
  path: string;
  description: string;
  params: string[];
  example: unknown;
}

const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "/public/v1");

const PUBLIC_ENDPOINTS: PublicEndpoint[] = [
  { method: "GET", path: "/sensors", description: "List public sensors, locations, types, and statuses.", params: ["status", "type"], example: [{ id: "sensor-001", name: "Gueliz AQ", type: "air_quality", status: "active" }] },
  { method: "GET", path: "/sensors/{sensor_id}/readings", description: "Read historical sensor values available to this key tier.", params: ["sensor_id", "metric", "from", "to", "interval"], example: [{ time: "2026-05-22T10:00:00Z", metric_key: "temperature", avg_value: 25.2 }] },
  { method: "GET", path: "/metrics", description: "List metric definitions allowed for the API key.", params: [], example: [{ key: "temperature", display_name: "Temperature", unit: "C" }] },
  { method: "GET", path: "/layers/{metric_key}", description: "Get the latest public layer values for one metric.", params: ["metric_key"], example: [{ sensor_id: "sensor-001", value: 25.2, unit: "C", time: "2026-05-22T10:00:00Z" }] },
  { method: "GET", path: "/intelligence/latest", description: "Return cached public intelligence suggestions.", params: ["analysis_type"], example: [{ type: "risk", title: "Heat stress rising", confidence: 0.82 }] },
  { method: "GET", path: "/status", description: "Public platform status. This endpoint does not require an API key.", params: [], example: { status: "operational", sensor_count: 24 } },
];

function methodBadge(method: string) {
  return <Badge tone="success">{method}</Badge>;
}

function DeveloperContent() {
  const { user, token, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("keys");

  if (loading) return <PageLoader message="Loading developer portal..." />;

  if (!user || !token) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <Card className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Login required</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">API key management is available after login.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Login</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-night-primary">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Developer Portal</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">Manage keys for the public `/public/v1` API and test live requests with a full key.</p>
        </Card>
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "keys", label: "API Keys" },
            { id: "usage", label: "Usage" },
            { id: "docs", label: "Documentation" },
            { id: "tester", label: "Live Tester" },
          ]}
        />
        <div className="mt-6">
          {activeTab === "keys" && <ApiKeysTab token={token} />}
          {activeTab === "usage" && <UsageTab token={token} />}
          {activeTab === "docs" && <DocsTab />}
          {activeTab === "tester" && <TesterTab token={token} />}
        </div>
      </main>
    </div>
  );
}

function ApiKeysTab({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await api.apiKeys.list(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [token]);

  const createKey = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const key = await api.apiKeys.create(name.trim(), token);
      setCreatedKey(key);
      setName("");
      setDescription("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    setError(null);
    try {
      await api.apiKeys.delete(id, token);
      setKeys((prev) => prev.map((key) => (key.id === id ? { ...key, is_active: false } : key)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  };

  if (loading) return <PageLoader message="Loading API keys..." />;

  return (
    <div className="space-y-6">
      {error && <PageError message={error} retry={loadKeys} />}
      {createdKey && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">Copy this full key now</h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">Only the prefix is visible after this panel is dismissed.</p>
          <div className="mt-4 rounded-lg border border-amber-300 bg-white p-3 font-mono text-sm text-gray-900 dark:border-amber-800 dark:bg-night-primary dark:text-gray-100">{createdKey.key}</div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigator.clipboard?.writeText(createdKey.key)}>Copy Full Key</Button>
            <Button variant="secondary" onClick={() => setCreatedKey(null)}>Dismiss</Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Create API Key</h2>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Key name" />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
          <Button onClick={createKey} disabled={creating || !name.trim()}>{creating ? "Creating..." : "Create Key"}</Button>
        </div>
      </Card>

      <div className="grid gap-4">
        {keys.length === 0 ? (
          <EmptyState message="No API keys yet." />
        ) : keys.map((key) => (
          <Card key={key.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{key.name}</h3>
                  <Badge tone={key.is_active ? "success" : "danger"}>{key.is_active ? "Active" : "Revoked"}</Badge>
                  <Badge tone="info">{key.tier}</Badge>
                </div>
                <p className="mt-2 font-mono text-xs text-gray-500 dark:text-gray-400">{key.key_prefix}...</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Created {new Date(key.created_at).toLocaleDateString()} · Last used {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "never"} · {key.total_requests ?? 0} requests
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => revokeKey(key.id)} disabled={!key.is_active}>Revoke</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UsageTab({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof api.apiKeys.usage>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.apiKeys.list(token).then((rows) => {
      setKeys(rows);
      setSelectedKeyId(rows.find((key) => key.is_active)?.id ?? rows[0]?.id ?? "");
    }).catch((err) => setError(err instanceof Error ? err.message : "Failed to load API keys"));
  }, [token]);

  useEffect(() => {
    if (!selectedKeyId) return;
    api.apiKeys.usage(selectedKeyId, token)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load key usage"));
  }, [selectedKeyId, token]);

  const endpointRows = useMemo(
    () => Object.entries(usage?.by_endpoint ?? {}).map(([path, count]) => ({ path, count })),
    [usage],
  );

  if (error) return <PageError message={error} retry={() => window.location.reload()} />;
  if (keys.length === 0) return <EmptyState message="Create an API key before usage analytics are available." />;

  return (
    <div className="space-y-6">
      <Card>
        <Select value={selectedKeyId} onChange={(event) => setSelectedKeyId(event.target.value)}>
          {keys.map((key) => <option key={key.id} value={key.id}>{key.name} ({key.key_prefix}...)</option>)}
        </Select>
      </Card>
      {!usage ? <PageLoader message="Loading usage..." /> : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><p className="text-xs text-gray-500">Today</p><p className="mt-1 text-3xl font-bold">{usage.requests_today}</p></Card>
            <Card><p className="text-xs text-gray-500">This week</p><p className="mt-1 text-3xl font-bold">{usage.requests_this_week}</p></Card>
            <Card><p className="text-xs text-gray-500">Error rate</p><p className="mt-1 text-3xl font-bold">{(usage.error_rate * 100).toFixed(1)}%</p></Card>
            <Card><p className="text-xs text-gray-500">Avg latency</p><p className="mt-1 text-3xl font-bold">{usage.avg_response_time_ms?.toFixed(0) ?? "--"}ms</p></Card>
          </div>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Requests by endpoint</h2>
            {endpointRows.length === 0 ? <EmptyState message="No endpoint usage recorded yet." /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={endpointRows} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="path" type="category" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DocsTab() {
  return (
    <div className="grid gap-4">
      {PUBLIC_ENDPOINTS.map((endpoint) => (
        <Card key={endpoint.path}>
          <div className="flex flex-wrap items-center gap-3">
            {methodBadge(endpoint.method)}
            <code className="text-sm text-gray-900 dark:text-gray-100">{endpoint.path}</code>
          </div>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{endpoint.description}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Base URL: <code>{PUBLIC_API_URL}</code></p>
          {endpoint.params.length > 0 && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Params: {endpoint.params.join(", ")}</p>}
          <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-green-300">{JSON.stringify(endpoint.example, null, 2)}</pre>
        </Card>
      ))}
    </div>
  );
}

function TesterTab({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [endpointPath, setEndpointPath] = useState(PUBLIC_ENDPOINTS[0].path);
  const [fullKey, setFullKey] = useState("");
  const [params, setParams] = useState("");
  const [response, setResponse] = useState("");
  const [request, setRequest] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.apiKeys.list(token).then(setKeys).catch(() => setKeys([]));
  }, [token]);

  const endpoint = PUBLIC_ENDPOINTS.find((item) => item.path === endpointPath) ?? PUBLIC_ENDPOINTS[0];

  const run = async () => {
    if (!fullKey.trim() && endpoint.path !== "/status") return;
    setLoading(true);
    setError("");
    setResponse("");
    let path = endpoint.path;
    const query = new URLSearchParams();
    params.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const [key, ...rest] = line.split("=");
      const value = rest.join("=");
      if (key && value && path.includes(`{${key}}`)) path = path.replace(`{${key}}`, value);
      else if (key && value) query.set(key, value);
    });
    const url = `${PUBLIC_API_URL}${path}${query.toString() ? `?${query.toString()}` : ""}`;
    setRequest(`GET ${url}`);
    try {
      const res = await fetch(url, { headers: endpoint.path === "/status" ? {} : { "x-api-key": fullKey.trim() } });
      const body = await res.text();
      const formatted = JSON.stringify(JSON.parse(body), null, 2);
      if (!res.ok) setError(`HTTP ${res.status}: ${formatted}`);
      else setResponse(formatted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
      <Card>
        <div className="space-y-4">
          <Select value={endpointPath} onChange={(event) => setEndpointPath(event.target.value)}>
            {PUBLIC_ENDPOINTS.map((item) => <option key={item.path} value={item.path}>{item.method} {item.path}</option>)}
          </Select>
          <Input value={fullKey} onChange={(event) => setFullKey(event.target.value)} placeholder="Full API key, not prefix" />
          <Textarea value={params} onChange={(event) => setParams(event.target.value)} rows={6} placeholder={"sensor_id=sensor-001\nmetric=temperature"} />
          <Button onClick={run} disabled={loading || (!fullKey.trim() && endpoint.path !== "/status")}>{loading ? "Sending..." : "Send Request"}</Button>
          {keys.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Available prefixes: {keys.map((key) => `${key.name} (${key.key_prefix}...)`).join(", ")}</p>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Request and response</h2>
        {request && <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-blue-200">{request}</pre>}
        {error && <pre className="overflow-x-auto rounded-lg bg-red-50 p-4 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</pre>}
        {response && <pre className="max-h-[32rem] overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-green-300">{response}</pre>}
        {!request && <EmptyState message="Run a request to see the live response." />}
      </Card>
    </div>
  );
}

export default function DeveloperPage() {
  return <DeveloperContent />;
}
