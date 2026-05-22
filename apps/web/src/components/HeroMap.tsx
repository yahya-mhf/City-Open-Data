"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";

export default function HeroMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { nightMode } = useTheme();

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: nightMode ? DARK_STYLE : LIGHT_STYLE,
      center: [-7.9811, 31.6295],
      zoom: 12,
      maxZoom: 17,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    let angle = 0;
    const timer = setInterval(() => {
      angle += 0.15;
      const lng = -7.9811 + Math.sin(angle * 0.005) * 0.12;
      const lat = 31.6295 + Math.cos(angle * 0.005) * 0.06;
      map.easeTo({ center: [lng, lat], duration: 8000, zoom: 12 });
    }, 9000);

    return () => {
      clearInterval(timer);
      map.remove();
      mapRef.current = null;
    };
  }, [nightMode]);

  return <div ref={ref} className="absolute inset-0 w-full h-full" />;
}
