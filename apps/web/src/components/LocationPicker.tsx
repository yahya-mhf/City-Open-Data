"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LocationPickerProps {
  latitude: string;
  longitude: string;
  onLocationChange: (lat: string, lng: string) => void;
}

const MARKER_HTML = `<div style="width: 28px; height: 28px; background: #2563eb; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`;

export default function LocationPicker({ latitude, longitude, onLocationChange }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const setMarker = (lat: number, lng: number) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else if (mapInstanceRef.current) {
      const icon = L.divIcon({
        className: "custom-marker",
        html: MARKER_HTML,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(
        mapInstanceRef.current
      );
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        onLocationChange(pos.lat.toFixed(6), pos.lng.toFixed(6));
      });
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const hasCoords = !isNaN(lat) && !isNaN(lng);
    const center: [number, number] = hasCoords ? [lat, lng] : [31.6295, -7.9811];

    const map = L.map(mapRef.current, {
      center,
      zoom: hasCoords ? 15 : 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      setMarker(e.latlng.lat, e.latlng.lng);
      onLocationChange(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
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
        mapInstanceRef.current?.setView([lat, lng], 15);
      },
      () => {
        alert("Unable to retrieve your location. Please click on the map instead.");
      }
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
