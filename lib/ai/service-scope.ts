import {
  detectCatalogServices,
  getCatalogServiceByZoneType,
  normalizeCatalogUnit,
  normalizeServiceText,
  resolveCatalogService,
  type ServiceCatalogEntry
} from "@/lib/services/catalog";

type ScopedMeasurement = {
  sourceId: string;
  label: string;
  zoneType: string;
  serviceType: string;
  quoteCategory?: string;
  quantity: number;
  unit: string;
  billable?: boolean;
  selected?: boolean;
};

type ScopedLine = {
  serviceName: string;
  sourceMeasurementId?: string | null;
  sourceDeleted?: boolean;
};

type ScopedTemplate = {
  id?: string;
  serviceName: string;
  unitType: string;
  defaultUnitPrice: number;
  minimumCharge: number;
};

export type ServiceScopedContext = {
  project: { primaryServiceType?: string };
  measurements: {
    available: ScopedMeasurement[];
    selectedSourceIds: string[];
  };
  quote: {
    lineItems: ScopedLine[];
    laborEquipment?: Array<{ category?: string; name?: string; amount?: number | null }>;
  };
  pricingDefaults: {
    serviceTemplates: ScopedTemplate[];
    global?: {
      travelCharge?: number;
      fuelSurchargePercent?: number;
      laborRate?: number;
      equipmentCost?: number;
    } | null;
  };
};

export type ServiceScopedSuggestion = {
  serviceType?: string;
  suggestedLineItems: Array<{
    serviceName: string;
    description: string;
    quantity: number;
    unit: string;
    suggestedRateRange: string;
    recommendedRate?: number;
    total?: number;
    explanation: string;
    notes: string;
    sourceMeasurementId?: string | null;
    sourceMeasurement?: string;
    zoneType?: string;
  }>;
  suggestedMaterials: Array<{ name: string; quantity?: number; unit?: string; notes: string }>;
  suggestedLaborEquipment: Array<{
    category: string;
    name: string;
    amount?: number;
    explanation: string;
    notes: string;
  }>;
  pricingAssumptions: string[];
  warnings: string[];
  [key: string]: unknown;
};

export function getActiveCatalogServices(context: ServiceScopedContext) {
  const selectedIds = new Set(context.measurements.selectedSourceIds.filter(Boolean));
  context.measurements.available.forEach((measurement) => {
    if (measurement.selected) selectedIds.add(measurement.sourceId);
  });
  const selectedMeasurements = context.measurements.available.filter((measurement) =>
    selectedIds.has(measurement.sourceId)
  );
  const measurementScope = selectedMeasurements.length
    ? selectedMeasurements
    : context.measurements.available.filter((measurement) => measurement.billable !== false);
  const measuredServices = measurementScope
    .map((measurement) =>
      getCatalogServiceByZoneType(measurement.zoneType) ??
      resolveCatalogService(measurement.quoteCategory, measurement.serviceType)
    )
    .filter((service): service is ServiceCatalogEntry => Boolean(service?.billable && service.estimateService));
  const manualServices = detectCatalogServices(
    context.quote.lineItems
      .filter((line) => !line.sourceDeleted && !line.sourceMeasurementId)
      .map((line) => line.serviceName)
  );
  const services = [...measuredServices, ...manualServices].filter(
    (service, index, all) =>
      service.billable &&
      Boolean(service.estimateService) &&
      all.findIndex((candidate) => candidate.key === service.key) === index
  );
  if (services.length) return services;
  return detectCatalogServices([context.project.primaryServiceType]);
}

function mentionsInactiveService(text: string, activeKeys: Set<string>) {
  const normalized = normalizeServiceText(text);
  if (!normalized) return false;
  return detectCatalogServices([normalized]).some((service) => !activeKeys.has(service.key));
}

function templateForService(service: ServiceCatalogEntry, templates: ScopedTemplate[]) {
  if (!service.pricingTemplateId) return null;
  return templates.find((template) => template.id === service.pricingTemplateId) ?? null;
}

