import type { QuoteService, ZoneType } from "@/lib/projects/types";

export type ServiceTemplate = {
  id: string;
  serviceName: QuoteService;
  unitType: string;
  defaultUnitPrice: number;
  minimumCharge: number;
  productionRatePerHour: number;
  equipmentCostPerHour: number;
  fuelCostPerHour: number;
  materialCostPerUnit: number;
  disposalCostPerUnit: number;
  notes: string;
  billableZoneTypes: ZoneType[];
  active: boolean;
};

export type ProfitInputs = {
  laborRate: number;
  estimatedHours: number;
  fuelCost: number;
  equipmentCost: number;
  materialCost: number;
  disposalCost: number;
  travelCharge: number;
  otherCost: number;
  markupPercent: number;
};

export type EstimatorZone = {
  id: string;
  name: string;
  type: ZoneType;
  acres: number;
  squareFeet: number;
  perimeterFeet: number;
};

export type EstimateLine = {
  id: string;
  zoneName: string;
  zoneType: ZoneType;
  serviceName: QuoteService;
  quantity: number;
  unit: string;
  productionRate: number;
  estimatedHours: number;
  laborCost: number;
  equipmentCost: number;
  fuelCost: number;
  materialCost: number;
  disposalCost: number;
  lineCost: number;
  recommendedRevenue: number;
};

export type ProjectEstimate = {
  lines: EstimateLine[];
  estimatedProductionRate: number;
  estimatedLaborHours: number;
  laborCost: number;
  equipmentCost: number;
  fuelCost: number;
  materialCost: number;
  disposalCost: number;
  travelCharge: number;
  otherCost: number;
  recommendedMarkup: number;
  estimatedRevenue: number;
  estimatedCost: number;
  estimatedProfit: number;
  profitMargin: number;
};

export const serviceTemplatesStorageKey = "acrex-service-templates";
export const profitInputsStorageKey = "acrex-profit-inputs";

export const defaultServiceTemplates: ServiceTemplate[] = [
  {
    id: "mowing",
    serviceName: "Mowing",
    unitType: "acre",
    defaultUnitPrice: 120,
    minimumCharge: 85,
    productionRatePerHour: 1.4,
    equipmentCostPerHour: 35,
    fuelCostPerHour: 10,
    materialCostPerUnit: 0,
    disposalCostPerUnit: 0,
    notes: "Open grass mowing with normal access.",
    billableZoneTypes: ["Grass"],
    active: true
  },
  {
    id: "brush-clearing",
    serviceName: "Brush Clearing",
    unitType: "acre",
    defaultUnitPrice: 920,
    minimumCharge: 650,
    productionRatePerHour: 0.45,
    equipmentCostPerHour: 95,
    fuelCostPerHour: 24,
    materialCostPerUnit: 0,
    disposalCostPerUnit: 75,
    notes: "Brush and small tree clearing. Verify density and haul-off.",
    billableZoneTypes: ["Brush"],
    active: true
  },
  {
    id: "land-clearing",
    serviceName: "Land Clearing",
    unitType: "acre",
    defaultUnitPrice: 1450,
    minimumCharge: 1000,
    productionRatePerHour: 0.38,
    equipmentCostPerHour: 135,
    fuelCostPerHour: 34,
    materialCostPerUnit: 0,
    disposalCostPerUnit: 125,
    notes: "General land clearing estimate. Verify tree density, access, hauling, and disposal.",
    billableZoneTypes: ["Property", "Custom"],
    active: true
  },
  {
    id: "forestry-mulching",
    serviceName: "Forestry Mulching",
    unitType: "acre",
    defaultUnitPrice: 1850,
    minimumCharge: 1200,
    productionRatePerHour: 0.28,
    equipmentCostPerHour: 150,
    fuelCostPerHour: 38,
    materialCostPerUnit: 0,
    disposalCostPerUnit: 0,
    notes: "Mulching rate depends on density, slope, access, and debris size.",
    billableZoneTypes: ["Property", "Brush", "Custom"],
    active: true
  },
  {
    id: "fencing",
    serviceName: "Fencing",
    unitType: "linear ft",
    defaultUnitPrice: 18,
    minimumCharge: 900,
    productionRatePerHour: 75,
    equipmentCostPerHour: 30,
    fuelCostPerHour: 8,
    materialCostPerUnit: 7.5,
    disposalCostPerUnit: 0,
    notes: "Use measured perimeter or dedicated measurement mode.",
    billableZoneTypes: ["Property", "Custom"],
    active: true
  },
  {
    id: "driveway-prep",
    serviceName: "Driveway Prep",
    unitType: "sq ft",
    defaultUnitPrice: 2.25,
    minimumCharge: 750,
    productionRatePerHour: 1100,
    equipmentCostPerHour: 120,
    fuelCostPerHour: 28,
    materialCostPerUnit: 0.45,
    disposalCostPerUnit: 0.05,
    notes: "Includes prep only. Materials and trucking should be added separately.",
    billableZoneTypes: ["Driveway"],
    active: true
  },
  {
    id: "house-pad",
    serviceName: "House Pad",
    unitType: "sq ft",
    defaultUnitPrice: 3.75,
    minimumCharge: 1500,
    productionRatePerHour: 850,
    equipmentCostPerHour: 135,
    fuelCostPerHour: 30,
    materialCostPerUnit: 0.65,
    disposalCostPerUnit: 0.05,
    notes: "Verify compaction requirements, fill depth, and drainage.",
    billableZoneTypes: ["Building"],
    active: true
  },
  {
    id: "sod",
    serviceName: "Sod",
    unitType: "sq ft",
    defaultUnitPrice: 1.45,
    minimumCharge: 1200,
    productionRatePerHour: 1400,
    equipmentCostPerHour: 40,
    fuelCostPerHour: 10,
    materialCostPerUnit: 0.72,
    disposalCostPerUnit: 0,
    notes: "Materials, prep, delivery, and irrigation readiness affect price.",
    billableZoneTypes: ["Grass"],
    active: true
  },
  {
    id: "irrigation",
    serviceName: "Irrigation",
    unitType: "zone",
    defaultUnitPrice: 950,
    minimumCharge: 1800,
    productionRatePerHour: 0.5,
    equipmentCostPerHour: 25,
    fuelCostPerHour: 6,
    materialCostPerUnit: 360,
    disposalCostPerUnit: 0,
    notes: "Use custom quantity for zones until irrigation takeoff is added.",
    billableZoneTypes: ["Grass", "Custom"],
    active: true
  },
  {
    id: "custom",
    serviceName: "Custom",
    unitType: "each",
    defaultUnitPrice: 0,
    minimumCharge: 0,
    productionRatePerHour: 1,
    equipmentCostPerHour: 0,
    fuelCostPerHour: 0,
    materialCostPerUnit: 0,
    disposalCostPerUnit: 0,
    notes: "Custom contractor line item.",
    billableZoneTypes: ["Custom"],
    active: true
  }
];

