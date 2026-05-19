"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import SensorDrawer from "@/components/SensorDrawer";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

function MapPageContent() {
  const { user } = useAuth();
  const [markers, setMarkers] = useState<Array<{ id: string; name: string; latitude: number; longitude: number; status: string; latest: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);

  useEffect(() => {
    api.map.markers().then(setMarkers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSensorClick = useCallback((sensorId: string) => {
    setSelectedSensorId(sensorId);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-700">Sensor Map</h1>
          <nav className="flex gap-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</Link>
            <Link href="/" className="text-gray-600 hover:text-primary-600">Home</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">Loading map...</div>
        ) : (
          <div className="h-[calc(100vh-8rem)] rounded-xl overflow-hidden shadow-lg relative z-0">
            <MapView markers={markers} onSensorClick={handleSensorClick} />
          </div>
        )}
      </main>

      {selectedSensorId && (
        <SensorDrawer
          sensorId={selectedSensorId}
          onClose={() => setSelectedSensorId(null)}
        />
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <AuthProvider>
      <MapPageContent />
    </AuthProvider>
  );
}
