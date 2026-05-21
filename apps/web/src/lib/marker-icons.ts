export const METRIC_ICONS: Record<string, string> = {
  temperature: "\uD83C\uDF21\uFE0F",
  pollution: "\uD83D\uDCA8",
  rainfall: "\uD83C\uDF27\uFE0F",
  seismic: "\uD83D\uDCE1",
  humidity: "\uD83D\uDCA7",
  co2: "\uD83C\uDFED",
  default: "\uD83D\uDCCD",
};

export function getMetricIcon(metricKey: string): string {
  const lower = metricKey.toLowerCase();
  if (lower.includes("temp")) return METRIC_ICONS.temperature;
  if (lower.includes("pm") || lower.includes("co2") || lower.includes("air") || lower.includes("pollution") || lower.includes("ozone") || lower.includes("no2") || lower.includes("so2") || lower.includes("co "))
    return METRIC_ICONS.pollution;
  if (lower.includes("rain") || lower.includes("water") || lower.includes("flood") || lower.includes("precip"))
    return METRIC_ICONS.rainfall;
  if (lower.includes("seismic") || lower.includes("earth") || lower.includes("richter"))
    return METRIC_ICONS.seismic;
  if (lower.includes("humid") || lower.includes("moisture"))
    return METRIC_ICONS.humidity;
  return METRIC_ICONS.default;
}

export function getSeverityColor(value: number, maxThreshold: number): string {
  const ratio = value / (maxThreshold || 1);
  if (ratio > 0.8) return "#ef4444"; // red
  if (ratio > 0.5) return "#f59e0b"; // amber
  return "#22c55e"; // green
}

export function createMarkerElement(icon: string, color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
    background: white; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    border: 2px solid ${color}; font-size: 18px; cursor: pointer;
    transition: transform 0.15s ease;
  `;
  el.textContent = icon;
  el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.15)"; });
  el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
  return el;
}