export const defaultProfitInputs: ProfitInputs = {
  laborRate: 55,
  estimatedHours: 4,
  fuelCost: 50,
  equipmentCost: 175,
  materialCost: 0,
  disposalCost: 0,
  travelCharge: 50,
  otherCost: 0,
  markupPercent: 25
};

export function mergeServiceTemplates(templates: Partial<ServiceTemplate>[] | null | undefined) {
  const storedTemplates = Array.isArray(templates) ? templates : [];
  const mergedDefaults = defaultServiceTemplates.map((defaultTemplate) => {
    const storedTemplate = storedTemplates.find((template) => template.id === defaultTemplate.id || template.serviceName === defaultTemplate.serviceName);
    return {
      ...defaultTemplate,
      ...(storedTemplate ?? {}),
      active: storedTemplate?.active ?? defaultTemplate.active
    };
  });
  const customTemplates = storedTemplates.filter(
    (template) => template.id && !defaultServiceTemplates.some((defaultTemplate) => defaultTemplate.id === template.id)
  ) as ServiceTemplate[];

  return [...mergedDefaults, ...customTemplates];
}

export function getTemplateForZone(type: ZoneType, templates: ServiceTemplate[] = defaultServiceTemplates) {
  const activeTemplates = templates.filter((template) => template.active !== false);
  return activeTemplates.find((template) => template.billableZoneTypes.includes(type)) ?? activeTemplates.find((template) => template.id === "custom") ?? defaultServiceTemplates[defaultServiceTemplates.length - 1];
}

export function getTemplateQuantity(type: ZoneType, acres: number, squareFeet: number, perimeterFeet: number, template: ServiceTemplate) {
  if (template.unitType === "sq ft") return squareFeet;
  if (template.unitType === "linear ft") return perimeterFeet;
  if (template.unitType === "zone") return Math.max(1, Math.ceil(acres / 0.35));
  if (template.unitType === "each") return 1;
  return acres;
}

export function calculateTemplateLineTotal(quantity: number, template: ServiceTemplate) {
  const rawTotal = quantity * template.defaultUnitPrice;
  return Math.max(rawTotal, template.minimumCharge);
}

