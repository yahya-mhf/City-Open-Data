interface IDWSensor {
  lat: number;
  lon: number;
  value: number;
}

interface IDWMessage {
  type: "compute";
  sensors: IDWSensor[];
  bounds: { north: number; south: number; east: number; west: number };
  gridSize: number;
  minValue: number;
  maxValue: number;
  power: number;
  smoothing: number;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

self.onmessage = (e: MessageEvent<IDWMessage>) => {
  if (e.data.type !== "compute") return;

  const { sensors, bounds, gridSize, minValue, maxValue, power, smoothing } =
    e.data;
  const cols = gridSize;
  const rows = gridSize;
  const result = new Float32Array(cols * rows);
  let actualMin = Infinity;
  let actualMax = -Infinity;

  for (let row = 0; row < rows; row++) {
    const lat = bounds.north - (row / rows) * (bounds.north - bounds.south);
    for (let col = 0; col < cols; col++) {
      const lon = bounds.west + (col / cols) * (bounds.east - bounds.west);
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < sensors.length; i++) {
        const s = sensors[i];
        const dist = haversineKm(lat, lon, s.lat, s.lon) + smoothing;
        const weight = 1 / Math.pow(dist, power);
        numerator += s.value * weight;
        denominator += weight;
      }
      const value = denominator > 0 ? numerator / denominator : 0;
      result[row * cols + col] = value;
      if (value < actualMin) actualMin = value;
      if (value > actualMax) actualMax = value;
    }
  }

  self.postMessage(
    { type: "result", data: result.buffer, cols, rows, actualMin, actualMax },
  );
};
