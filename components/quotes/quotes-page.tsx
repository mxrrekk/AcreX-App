"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AiEstimateReview,
  type AiEstimateSuggestion,
  type AiSuggestedCost,
  type AiSuggestedLineItem,
  type AiSuggestedMaterial
} from "@/components/quotes/ai-estimate-review";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import {
  detectEstimateServices,
  essentialEstimateQuestionIds,
  estimateQuestionCatalog,
  estimateQuestionKey,
  type EstimateServiceType
} from "@/lib/ai/estimate-questions";
import {
  calculateQuoteLine,
  getTemplateForZone,
  type ProfitInputs,
  type ServiceTemplate
} from "@/lib/projects/pricing";
import {
  detectCatalogServices,
  getCatalogServiceByZoneType,
  resolveCatalogService,
  serviceMatchesCatalog,
  type ServiceCatalogEntry
} from "@/lib/services/catalog";
import {
  getUserSettingsStorageKey,
  normalizeUserSettings,
  pricingTemplatesFromSettings,
  profitInputsFromSettings,
  type AcrexUserSettings
} from "@/lib/settings/user-settings";
import type { ClientRecord, ProjectRecord, QuoteRecord, QuoteStatus, SavedZoneProperties, ZoneType } from "@/lib/projects/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cascadeDeleteQuote } from "@/lib/data/cascades";
import { publishDataChange } from "@/lib/data/sync";
import { useAcrexDataRefresh } from "@/lib/data/use-data-refresh";
import { reconcileSourceLinkedLines, sourceSnapshot, type MeasurementSource } from "@/lib/quotes/source-sync";

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
type QuoteWorkspaceTab = "estimate" | "line-items" | "materials" | "labor" | "scope" | "review";
type MobileQuotePanel = "menu" | "details" | "pricing" | null;

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
  sourceManuallyEdited?: boolean;
  sourceChangeAvailable?: boolean;
  sourceDeleted?: boolean;
  sourceSnapshot?: {
    label: string;
    serviceName: string;
    zoneType: string;
    quantity: number;
    unit: string;
  };
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
  serviceAnswers: Record<string, string>;
};
type AiRouteResponse = {
  error?: string;
  code?: string;
  suggestion?: AiEstimateSuggestion;
};

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
      selected: boolean;
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
      sourceDeleted: boolean;
      sourceChangeAvailable: boolean;
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
      fuelSurcharge: number;
      tax: number;
      depositRequired: number;
      grandTotal: number;
    };
  };
  siteConditions: SiteConditions & {
    questionGroups: Array<{
      service: EstimateServiceType;
      answers: Array<{ id: string; question: string; answer: string }>;
    }>;
    unansweredQuestions: Array<{
      service: EstimateServiceType;
      id: string;
      question: string;
      options: string[];
    }>;
  };
  pricingDefaults: {
    serviceTemplates: ServiceTemplate[];
    global: Partial<ProfitInputs> | null;
  };
};

async function readAiRouteResponse(response: Response): Promise<AiRouteResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AI Estimator] Route returned a non-JSON response.", {
        status: response.status,
        routeNotFound: response.status === 404
      });
    }
    return {
      error: response.status === 404 ? "AI service unavailable" : "Invalid AI response",
      code: response.status === 404 ? "route_not_found" : "invalid_ai_response"
    };
  }

  try {
    return (await response.json()) as AiRouteResponse;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AI Estimator] Route response JSON could not be parsed.", {
        status: response.status,
        reason: error instanceof Error ? error.message : "Unknown JSON parsing error"
      });
    }
    return { error: "Invalid AI response", code: "invalid_ai_response" };
  }
}

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
  notes: "",
  serviceAnswers: {}
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
  const catalogService = getCatalogServiceByZoneType(properties.zoneType);
  if (catalogService) return catalogService.quoteCategory;
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
    const catalogService = getCatalogServiceByZoneType(zoneType);
    const unit = catalogService?.displayUnit ??
      (geometryType === "line" || feature.geometry.type === "LineString" ? "linear feet" : "acres");
    const quantity =
      unit === "linear feet"
        ? parseAmount(properties.lengthFt ?? properties.perimeterFeet)
        : unit === "sq ft"
          ? parseAmount(properties.areaSqFt ?? properties.squareFeet)
          : parseAmount(properties.areaAcres ?? properties.acres);
    const sourceId = String(feature.id ?? properties.createdAt ?? `${project.id}-${index}`);
    const label =
      properties.zoneName ??
      properties.label ??
      `${typeof zoneType === "string" ? zoneType.replace("HousePad", "House Pad") : "Work"} ${index + 1}`;
    const color = properties.color ?? zoneFallbackColors[String(zoneType)] ?? zoneFallbackColors.Custom;
    const billable = catalogService?.billable ?? (zoneType !== "Excluded" && quoteCategory !== "Non-billable");

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

function loadSavedUserSettings(userId: string) {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(getUserSettingsStorageKey(userId));
  if (!stored) return null;
  try {
    return normalizeUserSettings(JSON.parse(stored) as Partial<AcrexUserSettings>);
  } catch {
    return null;
  }
}

function loadSavedServiceTemplates(userId: string) {
  if (typeof window === "undefined") return null;
  const userSettings = loadSavedUserSettings(userId);
  return userSettings ? pricingTemplatesFromSettings(userSettings) : null;
}

function loadSavedProfitInputs(userId: string) {
  if (typeof window === "undefined") return null;
  const userSettings = loadSavedUserSettings(userId);
  return userSettings ? profitInputsFromSettings(userSettings) : null;
}

function findRateTemplate(measurement: MeasurementRow, savedTemplates: ServiceTemplate[] | null) {
  if (!savedTemplates) return null;
  const service = getCatalogServiceByZoneType(measurement.zoneType);
  if (!service?.pricingTemplateId) return null;
  return savedTemplates.find(
    (template) => template.active !== false && template.id === service.pricingTemplateId
  ) ?? null;
}

function normalizePricingUnit(unit: string) {
  if (unit === "acre") return "acres";
  if (unit === "linear ft") return "linear feet";
  return unit;
}

