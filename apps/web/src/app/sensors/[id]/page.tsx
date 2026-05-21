import type { Metadata } from "next";
import SensorView from "./sensor-view";

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function getSensor(id: string) {
  try {
    const res = await fetch(`${API_URL}/sensors/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json() as Promise<{ id: string; name: string; type: string; latitude: number; longitude: number; status: string; installed_at: string }>;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const sensor = await getSensor(id);
  const title = sensor ? `${sensor.name} | Urban Pulse` : "Sensor | Urban Pulse";
  const description = sensor
    ? `Live Urban Pulse data for ${sensor.name} (${sensor.type}). View real-time metrics, history charts, and location.`
    : "View Urban Pulse real-time sensor data, history charts, and report issues.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default function SensorPage({ params }: { params: Promise<{ id: string }> }) {
  return <SensorView params={params} />;
}
