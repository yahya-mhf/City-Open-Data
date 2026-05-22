import type { Map, StyleSpecification } from "maplibre-gl";

export const LIGHT_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    "dark-tiles": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    },
  },
  layers: [
    { id: "osm-tiles-layer", type: "raster", source: "osm-tiles", layout: { visibility: "visible" } },
    {
      id: "dark-tiles-layer",
      type: "raster",
      source: "dark-tiles",
      layout: { visibility: "none" },
    },
  ],
};

export const DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "dark-tiles": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    },
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: "osm-tiles-layer",
      type: "raster",
      source: "osm-tiles",
      layout: { visibility: "none" },
    },
    { id: "dark-tiles-layer", type: "raster", source: "dark-tiles", layout: { visibility: "visible" } },
  ],
};

export function applyMapTheme(map: Map, nightMode: boolean): void {
  if (!map.getLayer("osm-tiles-layer") || !map.getLayer("dark-tiles-layer")) {
    return;
  }
  map.setLayoutProperty("osm-tiles-layer", "visibility", nightMode ? "none" : "visible");
  map.setLayoutProperty("dark-tiles-layer", "visibility", nightMode ? "visible" : "none");
}
