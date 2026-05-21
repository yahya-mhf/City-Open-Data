"use client";

import maplibregl from "maplibre-gl";

export interface SensorPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  value?: string;
  metricKey?: string;
  timestamp?: string;
}

const UNIT_MAP: Record<string, string> = {
  temperature: "\u00B0C",
  humidity: "%",
  co2: "ppm",
  pressure: "hPa",
  rainfall: "mm/h",
  seismic: "R",
};

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function buildSensorGeoJSON(sensors: SensorPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sensors
      .filter((s) => !isNaN(s.longitude) && !isNaN(s.latitude))
      .map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
        properties: {
          id: s.id,
          name: s.name,
          status: s.status,
          value: s.value ?? "",
          metricKey: s.metricKey ?? "",
          timestamp: s.timestamp ?? "",
        },
      })),
  };
}

function statusColor(): maplibregl.DataDrivenPropertyValueSpecification<string> {
  return [
    "match",
    ["get", "status"],
    "active", "#22c55e",
    "inactive", "#ef4444",
    "maintenance", "#f59e0b",
    "warning", "#f59e0b",
    "critical", "#ef4444",
    "#6b7280",
  ] as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

export function addSensorLayers(
  map: maplibregl.Map,
  sourceId: string,
  beforeId?: string,
) {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    try { map.removeLayer(`${sourceId}-pulse`); } catch {}
    try { map.removeLayer(`${sourceId}-dot`); } catch {}
    try { map.removeLayer(`${sourceId}-label`); } catch {}
    try { map.removeSource(sourceId); } catch {}
  }

  map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  map.addLayer(
    {
      id: `${sourceId}-pulse`,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 22,
        "circle-color": statusColor(),
        "circle-opacity": 0.35,
        "circle-stroke-width": 0,
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: `${sourceId}-dot`,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 14,
        "circle-color": statusColor(),
        "circle-opacity": 1,
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: `${sourceId}-label`,
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": ["get", "value"],
        "text-size": 11,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.6)",
        "text-halo-width": 1.5,
      },
    },
    beforeId,
  );
}

export function updateSensorSource(
  map: maplibregl.Map,
  sourceId: string,
  sensors: SensorPoint[],
) {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(buildSensorGeoJSON(sensors));
  }
}

export function removeSensorLayers(map: maplibregl.Map, sourceId: string) {
  try { map.removeLayer(`${sourceId}-pulse`); } catch {}
  try { map.removeLayer(`${sourceId}-dot`); } catch {}
  try { map.removeLayer(`${sourceId}-label`); } catch {}
  try { map.removeSource(sourceId); } catch {}
}

export function setupSensorInteraction(
  map: maplibregl.Map,
  sourceId: string,
  onClick: (id: string, lng: number, lat: number) => void,
) {
  const dotLayer = `${sourceId}-dot`;
  let popup: maplibregl.Popup | null = null;

  function buildPopupHTML(props: Record<string, unknown>): string {
    const name = String(props.name ?? "Unknown");
    const value = String(props.value ?? "");
    const metricKey = String(props.metricKey ?? "");
    const timestamp = String(props.timestamp ?? "");
    const status = String(props.status ?? "unknown");
    const unit = UNIT_MAP[metricKey] ?? "";

    const statusLabel =
      status === "active" ? "Active" :
      status === "warning" ? "Warning" :
      status === "critical" ? "Critical" :
      status === "inactive" ? "Inactive" :
      status === "maintenance" ? "Maintenance" : status;

    const statusColor =
      status === "active" ? "#22c55e" :
      status === "warning" || status === "maintenance" ? "#f59e0b" :
      status === "critical" || status === "inactive" ? "#ef4444" :
      "#6b7280";

    const timeStr = timestamp ? `${formatDate(timestamp)} ${formatTime(timestamp)}` : "";
    const isDark = document.documentElement.classList.contains("dark");

    const bg = isDark ? "#1f2937" : "#ffffff";
    const text = isDark ? "#f3f4f6" : "#111827";
    const muted = isDark ? "#9ca3af" : "#6b7280";
    const border = isDark ? "#374151" : "#e5e7eb";

    return `
      <div style="font-family:system-ui,sans-serif;padding:10px 12px;min-width:180px;background:${bg};color:${text};border-radius:8px;">
        <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${name}</div>
        <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:6px;">
          <span style="font-size:20px;font-weight:700;">${value}</span>
          <span style="font-size:13px;color:${muted};">${unit}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};"></span>
          <span style="font-size:12px;color:${muted};">${statusLabel}</span>
        </div>
        ${timeStr ? `<div style="font-size:11px;color:${muted};border-top:1px solid ${border};padding-top:4px;margin-top:2px;">Last updated ${timeStr}</div>` : ""}
      </div>
    `;
  }

  map.on("mouseenter", dotLayer, (e) => {
    map.getCanvas().style.cursor = "pointer";
    const feature = e.features?.[0];
    if (!feature || !feature.properties) return;
    if (popup) popup.remove();
    const coords = (feature.geometry as GeoJSON.Point).coordinates;
    popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: [0, -18],
      className: "sensor-popup",
    })
      .setLngLat([coords[0], coords[1]])
      .setHTML(buildPopupHTML(feature.properties))
      .addTo(map);
  });

  map.on("mouseleave", dotLayer, () => {
    map.getCanvas().style.cursor = "";
    if (popup) {
      popup.remove();
      popup = null;
    }
  });

  map.on("click", dotLayer, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const id = feature.properties?.id;
    const coords = (feature.geometry as GeoJSON.Point).coordinates;
    if (id) onClick(id, coords[0], coords[1]);
  });
}

let pulseAnimId: number | null = null;

export function startPulseAnimation(map: maplibregl.Map, layerId: string) {
  stopPulseAnimation();
  let start = performance.now();

  function animate(now: number) {
    const elapsed = now - start;
    const t = (elapsed % 2000) / 2000;
    const phase = Math.sin(t * Math.PI * 2);
    const radius = 18 + phase * 8;
    const opacity = Math.max(0, 0.2 + phase * 0.3);

    try {
      map.setPaintProperty(layerId, "circle-radius", radius);
      map.setPaintProperty(layerId, "circle-opacity", opacity);
    } catch {}
    pulseAnimId = requestAnimationFrame(animate);
  }

  pulseAnimId = requestAnimationFrame(animate);
}

export function stopPulseAnimation() {
  if (pulseAnimId !== null) {
    cancelAnimationFrame(pulseAnimId);
    pulseAnimId = null;
  }
}
