import type { QuoteRateType, QuoteService, ShapeGeometryType, ZoneType } from "@/lib/projects/types";

export type ActiveServiceType = {
  id: string;
  label: string;
  shortLabel: string;
  zoneType: ZoneType;
  geometry: ShapeGeometryType;
  color: string;
  unit: "acre" | "sq ft" | "linear ft" | "each";
  quoteCategory: QuoteService;
  defaultRateType: QuoteRateType;
  description: string;
};

export const serviceTypes: ActiveServiceType[] = [
  {
    id: "property-boundary",
    label: "Property Boundary",
    shortLabel: "Property",
    zoneType: "Property",
    geometry: "polygon",
    color: "#7fd957",
    unit: "acre",
    quoteCategory: "Land Clearing",
    defaultRateType: "per_acre",
    description: "Parcel or total property boundary."
  },
  {
    id: "grass-mowing",
    label: "Grass / Mowing",
    shortLabel: "Grass",
    zoneType: "Grass",
    geometry: "polygon",
    color: "#4fca5a",
    unit: "acre",
    quoteCategory: "Mowing",
    defaultRateType: "per_acre",
    description: "Mowing, finish work, and open grass areas."
  },
  {
    id: "brush-clearing",
    label: "Brush Clearing",
    shortLabel: "Brush",
    zoneType: "Brush",
    geometry: "polygon",
    color: "#f97316",
    unit: "acre",
    quoteCategory: "Forestry Mulching / Brush Clearing",
    defaultRateType: "per_acre",
    description: "Brush, undergrowth, and small-tree clearing."
  },
  {
    id: "woods-timber",
    label: "Woods / Timber",
    shortLabel: "Woods",
    zoneType: "Woods",
    geometry: "polygon",
    color: "#1f7a3d",
    unit: "acre",
    quoteCategory: "Land Clearing",
    defaultRateType: "per_acre",
    description: "Wooded or heavier timber work areas."
  },
  {
    id: "fence-line",
    label: "Fence",
    shortLabel: "Fence",
    zoneType: "Fence",
    geometry: "line",
    color: "#8b5cf6",
    unit: "linear ft",
    quoteCategory: "Fence Installation",
    defaultRateType: "per_linear_ft",
    description: "Fence runs and other linear work."
  },
  {
    id: "driveway-gravel",
    label: "Driveway / Gravel",
    shortLabel: "Driveway",
    zoneType: "Driveway",
    geometry: "polygon",
    color: "#9aa4ad",
    unit: "sq ft",
    quoteCategory: "Gravel Driveway",
    defaultRateType: "per_sq_ft",
    description: "Driveway prep, gravel areas, and parking pads."
  },
  {
    id: "house-pad",
    label: "House Pad",
    shortLabel: "House Pad",
    zoneType: "HousePad",
    geometry: "polygon",
    color: "#b88352",
    unit: "sq ft",
    quoteCategory: "House Pad Prep",
    defaultRateType: "per_sq_ft",
    description: "House pads, building pads, and compacted areas."
  },
  {
    id: "exclusion",
    label: "Exclusion / Do Not Touch",
    shortLabel: "Exclusion",
    zoneType: "Excluded",
    geometry: "polygon",
    color: "#ef4444",
    unit: "acre",
    quoteCategory: "Custom",
    defaultRateType: "per_acre",
    description: "Areas excluded from billable work."
  },
  {
    id: "custom",
    label: "Custom",
    shortLabel: "Custom",
    zoneType: "Custom",
    geometry: "polygon",
    color: "#a980ff",
    unit: "each",
    quoteCategory: "Custom",
    defaultRateType: "each",
    description: "Custom area or scope item."
  }
];

export const defaultServiceType = serviceTypes[0];

export function getServiceTypeById(id: string | null | undefined) {
  return serviceTypes.find((serviceType) => serviceType.id === id) ?? defaultServiceType;
}

export function getServiceTypeByZoneType(zoneType: ZoneType | string | null | undefined) {
  return serviceTypes.find((serviceType) => serviceType.zoneType === zoneType) ?? serviceTypes.find((serviceType) => serviceType.zoneType === "Custom") ?? defaultServiceType;
}

export function getServiceTypeByQuoteCategory(category: string | null | undefined) {
  return serviceTypes.find((serviceType) => serviceType.quoteCategory === category) ?? null;
}
