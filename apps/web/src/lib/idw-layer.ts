export interface IDWSensor {
  lat: number;
  lon: number;
  value: number;
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

function parseGradientStops(
  gradient: Record<string, string>,
): Array<[number, number, number, number]> {
  return Object.entries(gradient)
    .map(([pos, hex]) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [parseFloat(pos), r, g, b] as [number, number, number, number];
    })
    .sort((a, b) => a[0] - b[0]);
}

function interpolateGradientFromStops(
  stops: Array<[number, number, number, number]>,
  t: number,
): [number, number, number] {
  if (t <= stops[0][0])
    return [stops[0][1], stops[0][2], stops[0][3]];
  if (t >= stops[stops.length - 1][0])
    return [
      stops[stops.length - 1][1],
      stops[stops.length - 1][2],
      stops[stops.length - 1][3],
    ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const frac =
        stops[i + 1][0] !== stops[i][0]
          ? (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
          : 0;
      return [
        Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * frac),
        Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * frac),
        Math.round(stops[i][3] + (stops[i + 1][3] - stops[i][3]) * frac),
      ];
    }
  }
  return [stops[0][1], stops[0][2], stops[0][3]];
}
