import type { QuoteRateType, QuoteService, ShapeGeometryType, ZoneType } from "@/lib/projects/types";

export type ServiceCatalogKey =
  | "property"
  | "mowing"
  | "forestry_mulching"
  | "land_clearing"
  | "fence_installation"
  | "gravel_driveway"
  | "house_pad_prep"
  | "non_billable"
  | "custom";

export type BillableServiceCatalogKey = Exclude<ServiceCatalogKey, "property" | "non_billable" | "custom">;

export type ServiceCatalogEntry = {
  key: ServiceCatalogKey;
  serviceType: string;
  label: string;
  shortLabel: string;
  zoneType: ZoneType;
  geometry: ShapeGeometryType;
  color: string;
  quoteCategory: QuoteService;
  estimateService:
    | "Mowing"
    | "Brush Clearing / Forestry Mulching"
    | "Fence Installation"
    | "Gravel Driveway"
    | "House Pad"
    | "Land Clearing"
    | null;
  unit: "acre" | "sq ft" | "linear ft" | "each";
  displayUnit: "acres" | "sq ft" | "linear feet" | "each";
  pricingMethod: "per_acre" | "per_visit" | "per_sq_ft" | "per_linear_ft" | "each" | "non_billable";
  defaultRateType: QuoteRateType;
  pricingTemplateId: string | null;
  settingsRateField:
    | "mowingRate"
    | "brushClearingRate"
    | "landClearingRate"
    | "fenceRate"
    | "drivewayRate"
    | "housePadRate"
    | null;
  settingsMinimumField: "mowingMinimumCharge" | "minimumJobCharge" | null;
  billable: boolean;
  aliases: string[];
  description: string;
};

export const serviceCatalog: ServiceCatalogEntry[] = [
  {
    key: "property",
    serviceType: "property",
    label: "Property Boundary",
    shortLabel: "Property",
    zoneType: "Property",
    geometry: "polygon",
    color: "#7fd957",
    quoteCategory: "Non-billable",
    estimateService: null,
    unit: "acre",
    displayUnit: "acres",
    pricingMethod: "non_billable",
    defaultRateType: "per_acre",
    pricingTemplateId: null,
    settingsRateField: null,
    settingsMinimumField: null,
    billable: false,
    aliases: ["property", "property boundary", "parcel boundary"],
    description: "Parcel or total property boundary."
  },
  {
    key: "mowing",
    serviceType: "grass",
    label: "Grass / Mowing",
    shortLabel: "Grass",
    zoneType: "Grass",
    geometry: "polygon",
    color: "#4fca5a",
    quoteCategory: "Mowing",
    estimateService: "Mowing",
    unit: "acre",
    displayUnit: "acres",
    pricingMethod: "per_acre",
    defaultRateType: "per_acre",
    pricingTemplateId: "mowing",
    settingsRateField: "mowingRate",
    settingsMinimumField: "mowingMinimumCharge",
    billable: true,
    aliases: ["mowing", "mow", "grass", "lawn", "grass mowing"],
    description: "Mowing, finish work, and open grass areas."
  },
  {
    key: "forestry_mulching",
    serviceType: "brush",
    label: "Brush Clearing",
    shortLabel: "Brush",
    zoneType: "Brush",
    geometry: "polygon",
    color: "#f97316",
    quoteCategory: "Forestry Mulching / Brush Clearing",
    estimateService: "Brush Clearing / Forestry Mulching",
    unit: "acre",
    displayUnit: "acres",
    pricingMethod: "per_acre",
    defaultRateType: "per_acre",
    pricingTemplateId: "brush-clearing",
    settingsRateField: "brushClearingRate",
    settingsMinimumField: "minimumJobCharge",
    billable: true,
    aliases: ["brush", "brush clearing", "forestry mulching", "forestry mulch", "underbrush"],
    description: "Brush, undergrowth, and small-tree clearing."
  },
  {
    key: "land_clearing",
    serviceType: "woods",
    label: "Woods / Land Clearing",
    shortLabel: "Woods",
    zoneType: "Woods",
    geometry: "polygon",
    color: "#1f7a3d",
    quoteCategory: "Land Clearing",
    estimateService: "Land Clearing",
    unit: "acre",
    displayUnit: "acres",
    pricingMethod: "per_acre",
    defaultRateType: "per_acre",
    pricingTemplateId: "land-clearing",
    settingsRateField: "landClearingRate",
    settingsMinimumField: "minimumJobCharge",
    billable: true,
    aliases: ["woods", "timber", "land clearing", "lot clearing", "tree clearing"],
    description: "Wooded or heavier timber work areas."
  },
  {
    key: "fence_installation",
    serviceType: "fence",
    label: "Fence",
    shortLabel: "Fence",
    zoneType: "Fence",
    geometry: "line",
    color: "#8b5cf6",
    quoteCategory: "Fence Installation",
    estimateService: "Fence Installation",
    unit: "linear ft",
    displayUnit: "linear feet",
    pricingMethod: "per_linear_ft",
    defaultRateType: "per_linear_ft",
    pricingTemplateId: "fencing",
    settingsRateField: "fenceRate",
    settingsMinimumField: "minimumJobCharge",
    billable: true,
    aliases: ["fence", "fencing", "fence installation", "chain link", "vinyl fence", "aluminum fence"],
    description: "Fence runs and other linear work."
  },
  {
    key: "gravel_driveway",
    serviceType: "driveway",
    label: "Driveway",
    shortLabel: "Driveway",
    zoneType: "Driveway",
    geometry: "polygon",
    color: "#9aa4ad",
    quoteCategory: "Gravel Driveway",
    estimateService: "Gravel Driveway",
    unit: "sq ft",
    displayUnit: "sq ft",
    pricingMethod: "per_sq_ft",
    defaultRateType: "per_sq_ft",
    pricingTemplateId: "driveway-prep",
    settingsRateField: "drivewayRate",
    settingsMinimumField: "minimumJobCharge",
    billable: true,
    aliases: ["driveway", "gravel driveway", "driveway prep", "road base", "crusher run", "culvert"],
    description: "Driveway prep, gravel areas, and parking pads."
  },
  {
    key: "house_pad_prep",
    serviceType: "house_pad",
    label: "House Pad",
    shortLabel: "House Pad",
    zoneType: "HousePad",
    geometry: "polygon",
    color: "#b88352",
    quoteCategory: "House Pad Prep",
    estimateService: "House Pad",
    unit: "sq ft",
    displayUnit: "sq ft",
    pricingMethod: "per_sq_ft",
    defaultRateType: "per_sq_ft",
    pricingTemplateId: "house-pad",
    settingsRateField: "housePadRate",
    settingsMinimumField: "minimumJobCharge",
    billable: true,
    aliases: ["house pad", "house pad prep", "building pad", "site pad"],
    description: "House pads, building pads, and compacted areas."
  },
  {
    key: "non_billable",
    serviceType: "exclusion",
    label: "Exclusion / Do Not Touch",
    shortLabel: "Exclusion",
    zoneType: "Excluded",
    geometry: "polygon",
    color: "#ef4444",
    quoteCategory: "Non-billable",
    estimateService: null,
    unit: "acre",
    displayUnit: "acres",
    pricingMethod: "non_billable",
    defaultRateType: "per_acre",
    pricingTemplateId: null,
    settingsRateField: null,
    settingsMinimumField: null,
    billable: false,
    aliases: ["exclusion", "excluded", "do not touch", "non billable"],
    description: "Areas excluded from billable work."
  },
  {
    key: "custom",
    serviceType: "custom",
    label: "Custom",
    shortLabel: "Custom",
    zoneType: "Custom",
    geometry: "polygon",
    color: "#64b5ff",
    quoteCategory: "Custom",
    estimateService: null,
    unit: "acre",
    displayUnit: "acres",
    pricingMethod: "each",
    defaultRateType: "per_acre",
    pricingTemplateId: "custom",
    settingsRateField: null,
    settingsMinimumField: null,
    billable: true,
    aliases: ["custom"],
    description: "Custom area or scope item."
  }
];

