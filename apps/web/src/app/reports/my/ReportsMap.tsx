"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { DARK_STYLE, LIGHT_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";

interface ReportLocation {
  id: string;
  category: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface ReportsMapProps {
  reports: ReportLocation[];
}

export default function ReportsMap({ reports }: ReportsMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { nightMode } = useTheme();

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: nightMode ? DARK_STYLE : LIGHT_STYLE,
      center: [-7.9811, 31.6295],
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [nightMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: reports.map((report) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [report.longitude, report.latitude] },
        properties: { id: report.id, category: report.category, status: report.status },
      })),
    };

    const addOrUpdate = () => {
      const source = map.getSource("my-reports") as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource("my-reports", { type: "geojson", data });
      map.addLayer({
        id: "my-reports-dots",
        type: "circle",
        source: "my-reports",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "status"],
            "resolved",
            "#16a34a",
            "in_progress",
            "#d97706",
            "rejected",
            "#dc2626",
            "#2563eb",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    };

    if (map.isStyleLoaded()) addOrUpdate();
    else map.once("load", addOrUpdate);
  }, [reports]);

  return <div ref={ref} className="h-full w-full" />;
}
