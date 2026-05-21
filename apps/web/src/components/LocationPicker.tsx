"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LIGHT_STYLE } from "@/lib/map-styles";

interface LocationPickerProps {
  latitude: string;
  longitude: string;
  onLocationChange: (lat: string, lng: string) => void;
}

const MARKER_HTML = `<div style="width:28px;height:28px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;

export default function LocationPicker({
  latitude,
  longitude,
  onLocationChange,
}: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const setMarker = (lat: number, lng: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement("div");
      el.innerHTML = MARKER_HTML;
      el.style.cursor = "grab";

      const marker = new maplibregl.Marker({
        element: el.firstElementChild as HTMLElement,
        draggable: true,
      })
        .setLngLat([lng, lat])
        .addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLngLat();
        onLocationChange(pos.lat.toFixed(6), pos.lng.toFixed(6));
      });

      markerRef.current = marker;
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const hasCoords = !isNaN(lat) && !isNaN(lng);
    const center: [number, number] = hasCoords
      ? [lng, lat]
      : [-7.9811, 31.6295];

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: LIGHT_STYLE,
      center,
      zoom: hasCoords ? 15 : 12,
      maxZoom: 19,
    });

    map.on("click", (e) => {
      setMarker(e.lngLat.lat, e.lngLat.lng);
      onLocationChange(e.lngLat.lat.toFixed(6), e.lngLat.lng.toFixed(6));
    });

    mapInstanceRef.current = map;

    if (hasCoords) setMarker(lat, lng);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMarker(lat, lng);
        onLocationChange(lat.toFixed(6), lng.toFixed(6));
        mapInstanceRef.current?.flyTo({ center: [lng, lat], zoom: 15 });
      },
      () => {
        alert(
          "Unable to retrieve your location. Please click on the map instead.",
        );
      },
    );
  };

  return (
    <div>
      <div
        ref={mapRef}
        className="h-64 w-full rounded-lg border border-gray-300 mb-2"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={getCurrentLocation}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Use my current location
        </button>
        <span className="text-xs text-gray-500">
          {latitude && longitude
            ? `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}`
            : "Click map to place pin"}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Click on the map to place a pin, or drag the pin to adjust.
      </p>
    </div>
  );
}
