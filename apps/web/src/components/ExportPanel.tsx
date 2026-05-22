"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";

type Granularity = "raw" | "1min" | "1hour" | "1day";
type Format = "csv" | "json" | "parquet" | "geojson";

interface ExportConfig {
  sensorIds: string[];
  metricKeys: string[];
  start: string;
  end: string;
  format: Format;
  granularity: Granularity;
}

interface ExportHistoryItem {
  id: string;
  config: ExportConfig;
  rowCount: number;
  fileName: string;
  timestamp: string;
  status: "success" | "error";
  error?: string;
}

interface ExportPanelProps {
  token: string;
  userPlan?: string;
}

interface PreviewInfo {
  row_count: number;
  daily_limit: number;
  daily_used: number;
  daily_remaining: number;
}

const STORAGE_KEY = "sc_export_history";

function loadHistory(): ExportHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(items: ExportHistoryItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const defaultEnd = () => new Date().toISOString().slice(0, 16);
const defaultStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 16);
};

export function ExportPanel({ token, userPlan = "free" }: ExportPanelProps) {
  const { nightMode } = useTheme();
  const [sensors, setSensors] = useState<Array<{ id: string; name: string }>>([]);
  const [metrics, setMetrics] = useState<Array<{ key: string; display_name: string; unit: string }>>([]);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);

  const [config, setConfig] = useState<ExportConfig>({
    sensorIds: [],
    metricKeys: [],
    start: defaultStart(),
    end: defaultEnd(),
    format: "csv",
    granularity: "1hour",
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isPaid = userPlan === "pro" || userPlan === "enterprise";

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-night-primary border-gray-300 dark:border-night-border text-gray-900 dark:text-gray-100";

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.sensors.list(token),
      api.metrics.list(true),
    ])
      .then(([sensorRows, metricRows]) => {
        setSensors(sensorRows);
        setMetrics(metricRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load export filters"));
  }, [token]);

  const fetchPreview = useCallback(async () => {
    if (config.sensorIds.length === 0 || config.metricKeys.length === 0) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    const sid = config.sensorIds.length === sensors.length ? "all" : config.sensorIds.join(",");
    const mk = config.metricKeys.length === metrics.length ? "all" : config.metricKeys.join(",");
    const params = new URLSearchParams({
      sensor_ids: sid,
      metric_keys: mk,
      start: new Date(config.start).toISOString(),
      end: new Date(config.end).toISOString(),
      granularity: config.granularity,
    });
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    try {
      const res = await fetch(`${baseUrl}/export/preview?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPreview(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  }, [config, sensors.length, metrics.length, token]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchPreview, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [config.sensorIds, config.metricKeys, config.start, config.end, config.granularity]);

  const handleExport = useCallback(async () => {
    setError(null);
    setExporting(true);

    const sid = config.sensorIds.length === sensors.length ? "all" : config.sensorIds.join(",");
    const mk = config.metricKeys.length === metrics.length ? "all" : config.metricKeys.join(",");

    const params = new URLSearchParams({
      sensor_ids: sid,
      metric_keys: mk,
      start: new Date(config.start).toISOString(),
      end: new Date(config.end).toISOString(),
      format: config.format,
      granularity: config.granularity,
    });
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

    try {
      const res = await fetch(`${baseUrl}/export/sensors?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(body || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?(.+?)"?$/);
      const fileName = match?.[1] || `smartcity_export.${config.format}`;
      const rowCount = parseInt(res.headers.get("X-Row-Count") || "0", 10);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const entry: ExportHistoryItem = {
        id: crypto.randomUUID(),
        config: { ...config },
        rowCount,
        fileName,
        timestamp: new Date().toISOString(),
        status: "success",
      };
      const updated = [entry, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      const entry: ExportHistoryItem = {
        id: crypto.randomUUID(),
        config: { ...config },
        rowCount: 0,
        fileName: "",
        timestamp: new Date().toISOString(),
        status: "error",
        error: msg,
      };
      const updated = [entry, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
    } finally {
      setExporting(false);
    }
  }, [config, sensors.length, metrics.length, token, history]);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const formatDisabled = config.format === "parquet" && !isPaid;
  const granularityDisabled = (config.granularity === "raw" || config.granularity === "1min") && !isPaid;
  const canExport = config.sensorIds.length > 0 && config.metricKeys.length > 0 && config.start < config.end && !formatDisabled && !granularityDisabled;

  return (
    <div className="space-y-6">
      {/* Sensor selector */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sensors</legend>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-gray-300 dark:border-night-border rounded-lg p-3 bg-white dark:bg-night-primary">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={config.sensorIds.length === sensors.length}
              onChange={(e) => setConfig({ ...config, sensorIds: e.target.checked ? sensors.map((s) => s.id) : [] })}
            />
            Select All
          </label>
          {sensors.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={config.sensorIds.includes(s.id)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    sensorIds: e.target.checked
                      ? [...config.sensorIds, s.id]
                      : config.sensorIds.filter((id) => id !== s.id),
                  })
                }
              />
              {s.name}
            </label>
          ))}
          {sensors.length === 0 && <p className="text-gray-500 dark:text-gray-400 text-sm">No sensors available</p>}
        </div>
      </fieldset>

      {/* Metric selector */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Metrics</legend>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border border-gray-300 dark:border-night-border rounded-lg p-3 bg-white dark:bg-night-primary">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={config.metricKeys.length === metrics.length}
              onChange={(e) => setConfig({ ...config, metricKeys: e.target.checked ? metrics.map((m) => m.key) : [] })}
            />
            Select All
          </label>
          {metrics.map((m) => (
            <label key={m.key} className="flex items-center gap-1.5 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={config.metricKeys.includes(m.key)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    metricKeys: e.target.checked
                      ? [...config.metricKeys, m.key]
                      : config.metricKeys.filter((k) => k !== m.key),
                  })
                }
              />
              {m.display_name} ({m.unit})
            </label>
          ))}
          {metrics.length === 0 && <p className="text-gray-500 dark:text-gray-400 text-sm">No metrics available</p>}
        </div>
      </fieldset>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start</label>
          <input
            type="datetime-local"
            value={config.start}
            onChange={(e) => setConfig({ ...config, start: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End</label>
          <input
            type="datetime-local"
            value={config.end}
            onChange={(e) => setConfig({ ...config, end: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      {/* Format & Granularity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Format</label>
          <select
            value={config.format}
            onChange={(e) => setConfig({ ...config, format: e.target.value as Format })}
            className={inputCls}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="geojson">GeoJSON</option>
            <option value="parquet" disabled={!isPaid}>
              Parquet {!isPaid && "(Pro+)"}
            </option>
          </select>
          {formatDisabled && <p className="text-xs text-amber-600 mt-1">Parquet requires Pro or Enterprise plan</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Granularity</label>
          <select
            value={config.granularity}
            onChange={(e) => setConfig({ ...config, granularity: e.target.value as Granularity })}
            className={inputCls}
          >
            <option value="raw" disabled={!isPaid}>Raw {!isPaid && "(Pro+)"}</option>
            <option value="1min" disabled={!isPaid}>1 Minute {!isPaid && "(Pro+)"}</option>
            <option value="1hour">1 Hour</option>
            <option value="1day">1 Day</option>
          </select>
          {granularityDisabled && <p className="text-xs text-amber-600 mt-1">Raw/1min requires Pro or Enterprise plan</p>}
        </div>
      </div>

      {/* Record count preview */}
      <div className="bg-gray-50 dark:bg-night-border/30 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-300">Estimated records</span>
          <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
            {previewLoading ? (
              <span className="text-gray-400 animate-pulse">Counting...</span>
            ) : preview ? (
              preview.row_count.toLocaleString()
            ) : (
              <span className="text-gray-400">--</span>
            )}
          </span>
        </div>
        {preview && (
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-300 mt-1">
            <span>Daily usage</span>
            <span className={preview.daily_remaining < 100 ? "text-amber-500 font-medium" : ""}>
              {preview.daily_used.toLocaleString()} / {preview.daily_limit.toLocaleString()} rows
              {preview.daily_remaining > 0 && ` (${preview.daily_remaining.toLocaleString()} remaining)`}
            </span>
          </div>
        )}
      </div>

      {/* Export button */}
      {exporting && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700 dark:border-primary-900 dark:bg-primary-900/20 dark:text-primary-300">
          Preparing export. Large files may take a moment; the download will start automatically.
        </div>
      )}
      <button
        onClick={handleExport}
        disabled={!canExport || exporting}
        className="w-full bg-primary-600 text-white rounded-lg px-4 py-2.5 font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {exporting ? "Exporting..." : "Download Export"}
      </button>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {/* Export history */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Export History</h3>
            <button onClick={clearHistory} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-300">
              Clear
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {history.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between text-xs px-3 py-2 rounded ${
                  item.status === "success"
                    ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                    : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"
                }`}
              >
                <span className="truncate flex-1">
                  {item.status === "success" ? `\u2713 ${item.fileName}` : `\u2717 ${item.error || "Export failed"}`}
                </span>
                <span className="ml-2 whitespace-nowrap">
                  {new Date(item.timestamp).toLocaleString()} — {item.rowCount} rows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