export function getCatalogServiceByKey(key: ServiceCatalogKey | string | null | undefined) {
  return serviceCatalog.find((service) => service.key === key) ?? null;
}

export function getCatalogServiceByZoneType(zoneType: ZoneType | string | null | undefined) {
  if (zoneType === "Building") return getCatalogServiceByKey("house_pad_prep");
  return serviceCatalog.find((service) => service.zoneType === zoneType) ?? null;
}

export function getCatalogServiceByQuoteCategory(category: string | null | undefined) {
  const normalized = normalizeServiceText(category);
  return serviceCatalog.find(
    (service) =>
      normalizeServiceText(service.quoteCategory) === normalized ||
      service.aliases.some((alias) => normalizeServiceText(alias) === normalized)
  ) ?? null;
}

export function normalizeServiceText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveCatalogService(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeServiceText(value);
    if (!normalized) continue;
    const exact = serviceCatalog.find(
      (service) =>
        normalizeServiceText(service.key) === normalized ||
        normalizeServiceText(service.serviceType) === normalized ||
        normalizeServiceText(service.zoneType) === normalized ||
        normalizeServiceText(service.quoteCategory) === normalized ||
        normalizeServiceText(service.estimateService) === normalized ||
        service.aliases.some((alias) => normalizeServiceText(alias) === normalized)
    );
    if (exact) return exact;
  }
  return null;
}

export function detectCatalogServices(values: Array<string | null | undefined>) {
  const detected: ServiceCatalogEntry[] = [];
  values.forEach((value) => {
    const normalized = normalizeServiceText(value);
    if (!normalized) return;
    serviceCatalog.forEach((service) => {
      if (!service.estimateService || !service.billable) return;
      const terms = [
        service.key,
        service.serviceType,
        service.zoneType,
        service.quoteCategory,
        service.estimateService,
        ...service.aliases
      ].map(normalizeServiceText).filter(Boolean);
      if (terms.some((term) => normalized === term || normalized.includes(term))) {
        if (!detected.some((item) => item.key === service.key)) detected.push(service);
      }
    });
  });
  return detected;
}

export function serviceMatchesCatalog(
  service: ServiceCatalogEntry,
  ...values: Array<string | null | undefined>
) {
  const recognized = values
    .map((value) => resolveCatalogService(value))
    .filter((candidate): candidate is ServiceCatalogEntry => Boolean(candidate));
  return recognized.length > 0 && recognized.every((candidate) => candidate.key === service.key);
}

export function normalizeCatalogUnit(unit: string | null | undefined) {
  const normalized = normalizeServiceText(unit);
  if (normalized === "acre" || normalized === "acres") return "acres";
  if (normalized === "linear ft" || normalized === "linear feet" || normalized === "ft") return "linear feet";
  if (normalized === "sq ft" || normalized === "square feet") return "sq ft";
  if (normalized === "each" || normalized === "visit" || normalized === "per visit") return "each";
  return unit?.trim() ?? "";
}
