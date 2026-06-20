import {
  defaultProfitInputs,
  defaultServiceTemplates,
  mergeServiceTemplates,
  profitInputsStorageKey,
  serviceTemplatesStorageKey,
  type ProfitInputs,
  type ServiceTemplate
} from "@/lib/projects/pricing";
import { serviceCatalog } from "@/lib/services/catalog";

export type AcrexUserSettings = {
  company: {
    name: string;
    phone: string;
    email: string;
    website: string;
    logoUrl: string;
  };
  quoteDefaults: {
    terms: string;
    notes: string;
    expirationDays: number;
    depositPercent: number;
    taxPercent: number;
  };
  pricing: {
    brushClearingRate: number;
    mowingRate: number;
    mowingMinimumCharge: number;
    fenceRate: number;
    drivewayRate: number;
    housePadRate: number;
    landClearingRate: number;
    mobilizationFee: number;
    minimumJobCharge: number;
    laborRate: number;
    crewSize: number;
    equipmentRate: number;
    fuelSurchargePercent: number;
    overheadPercent: number;
    targetProfitPercent: number;
  };
  drawing: {
    grassColor: string;
    brushColor: string;
    woodsColor: string;
    fenceColor: string;
    drivewayColor: string;
    housePadColor: string;
    exclusionColor: string;
  };
  map: {
    preferredStyle: "satellite" | "satellite-streets" | "outdoors" | "light" | "dark";
    preferredUnits: "imperial" | "metric";
    showLabels: boolean;
    showParcelBoundary: boolean;
  };
  updatedAt: string | null;
};

export const defaultUserSettings: AcrexUserSettings = {
  company: {
    name: "",
    phone: "",
    email: "",
    website: "",
    logoUrl: ""
  },
  quoteDefaults: {
    terms: "Payment due according to the accepted quote and agreed project schedule.",
    notes: "",
    expirationDays: 30,
    depositPercent: 0,
    taxPercent: 0
  },
  pricing: {
    brushClearingRate: 920,
    mowingRate: 120,
    mowingMinimumCharge: 85,
    fenceRate: 18,
    drivewayRate: 2.25,
    housePadRate: 3.75,
    landClearingRate: 1450,
    mobilizationFee: 50,
    minimumJobCharge: 0,
    laborRate: 55,
    crewSize: 1,
    equipmentRate: 175,
    fuelSurchargePercent: 0,
    overheadPercent: 15,
    targetProfitPercent: 25
  },
  drawing: {
    grassColor: "#4fca5a",
    brushColor: "#f97316",
    woodsColor: "#1f7a3d",
    fenceColor: "#8b5cf6",
    drivewayColor: "#9aa4ad",
    housePadColor: "#b88352",
    exclusionColor: "#ef4444"
  },
  map: {
    preferredStyle: "satellite-streets",
    preferredUnits: "imperial",
    showLabels: true,
    showParcelBoundary: true
  },
  updatedAt: null
};

