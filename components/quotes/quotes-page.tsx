"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AiEstimateReview,
  type AiEstimateSuggestion,
  type AiSuggestedCost,
  type AiSuggestedLineItem,
  type AiSuggestedMaterial
} from "@/components/quotes/ai-estimate-review";
import { AppSidebar } from "@/components/ui/app-sidebar";
import {
  getTemplateForZone,
  mergeServiceTemplates,
  profitInputsStorageKey,
  serviceTemplatesStorageKey,
  type ProfitInputs,
  type ServiceTemplate
} from "@/lib/projects/pricing";
import type { ClientRecord, ProjectRecord, QuoteRecord, QuoteStatus, SavedZoneProperties, ZoneType } from "@/lib/projects/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type QuotesPageProps = {
  userId: string;
  userEmail: string;
  projects: ProjectRecord[];
  clients: ClientRecord[];
  savedQuotes: QuoteRecord[];
  initialProjectId?: string | null;
  initialMeasurementId?: string | null;
  errorMessage?: string | null;
};

type QuoteUiStatus = "Draft" | "Sent" | "Approved" | "Declined";

type MeasurementRow = {
  id: string;
  sourceId: string;
  label: string;
  serviceType: string;
  zoneType: ZoneType | string;
  geometryType: string;
  quoteCategory: string;
  quantity: number;
  unit: string;
  color: string;
  billable: boolean;
  serviceTypeChangedAt: string | null;
  previousQuoteCategory: string | null;
};

type QuoteLineItem = {
  id: string;
  serviceName: string;
  description: string;
  sourceMeasurement: string;
  sourceId: string | null;
  zoneType: string;
  quantity: string;
  unit: string;
  rate: string;
  notes: string;
};

type MaterialItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  unitCost: string;
  notes: string;
};

type CostLine = {
  id: string;
  category: "labor" | "equipment" | "fuel" | "mobilization" | "haul-off" | "disposal" | "minimum" | "other";
  name: string;
  amount: string;
  notes: string;
};

type QuoteNotes = {
  scopeOfWork: string;
  customerNotes: string;
  exclusions: string;
  paymentTerms: string;
  estimatedTimeline: string;
};

type SavedQuotePayload = {
  lineItems?: QuoteLineItem[];
  materials?: MaterialItem[];
  costLines?: CostLine[];
  siteConditions?: SiteConditions;
  discount?: number;
  taxPercent?: number;
  depositPercent?: number;
  scopeOfWork?: string;
  customerNotes?: string;
  exclusions?: string;
  paymentTerms?: string;
  estimatedTimeline?: string;
};

type SiteConditions = {
  access: "" | "Easy" | "Moderate" | "Difficult";
  terrain: "" | "Flat" | "Sloped" | "Rough";
  density: "" | "Light" | "Medium" | "Heavy";
  haulOff: "" | "None" | "Partial" | "Full";
  timeline: "" | "Flexible" | "Normal" | "Rush";
  fenceMaterial: "" | "Wood" | "Vinyl" | "Chain Link" | "Aluminum";
  notes: string;
};

type GuidedQuestionType = "density" | "haulOff" | "access" | "fenceMaterial" | "timeline";

type EstimateContext = {
  project: {
    id: string | null;
    name: string;
    address: string;
    primaryServiceType: string;
    status: string;
  };
  customer: {
    id: string | null;
    name: string;
    company: string;
    email: string;
    phone: string;
    address: string;
    notes: string;
  } | null;
  measurements: {
    available: Array<{
      sourceId: string;
      label: string;
      zoneType: string;
      serviceType: string;
      quoteCategory: string;
      geometryType: string;
      quantity: number;
      unit: string;
      billable: boolean;
    }>;
    selectedSourceIds: string[];
    selected: Array<{
      sourceId: string;
      label: string;
      serviceType: string;
      quantity: number;
      unit: string;
    }>;
    totals: {
      drawingCount: number;
      validMeasurementCount: number;
      billableAcres: number;
      excludedAcres: number;
      squareFeet: number;
      linearFeet: number;
    };
  };
  quote: {
    quoteNumber: string;
    status: QuoteUiStatus;
    lineItems: Array<{
      serviceName: string;
      description: string;
      sourceMeasurementId: string | null;
      sourceMeasurement: string;
      zoneType: string;
      quantity: number;
      unit: string;
      rate: number | null;
      total: number;
      notes: string;
    }>;
    materials: Array<{
      name: string;
      quantity: number | null;
      unit: string;
      unitCost: number | null;
      total: number;
      notes: string;
    }>;
    laborEquipment: Array<{
      category: CostLine["category"];
      name: string;
      amount: number | null;
      notes: string;
    }>;
    notes: QuoteNotes;
    adjustments: {
      discount: number;
      taxPercent: number;
      depositPercent: number;
    };
    totals: {
      services: number;
      materials: number;
      laborEquipment: number;
      mobilization: number;
      tax: number;
      depositRequired: number;
      grandTotal: number;
    };
  };
  siteConditions: SiteConditions;
  pricingDefaults: {
    serviceTemplates: ServiceTemplate[];
    global: Partial<ProfitInputs> | null;
  };
};

const commonMaterials = [
  "Gravel",
  "Topsoil",
  "Sod",
  "Mulch",
  "Seed",
  "Straw",
  "Fence Posts",
  "Fence Wire/Panels",
  "Concrete",
  "Drainage Pipe",
  "Geotextile Fabric"
];

const emptyNotes: QuoteNotes = {
  scopeOfWork: "",
  customerNotes: "",
  exclusions: "",
  paymentTerms: "",
  estimatedTimeline: ""
};

const emptySiteConditions: SiteConditions = {
  access: "",
  terrain: "",
  density: "",
  haulOff: "",
  timeline: "",
  fenceMaterial: "",
  notes: ""
};

