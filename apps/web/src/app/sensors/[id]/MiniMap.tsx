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

    new maplibregl.Marker({
      element: (() => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:16px;height:16px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3)";
        return el;
      })(),
    })
      .setLngLat([longitude, latitude])
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  return <div ref={ref} className="h-full w-full" />;
}