export function enforceServiceScope<T extends ServiceScopedSuggestion>(
  suggestion: T,
  context: ServiceScopedContext
): T {
  const activeServices = getActiveCatalogServices(context);
  const activeKeys = new Set(activeServices.map((service) => service.key));
  const currentSourceIds = new Set(
    context.quote.lineItems
      .filter((line) => !line.sourceDeleted)
      .map((line) => line.sourceMeasurementId)
      .filter(Boolean)
  );
  const selectedIds = new Set(context.measurements.selectedSourceIds.filter(Boolean));
  context.measurements.available.forEach((measurement) => {
    if (measurement.selected) selectedIds.add(measurement.sourceId);
  });
  const selectedMeasurements = context.measurements.available.filter((measurement) =>
    selectedIds.has(measurement.sourceId)
  );
  const measurementScope = (selectedMeasurements.length
    ? selectedMeasurements
    : context.measurements.available.filter((measurement) => measurement.billable !== false)
  ).filter((measurement) => {
    const service = getCatalogServiceByZoneType(measurement.zoneType);
    return Boolean(service && activeKeys.has(service.key) && service.billable);
  });

  const usedAiIndexes = new Set<number>();
  const standardizedLines = measurementScope.flatMap((measurement) => {
    if (currentSourceIds.has(measurement.sourceId)) return [];
    const service = getCatalogServiceByZoneType(measurement.zoneType);
    if (!service || !activeKeys.has(service.key)) return [];
    let aiIndex = suggestion.suggestedLineItems.findIndex(
      (line, index) =>
        !usedAiIndexes.has(index) &&
        (line.sourceMeasurementId === measurement.sourceId ||
          resolveCatalogService(line.zoneType, line.serviceName)?.key === service.key)
    );
    if (aiIndex < 0) aiIndex = -1;
    if (aiIndex >= 0) usedAiIndexes.add(aiIndex);
    const aiLine = aiIndex >= 0 ? suggestion.suggestedLineItems[aiIndex] : null;
    const template = templateForService(service, context.pricingDefaults.serviceTemplates);
    const unit = service.displayUnit;
    const savedRate =
      template &&
      normalizeCatalogUnit(template.unitType) === unit &&
      template.defaultUnitPrice > 0
        ? template.defaultUnitPrice
        : null;
    const recommendedRate = savedRate ?? aiLine?.recommendedRate;
    const assumptions = savedRate
      ? `Uses the saved ${service.quoteCategory} default of $${savedRate.toFixed(2)} per ${unit}.`
      : "No pricing default set; use the suggested range as guidance and verify the final rate.";
    if (!suggestion.pricingAssumptions.includes(assumptions)) {
      suggestion.pricingAssumptions.push(assumptions);
    }
    if (template?.minimumCharge && template.minimumCharge > 0) {
      const minimumAssumption = `Saved ${service.quoteCategory} minimum charge: $${template.minimumCharge.toFixed(2)}.`;
      if (!suggestion.pricingAssumptions.includes(minimumAssumption)) {
        suggestion.pricingAssumptions.push(minimumAssumption);
      }
    }
    return [{
      serviceName: service.quoteCategory,
      description: aiLine?.description || measurement.label,
      quantity: measurement.quantity,
      unit,
      suggestedRateRange: aiLine?.suggestedRateRange || (savedRate ? `$${savedRate.toFixed(2)} saved default` : "Verify local market rate"),
      recommendedRate,
      total: typeof recommendedRate === "number" ? measurement.quantity * recommendedRate : undefined,
      explanation: aiLine?.explanation || assumptions,
      notes: aiLine?.notes || "",
      sourceMeasurementId: measurement.sourceId,
      sourceMeasurement: measurement.label,
      zoneType: service.zoneType
    }];
  });

  const manualActiveLines = measurementScope.length
    ? []
    : suggestion.suggestedLineItems.filter((line, index) => {
        if (usedAiIndexes.has(index) || line.sourceMeasurementId) return false;
        const service = resolveCatalogService(line.zoneType, line.serviceName);
        return Boolean(service && activeKeys.has(service.key));
      });
  const scopedMaterials = suggestion.suggestedMaterials.filter(
    (item) => !mentionsInactiveService(`${item.name} ${item.notes}`, activeKeys)
  );
  const scopedCosts = suggestion.suggestedLaborEquipment.filter(
    (item) => !mentionsInactiveService(`${item.category} ${item.name} ${item.notes}`, activeKeys)
  );
  const hasMobilization = [
    ...(context.quote.laborEquipment ?? []),
    ...scopedCosts
  ].some((item) =>
    normalizeServiceText(`${item.category ?? ""} ${item.name ?? ""}`).includes("mobilization")
  );
  const mobilization = Number(context.pricingDefaults.global?.travelCharge ?? 0);
  if (!hasMobilization && mobilization > 0) {
    scopedCosts.push({
      category: "mobilization",
      name: "Mobilization",
      amount: mobilization,
      explanation: "Uses the mobilization fee saved in Settings.",
      notes: "Review travel distance and equipment transport before applying."
    });
  }
  const fuelSurchargePercent = Number(context.pricingDefaults.global?.fuelSurchargePercent ?? 0);
  if (fuelSurchargePercent > 0) {
    const fuelAssumption = `Settings fuel surcharge: ${fuelSurchargePercent.toFixed(2)}%.`;
    if (!suggestion.pricingAssumptions.includes(fuelAssumption)) {
      suggestion.pricingAssumptions.push(fuelAssumption);
    }
  }

  return {
    ...suggestion,
    serviceType: activeServices.map((service) => service.key).join(","),
    suggestedLineItems: [...standardizedLines, ...manualActiveLines],
    suggestedMaterials: scopedMaterials,
    suggestedLaborEquipment: scopedCosts,
    warnings:
      activeServices.length > 0
        ? suggestion.warnings
        : [...suggestion.warnings, "No supported billable service was detected."]
  };
}
