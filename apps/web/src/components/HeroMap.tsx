"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LIGHT_STYLE, DARK_STYLE } from "@/lib/map-styles";
import { useTheme } from "@/lib/theme-context";

interface HeroMapMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface HeroMapProps {
  markers: HeroMapMarker[];
}

function markerColor(status: string): string {
  if (status === "critical" || status === "offline") return "#dc2626";
  if (status === "warning" || status === "maintenance") return "#d97706";
  return "#16a34a";
}

function buildMarkerCollection(markers: HeroMapMarker[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [marker.longitude, marker.latitude],
      },
      properties: {
        id: marker.id,
        name: marker.name,
        status: marker.status,
        color: markerColor(marker.status),
      },
    })),
  };
}

export default function HeroMap({ markers }: HeroMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<HeroMapMarker[]>(markers);
  const { nightMode } = useTheme();

  useEffect(() => {
    markersRef.current = markers;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("hero-sensors") as maplibregl.GeoJSONSource | undefined;
    source?.setData(buildMarkerCollection(markers));
  }, [markers]);

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

    const addSensorLayer = () => {
      if (!map.getSource("hero-sensors")) {
        map.addSource("hero-sensors", {
          type: "geojson",
          data: buildMarkerCollection(markersRef.current),
        });
      }

      if (!map.getLayer("hero-sensor-halo")) {
        map.addLayer({
          id: "hero-sensor-halo",
          type: "circle",
          source: "hero-sensors",
          paint: {
            "circle-radius": 14,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.18,
            "circle-blur": 0.6,
          },
        });
      }

      if (!map.getLayer("hero-sensor-dots")) {
        map.addLayer({
          id: "hero-sensor-dots",
          type: "circle",
          source: "hero-sensors",
          paint: {
            "circle-radius": 5,
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.95,
          },
        });
      }
    };

    map.on("load", addSensorLayer);

    let angle = 0;
    const timer = setInterval(() => {
      angle += 0.15;
      const lng = -7.9811 + Math.sin(angle * 0.005) * 0.12;
      const lat = 31.6295 + Math.cos(angle * 0.005) * 0.06;
      map.easeTo({ center: [lng, lat], duration: 8000, zoom: 12 });
    }, 9000);

    return () => {
      clearInterval(timer);
      map.off("load", addSensorLayer);
      map.remove();
      mapRef.current = null;
    };
  }, [nightMode]);

  return <div ref={ref} className="absolute inset-0 w-full h-full" />;
}
