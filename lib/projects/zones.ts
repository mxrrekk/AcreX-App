import type { ZoneType } from "@/lib/projects/types";

export const zoneTypes: ZoneType[] = ["Property", "Grass", "Brush", "Woods", "Fence", "Driveway", "HousePad", "Building", "Excluded", "Custom"];

export const zoneColors: Record<ZoneType, string> = {
  Property: "#7fd957",
  Grass: "#4fca5a",
  Brush: "#f97316",
  Woods: "#1f7a3d",
  Fence: "#8b5cf6",
  Driveway: "#9aa4ad",
  HousePad: "#b88352",
  Building: "#b88352",
  Excluded: "#ef4444",
  Custom: "#a980ff"
};

export const zoneLabels: Record<ZoneType, string> = {
  Property: "Parcel",
  Grass: "Grass",
  Brush: "Brush Clearing",
  Woods: "Woods / Timber",
  Fence: "Fence",
  Driveway: "Driveway / Parking",
  HousePad: "House Pad",
  Building: "House Pad",
  Excluded: "Excluded",
  Custom: "Custom"
};

export function getZoneColor(type: ZoneType) {
  return zoneColors[type] ?? zoneColors.Custom;
}
