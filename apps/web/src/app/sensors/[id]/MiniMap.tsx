"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LIGHT_STYLE } from "@/lib/map-styles";

interface MiniMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

export default function MiniMap({ latitude, longitude }: MiniMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: LIGHT_STYLE,
      center: [longitude, latitude],
      zoom: 15,
      maxZoom: 19,
      interactive: false,
    });

    map.on("load", () => {
      map.addSource("sensor-point", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [longitude, latitude] },
              properties: {},
            },
          ],
        },
      });

      map.addLayer({
        id: "sensor-dot",
        type: "circle",
        source: "sensor-point",
        paint: {
          "circle-radius": 14,
          "circle-color": "#2563eb",
          "circle-opacity": 1,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "sensor-pulse",
        type: "circle",
        source: "sensor-point",
        paint: {
          "circle-radius": 22,
          "circle-color": "#2563eb",
          "circle-opacity": 0.3,
          "circle-stroke-width": 0,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  return <div ref={ref} className="h-full w-full" />;
}