const zoneFallbackColors: Record<string, string> = {
  Property: "#7fd957",
  Grass: "#55c861",
  Brush: "#f97316",
  Woods: "#1f7a3b",
  Fence: "#8b5cf6",
  Driveway: "#9ca3af",
  HousePad: "#c59b5d",
  Building: "#60a5fa",
  Excluded: "#ef4444",
  Custom: "#93c5fd"
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseAmount(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMeasurement(quantity: number, unit: string) {
  if (unit === "acres") return `${quantity < 1 ? formatNumber(quantity, 3) : formatNumber(quantity, 2)} acres`;
  if (unit === "sq ft") return `${Math.round(quantity).toLocaleString()} sq ft`;
  if (unit === "linear feet") return `${Math.round(quantity).toLocaleString()} linear feet`;
  return `${formatNumber(quantity, 2)} ${unit}`;
}

function mapUiStatusToDatabase(status: QuoteUiStatus): QuoteStatus {
  return status === "Approved" ? "Accepted" : status;
}

function normalizeZoneType(value: unknown): ZoneType | string {
  if (typeof value !== "string" || value.trim().length === 0) return "Custom";
  return value;
}

function normalizeQuoteCategory(properties: SavedZoneProperties) {
  if (properties.zoneType === "Brush") return "Forestry Mulching / Brush Clearing";
  if (properties.zoneType === "Grass") return "Mowing";
  if (properties.zoneType === "Fence") return "Fence Installation";
  if (properties.zoneType === "Driveway") return "Gravel Driveway";
  if (properties.zoneType === "HousePad") return "House Pad Prep";
  if (properties.zoneType === "Woods") return "Land Clearing";
  if (properties.zoneType === "Excluded") return "Non-billable";
  if (properties.quoteCategory) return String(properties.quoteCategory);
  if (properties.serviceTypeLabel) return properties.serviceTypeLabel;
  return "Custom";
}

function getFeatureMeasurements(project: ProjectRecord | null): MeasurementRow[] {
  const mapData = project?.polygon_geojson;
  if (!mapData) return [];

  const features = mapData.type === "FeatureCollection" ? mapData.features : [mapData];

  return features.map((feature, index) => {
    const properties = feature.properties ?? {};
    const zoneType = normalizeZoneType(properties.zoneType ?? properties.serviceType);
    const geometryType = properties.geometryType ?? properties.shapeType ?? (feature.geometry.type === "LineString" ? "line" : "polygon");
    const quoteCategory = normalizeQuoteCategory(properties);
    const isLinear = geometryType === "line" || feature.geometry.type === "LineString" || zoneType === "Fence";
    const isSqFt =
      !isLinear &&
      (properties.unit === "sq ft" || zoneType === "Driveway" || zoneType === "HousePad" || zoneType === "Building");
    const quantity = isLinear
      ? parseAmount(properties.lengthFt ?? properties.perimeterFeet)
      : isSqFt
        ? parseAmount(properties.areaSqFt ?? properties.squareFeet)
        : parseAmount(properties.areaAcres ?? properties.acres);
    const unit = isLinear ? "linear feet" : isSqFt ? "sq ft" : "acres";
    const sourceId = String(feature.id ?? properties.createdAt ?? `${project.id}-${index}`);
    const label =
      properties.zoneName ??
      properties.label ??
      `${typeof zoneType === "string" ? zoneType.replace("HousePad", "House Pad") : "Work"} ${index + 1}`;
    const color = properties.color ?? zoneFallbackColors[String(zoneType)] ?? zoneFallbackColors.Custom;
    const billable = zoneType !== "Excluded" && quoteCategory !== "Non-billable";

    return {
      id: `${project.id}-${sourceId}`,
      sourceId,
      label,
      serviceType: properties.serviceTypeLabel ?? quoteCategory,
      zoneType,
      geometryType: String(geometryType),
      quoteCategory,
      quantity,
      unit,
      color,
      billable,
      serviceTypeChangedAt: properties.serviceTypeChangedAt ?? null,
      previousQuoteCategory: properties.previousQuoteCategory ?? null
    };
  });
}

function loadSavedServiceTemplates() {
  if (typeof window === "undefined") return null;
  const storedTemplates = window.localStorage.getItem(serviceTemplatesStorageKey);
  if (!storedTemplates) return null;

  try {
    return mergeServiceTemplates(JSON.parse(storedTemplates) as Partial<ServiceTemplate>[]);
  } catch {
    return null;
  }
}

function loadSavedProfitInputs() {
  if (typeof window === "undefined") return null;
  const storedInputs = window.localStorage.getItem(profitInputsStorageKey);
  if (!storedInputs) return null;

  try {
    const parsed = JSON.parse(storedInputs) as Partial<ProfitInputs>;
    const numericEntries = Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
    return Object.fromEntries(numericEntries) as Partial<ProfitInputs>;
  } catch {
    return null;
  }
}

function findRateTemplate(measurement: MeasurementRow, savedTemplates: ServiceTemplate[] | null) {
  if (!savedTemplates) return null;
  const directMatch = savedTemplates.find(
    (template) =>
      template.active !== false &&
      (template.serviceName === measurement.quoteCategory || template.serviceName === measurement.serviceType)
  );

  if (directMatch) return directMatch;

  const zoneType = measurement.zoneType as ZoneType;
  return getTemplateForZone(zoneType, savedTemplates);
}

function normalizePricingUnit(unit: string) {
  if (unit === "acre") return "acres";
  if (unit === "linear ft") return "linear feet";
  return unit;
}

function createLineItemFromMeasurement(measurement: MeasurementRow, savedTemplates: ServiceTemplate[] | null): QuoteLineItem {
  const template = findRateTemplate(measurement, savedTemplates);
  const matchingTemplate = template && normalizePricingUnit(template.unitType) === measurement.unit ? template : null;
  const rate = matchingTemplate ? String(matchingTemplate.defaultUnitPrice || "") : "";
  const serviceName =
    measurement.quoteCategory === "Non-billable"
      ? measurement.serviceType
      : measurement.quoteCategory || measurement.serviceType || measurement.label;

  return {
    id: createId("line"),
    serviceName,
    description: measurement.label,
    sourceMeasurement: measurement.label,
    sourceId: measurement.sourceId,
    zoneType: String(measurement.zoneType),
    quantity: quantityToInput(measurement.quantity, measurement.unit),
    unit: measurement.unit,
    rate,
    notes: matchingTemplate?.notes ?? ""
  };
}

function quantityToInput(quantity: number, unit: string) {
  if (unit === "acres") return String(Number(quantity.toFixed(quantity < 1 ? 3 : 2)));
  if (unit === "sq ft" || unit === "linear feet") return String(Math.round(quantity));
  return String(Number(quantity.toFixed(2)));
}

function createBlankLineItem(): QuoteLineItem {
  return {
    id: createId("line"),
    serviceName: "",
    description: "",
    sourceMeasurement: "Manual item",
    sourceId: null,
    zoneType: "Custom",
    quantity: "1",
    unit: "each",
    rate: "",
    notes: ""
  };
}

function createMaterial(name = ""): MaterialItem {
  return {
    id: createId("material"),
    name,
    quantity: "",
    unit: "",
    unitCost: "",
    notes: ""
  };
}

function lineTotal(item: QuoteLineItem) {
  return parseAmount(item.quantity) * parseAmount(item.rate);
}

function materialTotal(item: MaterialItem) {
  return parseAmount(item.quantity) * parseAmount(item.unitCost);
}

function parseSavedQuotePayload(quote: QuoteRecord | null): SavedQuotePayload {
  if (!quote?.notes) return {};
  try {
    return JSON.parse(quote.notes) as SavedQuotePayload;
  } catch {
    return {};
  }
}

function uiStatusFromQuote(status: QuoteStatus): QuoteUiStatus {
  return status === "Accepted" ? "Approved" : status;
}

function appendText(current: string, suggestion: string) {
  const cleanSuggestion = suggestion.trim();
  if (!cleanSuggestion) return current;
  if (!current.trim()) return cleanSuggestion;
  return `${current.trim()}\n\n${cleanSuggestion}`;
}

function normalizeCostCategory(value: string | undefined): CostLine["category"] {
  const category = value?.toLowerCase().trim();
  if (category === "labor") return "labor";
  if (category === "equipment") return "equipment";
  if (category === "fuel" || category === "fuel surcharge") return "fuel";
  if (category === "mobilization") return "mobilization";
  if (category === "haul-off" || category === "haul off") return "haul-off";
  if (category === "disposal") return "disposal";
  if (category === "minimum" || category === "minimum job charge") return "minimum";
  return "other";
}

function getGuidedQuestionType(question: string): GuidedQuestionType | null {
  const normalized = question.toLowerCase();
  if (normalized.includes("density") || normalized.includes("brush") || normalized.includes("vegetation")) return "density";
  if (normalized.includes("haul") || normalized.includes("debris") || normalized.includes("disposal")) return "haulOff";
  if (normalized.includes("access") || normalized.includes("gate") || normalized.includes("equipment reach")) return "access";
  if (normalized.includes("fence") && normalized.includes("material")) return "fenceMaterial";
  if (normalized.includes("timeline") || normalized.includes("schedule") || normalized.includes("rush")) return "timeline";
  return null;
}

const guidedQuestionOptions: Record<GuidedQuestionType, string[]> = {
  density: ["Light", "Medium", "Heavy"],
  haulOff: ["None", "Partial", "Full"],
  access: ["Easy", "Moderate", "Difficult"],
  fenceMaterial: ["Wood", "Vinyl", "Chain Link", "Aluminum"],
  timeline: ["Flexible", "Normal", "Rush"]
};

function getProjectStatus(project: ProjectRecord | null) {
  const mapData = project?.polygon_geojson;
  if (mapData?.type === "FeatureCollection" && mapData.properties?.status) return mapData.properties.status;
  return "Estimating";
}

export function QuotesPage({
  userId,
  userEmail,
  projects,
  clients,
  savedQuotes,
  initialProjectId,
  initialMeasurementId,
  errorMessage
}: QuotesPageProps) {
  const initialProject = initialProjectId
    ? projects.find((project) => project.id === initialProjectId) ?? null
    : projects[0] ?? null;
  const initialSavedQuote = savedQuotes.find((quote) => quote.project_id === initialProject?.id) ?? null;
  const initialSavedPayload = parseSavedQuotePayload(initialSavedQuote);
  const autoAddedMeasurementRef = useRef<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject?.id ?? "");
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const availableSourceIds = useMemo(
    () => new Set(getFeatureMeasurements(selectedProject).map((measurement) => measurement.sourceId)),
    [selectedProject]
  );
  const projectClient = useMemo(
    () => clients.find((client) => client.id === selectedProject?.client_id) ?? null,
    [clients, selectedProject?.client_id]
  );
  const [selectedClientId, setSelectedClientId] = useState(projectClient?.id ?? "");
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? projectClient ?? null;
  const [quoteNumber, setQuoteNumber] = useState(() => initialSavedQuote?.quote_number ?? `Q-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
  const [status, setStatus] = useState<QuoteUiStatus>(() => initialSavedQuote ? uiStatusFromQuote(initialSavedQuote.status) : "Draft");
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(() => initialSavedPayload.lineItems ?? []);
  const [materials, setMaterials] = useState<MaterialItem[]>(() => initialSavedPayload.materials ?? []);
  const [costLines, setCostLines] = useState<CostLine[]>(() => initialSavedPayload.costLines ?? []);
  const [discount, setDiscount] = useState(() => initialSavedPayload.discount ? String(initialSavedPayload.discount) : "");
  const [taxPercent, setTaxPercent] = useState(() => initialSavedPayload.taxPercent ? String(initialSavedPayload.taxPercent) : "");
  const [depositPercent, setDepositPercent] = useState(() => initialSavedPayload.depositPercent ? String(initialSavedPayload.depositPercent) : "");
  const [notes, setNotes] = useState<QuoteNotes>(() => ({
    scopeOfWork: initialSavedPayload.scopeOfWork ?? "",
    customerNotes: initialSavedPayload.customerNotes ?? "",
    exclusions: initialSavedPayload.exclusions ?? "",
    paymentTerms: initialSavedPayload.paymentTerms ?? "",
    estimatedTimeline: initialSavedPayload.estimatedTimeline ?? ""
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(initialSavedQuote?.id ?? null);
  const [savedTemplates, setSavedTemplates] = useState<ServiceTemplate[] | null>(null);
  const [savedProfitInputs, setSavedProfitInputs] = useState<Partial<ProfitInputs> | null>(null);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [siteConditions, setSiteConditions] = useState<SiteConditions>(() => ({
    ...emptySiteConditions,
    ...(initialSavedPayload.siteConditions ?? {})
  }));
  const [aiSuggestion, setAiSuggestion] = useState<AiEstimateSuggestion | null>(null);
  const [appliedSuggestionKeys, setAppliedSuggestionKeys] = useState<Set<string>>(() => new Set());
  const [aiBuildState, setAiBuildState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiBuildMessage, setAiBuildMessage] = useState("");
  const [aiEditCommand, setAiEditCommand] = useState("");
  const [aiEditState, setAiEditState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiEditMessage, setAiEditMessage] = useState("");

  useEffect(() => {
    setSavedTemplates(loadSavedServiceTemplates());
    setSavedProfitInputs(loadSavedProfitInputs());
    setTemplatesLoaded(true);
  }, []);

  useEffect(() => {
    const clientId = selectedProject?.client_id ?? "";
    setSelectedClientId(clientId);
  }, [selectedProject?.client_id]);

  useEffect(() => {
    if (!selectedProject) return;
    const savedQuote = savedQuotes.find((quote) => quote.project_id === selectedProject.id) ?? null;
    const payload = parseSavedQuotePayload(savedQuote);
    setSavedQuoteId(savedQuote?.id ?? null);
    setQuoteNumber(savedQuote?.quote_number ?? `Q-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
    setStatus(savedQuote ? uiStatusFromQuote(savedQuote.status) : "Draft");
    setLineItems(payload.lineItems ?? []);
    setMaterials(payload.materials ?? []);
    setCostLines(payload.costLines ?? []);
    setDiscount(payload.discount ? String(payload.discount) : "");
    setTaxPercent(payload.taxPercent ? String(payload.taxPercent) : "");
    setDepositPercent(payload.depositPercent ? String(payload.depositPercent) : "");
    setNotes({
      scopeOfWork: payload.scopeOfWork ?? "",
      customerNotes: payload.customerNotes ?? "",
      exclusions: payload.exclusions ?? "",
      paymentTerms: payload.paymentTerms ?? "",
      estimatedTimeline: payload.estimatedTimeline ?? ""
    });
    setSiteConditions({ ...emptySiteConditions, ...(payload.siteConditions ?? {}) });
    setSaveState(savedQuote ? "saved" : "idle");
    setSaveMessage("");
    setAiSuggestion(null);
    setAppliedSuggestionKeys(new Set());
  }, [savedQuotes, selectedProject]);

  const availableMeasurements = useMemo(() => getFeatureMeasurements(selectedProject), [selectedProject]);
  const addedSourceIds = useMemo(() => new Set(lineItems.map((item) => item.sourceId).filter(Boolean)), [lineItems]);

  useEffect(() => {
    if (!templatesLoaded || !initialMeasurementId || autoAddedMeasurementRef.current === initialMeasurementId) return;
    const requestedMeasurement = availableMeasurements.find((measurement) => measurement.sourceId === initialMeasurementId);
    autoAddedMeasurementRef.current = initialMeasurementId;
    if (!requestedMeasurement?.billable) return;

    setLineItems((items) => {
      if (items.some((item) => item.sourceId === requestedMeasurement.sourceId)) return items;
      return [...items, createLineItemFromMeasurement(requestedMeasurement, savedTemplates)];
    });
  }, [availableMeasurements, initialMeasurementId, savedTemplates, templatesLoaded]);

  const serviceSubtotal = useMemo(() => lineItems.reduce((total, item) => total + lineTotal(item), 0), [lineItems]);
  const materialsSubtotal = useMemo(() => materials.reduce((total, item) => total + materialTotal(item), 0), [materials]);
  const laborEquipmentSubtotal = useMemo(
    () => costLines.filter((line) => line.category !== "mobilization").reduce((total, line) => total + parseAmount(line.amount), 0),
    [costLines]
  );
  const mobilization = useMemo(
    () => costLines.filter((line) => line.category === "mobilization").reduce((total, line) => total + parseAmount(line.amount), 0),
    [costLines]
  );
  const subtotalBeforeAdjustments = serviceSubtotal + materialsSubtotal + laborEquipmentSubtotal + mobilization;
  const discountAmount = parseAmount(discount);
  const taxableSubtotal = Math.max(subtotalBeforeAdjustments - discountAmount, 0);
  const taxAmount = taxableSubtotal * (parseAmount(taxPercent) / 100);
  const grandTotal = taxableSubtotal + taxAmount;
  const depositRequired = grandTotal * (parseAmount(depositPercent) / 100);
  const estimateContext = useMemo<EstimateContext>(() => {
    const selectedMeasurements = availableMeasurements
      .filter((measurement) => addedSourceIds.has(measurement.sourceId))
      .map((measurement) => ({
        sourceId: measurement.sourceId,
        label: measurement.label,
        serviceType: measurement.serviceType,
        quantity: measurement.quantity,
        unit: measurement.unit
      }));
    const measurementTotals = availableMeasurements.reduce(
      (totals, measurement) => {
        if (measurement.quantity > 0) totals.validMeasurementCount += 1;
        if (measurement.unit === "acres") {
          if (measurement.billable) totals.billableAcres += measurement.quantity;
          else totals.excludedAcres += measurement.quantity;
        }
        if (measurement.unit === "sq ft" && measurement.billable) totals.squareFeet += measurement.quantity;
        if (measurement.unit === "linear feet" && measurement.billable) totals.linearFeet += measurement.quantity;
        return totals;
      },
      {
        drawingCount: availableMeasurements.length,
        validMeasurementCount: 0,
        billableAcres: 0,
        excludedAcres: 0,
        squareFeet: 0,
        linearFeet: 0
      }
    );

    return {
      project: {
        id: selectedProject?.id ?? null,
        name: selectedProject?.project_name ?? "",
        address: selectedProject?.address ?? "",
        primaryServiceType: selectedProject?.service_type ?? "",
        status: getProjectStatus(selectedProject)
      },
      customer: selectedClient
        ? {
            id: selectedClient.id,
            name: selectedClient.name,
            company: selectedClient.company ?? "",
            email: selectedClient.email ?? "",
            phone: selectedClient.phone ?? "",
            address: selectedClient.address ?? "",
            notes: selectedClient.notes ?? ""
          }
        : selectedProject?.customer_name
          ? {
              id: null,
              name: selectedProject.customer_name,
              company: "",
              email: "",
              phone: "",
              address: selectedProject.address ?? "",
              notes: ""
            }
          : null,
      measurements: {
        available: availableMeasurements.map((measurement) => ({
          sourceId: measurement.sourceId,
          label: measurement.label,
          zoneType: String(measurement.zoneType),
          serviceType: measurement.serviceType,
          quoteCategory: measurement.quoteCategory,
          geometryType: measurement.geometryType,
          quantity: measurement.quantity,
          unit: measurement.unit,
          billable: measurement.billable
        })),
        selectedSourceIds: lineItems.map((item) => item.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId)),
        selected: selectedMeasurements,
        totals: measurementTotals
      },
      quote: {
        quoteNumber,
        status,
        lineItems: lineItems.map((item) => ({
          serviceName: item.serviceName,
          description: item.description,
          sourceMeasurementId: item.sourceId,
          sourceMeasurement: item.sourceMeasurement,
          zoneType: item.zoneType,
          quantity: parseAmount(item.quantity),
          unit: item.unit,
          rate: item.rate.trim() ? parseAmount(item.rate) : null,
          total: lineTotal(item),
          notes: item.notes
        })),
        materials: materials.map((item) => ({
          name: item.name,
          quantity: item.quantity.trim() ? parseAmount(item.quantity) : null,
          unit: item.unit,
          unitCost: item.unitCost.trim() ? parseAmount(item.unitCost) : null,
          total: materialTotal(item),
          notes: item.notes
        })),
        laborEquipment: costLines.map((item) => ({
          category: item.category,
          name: item.name,
          amount: item.amount.trim() ? parseAmount(item.amount) : null,
          notes: item.notes
        })),
        notes,
        adjustments: {
          discount: discountAmount,
          taxPercent: parseAmount(taxPercent),
          depositPercent: parseAmount(depositPercent)
        },
        totals: {
          services: serviceSubtotal,
          materials: materialsSubtotal,
          laborEquipment: laborEquipmentSubtotal,
          mobilization,
          tax: taxAmount,
          depositRequired,
          grandTotal
        }
      },
      siteConditions,
      pricingDefaults: {
        serviceTemplates: (savedTemplates ?? []).filter((template) => template.active !== false),
        global: savedProfitInputs
      }
    };
  }, [
    addedSourceIds,
    availableMeasurements,
    costLines,
    depositPercent,
    depositRequired,
    discountAmount,
    grandTotal,
    laborEquipmentSubtotal,
    lineItems,
    materials,
    materialsSubtotal,
    mobilization,
    notes,
    quoteNumber,
    savedProfitInputs,
    savedTemplates,
    selectedClient,
    selectedProject,
    serviceSubtotal,
    siteConditions,
    status,
    taxAmount,
    taxPercent
  ]);
  const completedConditionCount = [
    siteConditions.access,
    siteConditions.terrain,
    siteConditions.density,
    siteConditions.haulOff,
    siteConditions.timeline
  ].filter(Boolean).length;
  const guidedQuestions = useMemo(() => {
    if (!aiSuggestion) return [];
    const questionsByType = new Map<GuidedQuestionType, string>();
    aiSuggestion.missingQuestions.forEach((question) => {
      const type = getGuidedQuestionType(question);
      if (type && !questionsByType.has(type)) questionsByType.set(type, question);
    });
    return Array.from(questionsByType, ([type, question]) => ({ type, question }));
  }, [aiSuggestion]);
  const estimateContextReady = Boolean(
    estimateContext.project.id &&
      (estimateContext.measurements.totals.validMeasurementCount > 0 || estimateContext.quote.lineItems.length > 0)
  );
  const estimateConfidence = useMemo(() => {
    let score = 0;
    if (selectedProject) score += 15;
    if (availableMeasurements.some((measurement) => measurement.billable && measurement.quantity > 0) || lineItems.length > 0) score += 20;
    if (savedTemplates?.some((template) => template.active !== false)) score += 15;
    if (materials.some((material) => material.name.trim() && parseAmount(material.quantity) > 0)) score += 10;
    if (siteConditions.access) score += 10;
    if (siteConditions.terrain) score += 5;
    if (siteConditions.density) score += 10;
    if (siteConditions.haulOff) score += 10;
    if (siteConditions.timeline) score += 5;
    return score;
  }, [availableMeasurements, lineItems.length, materials, savedTemplates, selectedProject, siteConditions]);
  const estimateWarnings = useMemo(() => {
    const warnings: string[] = [];
    const hasPricingDefaults = Boolean(savedTemplates?.some((template) => template.active !== false));
    const hasMobilization = costLines.some(
      (line) => line.category === "mobilization" && parseAmount(line.amount) > 0
    );
    const hasFenceMeasurement = availableMeasurements.some(
      (measurement) => measurement.billable && String(measurement.zoneType) === "Fence"
    );
    const hasSmallMeasurement = availableMeasurements.some((measurement) => {
      if (!measurement.billable || measurement.quantity <= 0) return false;
      if (measurement.unit === "acres") return measurement.quantity < 0.1;
      if (measurement.unit === "sq ft") return measurement.quantity < 500;
      if (measurement.unit === "linear feet") return measurement.quantity < 50;
      return false;
    });
    const minimumCharges = (savedTemplates ?? [])
      .filter(
        (template) =>
          template.active !== false &&
          (lineItems.some((line) => line.serviceName === template.serviceName) ||
            availableMeasurements.some(
              (measurement) =>
                measurement.billable && template.billableZoneTypes.includes(measurement.zoneType as ZoneType)
            ))
      )
      .map((template) => template.minimumCharge)
      .filter((value) => Number.isFinite(value) && value > 0);
    const applicableMinimum = minimumCharges.length > 0 ? Math.min(...minimumCharges) : 0;

    if (!selectedProject) warnings.push("Select a project to anchor the estimate.");
    if (!availableMeasurements.some((measurement) => measurement.billable && measurement.quantity > 0) && lineItems.length === 0) {
      warnings.push("Add a measurement or manual service line.");
    }
    if (!hasPricingDefaults) warnings.push("No pricing default found; verify each rate.");
    if (!siteConditions.haulOff) warnings.push("Haul-off is not confirmed.");
    if (hasFenceMeasurement && !siteConditions.fenceMaterial) warnings.push("Fence material is not selected.");
    if (!hasMobilization) warnings.push("No mobilization cost is included.");
    if (grandTotal > 0 && applicableMinimum > 0 && grandTotal < applicableMinimum) {
      warnings.push("Quote is below the saved minimum job charge.");
    }
    if (hasSmallMeasurement) warnings.push("A small measurement may need a profitable minimum.");

    return warnings;
  }, [
    availableMeasurements,
    costLines,
    grandTotal,
    lineItems,
    savedTemplates,
    selectedProject,
    siteConditions.fenceMaterial,
    siteConditions.haulOff
  ]);

  function updateLineItem(id: string, patch: Partial<QuoteLineItem>) {
    setLineItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSaveState("idle");
  }

  function updateMaterial(id: string, patch: Partial<MaterialItem>) {
    setMaterials((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSaveState("idle");
  }

  function updateCostLine(id: string, patch: Partial<CostLine>) {
    setCostLines((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSaveState("idle");
  }

  function updateSiteCondition<Key extends keyof SiteConditions>(key: Key, value: SiteConditions[Key]) {
    setSiteConditions((conditions) => ({ ...conditions, [key]: value }));
    markQuoteUnsaved();
  }

  function duplicateLineItem(item: QuoteLineItem) {
    setLineItems((items) => [...items, { ...item, id: createId("line") }]);
    setSaveState("idle");
  }

  function updateLineFromMeasurement(measurement: MeasurementRow) {
    const replacement = createLineItemFromMeasurement(measurement, savedTemplates);
    setLineItems((items) =>
      items.map((item) =>
        item.sourceId === measurement.sourceId
          ? {
              ...item,
              serviceName: replacement.serviceName,
              description: measurement.label,
              zoneType: String(measurement.zoneType),
              quantity: replacement.quantity,
              unit: replacement.unit,
              rate: replacement.rate,
              notes: replacement.notes
            }
          : item
      )
    );
    markQuoteUnsaved();
  }

  function markQuoteUnsaved() {
    setSaveState("idle");
    setSaveMessage("");
  }

  function updateAiSuggestion(suggestion: AiEstimateSuggestion) {
    setAiSuggestion(suggestion);
    markQuoteUnsaved();
  }

  function answerGuidedQuestion(type: GuidedQuestionType, question: string, answer: string) {
    updateSiteCondition(type, answer as SiteConditions[GuidedQuestionType]);
    setAiSuggestion((current) => {
      if (!current) return current;
      return {
        ...current,
        missingQuestions: current.missingQuestions.filter((item) => item !== question),
        confidenceScore:
          typeof current.confidenceScore === "number" ? Math.min(100, current.confidenceScore + 5) : current.confidenceScore
      };
    });
    setAiBuildState("idle");
    setAiBuildMessage("Context updated. Build Estimate again when you want refreshed recommendations.");
  }

  async function buildEstimate() {
    if (!estimateContextReady || aiBuildState === "loading") return;

    setAiBuildState("loading");
    setAiBuildMessage("AcreX is analyzing the current quote context.");

    try {
      const response = await fetch("/api/quote-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estimateContext)
      });
      const data = (await response.json()) as { error?: string; suggestion?: AiEstimateSuggestion };

      if (!response.ok || !data.suggestion) {
        setAiBuildState("error");
        setAiBuildMessage(data.error || "AI Estimator could not build suggestions. Your quote was not changed.");
        return;
      }

      setAiSuggestion(data.suggestion);
      setAppliedSuggestionKeys(new Set());
      setAiBuildState("success");
      setAiBuildMessage("Estimate suggestions are ready for review. Nothing was applied automatically.");
      markQuoteUnsaved();
    } catch {
      setAiBuildState("error");
      setAiBuildMessage("AI Estimator could not connect. Manual quoting is still available.");
    }
  }

  async function proposeAiChanges() {
    const command = aiEditCommand.trim();
    if (!aiSuggestion || !command || aiEditState === "loading") return;

    setAiEditState("loading");
    setAiEditMessage("AcreX is reviewing the requested change.");

    try {
      const response = await fetch("/api/quote-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...estimateContext,
          editCommand: command,
          currentSuggestion: aiSuggestion
        })
      });
      const data = (await response.json()) as { error?: string; suggestion?: AiEstimateSuggestion };

      if (!response.ok || !data.suggestion) {
        setAiEditState("error");
        setAiEditMessage(data.error || "AcreX could not propose that change. Your quote was not changed.");
        return;
      }

      setAiSuggestion(data.suggestion);
      setAppliedSuggestionKeys(new Set());
      setAiEditCommand("");
      setAiEditState("success");
      setAiEditMessage("Proposed changes are ready for review. Nothing was applied automatically.");
      markQuoteUnsaved();
    } catch {
      setAiEditState("error");
      setAiEditMessage("AcreX could not connect. Your quote and current suggestions were preserved.");
    }
  }

  function markSuggestionApplied(key: string) {
    setAppliedSuggestionKeys((keys) => {
      const nextKeys = new Set(keys);
      nextKeys.add(key);
      return nextKeys;
    });
    setSaveState("idle");
  }

  function applySuggestedLineItem(item: AiSuggestedLineItem, key: string) {
    setLineItems((items) => [
      ...items,
      {
        id: createId("line"),
        serviceName: item.serviceName,
        description: item.description ?? item.explanation ?? "",
        sourceMeasurement: item.sourceMeasurement ?? "AI suggestion",
        sourceId: item.sourceMeasurementId ?? null,
        zoneType: item.zoneType ?? "Custom",
        quantity: String(item.quantity),
        unit: item.unit,
        rate: typeof item.recommendedRate === "number" ? String(item.recommendedRate) : "",
        notes: item.notes ?? item.explanation ?? ""
      }
    ]);
    markSuggestionApplied(key);
  }

  function applySuggestedMaterial(item: AiSuggestedMaterial, key: string) {
    setMaterials((items) => [
      ...items,
      {
        id: createId("material"),
        name: item.name,
        quantity: typeof item.quantity === "number" ? String(item.quantity) : "",
        unit: item.unit ?? "",
        unitCost: "",
        notes: item.notes ?? ""
      }
    ]);
    markSuggestionApplied(key);
  }

  function applySuggestedCost(item: AiSuggestedCost, key: string) {
    setCostLines((items) => [
      ...items,
      {
        id: createId("cost"),
        category: normalizeCostCategory(item.category),
        name: item.name,
        amount: typeof item.amount === "number" ? String(item.amount) : "",
        notes: item.notes ?? item.explanation ?? ""
      }
    ]);
    markSuggestionApplied(key);
  }

  function applySuggestedText(field: "scope" | "exclusions" | "terms", value: string, key: string) {
    setNotes((current) => {
      if (field === "scope") return { ...current, scopeOfWork: appendText(current.scopeOfWork, value) };
      if (field === "exclusions") return { ...current, exclusions: appendText(current.exclusions, value) };
      return { ...current, paymentTerms: appendText(current.paymentTerms, value) };
    });
    markSuggestionApplied(key);
  }

  function addMeasurementToQuote(measurement: MeasurementRow) {
    if (!measurement.billable || addedSourceIds.has(measurement.sourceId)) return;
    setLineItems((items) => [...items, createLineItemFromMeasurement(measurement, savedTemplates)]);
    setSaveState("idle");
  }

  async function saveQuote() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSaveState("error");
      setSaveMessage("Supabase is not configured. Quote changes are still editable locally.");
      return;
    }

    setSaveState("saving");
    setSaveMessage("");

    const quoteNotesPayload = {
      ...notes,
      quoteStatus: status,
      project: {
        id: selectedProject?.id ?? null,
        name: selectedProject?.project_name ?? "",
        address: selectedProject?.address ?? ""
      },
      customer: selectedClient
        ? {
            id: selectedClient.id,
            name: selectedClient.name,
            company: selectedClient.company ?? "",
            email: selectedClient.email ?? "",
            phone: selectedClient.phone ?? ""
          }
        : null,
      measurementsUsed: estimateContext.measurements.selected,
      measurementSourceIds: estimateContext.measurements.selectedSourceIds,
      lineItems,
      materials,
      costLines,
      siteConditions,
      discount: discountAmount,
      taxPercent: parseAmount(taxPercent),
      depositPercent: parseAmount(depositPercent),
      depositRequired,
      materialsSubtotal,
      laborEquipmentSubtotal,
      mobilization,
      totals: estimateContext.quote.totals,
      aiReview: aiSuggestion
        ? {
            projectVision: aiSuggestion.projectVision ?? "",
            pricingAssumptions: aiSuggestion.pricingAssumptions,
            warnings: aiSuggestion.warnings,
            confidenceScore: aiSuggestion.confidenceScore ?? null
          }
        : null
    };

    const quotePayload = {
      user_id: userId,
      project_id: selectedProject?.id ?? null,
      client_id: selectedClient?.id ?? null,
      quote_number: quoteNumber,
      status: mapUiStatusToDatabase(status),
      project_name: selectedProject?.project_name ?? "",
      client_name: selectedClient?.name ?? selectedProject?.customer_name ?? "",
      address: selectedProject?.address ?? selectedClient?.address ?? "",
      subtotal: serviceSubtotal,
      total: grandTotal,
      notes: JSON.stringify(quoteNotesPayload)
    };
    const quoteResult = savedQuoteId
      ? await supabase.from("quotes").update(quotePayload).eq("id", savedQuoteId).eq("user_id", userId).select("*").single()
      : await supabase.from("quotes").insert(quotePayload).select("*").single();
    const quote = quoteResult.data;

    if (quoteResult.error || !quote) {
      setSaveState("error");
      setSaveMessage(quoteResult.error?.message ?? "Quote could not be saved.");
      return;
    }

    const quoteItemPayload = lineItems.map((item, index) => ({
      quote_id: quote.id,
      user_id: userId,
      service: item.serviceName || "Custom",
      description: item.description,
      quantity: parseAmount(item.quantity),
      unit: item.unit,
      unit_price: parseAmount(item.rate),
      total: lineTotal(item),
      zone_name: item.sourceMeasurement,
      zone_type: item.zoneType,
      notes: item.notes,
      sort_order: index
    }));
    const { data: previousItems, error: previousItemsError } = savedQuoteId
      ? await supabase.from("quote_items").select("*").eq("quote_id", quote.id).eq("user_id", userId)
      : { data: [], error: null };

    if (previousItemsError) {
      setSaveState("error");
      setSaveMessage("Quote details could not be prepared for update. The previous saved quote was preserved.");
      return;
    }

    const { error: deleteItemsError } = await supabase
      .from("quote_items")
      .delete()
      .eq("quote_id", quote.id)
      .eq("user_id", userId);

    if (deleteItemsError) {
      if (!savedQuoteId) await supabase.from("quotes").delete().eq("id", quote.id).eq("user_id", userId);
      setSaveState("error");
      setSaveMessage("Quote line items could not be updated. The quote was not finalized.");
      return;
    }

    if (quoteItemPayload.length > 0) {
      const { error: itemsError } = await supabase.from("quote_items").insert(quoteItemPayload);

      if (itemsError) {
        if (savedQuoteId && previousItems?.length) {
          await supabase.from("quote_items").insert(
            previousItems.map((item) => ({
              quote_id: item.quote_id,
              user_id: item.user_id,
              service: item.service,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              total: item.total,
              zone_name: item.zone_name,
              zone_type: item.zone_type,
              notes: item.notes,
              sort_order: item.sort_order
            }))
          );
        } else if (!savedQuoteId) {
          await supabase.from("quotes").delete().eq("id", quote.id).eq("user_id", userId);
        }
        setSaveState("error");
        setSaveMessage("Quote line items could not be saved. Previous saved items were preserved when available.");
        return;
      }
    }

    setSavedQuoteId(quote.id);
    setSaveState("saved");
    setSaveMessage(selectedProject ? "Quote saved to project." : "Quote saved.");
  }

  return (
    <main className="quotes-page">
      <aside className="projects-sidebar">
        <AppSidebar active="quotes" ariaLabel="Quote navigation" />
      </aside>

      <section className="quotes-workspace">
        <header className="projects-header quote-workspace-header">
          <div>
            <span>Quote Workspace</span>
            <h1>Build a contractor quote</h1>
            <p>Pull project measurements into editable service, material, labor, equipment, and cost lines.</p>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        {errorMessage ? <p className="projects-error">{errorMessage}</p> : null}
        {saveMessage ? <p className={saveState === "error" ? "projects-error" : "projects-success"}>{saveMessage}</p> : null}

        <section className="quote-workspace-grid">
          <div className="quote-workspace-main">
            <section className="quote-builder-card quote-header-card" aria-label="Quote header">
              <div className="quote-card-heading">
                <div>
                  <span>Quote Header</span>
                  <strong>Project and customer details</strong>
                </div>
                <span className={`quote-save-state quote-save-state-${saveState}`}>
                  {saveState === "saving"
                    ? "Saving"
                    : saveState === "saved"
                      ? "Saved"
                      : saveState === "error"
                        ? "Save needs attention"
                        : "Unsaved draft"}
                </span>
              </div>

              <div className="quote-setup-grid">
                <label>
                  Quote name / number
                  <input
                    value={quoteNumber}
                    onChange={(event) => {
                      setQuoteNumber(event.target.value);
                      markQuoteUnsaved();
                    }}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value as QuoteUiStatus);
                      markQuoteUnsaved();
                    }}
                  >
                    <option>Draft</option>
                    <option>Sent</option>
                    <option>Approved</option>
                    <option>Declined</option>
                  </select>
                </label>
                <label>
                  Project
                  <select
                    value={selectedProjectId}
                    onChange={(event) => {
                      setSelectedProjectId(event.target.value);
                      markQuoteUnsaved();
                    }}
                  >
                    <option value="">Select a project</option>
                    {projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.project_name || project.address || "Untitled project"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Customer
                  <select
                    value={selectedClientId}
                    onChange={(event) => {
                      setSelectedClientId(event.target.value);
                      markQuoteUnsaved();
                    }}
                  >
                    <option value="">No customer selected</option>
                    {clients.map((client) => (
                      <option value={client.id} key={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="quote-pulled-data">
                <div>
                  <span>Project</span>
                  <strong>{selectedProject?.project_name || "No project selected"}</strong>
                </div>
                <div>
                  <span>Customer</span>
                  <strong>{selectedClient?.name || selectedProject?.customer_name || "Unassigned"}</strong>
                </div>
                <div>
                  <span>Property Address</span>
                  <strong>{selectedProject?.address || selectedClient?.address || "No address yet"}</strong>
                </div>
              </div>
            </section>

            <section className="quote-ai-workspace" aria-label="AI estimator">
              <div className="quote-ai-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="quote-ai-heading">
                <div className="quote-ai-mark" aria-hidden="true">A</div>
                <div>
                  <span>AI Estimator</span>
                  <strong>Turn project context into a reviewed estimate</strong>
                  <p>
                    AcreX will analyze measurements, services, site conditions, materials, and pricing defaults while
                    keeping every suggestion under your control.
                  </p>
                </div>
                <span className="quote-ai-status">Context builder ready</span>
              </div>

              <div className="quote-ai-context">
                <span className={selectedProject ? "ready" : ""}>
                  <strong>{selectedProject ? "Project connected" : "Project needed"}</strong>
                  {selectedProject?.address || "Select a saved project"}
                </span>
                <span className={availableMeasurements.length > 0 ? "ready" : ""}>
                  <strong>{availableMeasurements.length} measurements</strong>
                  {availableMeasurements.length > 0 ? "Ready for estimate context" : "Draw work areas on the map"}
                </span>
                <span className={savedTemplates ? "ready" : ""}>
                  <strong>{savedTemplates ? "Pricing defaults found" : "Pricing defaults optional"}</strong>
                  {savedTemplates ? "Saved settings will be included" : "Rates can remain blank"}
                </span>
              </div>

              <div className="quote-ai-conditions">
                <div className="quote-ai-section-heading">
                  <div>
                    <span>Job Conditions</span>
                    <strong>Confirm what changes production and price</strong>
                  </div>
                  <small>{completedConditionCount}/5 confirmed</small>
                </div>
                <div className="quote-condition-grid">
                  <label>
                    Access
                    <select
                      name="access"
                      value={siteConditions.access}
                      onChange={(event) => updateSiteCondition("access", event.target.value as SiteConditions["access"])}
                    >
                      <option value="">Not confirmed</option>
                      <option>Easy</option>
                      <option>Moderate</option>
                      <option>Difficult</option>
                    </select>
                  </label>
                  <label>
                    Terrain
                    <select
                      name="terrain"
                      value={siteConditions.terrain}
                      onChange={(event) => updateSiteCondition("terrain", event.target.value as SiteConditions["terrain"])}
                    >
                      <option value="">Not confirmed</option>
                      <option>Flat</option>
                      <option>Sloped</option>
                      <option>Rough</option>
                    </select>
                  </label>
                  <label>
                    Density
                    <select
                      name="density"
                      value={siteConditions.density}
                      onChange={(event) => updateSiteCondition("density", event.target.value as SiteConditions["density"])}
                    >
                      <option value="">Not confirmed</option>
                      <option>Light</option>
                      <option>Medium</option>
                      <option>Heavy</option>
                    </select>
                  </label>
                  <label>
                    Haul-off
                    <select
                      name="haulOff"
                      value={siteConditions.haulOff}
                      onChange={(event) => updateSiteCondition("haulOff", event.target.value as SiteConditions["haulOff"])}
                    >
                      <option value="">Not confirmed</option>
                      <option>None</option>
                      <option>Partial</option>
                      <option>Full</option>
                    </select>
                  </label>
                  <label>
                    Timeline
                    <select
                      name="timeline"
                      value={siteConditions.timeline}
                      onChange={(event) => updateSiteCondition("timeline", event.target.value as SiteConditions["timeline"])}
                    >
                      <option value="">Not confirmed</option>
                      <option>Flexible</option>
                      <option>Normal</option>
                      <option>Rush</option>
                    </select>
                  </label>
                </div>
                <label className="quote-condition-notes">
                  Site notes
                  <textarea
                    name="siteNotes"
                    value={siteConditions.notes}
                    placeholder="Utilities, gates, slope, debris destination, material requirements, or other estimating context."
                    onChange={(event) => updateSiteCondition("notes", event.target.value)}
                  />
                </label>
                {guidedQuestions.length > 0 ? (
                  <div className="quote-guided-questions">
                    <div className="quote-ai-section-heading">
                      <div>
                        <span>AI Follow-up</span>
                        <strong>Answer the remaining estimate questions</strong>
                      </div>
                      <small>{guidedQuestions.length} remaining</small>
                    </div>
                    <div className="quote-guided-question-list">
                      {guidedQuestions.map(({ type, question }) => (
                        <div className="quote-guided-question" key={type}>
                          <p>{question}</p>
                          <div>
                            {guidedQuestionOptions[type].map((option) => (
                              <button
                                type="button"
                                key={option}
                                onClick={() => answerGuidedQuestion(type, question, option)}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="quote-ai-composer">
                <div>
                  <strong>{estimateContextReady ? "Estimate context assembled" : "Complete the estimate context"}</strong>
                  <p>
                    {estimateContextReady
                      ? `${estimateContext.measurements.totals.validMeasurementCount} measurements, ${estimateContext.quote.lineItems.length} current lines, and ${completedConditionCount} confirmed job conditions are ready.`
                      : "Select a project and add a valid measurement or manual service line before building an estimate."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={buildEstimate}
                  disabled={!estimateContextReady || aiBuildState === "loading"}
                  title={estimateContextReady ? "Build AI estimate suggestions" : "Select a project and add measured or manual work first"}
                >
                  {aiBuildState === "loading" ? "Building Estimate..." : "Build Estimate"}
                </button>
              </div>

              {aiBuildMessage ? (
                <p className={`quote-ai-build-message ${aiBuildState}`} role={aiBuildState === "error" ? "alert" : "status"}>
                  {aiBuildMessage}
                </p>
              ) : null}

              <div className="quote-ai-edit-command">
                <label htmlFor="ai-edit-command">Tell AcreX what to change…</label>
                <div>
                  <input
                    id="ai-edit-command"
                    value={aiEditCommand}
                    placeholder="Remove haul-off, make fence vinyl, add mobilization…"
                    disabled={!aiSuggestion || aiEditState === "loading"}
                    onChange={(event) => {
                      setAiEditCommand(event.target.value);
                      setAiEditState("idle");
                      setAiEditMessage("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void proposeAiChanges();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={proposeAiChanges}
                    disabled={!aiSuggestion || !aiEditCommand.trim() || aiEditState === "loading"}
                  >
                    {aiEditState === "loading" ? "Reviewing..." : "Propose Changes"}
                  </button>
                </div>
                {!aiSuggestion ? <small>Build an estimate before requesting changes.</small> : null}
              </div>

              {aiEditMessage ? (
                <p className={`quote-ai-build-message ${aiEditState}`} role={aiEditState === "error" ? "alert" : "status"}>
                  {aiEditMessage}
                </p>
              ) : null}

              <AiEstimateReview
                suggestion={aiSuggestion}
                appliedKeys={appliedSuggestionKeys}
                onChange={updateAiSuggestion}
                onApplyLineItem={applySuggestedLineItem}
                onApplyMaterial={applySuggestedMaterial}
                onApplyCost={applySuggestedCost}
                onApplyText={applySuggestedText}
                onClear={() => {
                  setAiSuggestion(null);
                  setAppliedSuggestionKeys(new Set());
                  markQuoteUnsaved();
                }}
              />
            </section>

            <section className="quote-builder-card" aria-label="Available measurements">
              <div className="quote-card-heading">
                <div>
                  <span>Available Measurements</span>
                  <strong>Choose what belongs on this quote</strong>
                </div>
              </div>

              <div className="available-measurements-list">
                {availableMeasurements.length > 0 ? (
                  availableMeasurements.map((measurement) => {
                    const isAdded = addedSourceIds.has(measurement.sourceId);
                    const existingLine = lineItems.find((item) => item.sourceId === measurement.sourceId);
                    const pricingTemplate = findRateTemplate(measurement, savedTemplates);
                    const hasPricingDefault =
                      Boolean(pricingTemplate) &&
                      normalizePricingUnit(pricingTemplate?.unitType ?? "") === measurement.unit &&
                      Number(pricingTemplate?.defaultUnitPrice ?? 0) > 0;
                    const serviceChanged =
                      Boolean(existingLine && measurement.serviceTypeChangedAt) &&
                      existingLine?.serviceName !== measurement.quoteCategory;
                    return (
                      <div className={`available-measurement-row quote-measurement-row${serviceChanged ? " service-changed" : ""}`} key={measurement.id}>
                        <i style={{ background: measurement.color }} aria-hidden="true" />
                        <span>
                          <strong>{measurement.label}</strong>
                          <small>
                            {measurement.serviceType} · {formatMeasurement(measurement.quantity, measurement.unit)}
                          </small>
                          {serviceChanged ? (
                            <small className="measurement-change-warning">
                              Service changed from {measurement.previousQuoteCategory || "the prior category"}. Review the quote line.
                            </small>
                          ) : !hasPricingDefault && measurement.billable ? (
                            <small className="measurement-pricing-warning">No pricing default configured</small>
                          ) : null}
                        </span>
                        {serviceChanged ? (
                          <button type="button" onClick={() => updateLineFromMeasurement(measurement)}>Update Quote Line</button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addMeasurementToQuote(measurement)}
                            disabled={!measurement.billable || isAdded}
                          >
                            {!measurement.billable ? "Non-billable" : isAdded ? "Added" : "Add to Quote"}
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="quote-empty-state">No project measurements yet. Open the map, draw work areas, then return to build a quote.</p>
                )}
              </div>
            </section>

            <section className="quote-items-card" aria-label="Quote line items">
              <div className="quote-card-heading">
                <div>
                  <span>Quote Line Items</span>
                  <strong>Editable service lines</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLineItems((items) => [...items, createBlankLineItem()]);
                    setSaveState("idle");
                  }}
                >
                  Add Service Line
                </button>
              </div>

              <div className="quote-items-table quote-editor-table">
                <div className="quote-editor-header quote-editor-line-grid">
                  <span>Service</span>
                  <span>Description</span>
                  <span>Source</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span>Rate</span>
                  <span>Total</span>
                  <span>Notes</span>
                  <span>Actions</span>
                </div>
                {lineItems.length > 0 ? (
                  lineItems.map((item) => (
                    <div className="quote-editor-row quote-editor-line-grid" key={item.id}>
                      <input aria-label="Service name" value={item.serviceName} onChange={(event) => updateLineItem(item.id, { serviceName: event.target.value })} />
                      <input aria-label="Description" value={item.description} onChange={(event) => updateLineItem(item.id, { description: event.target.value })} />
                      <span className={`quote-source-measurement${item.sourceId && !availableSourceIds.has(item.sourceId) ? " is-deleted" : ""}`}>
                        {item.sourceMeasurement}
                        {item.sourceId && !availableSourceIds.has(item.sourceId) ? " · Drawing deleted" : ""}
                      </span>
                      <input aria-label="Quantity" value={item.quantity} inputMode="decimal" onChange={(event) => updateLineItem(item.id, { quantity: event.target.value })} />
                      <input aria-label="Unit" value={item.unit} onChange={(event) => updateLineItem(item.id, { unit: event.target.value })} />
                      <input aria-label="Rate" value={item.rate} inputMode="decimal" placeholder="0.00" onChange={(event) => updateLineItem(item.id, { rate: event.target.value })} />
                      <strong className="quote-line-total">{formatCurrency(lineTotal(item))}</strong>
                      <input aria-label="Line item notes" value={item.notes} onChange={(event) => updateLineItem(item.id, { notes: event.target.value })} />
                      <div className="quote-editor-actions">
                        <button type="button" className="duplicate" onClick={() => duplicateLineItem(item)}>Duplicate</button>
                        <button
                          type="button"
                          onClick={() => {
                            setLineItems((items) => items.filter((line) => line.id !== item.id));
                            setSaveState("idle");
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="quote-empty-state">Add measurements or ask AI to generate a quote.</p>
                )}
              </div>
            </section>

            <section className="quote-items-card" aria-label="Materials">
              <div className="quote-card-heading">
                <div>
                  <span>Materials</span>
                  <strong>Editable material list</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMaterials((items) => [...items, createMaterial()]);
                    setSaveState("idle");
                  }}
                >
                  Add Material
                </button>
              </div>
              <div className="quote-custom-presets">
                {commonMaterials.map((material) => (
                  <button
                    type="button"
                    key={material}
                    onClick={() => {
                      setMaterials((items) => [...items, createMaterial(material)]);
                      setSaveState("idle");
                    }}
                  >
                    {material}
                  </button>
                ))}
              </div>
              <div className="quote-items-table quote-editor-table">
                <div className="quote-editor-header quote-editor-material-grid">
                  <span>Material</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span>Unit Cost</span>
                  <span>Total</span>
                  <span>Notes</span>
                  <span>Action</span>
                </div>
                {materials.length > 0 ? (
                  materials.map((item) => (
                    <div className="quote-editor-row quote-editor-material-grid" key={item.id}>
                      <input aria-label="Material name" value={item.name} onChange={(event) => updateMaterial(item.id, { name: event.target.value })} />
                      <input aria-label="Material quantity" value={item.quantity} inputMode="decimal" onChange={(event) => updateMaterial(item.id, { quantity: event.target.value })} />
                      <input aria-label="Material unit" value={item.unit} onChange={(event) => updateMaterial(item.id, { unit: event.target.value })} />
                      <input aria-label="Material unit cost" value={item.unitCost} inputMode="decimal" placeholder="0.00" onChange={(event) => updateMaterial(item.id, { unitCost: event.target.value })} />
                      <strong className="quote-line-total">{formatCurrency(materialTotal(item))}</strong>
                      <input aria-label="Material notes" value={item.notes} onChange={(event) => updateMaterial(item.id, { notes: event.target.value })} />
                      <button type="button" onClick={() => {
                        setMaterials((items) => items.filter((material) => material.id !== item.id));
                        setSaveState("idle");
                      }}>
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="quote-empty-state">No materials added yet. Add only the material costs this job needs.</p>
                )}
              </div>
            </section>

            <section className="quote-items-card" aria-label="Labor equipment and other costs">
              <div className="quote-card-heading">
                <div>
                  <span>Labor / Equipment / Other Costs</span>
                  <strong>Editable job cost lines</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCostLines((items) => [...items, { id: createId("cost"), category: "other", name: "", amount: "", notes: "" }]);
                    setSaveState("idle");
                  }}
                >
                  Add Cost
                </button>
              </div>

              <div className="quote-items-table quote-editor-table">
                <div className="quote-editor-header quote-editor-cost-grid">
                  <span>Category</span>
                  <span>Name</span>
                  <span>Amount</span>
                  <span>Notes</span>
                  <span>Action</span>
                </div>
                {costLines.length > 0 ? (
                  costLines.map((item) => (
                    <div className="quote-editor-row quote-editor-cost-grid" key={item.id}>
                      <select aria-label="Cost category" value={item.category} onChange={(event) => updateCostLine(item.id, { category: event.target.value as CostLine["category"] })}>
                        <option value="labor">Labor</option>
                        <option value="equipment">Equipment</option>
                        <option value="fuel">Fuel surcharge</option>
                        <option value="mobilization">Mobilization</option>
                        <option value="haul-off">Haul-off</option>
                        <option value="disposal">Disposal</option>
                        <option value="minimum">Minimum job charge</option>
                        <option value="other">Other</option>
                      </select>
                      <input aria-label="Cost name" value={item.name} onChange={(event) => updateCostLine(item.id, { name: event.target.value })} />
                      <input aria-label="Cost amount" value={item.amount} inputMode="decimal" placeholder="0.00" onChange={(event) => updateCostLine(item.id, { amount: event.target.value })} />
                      <input aria-label="Cost notes" value={item.notes} onChange={(event) => updateCostLine(item.id, { notes: event.target.value })} />
                      <button type="button" onClick={() => {
                        setCostLines((items) => items.filter((line) => line.id !== item.id));
                        setSaveState("idle");
                      }}>
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="quote-empty-state">No labor or equipment costs added yet.</p>
                )}
              </div>
            </section>

            <section className="quote-builder-card" aria-label="Notes and terms">
              <div className="quote-card-heading">
                <div>
                  <span>Notes / Terms</span>
                  <strong>Customer-facing quote details</strong>
                </div>
              </div>
              <div className="quote-notes-grid">
                <label className="quote-notes-field">
                  Scope of work
                  <textarea value={notes.scopeOfWork} onChange={(event) => {
                    setNotes((state) => ({ ...state, scopeOfWork: event.target.value }));
                    markQuoteUnsaved();
                  }} />
                </label>
                <label className="quote-notes-field">
                  Customer notes
                  <textarea value={notes.customerNotes} onChange={(event) => {
                    setNotes((state) => ({ ...state, customerNotes: event.target.value }));
                    markQuoteUnsaved();
                  }} />
                </label>
                <label className="quote-notes-field">
                  Exclusions
                  <textarea value={notes.exclusions} onChange={(event) => {
                    setNotes((state) => ({ ...state, exclusions: event.target.value }));
                    markQuoteUnsaved();
                  }} />
                </label>
                <label className="quote-notes-field">
                  Payment terms
                  <textarea value={notes.paymentTerms} onChange={(event) => {
                    setNotes((state) => ({ ...state, paymentTerms: event.target.value }));
                    markQuoteUnsaved();
                  }} />
                </label>
                <label className="quote-notes-field">
                  Estimated timeline
                  <textarea value={notes.estimatedTimeline} onChange={(event) => {
                    setNotes((state) => ({ ...state, estimatedTimeline: event.target.value }));
                    markQuoteUnsaved();
                  }} />
                </label>
              </div>
            </section>

          </div>

          <aside className="quote-summary-card quote-pricing-summary" aria-label="Pricing summary">
            <div className="quote-summary-heading">
              <span>Pricing Summary</span>
              <strong>{formatCurrency(grandTotal)}</strong>
              <small>Live total · updates as you edit</small>
            </div>

            <div className="quote-confidence-preview">
              <div>
                <span>Estimate Confidence</span>
                <strong>{estimateConfidence}%</strong>
              </div>
              <div
                className="quote-confidence-meter"
                role="progressbar"
                aria-label="Estimate confidence"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={estimateConfidence}
              >
                <span style={{ width: `${estimateConfidence}%` }} />
              </div>
              <p>Confidence improves as measurements, pricing, materials, and job conditions are confirmed.</p>
              {estimateWarnings.length > 0 ? (
                <ul>
                  {estimateWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : (
                <p className="ready">Core estimate context is confirmed.</p>
              )}
            </div>

            <div className="quote-total-inputs">
              <label>
                Discount
                <input value={discount} inputMode="decimal" placeholder="0.00" onChange={(event) => {
                  setDiscount(event.target.value);
                  markQuoteUnsaved();
                }} />
              </label>
              <label>
                Tax %
                <input value={taxPercent} inputMode="decimal" placeholder="0" onChange={(event) => {
                  setTaxPercent(event.target.value);
                  markQuoteUnsaved();
                }} />
              </label>
              <label>
                Deposit %
                <input value={depositPercent} inputMode="decimal" placeholder="0" onChange={(event) => {
                  setDepositPercent(event.target.value);
                  markQuoteUnsaved();
                }} />
              </label>
            </div>

            <div className="quote-total-breakdown">
              <span>
                Service subtotal <strong>{formatCurrency(serviceSubtotal)}</strong>
              </span>
              <span>
                Materials subtotal <strong>{formatCurrency(materialsSubtotal)}</strong>
              </span>
              <span>
                Labor / equipment <strong>{formatCurrency(laborEquipmentSubtotal)}</strong>
              </span>
              <span>
                Mobilization <strong>{formatCurrency(mobilization)}</strong>
              </span>
              <span>
                Discount <strong>-{formatCurrency(discountAmount)}</strong>
              </span>
              <span>
                Tax <strong>{formatCurrency(taxAmount)}</strong>
              </span>
              <span>
                Deposit required <strong>{formatCurrency(depositRequired)}</strong>
              </span>
              <span>
                Grand total <strong>{formatCurrency(grandTotal)}</strong>
              </span>
            </div>

            <div className="quote-summary-actions">
              <button type="button" onClick={saveQuote} disabled={saveState === "saving"}>
                {saveState === "saving" ? "Saving..." : "Save Quote"}
              </button>
              <button type="button" className="secondary" disabled title="Quote preview is coming soon">
                Preview Quote
                <small>Coming soon</small>
              </button>
              <div className="quote-summary-action-grid">
                <button
                  type="button"
                  className="secondary"
                  disabled
                  title={saveState === "saved" ? "PDF export is coming soon" : "Save the quote before exporting"}
                >
                  Export PDF
                  <small>{saveState === "saved" ? "Coming soon" : "Requires saved quote"}</small>
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled
                  title={saveState === "saved" ? "Customer sending is coming soon" : "Save the quote before sending"}
                >
                  Send to Customer
                  <small>{saveState === "saved" ? "Coming soon" : "Requires saved quote"}</small>
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled
                  title={saveState === "saved" ? "Invoice conversion is coming soon" : "Save the quote before converting"}
                >
                  Convert to Invoice
                  <small>{saveState === "saved" ? "Coming soon" : "Requires saved quote"}</small>
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled
                  title={selectedProject ? "The selected project is included when Save Quote runs" : "Select a project first"}
                >
                  Save to Project
                  <small>{selectedProject ? "Included in Save Quote" : "Select project first"}</small>
                </button>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
