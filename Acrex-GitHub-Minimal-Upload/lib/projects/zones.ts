import type { ZoneType } from "@/lib/projects/types";

export const zoneTypes: ZoneType[] = ["Property", "Grass", "Brush", "Driveway", "Building", "Excluded", "Custom"];

export const zoneColors: Record<ZoneType, string> = {
  Property: "#7fd957",
  Grass: "#4fca5a",
  Brush: "#f28b38",
  Driveway: "#9aa4ad",
  Building: "#4f8cff",
  Excluded: "#ff5b57",
  Custom: "#a980ff"
};

export const zoneLabels: Record<ZoneType, string> = {
  Property: "Parcel",
  Grass: "Grass",
  Brush: "Brush / Trees",
  Driveway: "Driveway / Parking",
  Building: "Buildings",
  Excluded: "Excluded",
  Custom: "Custom"
};

export function getZoneColor(type: ZoneType) {
  return zoneColors[type] ?? zoneColors.Custom;
}
