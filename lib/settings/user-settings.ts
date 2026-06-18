import {
  defaultProfitInputs,
  defaultServiceTemplates,
  mergeServiceTemplates,
  profitInputsStorageKey,
  serviceTemplatesStorageKey,
  type ProfitInputs,
  type ServiceTemplate
} from "@/lib/projects/pricing";

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
    fenceRate: number;
    drivewayRate: number;
    housePadRate: number;
    mobilizationFee: number;
    minimumJobCharge: number;
    laborRate: number;
    equipmentRate: number;
    fuelSurchargePercent: number;
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
    preferredStyle: "satellite" | "street";
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
    fenceRate: 18,
    drivewayRate: 2.25,
    housePadRate: 3.75,
    mobilizationFee: 50,
    minimumJobCharge: 0,
    laborRate: 55,
    equipmentRate: 175,
    fuelSurchargePercent: 0
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
    preferredStyle: "satellite",
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
      fenceRate: finiteNumber(pricing.fenceRate, defaultUserSettings.pricing.fenceRate),
      drivewayRate: finiteNumber(pricing.drivewayRate, defaultUserSettings.pricing.drivewayRate),
      housePadRate: finiteNumber(pricing.housePadRate, defaultUserSettings.pricing.housePadRate),
      mobilizationFee: finiteNumber(pricing.mobilizationFee, defaultUserSettings.pricing.mobilizationFee),
      minimumJobCharge: finiteNumber(pricing.minimumJobCharge, defaultUserSettings.pricing.minimumJobCharge),
      laborRate: finiteNumber(pricing.laborRate, defaultUserSettings.pricing.laborRate),
      equipmentRate: finiteNumber(pricing.equipmentRate, defaultUserSettings.pricing.equipmentRate),
      fuelSurchargePercent: finiteNumber(pricing.fuelSurchargePercent, defaultUserSettings.pricing.fuelSurchargePercent)
    },
    drawing: { ...defaultUserSettings.drawing, ...drawing },
    map: { ...defaultUserSettings.map, ...map },
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
          minimumCharge: Math.max(template.minimumCharge, minimumJobCharge),
          equipmentCostPerHour: equipmentRate ?? template.equipmentCostPerHour
        }
      : template
  );
}

export function pricingTemplatesFromSettings(settings: AcrexUserSettings) {
  let templates = mergeServiceTemplates(defaultServiceTemplates);
  templates = updateTemplate(templates, "brush-clearing", settings.pricing.brushClearingRate, settings.pricing.minimumJobCharge, settings.pricing.equipmentRate);
  templates = updateTemplate(templates, "mowing", settings.pricing.mowingRate, settings.pricing.minimumJobCharge);
  templates = updateTemplate(templates, "fencing", settings.pricing.fenceRate, settings.pricing.minimumJobCharge);
  templates = updateTemplate(templates, "driveway-prep", settings.pricing.drivewayRate, settings.pricing.minimumJobCharge, settings.pricing.equipmentRate);
  templates = updateTemplate(templates, "house-pad", settings.pricing.housePadRate, settings.pricing.minimumJobCharge, settings.pricing.equipmentRate);
  return templates;
}

export function profitInputsFromSettings(settings: AcrexUserSettings): ProfitInputs {
  return {
    ...defaultProfitInputs,
    laborRate: settings.pricing.laborRate,
    equipmentCost: settings.pricing.equipmentRate,
    travelCharge: settings.pricing.mobilizationFee,
    fuelCost: settings.pricing.fuelSurchargePercent
  };
}

export function saveUserSettings(userId: string, value: AcrexUserSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeUserSettings(value);
  window.localStorage.setItem(getUserSettingsStorageKey(userId), JSON.stringify(normalized));
  window.localStorage.setItem(serviceTemplatesStorageKey, JSON.stringify(pricingTemplatesFromSettings(normalized)));
  window.localStorage.setItem(profitInputsStorageKey, JSON.stringify(profitInputsFromSettings(normalized)));
}
