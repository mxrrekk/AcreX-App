export const mapStyles = {
  satellite: {
    label: "Satellite",
    description: "Clean aerial imagery",
    url: "mapbox://styles/mapbox/satellite-v9"
  },
  "satellite-streets": {
    label: "Satellite Streets",
    description: "Aerial imagery with roads and labels",
    url: "mapbox://styles/mapbox/satellite-streets-v12"
  },
  outdoors: {
    label: "Outdoors",
    description: "Terrain, trails, and land detail",
    url: "mapbox://styles/mapbox/outdoors-v12"
  },
  light: {
    label: "Light",
    description: "Bright planning basemap",
    url: "mapbox://styles/mapbox/light-v11"
  },
  dark: {
    label: "Dark",
    description: "Low-glare planning basemap",
    url: "mapbox://styles/mapbox/dark-v11"
  }
} as const;

export type MapStyle = keyof typeof mapStyles;

export const mapStyleOptions = Object.entries(mapStyles).map(([id, style]) => ({
  id: id as MapStyle,
  label: style.label,
  description: style.description
}));
