"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";
import AddressSearchBar from "./AddressSearchBar";
import { getMetricIcon } from "@/lib/marker-icons";

interface MarkerData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  latest: Record<string, unknown>;
}

interface MapViewProps {
  markers: MarkerData[];
  onSensorClick?: (sensorId: string) => void;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "#22c55e";
    case "inactive":
      return "#ef4444";
    case "maintenance":
      return "#f59e0b";
    default:
      return "#6b7280";
  }
}

export default function MapView({ markers, onSensorClick }: MapViewProps) {
  const { nightMode } = useTheme();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pendingRef = useRef<MarkerData[]>([]);
  const loadedRef = useRef(false);
  const onClickRef = useRef(onSensorClick);
  onClickRef.current = onSensorClick;

  console.log("[MapView] props markers:", markers.length, markers.slice(0, 2));

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
      console.log("[MapView] map load event fired");
      loadedRef.current = true;
      if (pendingRef.current.length > 0) {
        addMarkers(map, pendingRef.current);
        pendingRef.current = [];
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      loadedRef.current = false;
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
    const map = mapInstanceRef.current;
    if (!map) {
      console.warn("[MapView] map not ready yet, storing markers");
      pendingRef.current = markers;
      return;
    }

    const parsed = markers.map((m) => ({
      ...m,
      latitude: parseFloat(String(m.latitude)),
      longitude: parseFloat(String(m.longitude)),
    }));

    console.log(
      "[MapView] parsed sample:",
      parsed.slice(0, 2).map((m) => ({ name: m.name, lat: m.latitude, lng: m.longitude })),
    );

    if (!loadedRef.current) {
      pendingRef.current = parsed;
      return;
    }

    addMarkers(map, parsed);
  }, [markers]);

  function addMarkers(map: maplibregl.Map, data: MarkerData[]) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    data.forEach((m) => {
      const lng = parseFloat(String(m.longitude));
      const lat = parseFloat(String(m.latitude));

      if (isNaN(lng) || isNaN(lat)) {
        console.warn(`[MapView] invalid coords for ${m.name}: lat=${m.latitude}, lng=${m.longitude}`);
        return;
      }

      console.log(`[MapView] marker ${m.name}: [${lng}, ${lat}]`);

      const metricKey = Object.keys(m.latest || {}).find((k) => k !== "status") || "";
      const icon = getMetricIcon(metricKey);
      const color = getStatusColor(m.status);
      const el = document.createElement("div");
      el.style.cssText = `
        width:36px;height:36px;display:flex;align-items:center;justify-content:center;
        background:white;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.2);
        border:2px solid ${color};font-size:18px;cursor:pointer;
        transition:transform 0.15s ease;
      `;
      el.textContent = icon;
      el.title = `${m.name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.15)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
      el.addEventListener("click", () => onClickRef.current?.(m.id));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    console.log(`[MapView] rendered ${data.length} markers`);
  }

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
