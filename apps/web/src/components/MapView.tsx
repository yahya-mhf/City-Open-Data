"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";
import AddressSearchBar from "./AddressSearchBar";
import {
  addSensorLayers,
  updateSensorSource,
  removeSensorLayers,
  setupSensorInteraction,
  startPulseAnimation,
  stopPulseAnimation,
  type SensorPoint,
} from "@/lib/map-layers";

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

const SENSOR_SOURCE = "sensors";

function toSensorPoints(data: MarkerData[]): SensorPoint[] {
  return data.map((m) => {
    const latest = m.latest ?? {};
    const metrics = (latest.metrics as Record<string, unknown>) ?? {};
    const metricKeys = Object.keys(metrics);
    const metricKey = metricKeys[0] ?? "";
    const value = metricKey ? String(metrics[metricKey] ?? "") : "";
    const timestamp = latest.timestamp ? String(latest.timestamp) : "";
    return {
      id: m.id,
      name: m.name,
      latitude: parseFloat(String(m.latitude)),
      longitude: parseFloat(String(m.longitude)),
      status: m.status,
      value,
      metricKey,
      timestamp,
    };
  });
}

export default function MapView({ markers, onSensorClick }: MapViewProps) {
  const { nightMode } = useTheme();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const pendingRef = useRef<MarkerData[]>([]);
  const loadedRef = useRef(false);
  const onClickRef = useRef(onSensorClick);
  onClickRef.current = onSensorClick;

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
      loadedRef.current = true;
      addSensorLayers(map, SENSOR_SOURCE);
      setupSensorInteraction(map, SENSOR_SOURCE, (id) => onClickRef.current?.(id));
      startPulseAnimation(map, `${SENSOR_SOURCE}-pulse`);

      if (pendingRef.current.length > 0) {
        updateSensorSource(map, SENSOR_SOURCE, toSensorPoints(pendingRef.current));
        pendingRef.current = [];
      }
    });

    mapInstanceRef.current = map;

    return () => {
      stopPulseAnimation();
      removeSensorLayers(map, SENSOR_SOURCE);
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
    const onStyleLoad = () => {
      addSensorLayers(map, SENSOR_SOURCE);
      setupSensorInteraction(map, SENSOR_SOURCE, (id) => onClickRef.current?.(id));
      startPulseAnimation(map, `${SENSOR_SOURCE}-pulse`);
    };
    map.once("style.load", onStyleLoad);
    map.setStyle(nightMode ? DARK_STYLE : LIGHT_STYLE);
    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [nightMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      pendingRef.current = markers;
      return;
    }

    const parsed = markers.map((m) => ({
      ...m,
      latitude: parseFloat(String(m.latitude)),
      longitude: parseFloat(String(m.longitude)),
    }));

    if (!loadedRef.current) {
      pendingRef.current = parsed;
      return;
    }

    updateSensorSource(map, SENSOR_SOURCE, toSensorPoints(parsed));
  }, [markers]);

  return (
    <div className="relative h-full w-full">
      <AddressSearchBar
        onSelect={(lon, lat) => {
          const map = mapInstanceRef.current;
          if (!map) return;
          map.flyTo({ center: [lon, lat], zoom: 15, duration: 1200 });
          const srcId = "search-pin";
          try { map.removeLayer(`${srcId}-dot`); } catch {}
          try { map.removeLayer(`${srcId}-label`); } catch {}
          try { map.removeSource(srcId); } catch {}
          map.addSource(srcId, {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [lon, lat] },
                  properties: { value: "\uD83D\uDCCD" },
                },
              ],
            },
          });
          map.addLayer({
            id: `${srcId}-dot`,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": 16,
              "circle-color": "#2563eb",
              "circle-opacity": 0.9,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            },
          });
          map.addLayer({
            id: `${srcId}-label`,
            type: "symbol",
            source: srcId,
            layout: {
              "text-field": ["get", "value"],
              "text-size": 18,
              "text-allow-overlap": true,
            },
            paint: { "text-color": "#ffffff" },
          });
          setTimeout(() => {
            try { map.removeLayer(`${srcId}-dot`); } catch {}
            try { map.removeLayer(`${srcId}-label`); } catch {}
            try { map.removeSource(srcId); } catch {}
          }, 5000);
        }}
      />
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}
