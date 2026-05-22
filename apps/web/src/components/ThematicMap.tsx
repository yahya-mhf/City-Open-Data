"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import { api, createWebSocket, IntelligenceSuggestion } from "@/lib/api";
import AddressSearchBar from "./AddressSearchBar";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";
import { setChatContext } from "@/lib/chatbot-context";

interface LayerMarker {
  sensor_id: string;
  sensor_name: string;
  lat: number;
  lon: number;
  value: number | null;
  unit: string;
  quality_flag: string | null;
  time: string | null;
}

interface MetricInfo {
  key: string;
  display_name: string;
  unit: string;
  min_value: number | null;
  max_value: number | null;
}

interface ThematicMapProps {
  metricKey: string;
  metricInfo: MetricInfo;
  markers: LayerMarker[];
  mode: "live" | "history" | "forecast";
  historyValues?: Map<string, number | null>;
  currentBucketTime?: string | null;
  forecastValues?: Map<string, number | null>;
  forecastTrends?: Map<string, "up" | "down" | "flat">;
  onMarkerClick?: (sensorId: string) => void;
  intelligenceSuggestions?: IntelligenceSuggestion[];
  intelligenceVisible?: boolean;
  onMapReady?: (map: maplibregl.Map) => void;
}

interface IDWSensor {
  lat: number;
  lon: number;
  value: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerpColor(
  color1: string,
  color2: string,
  t: number,
): string {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function getColorScheme(
  metricKey: string,
  displayName: string,
): [string, string] {
  const lower = `${metricKey} ${displayName}`.toLowerCase();
  if (lower.includes("temp") || lower.includes("weather")) {
    return ["#3b82f6", "#ef4444"];
  }
  if (
    lower.includes("air") ||
    lower.includes("ozone") ||
    lower.includes("no2") ||
    lower.includes("so2") ||
    lower.includes("co") ||
    lower.includes("pollution")
  ) {
    return ["#22c55e", "#ef4444"];
  }
  if (lower.includes("uv")) {
    return ["#8b5cf6", "#f59e0b"];
  }
  if (lower.includes("traffic") || lower.includes("density")) {
    return ["#22c55e", "#ef4444"];
  }
  if (lower.includes("energy") || lower.includes("grid") || lower.includes("load")) {
    return ["#f59e0b", "#ef4444"];
  }
  if (lower.includes("dust")) {
    return ["#d97706", "#dc2626"];
  }
  return ["#6366f1", "#f97316"];
}

function getColor(
  value: number,
  min: number,
  max: number,
  scheme: [string, string],
): string {
  if (max === min) return scheme[1];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return lerpColor(scheme[0], scheme[1], t);
}

const gradients: Record<string, Record<string, string>> = {
  temperature: {
    0.0: "#313695", 0.25: "#74add1", 0.5: "#ffffbf", 0.75: "#f46d43", 1.0: "#a50026",
  },
  pollution: {
    0.0: "#1a9850", 0.4: "#ffffbf", 0.7: "#f46d43", 1.0: "#67000d",
  },
  humidity: {
    0.0: "#fff7fb", 0.5: "#74a9cf", 1.0: "#023858",
  },
  uv: {
    0.0: "#ffffcc", 0.3: "#c2e699", 0.6: "#78c679", 0.8: "#238443", 1.0: "#543005",
  },
  traffic: {
    0.0: "#1a9850", 0.4: "#ffffbf", 0.7: "#f46d43", 1.0: "#67000d",
  },
  energy: {
    0.0: "#ffffcc", 0.3: "#ffeda0", 0.6: "#feb24c", 0.8: "#f03b20", 1.0: "#bd0026",
  },
  dust: {
    0.0: "#ffffcc", 0.3: "#fdd49e", 0.6: "#fdbb84", 0.8: "#e34a33", 1.0: "#7f0000",
  },
  default: {
    0.0: "#313695", 0.5: "#ffffbf", 1.0: "#a50026",
  },
};

function getGradient(
  metricKey: string,
  displayName: string,
): Record<string, string> {
  const lower = `${metricKey} ${displayName}`.toLowerCase();
  if (lower.includes("temp")) return gradients.temperature;
  if (
    lower.includes("ozone") ||
    lower.includes("no2") ||
    lower.includes("so2") ||
    lower.includes("co") ||
    lower.includes("air") ||
    lower.includes("pollution")
  )
    return gradients.pollution;
  if (lower.includes("humidity") || lower.includes("moisture"))
    return gradients.humidity;
  if (lower.includes("uv")) return gradients.uv;
  if (lower.includes("traffic") || lower.includes("density"))
    return gradients.traffic;
  if (lower.includes("energy") || lower.includes("grid") || lower.includes("load"))
    return gradients.energy;
  if (lower.includes("dust")) return gradients.dust;
  return gradients.default;
}

function formatTime(iso: string | null): string {
  if (!iso) return "N/A";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function buildPopupHTML(
  name: string,
  value: number | null,
  unit: string,
  quality: string | null,
  time: string | null,
  color: string,
  trendHtml: string,
): string {
  const displayValue = value != null ? value : "N/A";
  return `
    <div style="min-width:160px">
      <b style="font-size:14px">${name}</b><br/>
      <span style="font-size:18px;font-weight:700;color:${color}">${displayValue}</span>
      <span style="color:#6b7280;font-size:12px"> ${unit}</span><br/>
      <span style="font-size:11px;color:#6b7280">
        Quality: ${quality ?? "N/A"}<br/>
        Updated: ${formatTime(time)}
      </span>
      ${trendHtml ? `<br/>${trendHtml}` : ""}
    </div>
  `;
}

const trendLabel: Record<string, string> = {
  up: '<span style="color:#22c55e;font-weight:700">\u2191 Rising</span>',
  down: '<span style="color:#ef4444;font-weight:700">\u2193 Falling</span>',
  flat: '<span style="color:#9ca3af;font-weight:600">\u2015 Stable</span>',
};

function interpolateGradient(
  t: number,
  gradient: Record<string, string>,
): [number, number, number] {
  const stops = Object.entries(gradient)
    .map(([pos, hex]) => {
      const [r, g, b] = hexToRgb(hex);
      return [parseFloat(pos), r, g, b] as [number, number, number, number];
    })
    .sort((a, b) => a[0] - b[0]);

  if (t <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
  if (t >= stops[stops.length - 1][0])
    return [
      stops[stops.length - 1][1],
      stops[stops.length - 1][2],
      stops[stops.length - 1][3],
    ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f =
        stops[i + 1][0] !== stops[i][0]
          ? (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
          : 0;
      return [
        Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f),
        Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * f),
        Math.round(stops[i][3] + (stops[i + 1][3] - stops[i][3]) * f),
      ];
    }
  }
  return [stops[0][1], stops[0][2], stops[0][3]];
}

export default function ThematicMap({
  metricKey,
  metricInfo,
  markers,
  mode,
  historyValues,
  currentBucketTime,
  forecastValues,
  forecastTrends,
  onMarkerClick,
  intelligenceSuggestions,
  intelligenceVisible,
  onMapReady,
}: ThematicMapProps) {
  const { nightMode } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const sensorValuesRef = useRef<
    Map<string, { lat: number; lon: number; value: number }>
  >(new Map());
  const sensorInfoRef = useRef<
    Map<string, { name: string; quality: string | null }>
  >(new Map());
  const pulseRef = useRef({ phase: 0 });
  const animRef = useRef<number | null>(null);
  const initialFitRef = useRef(false);
  const markersVisibleRef = useRef(true);
  const gridSizeRef = useRef(128);
  const powerRef = useRef(2);
  const smoothingRef = useRef(1);
  const legendElRef = useRef<HTMLDivElement | null>(null);
  const timeLabelElRef = useRef<HTMLDivElement | null>(null);
  const controlsElRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [actualRange, setActualRange] = useState({ min: 0, max: 100 });

  useEffect(() => {
    const worker = new Worker(
      new URL("@/workers/idw.worker.ts", import.meta.url),
    );
    workerRef.current = worker;
    return () => {
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: nightMode ? DARK_STYLE : LIGHT_STYLE,
      center: [-7.9811, 31.6295],
      zoom: 12,
      maxZoom: 19,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      map.addSource("sensors", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "sensor-dots",
        type: "circle",
        source: "sensors",
        paint: {
          "circle-radius": 4,
          "circle-color": "#9ca3af",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
          "circle-opacity": 1,
        },
      });

      map.addSource("idw-surface", {
        type: "image",
        url: "",
        coordinates: [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      });
      map.addLayer({
        id: "idw-layer",
        type: "raster",
        source: "idw-surface",
        paint: { "raster-opacity": nightMode ? 0.63 : 0.7 },
      });

      map.addSource("intel-circles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "intel-fills",
        type: "fill",
        source: "intel-circles",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["get", "opacity"],
        },
      });
      map.addLayer({
        id: "intel-outlines",
        type: "line",
        source: "intel-circles",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      map.on("click", "sensor-dots", (e) => {
        if (e.features?.[0]?.properties?.id) {
          onMarkerClick?.(e.features[0].properties.id);
        }
      });

      map.on("mouseenter", "sensor-dots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sensor-dots", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("moveend", () => {
        const b = map.getBounds();
        const visibleIds = markers.map((m) => m.sensor_id);
        setChatContext(
          {
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          },
          visibleIds,
        );
      });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handleResize = () => {
      try { map.resize(); } catch {}
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(nightMode ? DARK_STYLE : LIGHT_STYLE);
  }, [nightMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer("idw-layer")) {
        map.setPaintProperty("idw-layer", "raster-opacity", nightMode ? 0.63 : 0.7);
      }
    } catch {}
  }, [nightMode]);

  useEffect(() => {
    if (mapRef.current && onMapReady) {
      onMapReady(mapRef.current);
    }
  }, [mapReady, onMapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const animate = () => {
      pulseRef.current.phase = (pulseRef.current.phase + 0.03) % (2 * Math.PI);
      const pulseR = 7 + 5 * Math.abs(Math.sin(pulseRef.current.phase * 2));

      try {
        if (map.getLayer("sensor-dots")) {
          if (!map.getPaintProperty("sensor-dots", "circle-radius")) return;
          map.setPaintProperty("sensor-dots", "circle-radius", [
            "case",
            ["boolean", ["get", "alert"], false],
            pulseR,
            [
              "case",
              ["boolean", ["get", "warning"], false],
              5,
              4,
            ],
          ]);
        }
      } catch {}

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [mapReady]);

  const renderMarkers = useCallback(
    (
      values: Map<string, number | null>,
      trends?: Map<string, "up" | "down" | "flat">,
    ) => {
      const map = mapRef.current;
      const worker = workerRef.current;
      if (!map || !worker) return;

      const scheme = getColorScheme(metricKey, metricInfo.display_name);
      const gradient = getGradient(metricKey, metricInfo.display_name);
      const maxThreshold = metricInfo.max_value ?? 100;
      const threshold60 = maxThreshold * 0.6;
      const threshold80 = maxThreshold * 0.8;
      const idwSensors: IDWSensor[] = [];
      const sValues = new Map<
        string,
        { lat: number; lon: number; value: number }
      >();

      markers.forEach((m) => {
        if (m.lat == null || m.lon == null) return;
        const val = values.get(m.sensor_id);
        if (val != null && !isNaN(val)) {
          idwSensors.push({ lat: m.lat, lon: m.lon, value: val });
          sValues.set(m.sensor_id, {
            lat: m.lat,
            lon: m.lon,
            value: val,
          });
        }
        sensorInfoRef.current.set(m.sensor_id, {
          name: m.sensor_name,
          quality: m.quality_flag,
        });
      });

      let actualMin = 0;
      let actualMax = 100;
      if (idwSensors.length > 0) {
        actualMin = Math.min(...idwSensors.map((s) => s.value));
        actualMax = Math.max(...idwSensors.map((s) => s.value));
      }
      setActualRange({ min: actualMin, max: actualMax });

      const features: GeoJSON.Feature[] = markers
        .map((m) => {
          if (m.lat == null || m.lon == null) return null;
          const val = values.get(m.sensor_id);
          const hasVal = val != null;
          const color = hasVal
            ? getColor(val!, actualMin, actualMax, scheme)
            : "#9ca3af";
          const isAlert = hasVal && val! >= threshold80;
          const isWarning = hasVal && val! >= threshold60 && !isAlert;
          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [m.lon, m.lat],
            },
            properties: {
              id: m.sensor_id,
              name: m.sensor_name,
              value: hasVal ? val : null,
              unit: metricInfo.unit,
              quality: m.quality_flag,
              time: m.time,
              color,
              alert: isAlert,
              warning: isWarning,
              trend: trends?.get(m.sensor_id) || "",
            },
          } as GeoJSON.Feature;
        })
        .filter(Boolean) as GeoJSON.Feature[];

      try {
        (
          map.getSource("sensors") as maplibregl.GeoJSONSource
        )?.setData({
          type: "FeatureCollection",
          features,
        });
      } catch {}

      try {
        if (map.getLayer("sensor-dots")) {
          map.setPaintProperty("sensor-dots", "circle-color", [
            "get",
            "color",
          ]);
        }
      } catch {}

      sensorValuesRef.current = sValues;

      if (idwSensors.length > 0 && map.isStyleLoaded()) {
        const bounds = map.getBounds();
        const range = actualMax - actualMin || 1;
        worker.postMessage({
          type: "compute",
          sensors: idwSensors,
          bounds: {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          },
          gridSize: gridSizeRef.current,
          minValue: actualMin - range * 0.1,
          maxValue: actualMax + range * 0.1,
          power: powerRef.current,
          smoothing: smoothingRef.current,
        });
      }

      if (!initialFitRef.current && markers.length > 0) {
        initialFitRef.current = true;
        const coords = markers
          .filter((m) => m.lat != null && m.lon != null)
          .map((m) => [m.lon, m.lat] as [number, number]);
        if (coords.length > 0) {
          const b = coords.reduce(
            (bnd, c) => bnd.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(b, { padding: 60 });
        }
      }
    },
    [markers, metricKey, metricInfo, onMarkerClick, mode],
  );

  useEffect(() => {
    const worker = workerRef.current;
    const map = mapRef.current;
    if (!worker || !map) return;

    const handler = (e: MessageEvent) => {
      if (e.data.type !== "result") return;
      const { data, cols, rows } = e.data;
      const values = new Float32Array(data);
      const gradient = getGradient(metricKey, metricInfo.display_name);

      const canvas = document.createElement("canvas");
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.createImageData(cols, rows);
      const pixelData = imageData.data;

      const minV = metricInfo.min_value ?? e.data.actualMin;
      const maxV = metricInfo.max_value ?? e.data.actualMax;
      const range = maxV - minV || 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const v = values[row * cols + col];
          let t = (v - minV) / range;
          t = Math.max(0, Math.min(1, t));
          const [r, g, b] = interpolateGradient(t, gradient);
          const idx = (row * cols + col) * 4;
          pixelData[idx] = r;
          pixelData[idx + 1] = g;
          pixelData[idx + 2] = b;
          pixelData[idx + 3] = 200;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL();

      try {
        const bnds = map.getBounds();
        const coords: [[number, number], [number, number], [number, number], [number, number]] = [
          [bnds.getWest(), bnds.getSouth()],
          [bnds.getEast(), bnds.getSouth()],
          [bnds.getEast(), bnds.getNorth()],
          [bnds.getWest(), bnds.getNorth()],
        ];
        const source = map.getSource("idw-surface") as maplibregl.ImageSource;
        if (source) {
          source.updateImage({ url: dataUrl, coordinates: coords });
        }
      } catch {}
    };

    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, [metricKey, metricInfo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const initialValues = new Map<string, number | null>();
    markers.forEach((m) => initialValues.set(m.sensor_id, m.value));
    renderMarkers(initialValues);

    const b = map.getBounds();
    const visibleIds = markers.map((m) => m.sensor_id);
    setChatContext(
      {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      },
      visibleIds,
    );
  }, [markers, renderMarkers, mapReady]);

  useEffect(() => {
    if (mode !== "history" || !mapReady) return;
    renderMarkers(historyValues ?? new Map());
  }, [mode, historyValues, renderMarkers, mapReady]);

  useEffect(() => {
    if (
      mode !== "forecast" ||
      !mapReady ||
      !forecastValues ||
      forecastValues.size === 0
    )
      return;
    renderMarkers(forecastValues, forecastTrends);
  }, [mode, forecastValues, forecastTrends, renderMarkers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const features: GeoJSON.Feature[] = [];
    const typeColors: Record<string, string> = {
      opportunity: "#3b82f6",
      risk: "#ef4444",
      recommendation: "#22c55e",
      alert: "#f97316",
    };

    (intelligenceSuggestions || [])
      .filter(() => intelligenceVisible)
      .forEach((s) => {
        const color = typeColors[s.type] || "#6b7280";
        const earthR = 6371000;
        const latRad = (s.lat * Math.PI) / 180;
        const dLat = (s.radius_meters / earthR) * (180 / Math.PI);
        const dLon =
          (s.radius_meters / earthR) *
          (180 / Math.PI) /
          Math.cos(latRad);
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [s.lon - dLon, s.lat - dLat],
                [s.lon + dLon, s.lat - dLat],
                [s.lon + dLon, s.lat + dLat],
                [s.lon - dLon, s.lat + dLat],
                [s.lon - dLon, s.lat - dLat],
              ],
            ],
          },
          properties: { color, opacity: s.confidence * 0.4 },
        });
      });

    try {
      (
        map.getSource("intel-circles") as maplibregl.GeoJSONSource
      )?.setData({
        type: "FeatureCollection",
        features,
      });
    } catch {}
  }, [intelligenceSuggestions, intelligenceVisible, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (legendElRef.current) {
      legendElRef.current.remove();
      legendElRef.current = null;
    }

    const { min, max } = actualRange;
    const scheme = getColorScheme(metricKey, metricInfo.display_name);
    const el = document.createElement("div");
    el.style.cssText = `
      background: rgba(30,30,30,0.85); color: #e5e7eb; padding: 10px 14px;
      border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif; min-width: 140px;
      border: 1px solid rgba(255,255,255,0.1);
      position: absolute; bottom: 30px; left: 10px; z-index: 10;
      pointer-events: none;
    `;
    el.innerHTML = `
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;text-transform:capitalize;color:#f9fafb">
        ${metricInfo.display_name}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;color:#9ca3af">${min}</span>
        <div style="flex:1;height:10px;border-radius:4px;background:linear-gradient(to right, ${scheme[0]}, ${scheme[1]})"></div>
        <span style="font-size:10px;color:#9ca3af">${max}</span>
      </div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px">${metricInfo.unit}</div>
    `;
    map.getContainer().appendChild(el);
    legendElRef.current = el;

    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, [metricKey, metricInfo, mapReady, actualRange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (timeLabelElRef.current) {
      timeLabelElRef.current.remove();
      timeLabelElRef.current = null;
    }

    if (mode !== "history" || !currentBucketTime) return;

    const formatted = (() => {
      try {
        return new Date(currentBucketTime).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return currentBucketTime;
      }
    })();

    const el = document.createElement("div");
    el.style.cssText = `
      background: rgba(0,0,0,0.8); color: white; padding: 8px 16px;
      border-radius: 8px; font-family: system-ui, sans-serif;
      font-size: 14px; font-weight: 600; white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      position: absolute; top: 10px; right: 10px; z-index: 10;
      pointer-events: none;
    `;
    el.textContent = formatted;
    map.getContainer().appendChild(el);
    timeLabelElRef.current = el;

    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, [mode, currentBucketTime, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (controlsElRef.current) {
      controlsElRef.current.remove();
      controlsElRef.current = null;
    }

    const el = document.createElement("div");
    el.style.cssText = `
      background: rgba(30,30,30,0.9); color: #e5e7eb; padding: 12px;
      border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif; min-width: 170px;
      border: 1px solid rgba(255,255,255,0.1);
      position: absolute; bottom: 30px; right: 10px; z-index: 10;
    `;
    el.innerHTML = `
      <div style="font-size:11px;font-weight:600;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;color:#f9fafb">Interpolation</div>
      <div style="font-size:10px;margin-bottom:4px;color:#9ca3af">Grid:
        <select id="idw-gridsize" style="background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:2px 4px;font-size:10px;cursor:pointer;margin-left:4px">
          <option value="64">64\u00d764</option>
          <option value="128" selected>128\u00d7128</option>
          <option value="256">256\u00d7256</option>
        </select>
      </div>
      <label style="font-size:10px;display:block;margin-bottom:6px;color:#9ca3af">
        Falloff: <span id="idw-power-val">${powerRef.current}</span>
        <input type="range" min="1" max="4" step="0.5" value="${powerRef.current}"
               style="width:100%;margin-top:2px;cursor:pointer" id="idw-power" />
      </label>
      <label style="font-size:10px;display:block;margin-bottom:6px;color:#9ca3af">
        Smooth: <span id="idw-smoothing-val">${smoothingRef.current.toFixed(1)}</span>
        <input type="range" min="0.5" max="5" step="0.5" value="${smoothingRef.current}"
               style="width:100%;margin-top:2px;cursor:pointer" id="idw-smoothing" />
      </label>
      <label style="font-size:10px;display:flex;align-items:center;gap:4px;cursor:pointer;color:#9ca3af;margin-top:8px">
        <input type="checkbox" checked id="idw-toggle-markers" style="cursor:pointer" /> Show markers
      </label>
    `;

    const gridSelect = el.querySelector("#idw-gridsize") as HTMLSelectElement;
    const powerInput = el.querySelector("#idw-power") as HTMLInputElement;
    const smoothingInput = el.querySelector(
      "#idw-smoothing",
    ) as HTMLInputElement;
    const toggleInput = el.querySelector(
      "#idw-toggle-markers",
    ) as HTMLInputElement;

    const worker = workerRef.current;

    const triggerRecompute = () => {
      const map2 = mapRef.current;
      if (!map2 || !map2.isStyleLoaded() || sensorValuesRef.current.size === 0)
        return;
      const sensors = Array.from(sensorValuesRef.current.values());
      const bounds = map2.getBounds();
      worker?.postMessage({
        type: "compute",
        sensors,
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        gridSize: gridSizeRef.current,
        minValue: actualRange.min,
        maxValue: actualRange.max,
        power: powerRef.current,
        smoothing: smoothingRef.current,
      });
    };

    gridSelect.addEventListener("change", () => {
      gridSizeRef.current = parseInt(gridSelect.value);
      triggerRecompute();
    });

    powerInput.addEventListener("input", () => {
      const val = parseFloat(powerInput.value);
      const label = document.getElementById("idw-power-val");
      if (label) label.textContent = String(val);
      powerRef.current = val;
      triggerRecompute();
    });

    smoothingInput.addEventListener("input", () => {
      const val = parseFloat(smoothingInput.value);
      const label = document.getElementById("idw-smoothing-val");
      if (label) label.textContent = val.toFixed(1);
      smoothingRef.current = val;
      triggerRecompute();
    });

    toggleInput.addEventListener("change", () => {
      markersVisibleRef.current = toggleInput.checked;
      try {
        if (map.getLayer("sensor-dots")) {
          map.setLayoutProperty(
            "sensor-dots",
            "visibility",
            toggleInput.checked ? "visible" : "none",
          );
        }
      } catch {}
    });

    map.getContainer().appendChild(el);
    controlsElRef.current = el;

    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, [mapReady]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    if (mode === "forecast") {
      container.style.border = "2px dashed #9ca3af";
      container.style.borderRadius = "8px";
    } else {
      container.style.border = "";
      container.style.borderRadius = "";
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "live") return;

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
              const key: string = msg.data?.key || "";
              const sensorId = key
                .replace("sensor:", "")
                .replace(":latest", "");
              if (sensorValuesRef.current.has(sensorId)) {
                const map = mapRef.current;
                if (!map) return;
                api.sensors
                  .latest(sensorId)
                  .then((latest) => {
                    const value = latest.metrics?.[metricKey];
                    if (value == null) return;
                    const existing = sensorValuesRef.current.get(sensorId);
                    if (existing) {
                      sensorValuesRef.current.set(sensorId, {
                        lat: existing.lat,
                        lon: existing.lon,
                        value,
                      });
                      const all = Array.from(
                        sensorValuesRef.current.values(),
                      );
                      const worker = workerRef.current;
                      if (worker && all.length > 0) {
                        const bounds = map.getBounds();
                        worker.postMessage({
                          type: "compute",
                          sensors: all,
                          bounds: {
                            north: bounds.getNorth(),
                            south: bounds.getSouth(),
                            east: bounds.getEast(),
                            west: bounds.getWest(),
                          },
                          gridSize: gridSizeRef.current,
                          minValue: actualRange.min,
                          maxValue: actualRange.max,
                          power: powerRef.current,
                          smoothing: smoothingRef.current,
                        });
                      }
                    }
                  })
                  .catch(() => {});
              }
            }
          } catch {}
        };
        ws.onclose = () => {
          const delay = Math.min(backoffRef, 30000);
          backoffRef = Math.min(backoffRef * 2, 30000);
          reconnectTimer = setTimeout(connect, delay);
        };
      } catch {}
    };

    backoffRef = 1000;
    connect();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [mode, metricKey]);

  return (
    <div className="relative h-full w-full">
      <AddressSearchBar
        onSelect={(lon, lat) => {
          if (mapRef.current) {
            mapRef.current.flyTo({ center: [lon, lat], zoom: 15, duration: 1200 });
            const map = mapRef.current;
            const id = "search-pin";
            try { map.removeLayer(`${id}-dot`); } catch {}
            try { map.removeLayer(`${id}-label`); } catch {}
            try { map.removeSource(id); } catch {}
            map.addSource(id, {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { label: "\uD83D\uDCCD" } }],
              },
            });
            map.addLayer({ id: `${id}-dot`, type: "circle", source: id, paint: { "circle-radius": 16, "circle-color": "#2563eb", "circle-opacity": 0.9, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
            map.addLayer({ id: `${id}-label`, type: "symbol", source: id, layout: { "text-field": ["get", "label"], "text-size": 18, "text-allow-overlap": true }, paint: { "text-color": "#ffffff" } });
            setTimeout(() => {
              try { map.removeLayer(`${id}-dot`); } catch {}
              try { map.removeLayer(`${id}-label`); } catch {}
              try { map.removeSource(id); } catch {}
            }, 5000);
          }
        }}
      />
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
