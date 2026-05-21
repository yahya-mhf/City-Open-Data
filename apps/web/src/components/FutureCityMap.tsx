"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { IntelligenceSuggestion } from "@/lib/api";
import AddressSearchBar from "./AddressSearchBar";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";

interface CategorySensor {
  sensor_id: string;
  name: string;
  lat: number;
  lon: number;
}

interface CategoryEntry {
  color: string;
  label: string;
  sensors: CategorySensor[];
}

interface FutureCityMapProps {
  categories: Record<string, CategoryEntry>;
  intelligenceSuggestions: IntelligenceSuggestion[];
  onMapReady?: (map: maplibregl.Map) => void;
}

export default function FutureCityMap({
  categories,
  intelligenceSuggestions,
  onMapReady,
}: FutureCityMapProps) {
  const { nightMode } = useTheme();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const legendContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
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
          "circle-radius": 5,
          "circle-color": "#6b7280",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
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

      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handleResize = () => {
      try { map.resize(); } catch {}
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setStyle(nightMode ? DARK_STYLE : LIGHT_STYLE);
  }, [nightMode]);

  useEffect(() => {
    if (mapInstanceRef.current && onMapReady) {
      onMapReady(mapInstanceRef.current);
    }
  }, [mapReady, onMapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    const features: GeoJSON.Feature[] = [];
    const allCoords: [number, number][] = [];

    Object.entries(categories).forEach(([, entry]) => {
      entry.sensors.forEach((s) => {
        allCoords.push([s.lon, s.lat]);
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          properties: {
            name: s.name,
            color: entry.color,
            label: entry.label,
          },
        });
      });
    });

    const source = map.getSource("sensors") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }

    map.setPaintProperty("sensor-dots", "circle-color", [
      "get",
      "color",
    ]);

    if (allCoords.length > 0) {
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
      );
      map.fitBounds(bounds, { padding: 60 });
    }
  }, [categories, mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    const features: GeoJSON.Feature[] = [];
    const typeColors: Record<string, string> = {
      opportunity: "#3b82f6",
      risk: "#ef4444",
      recommendation: "#22c55e",
      alert: "#f97316",
    };

    (intelligenceSuggestions || []).forEach((s) => {
      const color = typeColors[s.type] || "#6b7280";
      const earthRadius = 6371000;
      const latRad = (s.lat * Math.PI) / 180;
      const dLat = (s.radius_meters / earthRadius) * (180 / Math.PI);
      const dLon =
        (s.radius_meters / earthRadius) *
        (180 / Math.PI) *
        (1 / Math.cos(latRad));
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
        properties: {
          color,
          opacity: s.confidence * 0.4,
          title: s.title,
          severity: s.severity,
          description: s.description,
        },
      });
    });

    const source = map.getSource("intel-circles") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }
  }, [intelligenceSuggestions, mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    if (legendContainerRef.current) {
      legendContainerRef.current.remove();
      legendContainerRef.current = null;
    }

    const entries = Object.entries(categories);
    if (entries.length === 0) return;

    const container = document.createElement("div");
    container.style.cssText = `
      background: rgba(30,30,30,0.85); color: #e5e7eb; padding: 10px 14px;
      border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif; min-width: 140px;
      border: 1px solid rgba(255,255,255,0.1);
      position: absolute; bottom: 30px; left: 10px; z-index: 10;
    `;

    let html =
      '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#f9fafb">Categories</div>';
    entries.forEach(([, entry]) => {
      html += `
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <div style="width:10px;height:10px;border-radius:50%;background:${entry.color};flex-shrink:0"></div>
          <span style="font-size:11px;color:#d1d5db;text-transform:capitalize">${entry.label}</span>
        </div>
      `;
    });

    container.innerHTML = html;
    map.getContainer().appendChild(container);
    legendContainerRef.current = container;

    return () => {
      if (container.parentNode) container.parentNode.removeChild(container);
      legendContainerRef.current = null;
    };
  }, [categories, mapReady]);

  return (
    <div className="relative h-full w-full">
      <AddressSearchBar
        onSelect={(lon, lat) => {
          const map = mapInstanceRef.current;
          if (map) {
            map.flyTo({ center: [lon, lat], zoom: 15, duration: 1200 });
            const el = document.createElement("div");
            el.textContent = "\uD83D\uDCCD";
            el.style.cssText = "font-size:24px;text-shadow:0 2px 4px rgba(0,0,0,0.3)";
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([lon, lat])
              .addTo(map);
            setTimeout(() => marker.remove(), 5000);
          }
        }}
      />
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}