export function getUserSettingsStorageKey(userId: string) {
  return `acrex:user-settings:${userId}`;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeUserSettings(value: Partial<AcrexUserSettings> | null | undefined): AcrexUserSettings {
  const company = (value?.company ?? {}) as Partial<AcrexUserSettings["company"]>;
  const quoteDefaults = (value?.quoteDefaults ?? {}) as Partial<AcrexUserSettings["quoteDefaults"]>;
  const pricing = (value?.pricing ?? {}) as Partial<AcrexUserSettings["pricing"]>;
  const drawing = (value?.drawing ?? {}) as Partial<AcrexUserSettings["drawing"]>;
  const map = (value?.map ?? {}) as Partial<AcrexUserSettings["map"]>;
  const rawPreferredStyle = (value?.map as { preferredStyle?: unknown } | undefined)?.preferredStyle;
  const supportedMapStyles = new Set(["satellite", "satellite-streets", "outdoors", "light", "dark"]);
  const preferredStyle = rawPreferredStyle === "street"
    ? "light"
    : typeof rawPreferredStyle === "string" && supportedMapStyles.has(rawPreferredStyle)
      ? rawPreferredStyle as AcrexUserSettings["map"]["preferredStyle"]
      : defaultUserSettings.map.preferredStyle;

  return {
    company: { ...defaultUserSettings.company, ...company },
    quoteDefaults: {
      ...defaultUserSettings.quoteDefaults,
      ...quoteDefaults,
      expirationDays: finiteNumber(quoteDefaults.expirationDays, defaultUserSettings.quoteDefaults.expirationDays),
      depositPercent: finiteNumber(quoteDefaults.depositPercent, defaultUserSettings.quoteDefaults.depositPercent),
      taxPercent: finiteNumber(quoteDefaults.taxPercent, defaultUserSettings.quoteDefaults.taxPercent)
    },
    pricing: {
      ...defaultUserSettings.pricing,
      ...pricing,
      brushClearingRate: finiteNumber(pricing.brushClearingRate, defaultUserSettings.pricing.brushClearingRate),
      mowingRate: finiteNumber(pricing.mowingRate, defaultUserSettings.pricing.mowingRate),
      mowingMinimumCharge: finiteNumber(pricing.mowingMinimumCharge, defaultUserSettings.pricing.mowingMinimumCharge),
      fenceRate: finiteNumber(pricing.fenceRate, defaultUserSettings.pricing.fenceRate),
      drivewayRate: finiteNumber(pricing.drivewayRate, defaultUserSettings.pricing.drivewayRate),
      housePadRate: finiteNumber(pricing.housePadRate, defaultUserSettings.pricing.housePadRate),
      landClearingRate: finiteNumber(pricing.landClearingRate, defaultUserSettings.pricing.landClearingRate),
      mobilizationFee: finiteNumber(pricing.mobilizationFee, defaultUserSettings.pricing.mobilizationFee),
      minimumJobCharge: finiteNumber(pricing.minimumJobCharge, defaultUserSettings.pricing.minimumJobCharge),
      laborRate: finiteNumber(pricing.laborRate, defaultUserSettings.pricing.laborRate),
      crewSize: finiteNumber(pricing.crewSize, defaultUserSettings.pricing.crewSize),
      equipmentRate: finiteNumber(pricing.equipmentRate, defaultUserSettings.pricing.equipmentRate),
      fuelSurchargePercent: finiteNumber(pricing.fuelSurchargePercent, defaultUserSettings.pricing.fuelSurchargePercent),
      overheadPercent: finiteNumber(pricing.overheadPercent, defaultUserSettings.pricing.overheadPercent),
      targetProfitPercent: finiteNumber(pricing.targetProfitPercent, defaultUserSettings.pricing.targetProfitPercent)
    },
    drawing: { ...defaultUserSettings.drawing, ...drawing },
    map: { ...defaultUserSettings.map, ...map, preferredStyle },
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null
  };
}

export function loadUserSettings(userId: string) {
  if (typeof window === "undefined") return defaultUserSettings;
  try {
    const stored = window.localStorage.getItem(getUserSettingsStorageKey(userId));
    return stored ? normalizeUserSettings(JSON.parse(stored) as Partial<AcrexUserSettings>) : defaultUserSettings;
  } catch {
    return defaultUserSettings;
  }
}

function updateTemplate(
  templates: ServiceTemplate[],
  id: string,
  rate: number,
  minimumJobCharge: number,
  equipmentRate?: number
) {
  return templates.map((template) =>
    template.id === id
      ? {
          ...template,
          defaultUnitPrice: rate,
          minimumCharge: Math.max(0, minimumJobCharge),
          equipmentCostPerHour: equipmentRate ?? template.equipmentCostPerHour
        }
      : template
  );
}

export function pricingTemplatesFromSettings(settings: AcrexUserSettings) {
  let templates = mergeServiceTemplates(defaultServiceTemplates);
  serviceCatalog.forEach((service) => {
    if (!service.pricingTemplateId || !service.settingsRateField) return;
    const minimumField = service.settingsMinimumField;
    const serviceMinimum = minimumField ? settings.pricing[minimumField] : 0;
    const minimumCharge = Math.max(serviceMinimum, settings.pricing.minimumJobCharge);
    const usesHeavyEquipment = ["forestry_mulching", "land_clearing", "gravel_driveway", "house_pad_prep"].includes(service.key);
    templates = updateTemplate(
      templates,
      service.pricingTemplateId,
      settings.pricing[service.settingsRateField],
      minimumCharge,
      usesHeavyEquipment ? settings.pricing.equipmentRate : undefined
    );
  });
  return templates;
}

export function profitInputsFromSettings(settings: AcrexUserSettings): ProfitInputs {
  return {
    ...defaultProfitInputs,
    laborRate: settings.pricing.laborRate,
    crewSize: settings.pricing.crewSize,
    equipmentCost: settings.pricing.equipmentRate,
    travelCharge: settings.pricing.mobilizationFee,
    fuelCost: 0,
    fuelSurchargePercent: settings.pricing.fuelSurchargePercent,
    overheadPercent: settings.pricing.overheadPercent,
    targetProfitPercent: settings.pricing.targetProfitPercent,
    markupPercent: settings.pricing.targetProfitPercent
  };
}

export function saveUserSettings(userId: string, value: AcrexUserSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeUserSettings(value);
  window.localStorage.setItem(getUserSettingsStorageKey(userId), JSON.stringify(normalized));
  window.localStorage.setItem(serviceTemplatesStorageKey, JSON.stringify(pricingTemplatesFromSettings(normalized)));
  window.localStorage.setItem(profitInputsStorageKey, JSON.stringify(profitInputsFromSettings(normalized)));
}
