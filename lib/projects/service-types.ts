import { serviceCatalog } from "@/lib/services/catalog";
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

export const serviceTypes: ActiveServiceType[] = serviceCatalog.map((service) => ({
  id:
    service.key === "property"
      ? "property-boundary"
      : service.key === "mowing"
        ? "grass-mowing"
        : service.key === "forestry_mulching"
          ? "brush-clearing"
          : service.key === "land_clearing"
            ? "woods-timber"
            : service.key === "fence_installation"
              ? "fence-line"
              : service.key === "gravel_driveway"
                ? "driveway-gravel"
                : service.key === "house_pad_prep"
                  ? "house-pad"
                  : service.key === "non_billable"
                    ? "exclusion"
                    : "custom",
  label: service.label,
  shortLabel: service.shortLabel,
  zoneType: service.zoneType,
  geometry: service.geometry,
  color: service.color,
  unit: service.unit,
  quoteCategory: service.quoteCategory,
  defaultRateType: service.defaultRateType,
  description: service.description
}));

export const defaultServiceType = serviceTypes[0];

export function getServiceTypeById(id: string | null | undefined) {
  return serviceTypes.find((serviceType) => serviceType.id === id) ?? defaultServiceType;
}

export function getServiceTypeByZoneType(zoneType: ZoneType | string | null | undefined) {
  return serviceTypes.find((serviceType) => serviceType.zoneType === zoneType) ??
    serviceTypes.find((serviceType) => serviceType.zoneType === "Custom") ??
    defaultServiceType;
}

export function getServiceTypeByQuoteCategory(category: string | null | undefined) {
  return serviceTypes.find((serviceType) => serviceType.quoteCategory === category) ?? null;
}
