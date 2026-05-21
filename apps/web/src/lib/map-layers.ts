"use client";

export interface SensorPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  value?: string;
}

export function buildSensorGeoJSON(sensors: SensorPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sensors
      .filter((s) => !isNaN(s.longitude) && !isNaN(s.latitude))
      .map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
        properties: {
          id: s.id,
          name: s.name,
          status: s.status,
          value: s.value ?? "",
        },
      })),
  };
}

function statusColor(): maplibregl.DataDrivenPropertyValueSpecification<string> {
  return [
    "match",
    ["get", "status"],
    "active", "#22c55e",
    "inactive", "#ef4444",
    "maintenance", "#f59e0b",
    "warning", "#f59e0b",
    "critical", "#ef4444",
    "#6b7280",
  ] as maplibregl.DataDrivenPropertyValueSpecification<string>;
}

export function addSensorLayers(
  map: maplibregl.Map,
  sourceId: string,
  beforeId?: string,
) {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    try { map.removeLayer(`${sourceId}-pulse`); } catch {}
    try { map.removeLayer(`${sourceId}-dot`); } catch {}
    try { map.removeLayer(`${sourceId}-label`); } catch {}
    try { map.removeSource(sourceId); } catch {}
  }

  map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  map.addLayer(
    {
      id: `${sourceId}-pulse`,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 22,
        "circle-color": statusColor(),
        "circle-opacity": 0.35,
        "circle-stroke-width": 0,
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: `${sourceId}-dot`,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 14,
        "circle-color": statusColor(),
        "circle-opacity": 1,
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: `${sourceId}-label`,
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": ["get", "value"],
        "text-size": 11,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.6)",
        "text-halo-width": 1.5,
      },
    },
    beforeId,
  );
}

export function updateSensorSource(
  map: maplibregl.Map,
  sourceId: string,
  sensors: SensorPoint[],
) {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(buildSensorGeoJSON(sensors));
  }
}

export function removeSensorLayers(map: maplibregl.Map, sourceId: string) {
  try { map.removeLayer(`${sourceId}-pulse`); } catch {}
  try { map.removeLayer(`${sourceId}-dot`); } catch {}
  try { map.removeLayer(`${sourceId}-label`); } catch {}
  try { map.removeSource(sourceId); } catch {}
}

export function setupSensorInteraction(
  map: maplibregl.Map,
  sourceId: string,
  onClick: (id: string) => void,
) {
  const dotLayer = `${sourceId}-dot`;

  map.on("click", dotLayer, (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (id) onClick(id);
  });

  map.on("mouseenter", dotLayer, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", dotLayer, () => {
    map.getCanvas().style.cursor = "";
  });
}

let pulseAnimId: number | null = null;

export function startPulseAnimation(map: maplibregl.Map, layerId: string) {
  stopPulseAnimation();
  let start = performance.now();

  function animate(now: number) {
    const elapsed = now - start;
    const t = (elapsed % 2000) / 2000;
    const phase = Math.sin(t * Math.PI * 2);
    const radius = 18 + phase * 8;
    const opacity = Math.max(0, 0.2 + phase * 0.3);

    try {
      map.setPaintProperty(layerId, "circle-radius", radius);
      map.setPaintProperty(layerId, "circle-opacity", opacity);
    } catch {}
    pulseAnimId = requestAnimationFrame(animate);
  }

  pulseAnimId = requestAnimationFrame(animate);
}

export function stopPulseAnimation() {
  if (pulseAnimId !== null) {
    cancelAnimationFrame(pulseAnimId);
    pulseAnimId = null;
  }
}
