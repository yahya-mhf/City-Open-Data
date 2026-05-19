"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function getLatestMetrics(latest: Record<string, unknown>): string {
  const metrics = latest?.metrics as Record<string, number> | undefined;
  if (!metrics) return "No data";
  return Object.entries(metrics)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

export default function MapView({ markers, onSensorClick }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [31.6295, -7.9811],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const markerLayer = L.layerGroup().addTo(map);

    markers.forEach((marker) => {
      const color = getStatusColor(marker.status);
      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="width: 24px; height: 24px; background: ${color}; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([marker.latitude, marker.longitude], { icon })
        .addTo(markerLayer)
        .on("click", () => onSensorClick?.(marker.id));
    });

    return () => {
      markerLayer.clearLayers();
    };
  }, [markers]);

  return <div ref={mapRef} className="h-full w-full" />;
}
