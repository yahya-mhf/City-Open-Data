export interface IntelligenceSuggestion {
  id: string;
  type: "opportunity" | "risk" | "recommendation" | "alert";
  title: string;
  description: string;
  lat: number;
  lon: number;
  radius_meters: number;
  severity: "low" | "medium" | "high";
  metrics_involved: string[];
  confidence: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

interface FetchOptions extends RequestInit {
  token?: string;
}

async function fetchApi<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOpts.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOpts,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; full_name: string }) =>
      fetchApi("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      fetchApi<{ access_token: string; refresh_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    refresh: (refresh_token: string) =>
      fetchApi<{ access_token: string; refresh_token: string }>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token }),
      }),
    logout: (refresh_token: string, token: string) =>
      fetchApi("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token }),
        token,
      }),
    me: (token: string) => fetchApi("/auth/me", { token }),
    applyCoupon: (code: string, token: string) =>
      fetchApi("/auth/me/plan", { method: "PATCH", body: JSON.stringify({ code }), token }),
  },
  sensors: {
    list: (token?: string) =>
      fetchApi<Array<{ id: string; name: string; type: string; latitude: number; longitude: number; status: string; installed_at: string }>>("/sensors", { token }),
    get: (id: string, token?: string) =>
      fetchApi<{ id: string; name: string; type: string; latitude: number; longitude: number; status: string; installed_at: string }>(`/sensors/${id}`, { token }),
    latest: (id: string) =>
      fetchApi<{ sensor_id: string; timestamp?: string; metrics: Record<string, number> }>(`/sensors/${id}/latest`),
    history: (id: string, metricKey?: string, hours = 24) =>
      fetchApi<Array<{ time: string; metric_key: string; value_numeric?: number; value_text?: string; quality_flag?: string }>>(
        `/sensors/${id}/history?${metricKey ? `metric_key=${metricKey}&` : ""}hours=${hours}`
      ),
    historyRange: (id: string, metricKey: string, start: string, end: string) =>
      fetchApi<Array<{ time: string; metric_key: string; value_numeric?: number; value_text?: string; quality_flag?: string }>>(
        `/sensors/${id}/history?metric_key=${metricKey}&start=${start}&end=${end}`
      ),
    stats: (id: string) =>
      fetchApi<{ sensor_id: string; metrics: Array<{ metric_key: string; display_name: string; unit: string; current_value?: number; avg_24h?: number; monthly_avg?: number; monthly_min?: number; monthly_max?: number; monthly_count: number }> }>(
        `/sensors/${id}/stats`
      ),
    heatmap: (id: string) =>
      fetchApi<Array<{ hour: number; weekday: number; avg_value: number; metric_key: string }>>(
        `/sensors/${id}/heatmap`
      ),
    distribution: (id: string, metricKey: string, buckets = 15) =>
      fetchApi<Array<{ range_min: number; range_max: number; count: number; metric_key: string }>>(
        `/sensors/${id}/distribution?metric_key=${metricKey}&buckets=${buckets}`
      ),
    simulate: (id: string, adjustments: Record<string, number>) =>
      fetchApi<{
        sensor_id: string;
        sensor_name: string;
        current: Record<string, number>;
        hypothetical: Record<string, number>;
        impact: Record<string, { current: number; hypothetical: number; diff: number; percent_change: number; direction: string }>;
      }>(`/sensors/${id}/simulate`, {
        method: "POST",
        body: JSON.stringify({ adjustments }),
      }),
  },
  alerts: {
    list: (token: string, acknowledged?: boolean) =>
      fetchApi<Array<{ id: string; sensor_id: string; severity: string; message: string; acknowledged: boolean; created_at: string }>>(
        `/alerts${acknowledged !== undefined ? `?acknowledged=${acknowledged}` : ""}`,
        { token }
      ),
    acknowledge: (id: string, token: string) =>
      fetchApi(`/alerts/${id}/acknowledge`, { method: "POST", token }),
    bySensor: (sensorId: string, token: string) =>
      fetchApi<Array<{ id: string; sensor_id: string; severity: string; message: string; acknowledged: boolean; created_at: string }>>(
        `/alerts?sensor_id=${sensorId}&acknowledged=false`,
        { token }
      ),
  },
  reports: {
    create: (data: FormData, token: string) =>
      fetchApi("/reports", { method: "POST", body: data, token }),
    my: (token: string) =>
      fetchApi<Array<{ id: string; category: string; description: string; status: string; created_at: string; latitude: number; longitude: number; image_url: string | null }>>("/reports/me", { token }),
    list: (token: string, status?: string) =>
      fetchApi<Array<{ id: string; user_id: string; category: string; description: string; status: string; created_at: string; image_url: string | null }>>(
        `/reports${status ? `?status_filter=${status}` : ""}`,
        { token }
      ),
    updateStatus: (id: string, status: string, token: string) =>
      fetchApi(`/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }), token }),
    public: (category?: string) =>
      fetchApi<Array<{ id: string; user_id: string; category: string; description: string; latitude: number; longitude: number; image_url: string | null; status: string; created_at: string }>>(
        `/reports/public${category ? `?category=${category}` : ""}`
      ),
  },
  city: {
    stats: () =>
      fetchApi<{ sensor_count: number; alert_count: number; timestamp?: string }>("/city-stats"),
  },
  map: {
    markers: () =>
      fetchApi<Array<{ id: string; name: string; latitude: number; longitude: number; status: string; latest: Record<string, unknown> }>>("/map/markers"),
  },
  maps: {
    metrics: () =>
      fetchApi<Array<{ id: string; key: string; display_name: string; unit: string; category: string; min_value: number | null; max_value: number | null }>>("/maps/metrics"),
    layers: (metricKey: string) =>
      fetchApi<Array<{ sensor_id: string; sensor_name: string; lat: number; lon: number; value: number; unit: string; quality_flag: string | null; time: string | null }>>(`/maps/layers/${metricKey}`),
    forecast: (metricKey: string, hoursAhead = 24) =>
      fetchApi<Array<{ sensor_id: string; forecast: Array<{ time: string; value: number; lower_bound: number; upper_bound: number }>; regressors: string[]; regressor_importance: Record<string, number>; type: string }>>(
        `/maps/layers/${metricKey}/forecast?hours_ahead=${hoursAhead}`
      ),
    forecastSensor: (metricKey: string, sensorId: string, hoursAhead = 24) =>
      fetchApi<{ sensor_id: string; forecast: Array<{ time: string; value: number; lower_bound: number; upper_bound: number }>; regressors: string[]; regressor_importance: Record<string, number>; type: string }>(
        `/maps/layers/${metricKey}/forecast?sensor_id=${sensorId}&hours_ahead=${hoursAhead}`
      ),
  },
  intelligence: {
    analyze: (data: { metric_keys: string[]; bbox: { north: number; south: number; east: number; west: number }; analysis_type: string }) =>
      fetchApi<IntelligenceSuggestion[]>("/intelligence/analyze", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    briefing: () =>
      fetchApi<{ paragraphs: string[]; generated_at: string }>("/intelligence/briefing"),
    suggestions: (analysisType: string, bbox: { north: number; south: number; east: number; west: number }) => {
      const params = new URLSearchParams({
        analysis_type: analysisType,
        north: bbox.north.toString(),
        south: bbox.south.toString(),
        east: bbox.east.toString(),
        west: bbox.west.toString(),
      });
      return fetchApi<IntelligenceSuggestion[]>(`/intelligence/suggestions?${params.toString()}`);
    },
  },
  metrics: {
    list: (activeOnly = false) =>
      fetchApi<Array<{ id: string; key: string; display_name: string; unit: string; category: string }>>(`/metrics${activeOnly ? "?active_only=true" : ""}`),
    create: (data: Record<string, unknown>, token: string) =>
      fetchApi("/metrics", { method: "POST", body: JSON.stringify(data), token }),
    update: (id: string, data: Record<string, unknown>, token: string) =>
      fetchApi(`/metrics/${id}`, { method: "PATCH", body: JSON.stringify(data), token }),
    delete: (id: string, token: string) =>
      fetchApi(`/metrics/${id}`, { method: "DELETE", token }),
  },
  analytics: {
    history: (sensorId: string, metricKey?: string, from?: string, to?: string, token?: string) => {
      const params = new URLSearchParams();
      if (metricKey) params.set("metric_key", metricKey);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return fetchApi<Array<{ time: string; metric_key: string; value_numeric?: number; value_text?: string; quality_flag?: string }>>(
        `/analytics/sensors/${sensorId}/history?${params.toString()}`,
        { token }
      );
    },
    export: (sensorId: string, metricKey: string, from?: string, to?: string, format: string = "json", token?: string) => {
      const params = new URLSearchParams({ sensor_id: sensorId, metric_key: metricKey, format });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return fetchApi<{ sensor_id: string; metric_key: string; data: unknown[]; format: string }>(
        `/analytics/export?${params.toString()}`,
        { token }
      );
    },
    exportCsv: (sensorId: string, metricKey: string, from?: string, to?: string, token?: string) => {
      const params = new URLSearchParams({ sensor_id: sensorId, metric_key: metricKey, format: "csv" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return fetchApi<{ sensor_id: string; metric_key: string; data: string[]; format: string }>(
        `/analytics/export?${params.toString()}`,
        { token }
      );
    },
    correlations: (days = 30) =>
      fetchApi<{ metrics: string[]; pairs: Array<{ metric_a: string; metric_b: string; correlation: number }> }>(
        `/analytics/correlations?days=${days}`
      ),
    cityHealth: () =>
      fetchApi<{
        aqi: { name: string; score: number; previous_score: number; trend: string; status: string; sparkline: (number | null)[] };
        heat_stress: { name: string; score: number; previous_score: number; trend: string; status: string; sparkline: (number | null)[] };
        livability: { name: string; score: number; previous_score: number; trend: string; status: string; sparkline: (number | null)[] };
        updated_at: string;
      }>("/city-health"),
    aggregate: (sensorId: string, metrics?: string[], from?: string, to?: string, token?: string) => {
      const params = new URLSearchParams({ sensor_id: sensorId });
      if (metrics?.length) params.set("metrics", metrics.join(","));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return fetchApi<Array<{ metric_key: string; sensor_id: string; avg?: number; min?: number; max?: number; count: number }>>(
        `/analytics/aggregate?${params.toString()}`,
        { token }
      );
    },
  },
  apiKeys: {
    list: (token: string) =>
      fetchApi<Array<{ id: string; name: string; description?: string | null; key_prefix: string; tier: string; rate_limit: number; is_active: boolean; created_at: string; last_used_at?: string | null; total_requests?: number }>>("/developer/keys", { token }),
    create: (name: string, token: string) =>
      fetchApi<{ id: string; name: string; description?: string | null; key: string; tier: string; rate_limit: number; created_at: string }>("/developer/keys", { method: "POST", body: JSON.stringify({ name }), token }),
    delete: (id: string, token: string) =>
      fetchApi(`/developer/keys/${id}`, { method: "DELETE", token }),
    usage: (id: string, token: string) =>
      fetchApi<{ requests_today: number; requests_this_week: number; by_endpoint: Record<string, number>; avg_response_time_ms: number | null; error_rate: number }>(`/developer/keys/${id}/usage`, { token }),
  },
  admin: {
    sensors: {
      list: (token: string) =>
        fetchApi<Array<{ id: string; name: string; type: string; latitude: number; longitude: number; status: string; installed_at: string }>>("/admin/sensors", { token }),
      create: (data: Record<string, unknown>, token: string) =>
        fetchApi<{ id: string; name: string; type: string; latitude: number; longitude: number; status: string; installed_at: string }>("/admin/sensors", { method: "POST", body: JSON.stringify(data), token }),
      update: (id: string, data: Record<string, unknown>, token: string) =>
        fetchApi<{ id: string; name: string; type: string; latitude: number; longitude: number; status: string; installed_at: string }>(`/admin/sensors/${id}`, { method: "PATCH", body: JSON.stringify(data), token }),
      delete: (id: string, token: string) =>
        fetchApi(`/admin/sensors/${id}`, { method: "DELETE", token }),
    },
    users: {
      list: (token: string) =>
        fetchApi<Array<{ id: string; email: string; full_name: string; role: string; plan: string; created_at: string }>>("/admin/users", { token }),
      create: (data: Record<string, unknown>, token: string) =>
        fetchApi("/admin/users", { method: "POST", body: JSON.stringify(data), token }),
      update: (id: string, data: Record<string, unknown>, token: string) =>
        fetchApi<{ id: string; email: string; full_name: string; role: string; plan: string; created_at: string }>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data), token }),
    },
    hubs: {
      list: (token: string) =>
        fetchApi<Array<{ id: string; name: string; latitude: number; longitude: number; status: string }>>("/admin/hubs", { token }),
      create: (data: Record<string, unknown>, token: string) =>
        fetchApi("/admin/hubs", { method: "POST", body: JSON.stringify(data), token }),
    },
  },
};

export function createWebSocket(channel: "sensors" | "alerts" | "reports"): WebSocket {
  return new WebSocket(`${WS_URL}/${channel}`);
}