function getTemplateNumber(template: ServiceTemplate, field: keyof Pick<ServiceTemplate, "productionRatePerHour" | "equipmentCostPerHour" | "fuelCostPerHour" | "materialCostPerUnit" | "disposalCostPerUnit">) {
  const defaultTemplate = defaultServiceTemplates.find((item) => item.id === template.id);
  const value = template[field] ?? defaultTemplate?.[field] ?? 0;
  return Number.isFinite(value) ? value : 0;
}

export function calculateProjectEstimate(
  zones: EstimatorZone[],
  templates: ServiceTemplate[] = defaultServiceTemplates,
  inputs: ProfitInputs = defaultProfitInputs
): ProjectEstimate {
  const billableZones = zones.filter((zone) => !["Excluded", "Building"].includes(zone.type));
  const lines = billableZones.map<EstimateLine>((zone) => {
    const template = getTemplateForZone(zone.type, templates);
    const quantity = getTemplateQuantity(zone.type, zone.acres, zone.squareFeet, zone.perimeterFeet, template);
    const productionRate = Math.max(getTemplateNumber(template, "productionRatePerHour"), 0.01);
    const estimatedHours = quantity > 0 ? quantity / productionRate : 0;
    const laborCost = estimatedHours * inputs.laborRate;
    const equipmentCost = estimatedHours * getTemplateNumber(template, "equipmentCostPerHour");
    const fuelCost = estimatedHours * getTemplateNumber(template, "fuelCostPerHour");
    const materialCost = quantity * getTemplateNumber(template, "materialCostPerUnit");
    const disposalCost = quantity * getTemplateNumber(template, "disposalCostPerUnit");
    const lineCost = laborCost + equipmentCost + fuelCost + materialCost + disposalCost;
    const recommendedRevenue = calculateTemplateLineTotal(quantity, template);

    return {
      id: zone.id,
      zoneName: zone.name,
      zoneType: zone.type,
      serviceName: template.serviceName,
      quantity,
      unit: template.unitType,
      productionRate,
      estimatedHours,
      laborCost,
      equipmentCost,
      fuelCost,
      materialCost,
      disposalCost,
      lineCost,
      recommendedRevenue
    };
  });

  const lineHours = lines.reduce((total, line) => total + line.estimatedHours, 0);
  const estimatedLaborHours = lineHours + inputs.estimatedHours;
  const laborCost = lines.reduce((total, line) => total + line.laborCost, 0) + inputs.estimatedHours * inputs.laborRate;
  const equipmentCost = lines.reduce((total, line) => total + line.equipmentCost, 0) + inputs.equipmentCost;
  const fuelCost = lines.reduce((total, line) => total + line.fuelCost, 0) + inputs.fuelCost;
  const materialCost = lines.reduce((total, line) => total + line.materialCost, 0) + inputs.materialCost;
  const disposalCost = lines.reduce((total, line) => total + line.disposalCost, 0) + inputs.disposalCost;
  const estimatedCost = laborCost + equipmentCost + fuelCost + materialCost + disposalCost + inputs.travelCharge + inputs.otherCost;
  const templateRevenue = lines.reduce((total, line) => total + line.recommendedRevenue, 0) + inputs.travelCharge;
  const markedUpRevenue = estimatedCost * (1 + inputs.markupPercent / 100);
  const estimatedRevenue = Math.max(templateRevenue, markedUpRevenue);
  const estimatedProfit = estimatedRevenue - estimatedCost;
  const profitMargin = estimatedRevenue > 0 ? (estimatedProfit / estimatedRevenue) * 100 : 0;
  const estimatedProductionRate = estimatedLaborHours > 0 ? lines.reduce((total, line) => total + line.quantity, 0) / estimatedLaborHours : 0;

  return {
    lines,
    estimatedProductionRate,
    estimatedLaborHours,
    laborCost,
    equipmentCost,
    fuelCost,
    materialCost,
    disposalCost,
    travelCharge: inputs.travelCharge,
    otherCost: inputs.otherCost,
    recommendedMarkup: inputs.markupPercent,
    estimatedRevenue,
    estimatedCost,
    estimatedProfit,
    profitMargin
  };
}

export function calculateProfit(revenue: number, inputs: ProfitInputs) {
  const cost =
    inputs.laborRate * inputs.estimatedHours +
    inputs.fuelCost +
    inputs.equipmentCost +
    inputs.materialCost +
    inputs.disposalCost +
    inputs.travelCharge +
    inputs.otherCost;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return { revenue, cost, profit, margin };
}