function createLineItemFromMeasurement(measurement: MeasurementRow, savedTemplates: ServiceTemplate[] | null): QuoteLineItem {
  const service = getCatalogServiceByZoneType(measurement.zoneType);
  const pricing = calculateQuoteLine({
    serviceType: service?.key ?? "custom",
    quantity: measurement.quantity,
    unit: measurement.unit,
    templates: savedTemplates
  });
  const template = findRateTemplate(measurement, savedTemplates);
  const serviceName = pricing.serviceName;
  const source: MeasurementSource = {
    sourceId: measurement.sourceId,
    label: measurement.label,
    serviceName,
    zoneType: String(measurement.zoneType),
    quantity: measurement.quantity,
    unit: measurement.unit
  };

  return {
    id: createId("line"),
    serviceName,
    description: measurement.label,
    sourceMeasurement: measurement.label,
    sourceId: measurement.sourceId,
    zoneType: String(measurement.zoneType),
    quantity: quantityToInput(pricing.quantity, pricing.unit),
    unit: pricing.unit,
    rate: pricing.rate === null ? "" : String(pricing.rate),
    notes: [template?.notes ?? "", ...pricing.missingInputs].filter(Boolean).join(" "),
    sourceSnapshot: sourceSnapshot(source),
    sourceManuallyEdited: false,
    sourceChangeAvailable: false,
    sourceDeleted: false
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

const quoteWorkspaceTabs: Array<{ id: QuoteWorkspaceTab; label: string }> = [
  { id: "estimate", label: "Estimate" },
  { id: "line-items", label: "Line Items" },
  { id: "materials", label: "Materials" },
  { id: "labor", label: "Labor" },
  { id: "scope", label: "Scope" },
  { id: "review", label: "Review" }
];

function detectProjectServices(
  project: ProjectRecord | null,
  measurements: MeasurementRow[],
  lineItems: QuoteLineItem[]
) {
  const selectedSourceIds = new Set(
    lineItems
      .filter((item) => !item.sourceDeleted && item.sourceId)
      .map((item) => item.sourceId)
  );
  const selectedMeasurements = measurements.filter((measurement) => selectedSourceIds.has(measurement.sourceId));
  const manualServices = detectCatalogServices(
    lineItems
      .filter((item) => !item.sourceDeleted && !item.sourceId)
      .flatMap((item) => [item.serviceName, item.zoneType])
  );
  const measurementScope = selectedMeasurements.length
    ? selectedMeasurements
    : measurements.filter((measurement) => measurement.billable);
  const measurementServices = measurementScope
    .map((measurement) =>
      getCatalogServiceByZoneType(measurement.zoneType) ??
      resolveCatalogService(measurement.quoteCategory, measurement.serviceType)
    )
    .filter((service): service is ServiceCatalogEntry => Boolean(service?.estimateService && service.billable));
  const active = [...measurementServices, ...manualServices].filter(
    (service, index, services) =>
      service.estimateService &&
      service.billable &&
      services.findIndex((candidate) => candidate.key === service.key) === index
  );
  if (active.length) {
    return active
      .map((service) => service.estimateService)
      .filter((service): service is EstimateServiceType => Boolean(service));
  }

  return detectEstimateServices([project?.service_type]);
}

function inferServiceQuestionAnswer(
  service: EstimateServiceType,
  questionId: string,
  options: string[],
  siteConditions: SiteConditions,
  contextText: string
) {
  const legacyAnswers: Partial<Record<string, string>> = {
    "Brush Clearing / Forestry Mulching:density": siteConditions.density,
    "Brush Clearing / Forestry Mulching:haulOff": siteConditions.haulOff,
    "Brush Clearing / Forestry Mulching:equipmentAccess": siteConditions.access,
    "Fence Installation:fenceMaterial": siteConditions.fenceMaterial,
    "Fence Installation:terrainIssues": siteConditions.terrain,
    "Land Clearing:haulOff": siteConditions.haulOff
  };
  const legacyAnswer = legacyAnswers[estimateQuestionKey(service, questionId)];
  if (legacyAnswer && options.includes(legacyAnswer)) return legacyAnswer;

  const normalizedContext = contextText.toLowerCase();
  return options.find((option) => {
    const normalizedOption = option.toLowerCase();
    if (["yes", "no", "none", "not confirmed"].includes(normalizedOption)) return false;
    return normalizedContext.includes(normalizedOption);
  }) ?? "";
}

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
  const [quoteNumber, setQuoteNumber] = useState(() => initialSavedQuote?.quote_number ?? "");
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
  const [aiBuildState, setAiBuildState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiBuildMessage, setAiBuildMessage] = useState("");
  const [aiEditCommand, setAiEditCommand] = useState("");
  const [aiEditState, setAiEditState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiEditMessage, setAiEditMessage] = useState("");
  const [activeTab, setActiveTab] = useState<QuoteWorkspaceTab>("estimate");
  const [mobileQuotePanel, setMobileQuotePanel] = useState<MobileQuotePanel>(null);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [areMobileQuestionsOpen, setAreMobileQuestionsOpen] = useState(false);
  const [isDeletingQuote, setIsDeletingQuote] = useState(false);
  const handleExternalDataChange = useCallback(
    (change: { type: string }) => {
      if (change.type === "settings-saved") {
        setSavedTemplates(loadSavedServiceTemplates(userId));
        setSavedProfitInputs(loadSavedProfitInputs(userId));
        setAiSuggestion(null);
        setAiBuildState("idle");
        setAiBuildMessage("Pricing defaults changed. Build Estimate again for current suggestions.");
      }
      if (change.type === "client-saved" || change.type === "client-deleted") {
        setAiSuggestion(null);
        setAiBuildState("idle");
        setAiBuildMessage("Customer context changed. Build Estimate again for current suggestions.");
      }
    },
    [userId]
  );
  useAcrexDataRefresh(handleExternalDataChange, { refreshSameTab: true });

  useEffect(() => {
    if (!initialProjectId || initialProjectId === selectedProjectId) return;
    if (!projects.some((project) => project.id === initialProjectId)) return;
    setSelectedProjectId(initialProjectId);
  }, [initialProjectId, projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || projects.some((project) => project.id === selectedProjectId)) return;
    setSelectedProjectId(projects[0]?.id ?? "");
    setSavedQuoteId(null);
    setLineItems([]);
    setMaterials([]);
    setCostLines([]);
    setAiSuggestion(null);
    setSaveMessage("The selected project was deleted. Quote context was cleared.");
  }, [projects, selectedProjectId]);

  useEffect(() => {
    const userSettings = loadSavedUserSettings(userId);
    setSavedTemplates(loadSavedServiceTemplates(userId));
    setSavedProfitInputs(loadSavedProfitInputs(userId));
    if (!initialSavedQuote && userSettings) {
      setDepositPercent(userSettings.quoteDefaults.depositPercent ? String(userSettings.quoteDefaults.depositPercent) : "");
      setTaxPercent(userSettings.quoteDefaults.taxPercent ? String(userSettings.quoteDefaults.taxPercent) : "");
      setNotes((current) => ({
        ...current,
        customerNotes: current.customerNotes || userSettings.quoteDefaults.notes,
        paymentTerms: current.paymentTerms || userSettings.quoteDefaults.terms
      }));
    }
    setTemplatesLoaded(true);
  }, [initialSavedQuote, userId]);

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
  }, [savedQuotes, selectedProject]);

  const availableMeasurements = useMemo(() => getFeatureMeasurements(selectedProject), [selectedProject]);
  const measurementGroups = useMemo(() => {
    const groups = new Map<string, MeasurementRow[]>();
    availableMeasurements.forEach((measurement) => {
      const service = getCatalogServiceByZoneType(measurement.zoneType);
      const label = service?.quoteCategory ?? measurement.quoteCategory;
      groups.set(label, [...(groups.get(label) ?? []), measurement]);
    });
    return Array.from(groups, ([label, measurements]) => ({ label, measurements }));
  }, [availableMeasurements]);
  const addedSourceIds = useMemo(() => new Set(lineItems.map((item) => item.sourceId).filter(Boolean)), [lineItems]);
  const mismatchedLineIds = useMemo(() => {
    const measurementsById = new Map(availableMeasurements.map((measurement) => [measurement.sourceId, measurement]));
    return new Set(
      lineItems
        .filter((line) => {
          if (!line.sourceId || line.sourceDeleted) return false;
          const measurement = measurementsById.get(line.sourceId);
          const sourceService = measurement ? getCatalogServiceByZoneType(measurement.zoneType) : null;
          return Boolean(
            sourceService &&
            !serviceMatchesCatalog(sourceService, line.serviceName, line.zoneType)
          );
        })
        .map((line) => line.id)
    );
  }, [availableMeasurements, lineItems]);

  useEffect(() => {
    if (!templatesLoaded) return;
    const sources: MeasurementSource[] = availableMeasurements.map((measurement) => {
      const template = findRateTemplate(measurement, savedTemplates);
      return {
        sourceId: measurement.sourceId,
        label: measurement.label,
        serviceName: measurement.quoteCategory || measurement.serviceType,
        zoneType: String(measurement.zoneType),
        quantity: measurement.quantity,
        unit: measurement.unit,
        rate:
          template && normalizePricingUnit(template.unitType) === measurement.unit && template.defaultUnitPrice > 0
            ? template.defaultUnitPrice
            : null,
        defaultNotes: template?.notes
      };
    });
    const reconciled = reconcileSourceLinkedLines(lineItems, sources);
    if (!reconciled.changed) return;
    setLineItems(reconciled.lines);
    setSaveState("idle");
    setSaveMessage("A source drawing changed. Review the linked quote line before saving.");
    setAiSuggestion(null);
    setAiBuildState("idle");
    setAiBuildMessage("Project measurements changed. Build Estimate again for current suggestions.");
  }, [availableMeasurements, lineItems, savedTemplates, templatesLoaded]);

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
  const fuelSurchargePercent = Math.max(0, Number(savedProfitInputs?.fuelSurchargePercent ?? 0));
  const fuelSurchargeAmount = subtotalBeforeAdjustments * (fuelSurchargePercent / 100);
  const discountAmount = parseAmount(discount);
  const taxableSubtotal = Math.max(subtotalBeforeAdjustments + fuelSurchargeAmount - discountAmount, 0);
  const taxAmount = taxableSubtotal * (parseAmount(taxPercent) / 100);
  const grandTotal = taxableSubtotal + taxAmount;
  const depositRequired = grandTotal * (parseAmount(depositPercent) / 100);
  const hasQuoteContent =
    lineItems.length > 0 ||
    materials.length > 0 ||
    costLines.length > 0 ||
    Boolean(notes.scopeOfWork.trim());
  const customerEmail = selectedClient?.email?.trim() ?? "";
  const quoteEmailHref = customerEmail
    ? `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(`Quote ${quoteNumber} from AcreX`)}&body=${encodeURIComponent(
        [
          `Quote: ${quoteNumber}`,
          `Project: ${selectedProject?.project_name || "Project"}`,
          `Address: ${selectedProject?.address || "Address not provided"}`,
          `Total: ${formatCurrency(grandTotal)}`,
          "",
          notes.scopeOfWork || "Please review the attached project estimate.",
          "",
          notes.paymentTerms || ""
        ].filter(Boolean).join("\n")
      )}`
    : null;
  const detectedServices = useMemo(
    () => detectProjectServices(selectedProject, availableMeasurements, lineItems),
    [availableMeasurements, lineItems, selectedProject]
  );
  const detectedProjectType = detectedServices.length ? detectedServices.join(" + ") : "Not detected";
  const serviceQuestionGroups = useMemo(() => {
    const knownContext = [
      selectedProject?.project_name,
      selectedProject?.service_type,
      notes.scopeOfWork,
      notes.customerNotes,
      siteConditions.notes,
      ...lineItems.flatMap((item) => [item.serviceName, item.description, item.notes])
    ].filter(Boolean).join(" ");
    return detectedServices.map((service) => {
      const questions = estimateQuestionCatalog[service]
        .filter((question) => {
          if (
            service === "House Pad" &&
            question.id === "finishedDimensions" &&
            availableMeasurements.some(
              (measurement) =>
                measurement.billable &&
                (String(measurement.zoneType) === "HousePad" || String(measurement.zoneType) === "Building") &&
                measurement.quantity > 0
            )
          ) {
            return false;
          }
          return true;
        })
        .map((question) => ({
          ...question,
          answer:
            siteConditions.serviceAnswers[estimateQuestionKey(service, question.id)] ||
            inferServiceQuestionAnswer(service, question.id, question.options, siteConditions, knownContext)
        }));
      return {
        service,
        questions,
        essential: questions.filter((question) => essentialEstimateQuestionIds[service].includes(question.id)),
        optional: questions.filter((question) => !essentialEstimateQuestionIds[service].includes(question.id)),
        unanswered: questions.filter(
          (question) => essentialEstimateQuestionIds[service].includes(question.id) && !question.answer
        )
      };
    });
  }, [availableMeasurements, detectedServices, lineItems, notes, selectedProject, siteConditions]);
  const relevantQuestionCount = useMemo(
    () => serviceQuestionGroups.reduce((total, group) => total + group.essential.length, 0),
    [serviceQuestionGroups]
  );
  const unansweredRelevantQuestions = useMemo(
    () => serviceQuestionGroups.flatMap((group) =>
      group.unanswered.map((question) => ({
        service: group.service,
        id: question.id,
        question: question.label,
        options: question.options
      }))
    ),
    [serviceQuestionGroups]
  );
  const answeredRelevantQuestionCount = relevantQuestionCount - unansweredRelevantQuestions.length;
  const billableMeasurements = availableMeasurements.filter((measurement) => measurement.billable && measurement.quantity > 0);
  const measurementsWithPricingDefaults = billableMeasurements.filter((measurement) => {
    const template = findRateTemplate(measurement, savedTemplates);
    return Boolean(
      template &&
      template.active !== false &&
      normalizePricingUnit(template.unitType) === measurement.unit &&
      template.defaultUnitPrice > 0
    );
  });
  const hasPricingDefaults = billableMeasurements.length > 0
    ? measurementsWithPricingDefaults.length === billableMeasurements.length
    : Boolean(savedTemplates?.some((template) => template.active !== false && template.defaultUnitPrice > 0));
  const incompleteRateCount = lineItems.filter((item) => !item.rate.trim() || parseAmount(item.rate) <= 0).length;
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
        primaryServiceType: detectedProjectType === "Not detected" ? "" : detectedProjectType,
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
          billable: measurement.billable,
          selected: addedSourceIds.has(measurement.sourceId)
        })),
        selectedSourceIds: lineItems
          .filter((item) => !item.sourceDeleted)
          .map((item) => item.sourceId)
          .filter((sourceId): sourceId is string => Boolean(sourceId)),
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
          notes: item.notes,
          sourceDeleted: Boolean(item.sourceDeleted),
          sourceChangeAvailable: Boolean(item.sourceChangeAvailable)
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
          fuelSurcharge: fuelSurchargeAmount,
          tax: taxAmount,
          depositRequired,
          grandTotal
        }
      },
      siteConditions: {
        ...siteConditions,
        questionGroups: serviceQuestionGroups.map((group) => ({
          service: group.service,
          answers: group.essential
            .map((question) => ({
              id: question.id,
              question: question.label,
              answer: question.answer
            }))
        })),
        unansweredQuestions: unansweredRelevantQuestions
      },
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
    detectedProjectType,
    discountAmount,
    grandTotal,
    laborEquipmentSubtotal,
    lineItems,
    materials,
    materialsSubtotal,
    mobilization,
    fuelSurchargeAmount,
    notes,
    quoteNumber,
    savedProfitInputs,
    savedTemplates,
    selectedClient,
    selectedProject,
    serviceSubtotal,
    serviceQuestionGroups,
    siteConditions,
    status,
    taxAmount,
    taxPercent,
    unansweredRelevantQuestions
  ]);
  const completedConditionCount = answeredRelevantQuestionCount;
  const estimateContextReady = Boolean(
    estimateContext.project.id &&
      (estimateContext.measurements.totals.validMeasurementCount > 0 || estimateContext.quote.lineItems.length > 0)
  );
  const estimateConfidence = useMemo(() => {
    let score = 0;
    const materialsRequired = detectedServices.some((service) =>
      ["Fence Installation", "Gravel Driveway", "House Pad"].includes(service)
    );
    const materialsConfirmed = !materialsRequired || materials.some(
      (material) => material.name.trim() && parseAmount(material.quantity) > 0 && material.unit.trim()
    );
    const costsConfirmed = costLines.some(
      (line) => line.name.trim() && parseAmount(line.amount) > 0
    );
    const ratesComplete = lineItems.length > 0 && incompleteRateCount === 0;

    if (selectedProject) score += 10;
    if (detectedServices.length > 0) score += 10;
    if (billableMeasurements.length > 0 || lineItems.length > 0) score += 20;
    if (hasPricingDefaults) score += 15;
    if (ratesComplete) score += 10;
    if (materialsConfirmed) score += 5;
    if (costsConfirmed) score += 5;
    if (grandTotal > 0) score += 5;
    const questionScore = relevantQuestionCount === 0
      ? 20
      : Math.round((answeredRelevantQuestionCount / relevantQuestionCount) * 20);
    return Math.min(100, score + questionScore);
  }, [
    answeredRelevantQuestionCount,
    billableMeasurements.length,
    costLines,
    detectedServices,
    grandTotal,
    hasPricingDefaults,
    incompleteRateCount,
    lineItems.length,
    materials,
    relevantQuestionCount,
    selectedProject
  ]);
  const estimateWarnings = useMemo(() => {
    const warnings: string[] = [];
    const hasMobilization = costLines.some(
      (line) => line.category === "mobilization" && parseAmount(line.amount) > 0
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
    if (incompleteRateCount > 0) warnings.push(`${incompleteRateCount} service ${incompleteRateCount === 1 ? "rate is" : "rates are"} still blank.`);
    unansweredRelevantQuestions.slice(0, 3).forEach((item) => warnings.push(`${item.service}: ${item.question}`));
    const materialsRequired = detectedServices.some((service) =>
      ["Fence Installation", "Gravel Driveway", "House Pad"].includes(service)
    );
    if (materialsRequired && !materials.some((material) => material.name.trim() && parseAmount(material.quantity) > 0)) {
      warnings.push("Material quantities are not confirmed.");
    }
    if (!costLines.some((line) => line.name.trim() && parseAmount(line.amount) > 0)) {
      warnings.push("Labor and equipment assumptions are not confirmed.");
    }
    if (!hasMobilization) warnings.push("No mobilization cost is included.");
    if (grandTotal > 0 && applicableMinimum > 0 && grandTotal < applicableMinimum) {
      warnings.push("Quote is below the saved minimum job charge.");
    }
    if (hasSmallMeasurement) warnings.push("A small measurement may need a profitable minimum.");

    return warnings;
  }, [
    availableMeasurements,
    costLines,
    detectedServices,
    grandTotal,
    hasPricingDefaults,
    incompleteRateCount,
    lineItems,
    materials,
    savedTemplates,
    selectedProject,
    unansweredRelevantQuestions
  ]);
  const targetProfitPercent = typeof savedProfitInputs?.targetProfitPercent === "number"
    ? savedProfitInputs.targetProfitPercent
    : null;
  const targetProfitAmount = targetProfitPercent !== null
    ? Math.max(taxableSubtotal * (targetProfitPercent / 100), 0)
    : null;

  function updateLineItem(id: string, patch: Partial<QuoteLineItem>) {
    const sourceFields = ["serviceName", "description", "quantity", "unit", "rate", "notes"] as const;
    const editsSource = sourceFields.some((field) => Object.prototype.hasOwnProperty.call(patch, field));
    setLineItems((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              sourceManuallyEdited: Boolean(item.sourceId && editsSource) ? true : item.sourceManuallyEdited
            }
          : item
      )
    );
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
    setLineItems((items) => [
      ...items,
      {
        ...item,
        id: createId("line"),
        sourceId: null,
        sourceMeasurement: "Duplicated line",
        sourceSnapshot: undefined,
        sourceManuallyEdited: true,
        sourceChangeAvailable: false,
        sourceDeleted: false
      }
    ]);
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
              notes: replacement.notes,
              sourceSnapshot: replacement.sourceSnapshot,
              sourceManuallyEdited: false,
              sourceChangeAvailable: false,
              sourceDeleted: false
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

  function answerServiceQuestion(service: EstimateServiceType, questionId: string, question: string, answer: string) {
    const key = estimateQuestionKey(service, questionId);
    setSiteConditions((conditions) => ({
      ...conditions,
      serviceAnswers: {
        ...conditions.serviceAnswers,
        [key]: answer
      }
    }));
    markQuoteUnsaved();
    setAiSuggestion((current) => {
      if (!current) return current;
      return {
        ...current,
        missingQuestions: current.missingQuestions.filter(
          (item) => item.toLowerCase() !== question.toLowerCase() && !item.toLowerCase().includes(question.toLowerCase())
        ),
        confidenceScore:
          typeof current.confidenceScore === "number" ? Math.min(100, current.confidenceScore + 3) : current.confidenceScore
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
      const response = await fetch("/api/ai/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estimateContext)
      });
      const data = await readAiRouteResponse(response);

      if (!response.ok || !data.suggestion) {
        setAiBuildState("error");
        setAiBuildMessage(data.error || "AI Estimator could not build suggestions. Your quote was not changed.");
        return;
      }

      setAiSuggestion(data.suggestion);
      setAiBuildState("success");
      setAiBuildMessage("Estimate suggestions are ready for review. Nothing was applied automatically.");
      markQuoteUnsaved();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[AI Estimator] Request could not reach the AI quote route.", {
          reason: error instanceof Error ? error.message : "Unknown connection failure"
        });
      }
      setAiBuildState("error");
      setAiBuildMessage("AI service unavailable");
    }
  }

  async function proposeAiChanges() {
    const command = aiEditCommand.trim();
    if (!aiSuggestion || !command || aiEditState === "loading") return;

    setAiEditState("loading");
    setAiEditMessage("AcreX is reviewing the requested change.");

    try {
      const response = await fetch("/api/ai/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...estimateContext,
          editCommand: command,
          currentSuggestion: aiSuggestion
        })
      });
      const data = await readAiRouteResponse(response);

      if (!response.ok || !data.suggestion) {
        setAiEditState("error");
        setAiEditMessage(data.error || "AcreX could not propose that change. Your quote was not changed.");
        return;
      }

      setAiSuggestion(data.suggestion);
      setAiEditCommand("");
      setAiEditState("success");
      setAiEditMessage("Proposed changes are ready for review. Nothing was applied automatically.");
      markQuoteUnsaved();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[AI Estimator] Edit request could not reach the AI quote route.", {
          reason: error instanceof Error ? error.message : "Unknown connection failure"
        });
      }
      setAiEditState("error");
      setAiEditMessage("AI service unavailable");
    }
  }

  function removeAppliedSuggestion(key: string) {
    setAiSuggestion((current) => {
      if (!current) return current;
      if (key.startsWith("line-")) {
        const index = Number(key.replace("line-", ""));
        return { ...current, suggestedLineItems: current.suggestedLineItems.filter((_, itemIndex) => itemIndex !== index) };
      }
      if (key.startsWith("material-")) {
        const index = Number(key.replace("material-", ""));
        return { ...current, suggestedMaterials: current.suggestedMaterials.filter((_, itemIndex) => itemIndex !== index) };
      }
      if (key.startsWith("cost-")) {
        const index = Number(key.replace("cost-", ""));
        return {
          ...current,
          suggestedLaborEquipment: current.suggestedLaborEquipment.filter((_, itemIndex) => itemIndex !== index)
        };
      }
      if (key === "text-scope") return { ...current, suggestedScopeOfWork: "" };
      if (key === "text-exclusions") return { ...current, suggestedExclusions: [] };
      if (key === "text-terms") return { ...current, suggestedTerms: "" };
      return current;
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
    removeAppliedSuggestion(key);
    setActiveTab("line-items");
    setAiBuildMessage("Line item applied. Review and edit it in Line Items.");
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
    removeAppliedSuggestion(key);
    setActiveTab("materials");
    setAiBuildMessage("Material applied. Review and edit it in Materials.");
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
    removeAppliedSuggestion(key);
    setActiveTab("labor");
    setAiBuildMessage("Cost applied. Review and edit it in Labor / Equipment.");
  }

  function applySuggestedText(field: "scope" | "exclusions" | "terms", value: string, key: string) {
    setNotes((current) => {
      if (field === "scope") return { ...current, scopeOfWork: appendText(current.scopeOfWork, value) };
      if (field === "exclusions") return { ...current, exclusions: appendText(current.exclusions, value) };
      return { ...current, paymentTerms: appendText(current.paymentTerms, value) };
    });
    removeAppliedSuggestion(key);
    setActiveTab("scope");
    setAiBuildMessage("Text applied. Review and edit it in Scope / Terms.");
  }

  function addMeasurementToQuote(measurement: MeasurementRow) {
    if (!measurement.billable || addedSourceIds.has(measurement.sourceId)) return;
    setLineItems((items) => [...items, createLineItemFromMeasurement(measurement, savedTemplates)]);
    setSaveState("idle");
  }

  async function saveQuote() {
    if (!selectedProject) {
      setSaveState("error");
      setSaveMessage("Select a project before saving this quote.");
      return;
    }
    if (!quoteNumber.trim()) {
      setSaveState("error");
      setSaveMessage("Add a quote number before saving.");
      return;
    }

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
    const previousSavedQuote = savedQuoteId
      ? savedQuotes.find((savedQuote) => savedQuote.id === savedQuoteId) ?? null
      : null;
    const { data: previousItems, error: previousItemsError } = savedQuoteId
      ? await supabase.from("quote_items").select("*").eq("quote_id", savedQuoteId).eq("user_id", userId)
      : { data: [], error: null };
    if (previousItemsError || (savedQuoteId && !previousSavedQuote)) {
      setSaveState("error");
      setSaveMessage("Quote details could not be prepared for update. The previous saved quote was preserved.");
      return;
    }

    const restorePreviousQuote = async (quoteId: string) => {
      if (!previousSavedQuote) {
        await supabase.from("quotes").delete().eq("id", quoteId).eq("user_id", userId);
        return;
      }
      await supabase
        .from("quotes")
        .update({
          project_id: previousSavedQuote.project_id,
          client_id: previousSavedQuote.client_id,
          quote_number: previousSavedQuote.quote_number,
          status: previousSavedQuote.status,
          project_name: previousSavedQuote.project_name,
          client_name: previousSavedQuote.client_name,
          address: previousSavedQuote.address,
          subtotal: previousSavedQuote.subtotal,
          total: previousSavedQuote.total,
          notes: previousSavedQuote.notes
        })
        .eq("id", previousSavedQuote.id)
        .eq("user_id", userId);
    };
    const restorePreviousItems = async (quoteId: string) => {
      await supabase.from("quote_items").delete().eq("quote_id", quoteId).eq("user_id", userId);
      if (!previousItems?.length) return;
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

    const { error: deleteItemsError } = await supabase
      .from("quote_items")
      .delete()
      .eq("quote_id", quote.id)
      .eq("user_id", userId);

    if (deleteItemsError) {
      await restorePreviousQuote(quote.id);
      setSaveState("error");
      setSaveMessage("Quote line items could not be updated. The quote was not finalized.");
      return;
    }

    if (quoteItemPayload.length > 0) {
      const { error: itemsError } = await supabase.from("quote_items").insert(quoteItemPayload);

      if (itemsError) {
        await restorePreviousItems(quote.id);
        await restorePreviousQuote(quote.id);
        setSaveState("error");
        setSaveMessage("Quote line items could not be saved. Previous saved items were preserved when available.");
        return;
      }
    }

    const { error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update({
        project_id: quote.project_id,
        client_id: quote.client_id,
        client_name: quote.client_name,
        project_name: quote.project_name,
        address: quote.address,
        total: quote.total
      })
      .eq("quote_id", quote.id)
      .eq("user_id", userId)
      .eq("status", "Draft");
    if (invoiceUpdateError) {
      await restorePreviousItems(quote.id);
      await restorePreviousQuote(quote.id);
      setSaveState("error");
      setSaveMessage("Quote changes could not be synchronized to the linked draft invoice. The previous quote was restored.");
      return;
    }

    setSavedQuoteId(quote.id);
    setSaveState("saved");
    setSaveMessage(selectedProject ? "Quote saved to project." : "Quote saved.");
    publishDataChange({ type: "quote-saved", projectId: selectedProject?.id ?? null, quoteId: quote.id });
  }

  async function deleteCurrentQuote() {
    const currentSavedQuote = savedQuotes.find((quote) => quote.id === savedQuoteId) ?? null;
    if (!savedQuoteId || !currentSavedQuote || isDeletingQuote) return;
    if (!window.confirm(`Delete draft quote ${currentSavedQuote.quote_number}?`)) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSaveState("error");
      setSaveMessage("Supabase is not configured.");
      return;
    }
    setIsDeletingQuote(true);
    const result = await cascadeDeleteQuote({
      supabase,
      userId,
      quote: currentSavedQuote
    });
    setIsDeletingQuote(false);
    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      return;
    }
    const deletedId = savedQuoteId;
    setSavedQuoteId(null);
    setQuoteNumber(`Q-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
    setLineItems([]);
    setMaterials([]);
    setCostLines([]);
    setAiSuggestion(null);
    setSaveState("idle");
    setSaveMessage("Quote deleted.");
    publishDataChange({ type: "quote-deleted", projectId: selectedProject?.id ?? null, quoteId: deletedId });
  }

  return (
    <main className={`quotes-page${mobileQuotePanel ? ` mobile-quote-panel-${mobileQuotePanel}` : ""}`}>
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

        <section className="quote-mobile-toolbar" aria-label="Mobile quote workspace">
          <div>
            <span>Quote Workspace</span>
            <strong>{selectedProject?.project_name || selectedProject?.address || "New quote"}</strong>
            <small>{quoteNumber} · {status}</small>
          </div>
          <button type="button" onClick={() => setMobileQuotePanel("menu")} aria-label="Open quote tools">
            <span aria-hidden="true">•••</span>
          </button>
        </section>

        {mobileQuotePanel ? (
          <button
            type="button"
            className="quote-mobile-panel-backdrop"
            aria-label="Close quote panel"
            onClick={() => setMobileQuotePanel(null)}
          />
        ) : null}

        {mobileQuotePanel === "menu" ? (
          <section className="quote-mobile-tools-panel" role="dialog" aria-label="Quote tools">
            <header>
              <div>
                <span>Quote tools</span>
                <strong>Open only what you need</strong>
              </div>
              <button type="button" onClick={() => setMobileQuotePanel(null)} aria-label="Close quote tools">×</button>
            </header>
            <div>
              <button type="button" onClick={() => setMobileQuotePanel("details")}>Quote details <small>Project, customer, status</small></button>
              <button type="button" onClick={() => { setActiveTab("materials"); setMobileQuotePanel(null); }}>Materials <small>{materials.length} added</small></button>
              <button type="button" onClick={() => { setActiveTab("labor"); setMobileQuotePanel(null); }}>Labor & equipment <small>{costLines.length} added</small></button>
              <button type="button" onClick={() => { setActiveTab("scope"); setMobileQuotePanel(null); }}>Scope & terms <small>Notes and exclusions</small></button>
              <button type="button" onClick={() => { setActiveTab("review"); setMobileQuotePanel(null); }}>Review quote <small>Final checks</small></button>
              <button
                type="button"
                disabled={!hasQuoteContent}
                onClick={() => { setIsPreviewOpen(true); setMobileQuotePanel(null); }}
              >
                Preview & export
                <small>{hasQuoteContent ? "Customer-ready PDF view" : "Add quote content first"}</small>
              </button>
              <button type="button" onClick={() => setMobileQuotePanel("pricing")}>Pricing summary <small>{formatCurrency(grandTotal)}</small></button>
              {savedQuoteId && status === "Draft" ? (
                <button type="button" className="danger-button" onClick={() => void deleteCurrentQuote()} disabled={isDeletingQuote}>
                  {isDeletingQuote ? "Deleting quote…" : "Delete draft quote"}
                  <small>Also removes its draft invoice</small>
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="quote-workspace-grid">
          <div className="quote-workspace-main">
            <section className="quote-builder-card quote-header-card" aria-label="Quote header">
              <div className="quote-mobile-panel-heading">
                <div>
                  <span>Quote details</span>
                  <strong>Project and customer</strong>
                </div>
                <button type="button" onClick={() => setMobileQuotePanel(null)} aria-label="Close quote details">×</button>
              </div>
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
                      setAiSuggestion(null);
                      setAiBuildState("idle");
                      setAiBuildMessage("Customer context changed. Build Estimate again for current suggestions.");
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
              <div className="quote-project-summary-strip" aria-label="Selected quote context">
                <div>
                  <span>Project</span>
                  <strong>{selectedProject?.project_name || "No project selected"}</strong>
                </div>
                <div>
                  <span>Customer</span>
                  <strong>{selectedClient?.name || selectedProject?.customer_name || "No customer selected"}</strong>
                </div>
                <div>
                  <span>Address</span>
                  <strong>{selectedProject?.address || "No project address"}</strong>
                </div>
              </div>

            </section>

            <nav className="quote-mobile-primary-tabs" aria-label="Primary quote tools">
              <button
                type="button"
                className={activeTab === "estimate" ? "active" : ""}
                onClick={() => setActiveTab("estimate")}
              >
                Estimate
              </button>
              <button
                type="button"
                className={activeTab === "line-items" ? "active" : ""}
                onClick={() => setActiveTab("line-items")}
              >
                Line Items {lineItems.length > 0 ? <span>{lineItems.length}</span> : null}
              </button>
            </nav>

            {!["estimate", "line-items"].includes(activeTab) ? (
              <div className="quote-mobile-active-extra">
                <span>{quoteWorkspaceTabs.find((tab) => tab.id === activeTab)?.label}</span>
                <button type="button" onClick={() => setActiveTab("estimate")}>Done</button>
              </div>
            ) : null}

            <nav className="quote-detail-tabs" aria-label="Quote details">
              {quoteWorkspaceTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.id === "line-items" && lineItems.length > 0 ? <span>{lineItems.length}</span> : null}
                  {tab.id === "materials" && materials.length > 0 ? <span>{materials.length}</span> : null}
                  {tab.id === "labor" && costLines.length > 0 ? <span>{costLines.length}</span> : null}
                </button>
              ))}
            </nav>

            <div className="quote-tab-panel" role="tabpanel" aria-label={quoteWorkspaceTabs.find((tab) => tab.id === activeTab)?.label}>
            {activeTab === "estimate" ? (
              <>
            <section className="quote-ai-workspace quote-ai-workspace-primary" aria-label="AI estimator">
              <div className="quote-ai-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="quote-ai-heading">
                <div className="quote-ai-mark" aria-hidden="true">A</div>
                <div>
                  <span>AcreX AI Estimator</span>
                  <strong>Build a project-specific estimate from the facts already in AcreX</strong>
                  <p>
                    Measurements and your pricing defaults lead. AI organizes the job-specific breakdown and flags
                    what still needs confirmation.
                  </p>
                </div>
                <span className="quote-ai-status">{aiSuggestion ? "Suggestions ready" : "Estimator ready"}</span>
              </div>

              <div className="quote-ai-composer">
                <div>
                  <strong>{estimateContextReady ? "Estimate context assembled" : "Complete the estimate context"}</strong>
                  <p>
                    {estimateContextReady
                      ? `${estimateContext.measurements.totals.validMeasurementCount} measurements, ${estimateContext.quote.lineItems.length} current lines, and ${completedConditionCount} of ${relevantQuestionCount} relevant questions are confirmed.`
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

              <div className="quote-ai-context quote-ai-context-overview">
                <span className={detectedProjectType !== "Not detected" ? "ready" : ""}>
                  <small>Project type</small>
                  <strong>{detectedProjectType}</strong>
                  <small className="quote-ai-context-detail">{selectedProject?.address || "Select a saved project"}</small>
                </span>
                <span className={availableMeasurements.length > 0 ? "ready" : ""}>
                  <small>Measurements detected</small>
                  <strong>{availableMeasurements.length} {availableMeasurements.length === 1 ? "measurement" : "measurements"}</strong>
                  <small className="quote-ai-context-detail">
                    {estimateContext.measurements.totals.validMeasurementCount > 0
                      ? `${estimateContext.measurements.totals.validMeasurementCount} usable ${estimateContext.measurements.totals.validMeasurementCount === 1 ? "quantity" : "quantities"}`
                      : "Draw work areas on the map"}
                  </small>
                </span>
                <span className={hasPricingDefaults ? "ready" : ""}>
                  <small>Pricing defaults</small>
                  <strong>{hasPricingDefaults ? "Settings rates found" : "No pricing default set"}</strong>
                  <small className="quote-ai-context-detail">
                    {hasPricingDefaults ? "Settings rates apply to new lines" : "Existing quote rates stay unchanged"}
                  </small>
                </span>
                <span className={estimateWarnings.length === 0 ? "ready" : ""}>
                  <small>Missing information</small>
                  <strong>
                    {estimateWarnings.length === 0
                      ? "Core context complete"
                      : `${estimateWarnings.length} ${estimateWarnings.length === 1 ? "item" : "items"} to review`}
                  </strong>
                  <small className="quote-ai-context-detail">{estimateWarnings[0] || "Ready for review"}</small>
                </span>
                <span className={estimateConfidence >= 70 ? "ready" : ""}>
                  <small>Confidence score</small>
                  <strong>{estimateConfidence}%</strong>
                  <small className="quote-ai-context-detail">Improves as job conditions are confirmed</small>
                </span>
              </div>

              <div className="quote-ai-conditions">
                {relevantQuestionCount > 0 ? (
                  <button
                    type="button"
                    className="quote-mobile-question-toggle"
                    aria-expanded={areMobileQuestionsOpen}
                    onClick={() => setAreMobileQuestionsOpen((current) => !current)}
                  >
                    <span>
                      <strong>{unansweredRelevantQuestions.length ? "Review job questions" : "Job details"}</strong>
                      <small>{completedConditionCount}/{relevantQuestionCount} confirmed</small>
                    </span>
                    <i aria-hidden="true">{areMobileQuestionsOpen ? "−" : "+"}</i>
                  </button>
                ) : null}
                <div className={`quote-question-workspace${areMobileQuestionsOpen ? " is-open" : ""}`}>
                <div className="quote-ai-section-heading">
                  <div>
                    <span>Project Questions</span>
                    <strong>Only questions relevant to the detected work</strong>
                  </div>
                  <small>
                    {relevantQuestionCount
                      ? `${completedConditionCount}/${relevantQuestionCount} confirmed`
                      : "No questions needed"}
                  </small>
                </div>
                {unansweredRelevantQuestions.length > 0 ? (
                  <div className="quote-service-question-groups">
                    {serviceQuestionGroups.filter((group) => group.unanswered.length > 0).map((group) => (
                      <section className="quote-service-question-group" key={group.service}>
                        <header>
                          <strong>{group.service}</strong>
                          <small>{group.unanswered.length} unanswered</small>
                        </header>
                        <div className="quote-guided-question-list">
                          {group.unanswered.map((question) => {
                            const answerKey = estimateQuestionKey(group.service, question.id);
                            const currentAnswer = question.answer;
                            return (
                              <div className={`quote-guided-question${currentAnswer ? " answered" : ""}`} key={answerKey}>
                                <p>{question.label}</p>
                                <div>
                                  {question.options.map((option) => (
                                    <button
                                      type="button"
                                      className={currentAnswer === option ? "active" : ""}
                                      key={option}
                                      onClick={() => answerServiceQuestion(group.service, question.id, question.label, option)}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="quote-ai-empty-review">
                    <strong>{detectedServices.length ? "No follow-up questions needed" : "No project type detected yet"}</strong>
                    <p>
                      {detectedServices.length
                        ? "AcreX already has the relevant project details and can build a draft estimate."
                        : "Add a service measurement or line item so AcreX can detect the project type."}
                    </p>
                  </div>
                )}
                {serviceQuestionGroups.some((group) => group.optional.length > 0) ? (
                  <details className="quote-optional-questions">
                    <summary>Additional job details</summary>
                    <p>Optional details can improve pricing, but they are not required to build the first estimate.</p>
                    <div className="quote-service-question-groups">
                      {serviceQuestionGroups.filter((group) => group.optional.length > 0).map((group) => (
                        <section className="quote-service-question-group" key={`optional-${group.service}`}>
                          <header>
                            <strong>{group.service}</strong>
                            <small>Optional</small>
                          </header>
                          <div className="quote-guided-question-list">
                            {group.optional.map((question) => {
                              const answerKey = estimateQuestionKey(group.service, question.id);
                              const currentAnswer = question.answer;
                              return (
                                <div className={`quote-guided-question${currentAnswer ? " answered" : ""}`} key={answerKey}>
                                  <p>{question.label}</p>
                                  <div>
                                    {question.options.map((option) => (
                                      <button
                                        type="button"
                                        className={currentAnswer === option ? "active" : ""}
                                        key={option}
                                        onClick={() => answerServiceQuestion(group.service, question.id, question.label, option)}
                                      >
                                        {option}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </details>
                ) : null}
                <label className="quote-condition-notes">
                  Site notes
                  <textarea
                    name="siteNotes"
                    value={siteConditions.notes}
                    placeholder="Utilities, gates, slope, debris destination, material requirements, or other estimating context."
                    onChange={(event) => updateSiteCondition("notes", event.target.value)}
                  />
                </label>
                </div>
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
                onChange={updateAiSuggestion}
                onApplyLineItem={applySuggestedLineItem}
                onApplyMaterial={applySuggestedMaterial}
                onApplyCost={applySuggestedCost}
                onApplyText={applySuggestedText}
                onClear={() => {
                  setAiSuggestion(null);
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
                  measurementGroups.map((group) => (
                    <section className="quote-measurement-group" key={group.label}>
                      <header>
                        <strong>{group.label}</strong>
                        <span>{group.measurements.length}</span>
                      </header>
                      {group.measurements.map((measurement) => {
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
                    const sourceChanged = Boolean(existingLine?.sourceChangeAvailable);
                    return (
                      <div className={`available-measurement-row quote-measurement-row${serviceChanged || sourceChanged ? " service-changed" : ""}`} key={measurement.id}>
                        <i style={{ background: measurement.color }} aria-hidden="true" />
                        <span>
                          <strong>{measurement.label}</strong>
                          <small>
                            {measurement.serviceType} · {formatMeasurement(measurement.quantity, measurement.unit)}
                          </small>
                          {serviceChanged || sourceChanged ? (
                            <small className="measurement-change-warning">
                              {sourceChanged
                                ? "Source measurement changed. Your edited line was preserved."
                                : `Service changed from ${measurement.previousQuoteCategory || "the prior category"}. Review the quote line.`}
                            </small>
                          ) : !isAdded && !hasPricingDefault && measurement.billable ? (
                            <small className="measurement-pricing-warning">No pricing default set</small>
                          ) : null}
                        </span>
                        {serviceChanged || sourceChanged ? (
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
                      })}
                    </section>
                  ))
                ) : (
                  <p className="quote-empty-state">No project measurements yet. Open the map, draw work areas, then return to build a quote.</p>
                )}
              </div>
            </section>
              </>
            ) : null}

            {activeTab === "line-items" ? (
            <section className="quote-items-card" aria-label="Quote line items">
              <div className="quote-card-heading">
                <div>
                  <span>Quote Line Items</span>
                  <strong>Editable service lines</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextItem = createBlankLineItem();
                    setLineItems((items) => [...items, nextItem]);
                    setEditingLineItemId(nextItem.id);
                    setSaveState("idle");
                  }}
                >
                  Add Service Line
                </button>
                {mismatchedLineIds.size > 0 ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setLineItems((items) => items.filter((item) => !mismatchedLineIds.has(item.id)));
                      markQuoteUnsaved();
                    }}
                  >
                    Remove Mismatched Lines
                  </button>
                ) : null}
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
                  lineItems.map((item) => {
                    const isEditing = editingLineItemId === item.id;
                    return (
                    <div className={`quote-editor-row quote-editor-line-grid${isEditing ? " is-editing" : ""}`} key={item.id}>
                      <div className="quote-line-compact-summary">
                        <span>
                          <strong>{item.serviceName || "Untitled service"}</strong>
                          <small>{item.quantity || "0"} {item.unit || "unit"} × {item.rate ? formatCurrency(Number(item.rate)) : "No rate"}</small>
                        </span>
                        <strong>{formatCurrency(lineTotal(item))}</strong>
                        <button type="button" onClick={() => setEditingLineItemId(isEditing ? null : item.id)}>
                          {isEditing ? "Done" : "Edit"}
                        </button>
                      </div>
                      <label className="quote-mobile-field"><span>Service</span><input aria-label="Service name" value={item.serviceName} onChange={(event) => updateLineItem(item.id, { serviceName: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Description</span><input aria-label="Description" value={item.description} onChange={(event) => updateLineItem(item.id, { description: event.target.value })} /></label>
                      <span className={`quote-source-measurement${item.sourceDeleted || (item.sourceId && !availableSourceIds.has(item.sourceId)) ? " is-deleted" : ""}`}>
                        <small>Source measurement</small>
                        {item.sourceMeasurement}
                        {item.sourceDeleted || (item.sourceId && !availableSourceIds.has(item.sourceId)) ? " · Source drawing deleted" : ""}
                        {item.sourceChangeAvailable ? " · Source measurement changed — update available" : ""}
                        {mismatchedLineIds.has(item.id) ? " · Possibly mismatched service" : ""}
                      </span>
                      <label className="quote-mobile-field"><span>Quantity</span><input aria-label="Quantity" value={item.quantity} inputMode="decimal" onChange={(event) => updateLineItem(item.id, { quantity: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Unit</span><input aria-label="Unit" value={item.unit} onChange={(event) => updateLineItem(item.id, { unit: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Rate</span><input aria-label="Rate" value={item.rate} inputMode="decimal" placeholder="0.00" onChange={(event) => updateLineItem(item.id, { rate: event.target.value })} /></label>
                      <strong className="quote-line-total"><small>Total</small>{formatCurrency(lineTotal(item))}</strong>
                      <label className="quote-mobile-field"><span>Notes</span><input aria-label="Line item notes" value={item.notes} onChange={(event) => updateLineItem(item.id, { notes: event.target.value })} /></label>
                      <div className="quote-editor-actions">
                        <button type="button" className="duplicate" onClick={() => duplicateLineItem(item)}>Duplicate</button>
                        <button
                          type="button"
                          onClick={() => {
                            setLineItems((items) => items.filter((line) => line.id !== item.id));
                            setEditingLineItemId((current) => current === item.id ? null : current);
                            setSaveState("idle");
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    );
                  })
                ) : (
                  <p className="quote-empty-state">Add measurements or ask AI to generate a quote.</p>
                )}
              </div>
            </section>
            ) : null}

            {activeTab === "materials" ? (
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
                      <label className="quote-mobile-field"><span>Material</span><input aria-label="Material name" value={item.name} onChange={(event) => updateMaterial(item.id, { name: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Quantity</span><input aria-label="Material quantity" value={item.quantity} inputMode="decimal" onChange={(event) => updateMaterial(item.id, { quantity: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Unit</span><input aria-label="Material unit" value={item.unit} onChange={(event) => updateMaterial(item.id, { unit: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Unit cost</span><input aria-label="Material unit cost" value={item.unitCost} inputMode="decimal" placeholder="0.00" onChange={(event) => updateMaterial(item.id, { unitCost: event.target.value })} /></label>
                      <strong className="quote-line-total"><small>Total</small>{formatCurrency(materialTotal(item))}</strong>
                      <label className="quote-mobile-field"><span>Notes</span><input aria-label="Material notes" value={item.notes} onChange={(event) => updateMaterial(item.id, { notes: event.target.value })} /></label>
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
            ) : null}

            {activeTab === "labor" ? (
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
                      <label className="quote-mobile-field"><span>Category</span><select aria-label="Cost category" value={item.category} onChange={(event) => updateCostLine(item.id, { category: event.target.value as CostLine["category"] })}>
                        <option value="labor">Labor</option>
                        <option value="equipment">Equipment</option>
                        <option value="fuel">Fuel surcharge</option>
                        <option value="mobilization">Mobilization</option>
                        <option value="haul-off">Haul-off</option>
                        <option value="disposal">Disposal</option>
                        <option value="minimum">Minimum job charge</option>
                        <option value="other">Other</option>
                      </select></label>
                      <label className="quote-mobile-field"><span>Name</span><input aria-label="Cost name" value={item.name} onChange={(event) => updateCostLine(item.id, { name: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Amount</span><input aria-label="Cost amount" value={item.amount} inputMode="decimal" placeholder="0.00" onChange={(event) => updateCostLine(item.id, { amount: event.target.value })} /></label>
                      <label className="quote-mobile-field"><span>Notes</span><input aria-label="Cost notes" value={item.notes} onChange={(event) => updateCostLine(item.id, { notes: event.target.value })} /></label>
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
            ) : null}

            {activeTab === "scope" ? (
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
            ) : null}

            {activeTab === "review" ? (
              <section className="quote-review-workspace" aria-label="Quote review">
                <div className="quote-review-heading">
                  <div>
                    <span>Quote Review</span>
                    <strong>{selectedProject?.project_name || "Untitled quote"}</strong>
                    <p>{selectedProject?.address || "No project address selected"}</p>
                  </div>
                  <span className={`quote-save-state quote-save-state-${saveState}`}>
                    {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving" : "Unsaved draft"}
                  </span>
                </div>
                <div className="quote-review-grid">
                  <article>
                    <span>Services</span>
                    <strong>{lineItems.length}</strong>
                    <small>{formatCurrency(serviceSubtotal)}</small>
                  </article>
                  <article>
                    <span>Materials</span>
                    <strong>{materials.length}</strong>
                    <small>{formatCurrency(materialsSubtotal)}</small>
                  </article>
                  <article>
                    <span>Labor / Equipment</span>
                    <strong>{costLines.length}</strong>
                    <small>{formatCurrency(laborEquipmentSubtotal + mobilization)}</small>
                  </article>
                  <article>
                    <span>Estimate confidence</span>
                    <strong>{estimateConfidence}%</strong>
                    <small>{estimateWarnings.length} warnings</small>
                  </article>
                </div>
                <div className="quote-review-sections">
                  <article>
                    <strong>Scope of work</strong>
                    <p>{notes.scopeOfWork || "No scope has been added yet."}</p>
                  </article>
                  <article>
                    <strong>Exclusions</strong>
                    <p>{notes.exclusions || "No exclusions have been added yet."}</p>
                  </article>
                  <article>
                    <strong>Payment terms</strong>
                    <p>{notes.paymentTerms || "No payment terms have been added yet."}</p>
                  </article>
                  <article>
                    <strong>AI assumptions and warnings</strong>
                    <p>
                      {aiSuggestion
                        ? [...aiSuggestion.pricingAssumptions, ...aiSuggestion.warnings].join(" · ") || "No active AI advisories."
                        : "Build an estimate to review AI assumptions."}
                    </p>
                  </article>
                </div>
              </section>
            ) : null}
            </div>

          </div>

          <aside className="quote-summary-card quote-pricing-summary" aria-label="Pricing summary">
            <div className="quote-mobile-panel-heading">
              <div>
                <span>Pricing</span>
                <strong>Quote summary</strong>
              </div>
              <button type="button" onClick={() => setMobileQuotePanel(null)} aria-label="Close pricing summary">×</button>
            </div>
            <div className="quote-summary-heading">
              <span>Pricing Summary</span>
              <strong>{formatCurrency(grandTotal)}</strong>
              <small>Live total · updates as you edit</small>
              {targetProfitPercent !== null ? (
                <div className="quote-target-profit">
                  <span>Target profit</span>
                  <strong>{formatCurrency(targetProfitAmount ?? 0)}</strong>
                  <small>{formatNumber(targetProfitPercent, 1)}% target from Settings</small>
                </div>
              ) : null}
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
                Fuel surcharge <strong>{formatCurrency(fuelSurchargeAmount)}</strong>
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
              <button
                type="button"
                onClick={saveQuote}
                disabled={saveState === "saving" || !selectedProject}
                title={!selectedProject ? "Select a project before saving." : undefined}
              >
                {saveState === "saving" ? "Saving..." : "Save Quote"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsPreviewOpen(true)}
                disabled={!hasQuoteContent}
                title={!hasQuoteContent ? "Add quote content before previewing or exporting." : undefined}
              >
                Preview / Export
                <small>{hasQuoteContent ? "Customer-ready view" : "Add quote content first"}</small>
              </button>
              {savedQuoteId && status === "Draft" ? (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void deleteCurrentQuote()}
                  disabled={isDeletingQuote}
                >
                  {isDeletingQuote ? "Deleting…" : "Delete Quote"}
                </button>
              ) : null}
              <div className="quote-summary-action-grid">
                {quoteEmailHref ? (
                  <a className="secondary" href={quoteEmailHref}>
                    Email Customer
                    <small>{customerEmail}</small>
                  </a>
                ) : (
                  <span className="quote-action-status">Add a customer email to send this quote.</span>
                )}
                {savedQuoteId ? (
                  <Link className="secondary" href={`/invoices?quote=${encodeURIComponent(savedQuoteId)}`}>
                    Convert to Invoice
                    <small>Use saved quote</small>
                  </Link>
                ) : (
                  <span className="quote-action-status">Save the quote before converting it to an invoice.</span>
                )}
              </div>
            </div>
          </aside>
        </section>

        <aside className="quote-mobile-summary-bar" aria-label="Mobile quote summary">
          <button type="button" className="quote-mobile-total-button" onClick={() => setMobileQuotePanel("pricing")}>
            <span>Grand total</span>
            <strong>{formatCurrency(grandTotal)}</strong>
          </button>
          <button type="button" onClick={() => setActiveTab("review")}>Review</button>
          <button
            type="button"
            onClick={saveQuote}
            disabled={saveState === "saving" || !selectedProject}
            title={!selectedProject ? "Select a project before saving." : undefined}
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
        </aside>
      </section>
      {isPreviewOpen ? (
        <div className="quote-preview-overlay" role="presentation">
          <section className="quote-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-preview-title">
            <div className="quote-preview-toolbar">
              <div>
                <span>Quote preview</span>
                <strong id="quote-preview-title">{quoteNumber}</strong>
              </div>
              <div>
                <button type="button" className="secondary" onClick={() => setIsPreviewOpen(false)}>Close</button>
                <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
              </div>
            </div>
            <article className="quote-preview-document">
              <header>
                <div>
                  <span>AcreX Quote</span>
                  <strong>{selectedProject?.project_name || "Project estimate"}</strong>
                </div>
                <div>
                  <span>{quoteNumber}</span>
                  <strong>{status}</strong>
                </div>
              </header>
              <dl>
                <div><dt>Customer</dt><dd>{selectedClient?.name || selectedProject?.customer_name || "Not assigned"}</dd></div>
                <div><dt>Project address</dt><dd>{selectedProject?.address || "Not provided"}</dd></div>
              </dl>
              <section className="quote-preview-lines" aria-label="Quote line items">
                {lineItems.length ? lineItems.map((item) => (
                  <div key={item.id}>
                    <span>{item.serviceName || "Custom service"} · {item.quantity || "0"} {item.unit}</span>
                    <strong>{formatCurrency(lineTotal(item))}</strong>
                  </div>
                )) : <p>No service line items added.</p>}
                {materials.length ? <div><span>Materials</span><strong>{formatCurrency(materialsSubtotal)}</strong></div> : null}
                {costLines.length ? <div><span>Labor, equipment, and mobilization</span><strong>{formatCurrency(laborEquipmentSubtotal + mobilization)}</strong></div> : null}
              </section>
              <section className="quote-preview-totals">
                <div><span>Subtotal</span><strong>{formatCurrency(subtotalBeforeAdjustments)}</strong></div>
                {fuelSurchargeAmount > 0 ? <div><span>Fuel surcharge</span><strong>{formatCurrency(fuelSurchargeAmount)}</strong></div> : null}
                {discountAmount > 0 ? <div><span>Discount</span><strong>-{formatCurrency(discountAmount)}</strong></div> : null}
                {taxAmount > 0 ? <div><span>Tax</span><strong>{formatCurrency(taxAmount)}</strong></div> : null}
                <div><span>Grand total</span><strong>{formatCurrency(grandTotal)}</strong></div>
                {depositRequired > 0 ? <div><span>Deposit required</span><strong>{formatCurrency(depositRequired)}</strong></div> : null}
              </section>
              <section className="quote-preview-terms">
                {notes.scopeOfWork ? <div><strong>Scope of work</strong><p>{notes.scopeOfWork}</p></div> : null}
                {notes.exclusions ? <div><strong>Exclusions</strong><p>{notes.exclusions}</p></div> : null}
                {notes.paymentTerms ? <div><strong>Payment terms</strong><p>{notes.paymentTerms}</p></div> : null}
                {notes.estimatedTimeline ? <div><strong>Timeline</strong><p>{notes.estimatedTimeline}</p></div> : null}
                {notes.customerNotes ? <div><strong>Notes</strong><p>{notes.customerNotes}</p></div> : null}
              </section>
            </article>
          </section>
        </div>
      ) : null}
      <MobileAppNav active="quotes" />
    </main>
  );
}
