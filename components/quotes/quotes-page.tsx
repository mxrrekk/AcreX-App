"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AcrexLogo } from "@/components/ui/acrex-logo";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { defaultServiceTemplates, getTemplateQuantity, mergeServiceTemplates, serviceTemplatesStorageKey, type ServiceTemplate } from "@/lib/projects/pricing";
import { getServiceTypeByZoneType } from "@/lib/projects/service-types";
import type {
  ClientRecord,
  ProjectRecord,
  QuoteFormState,
  QuoteItemFormState,
  QuoteRecord,
  QuoteService,
  QuoteStatus,
  SavedProjectMapData,
  SavedZoneProperties,
  ZoneType
} from "@/lib/projects/types";

type QuotesPageProps = {
  userId: string;
  userEmail: string;
  projects: ProjectRecord[];
  clients: ClientRecord[];
  quotes: QuoteRecord[];
  errorMessage: string | null;
};

type ZoneMeasurement = {
  name: string;
  type: ZoneType | string;
  acres: number;
  squareFeet: number;
  perimeterFeet: number;
  notes: string;
  serviceTypeId?: string;
  serviceTypeLabel?: string;
  geometryType?: string;
  color?: string;
  lengthFt?: number;
  quoteCategory?: string;
  defaultRateType?: string;
};

const quoteStatuses: QuoteStatus[] = ["Draft", "Sent", "Accepted", "Declined"];
const quoteServices: QuoteService[] = [
  "Mowing",
  "Brush Clearing",
  "Forestry Mulching / Brush Clearing",
  "Forestry Mulching",
  "Land Clearing",
  "Driveway Prep",
  "Gravel Driveway",
  "House Pad",
  "House Pad Prep",
  "Fencing",
  "Fence Installation",
  "Sod",
  "Irrigation",
  "Custom"
];

const emptyQuoteForm: QuoteFormState = {
  projectId: "",
  clientId: "",
  status: "Draft",
  discount: "0",
  taxPercent: "0",
  depositPercent: "25",
  depositAmount: "0",
  depositMode: "percent",
  scopeOfWork: "",
  customerNotes: "",
  exclusions: "",
  paymentTerms: "Payment due according to accepted proposal terms.",
  estimatedTimeline: "",
  notes: ""
};

type QuoteMode = "edit" | "preview";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMeasurementValue(zone: ZoneMeasurement) {
  if (zone.type === "Fence" || zone.geometryType === "line") {
    return `${formatNumber(zone.lengthFt || zone.perimeterFeet)} ft`;
  }

  if (zone.type === "Driveway" || zone.type === "HousePad" || zone.type === "Building") {
    return `${formatNumber(zone.squareFeet)} sq ft`;
  }

  return `${formatNumber(zone.acres)} acres`;
}

function generateItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function generateQuoteNumber() {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `Q-${datePart}-${String(Date.now()).slice(-4)}`;
}

function parseMoney(value: string) {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value: string) {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLineTotal(item: QuoteItemFormState) {
  return parseQuantity(item.quantity) * parseMoney(item.unitPrice);
}

function getQuoteStatusLabel(status: QuoteStatus) {
  return status === "Accepted" ? "Approved" : status;
}

function buildQuoteNotes(formState: QuoteFormState) {
  const sections = [
    ["Scope of work", formState.scopeOfWork],
    ["Customer notes", formState.customerNotes],
    ["Exclusions", formState.exclusions],
    ["Payment terms", formState.paymentTerms],
    ["Estimated timeline", formState.estimatedTimeline],
    ["Internal notes", formState.notes]
  ];

  return sections
    .map(([label, value]) => `${label}: ${value.trim() || "Not specified"}`)
    .join("\n\n");
}

function getReadableQuoteError(message: string) {
  if (message.includes("public.quotes") || message.includes("quote_items") || message.includes("quotes")) {
    return "Quote storage is not set up yet. Apply supabase/schema.sql in Supabase, then refresh this page.";
  }

  if (message.includes("public.clients") || message.includes("client_id")) {
    return "Client/project storage needs the latest schema. Apply supabase/schema.sql in Supabase, then refresh this page.";
  }

  return message;
}

function normalizeQuote(row: unknown): QuoteRecord {
  return row as QuoteRecord;
}

function getProjectZones(project: ProjectRecord | null): ZoneMeasurement[] {
  const mapData = project?.polygon_geojson as SavedProjectMapData | null;

  if (mapData?.type === "FeatureCollection") {
    return mapData.features.map((feature, index) => {
      const properties = (feature.properties ?? {}) as SavedZoneProperties;
      return {
        name: properties.zoneName || `Zone ${index + 1}`,
        type: properties.zoneType || "Custom",
        acres: Number(properties.acres ?? 0),
        squareFeet: Number(properties.squareFeet ?? 0),
        perimeterFeet: Number(properties.perimeterFeet ?? 0),
        notes: properties.zoneNotes || "",
        serviceTypeId: properties.serviceTypeId,
        serviceTypeLabel: properties.serviceTypeLabel,
        geometryType: properties.geometryType,
        color: properties.color,
        lengthFt: Number(properties.lengthFt ?? 0),
        quoteCategory: properties.quoteCategory,
        defaultRateType: properties.defaultRateType
      };
    });
  }

  if (mapData?.type === "Feature") {
    const properties = (mapData.properties ?? {}) as SavedZoneProperties;
    return [
      {
        name: properties.zoneName || project?.project_name || "Work Area",
        type: properties.zoneType || "Custom",
        acres: Number(properties.acres ?? project?.acres ?? 0),
        squareFeet: Number(properties.squareFeet ?? project?.square_feet ?? 0),
        perimeterFeet: Number(properties.perimeterFeet ?? 0),
        notes: properties.zoneNotes || "",
        serviceTypeId: properties.serviceTypeId,
        serviceTypeLabel: properties.serviceTypeLabel,
        geometryType: properties.geometryType,
        color: properties.color,
        lengthFt: Number(properties.lengthFt ?? 0),
        quoteCategory: properties.quoteCategory,
        defaultRateType: properties.defaultRateType
      }
    ];
  }

  if (project?.acres || project?.square_feet) {
    return [
      {
        name: project.project_name || "Work Area",
        type: project.service_type || "Custom",
        acres: Number(project.acres ?? 0),
        squareFeet: Number(project.square_feet ?? 0),
        perimeterFeet: 0,
        notes: "",
        quoteCategory: project.service_type ?? undefined
      }
    ];
  }

  return [];
}

function loadStoredTemplates() {
  if (typeof window === "undefined") return defaultServiceTemplates;
  try {
    const stored = window.localStorage.getItem(serviceTemplatesStorageKey);
    if (!stored) return defaultServiceTemplates;
    const parsed = JSON.parse(stored) as Partial<ServiceTemplate>[];
    return mergeServiceTemplates(parsed);
  } catch {
    return defaultServiceTemplates;
  }
}

function getTemplateLookupService(service: QuoteService): QuoteService {
  if (service === "Forestry Mulching / Brush Clearing") return "Brush Clearing";
  if (service === "Fence Installation") return "Fencing";
  if (service === "Gravel Driveway") return "Driveway Prep";
  if (service === "House Pad Prep") return "House Pad";
  return service;
}

function getTemplateForService(service: QuoteService, templates: ServiceTemplate[]) {
  const lookupService = getTemplateLookupService(service);
  return templates.find((template) => template.serviceName === lookupService && template.active !== false);
}

function getMeasurementQuoteService(zone: ZoneMeasurement): QuoteService | null {
  if (zone.type === "Excluded") return null;
  if (zone.type === "Brush") return "Forestry Mulching / Brush Clearing";
  if (zone.type === "Grass") return "Mowing";
  if (zone.type === "Fence") return "Fence Installation";
  if (zone.type === "Driveway") return "Gravel Driveway";
  if (zone.type === "HousePad" || zone.type === "Building") return "House Pad Prep";
  return null;
}

function getSuggestedTemplateForZone(zone: ZoneMeasurement, project: ProjectRecord | null, templates: ServiceTemplate[]) {
  const projectService = (project?.service_type ?? "").toLowerCase();
  const zoneText = `${zone.name} ${zone.type} ${zone.notes}`.toLowerCase();
  const measurementService = getMeasurementQuoteService(zone);
  if (measurementService) {
    return getTemplateForService(measurementService, templates);
  }

  const categoryTemplate = getTemplateForService(zone.quoteCategory as QuoteService, templates);

  if (categoryTemplate) {
    return categoryTemplate;
  }

  if (projectService.includes("fenc") || zoneText.includes("fenc")) {
    return getTemplateForService("Fencing", templates);
  }

  if (zone.type === "Grass") return getTemplateForService("Mowing", templates);
  if (zone.type === "Brush") return getTemplateForService("Forestry Mulching / Brush Clearing", templates);
  if (zone.type === "Woods") return getTemplateForService("Land Clearing", templates) ?? getTemplateForService("Forestry Mulching", templates);
  if (zone.type === "Fence") return getTemplateForService("Fencing", templates);
  if (zone.type === "Driveway") return getTemplateForService("Driveway Prep", templates);
  if (zone.type === "HousePad" || zone.type === "Building") return getTemplateForService("House Pad Prep", templates);
  if (zone.type === "Property") {
    if (projectService.includes("mulch")) return getTemplateForService("Forestry Mulching", templates);
    return getTemplateForService("Land Clearing", templates) ?? getTemplateForService("Forestry Mulching", templates);
  }

  return templates.find((template) => template.billableZoneTypes.includes(zone.type as ZoneType)) ?? getTemplateForService("Custom", templates);
}

function getDefaultsForZone(
  zone: ZoneMeasurement,
  project: ProjectRecord | null,
  templates: ServiceTemplate[]
): Pick<QuoteItemFormState, "service" | "unit" | "unitPrice" | "quantity"> {
  const measurementService = getMeasurementQuoteService(zone);
  const matchingTemplate = getSuggestedTemplateForZone(zone, project, templates);
  if (matchingTemplate) {
    const effectiveType = zone.type === "Fence" ? "Fence" : (zone.type as ZoneType);
    const quantity = getTemplateQuantity(
      effectiveType as ZoneType,
      zone.acres,
      zone.squareFeet,
      zone.lengthFt || zone.perimeterFeet,
      matchingTemplate
    );
    const unitPrice =
      quantity > 0 && matchingTemplate.minimumCharge > 0
        ? Math.max(matchingTemplate.defaultUnitPrice, matchingTemplate.minimumCharge / quantity)
        : matchingTemplate.defaultUnitPrice;
    return {
      service: measurementService ?? matchingTemplate.serviceName,
      unit: matchingTemplate.unitType,
      unitPrice: unitPrice.toFixed(2),
      quantity: matchingTemplate.unitType === "sq ft" || matchingTemplate.unitType === "linear ft" ? Math.round(quantity).toString() : quantity.toFixed(2)
    };
  }

  if (zone.type === "Grass") {
    return { service: "Mowing", unit: "acre", unitPrice: "85", quantity: zone.acres.toFixed(2) };
  }

  if (zone.type === "Brush") {
    return { service: "Forestry Mulching / Brush Clearing", unit: "acre", unitPrice: "950", quantity: zone.acres.toFixed(2) };
  }

  if (zone.type === "Woods") {
    return { service: "Land Clearing", unit: "acre", unitPrice: "1850", quantity: zone.acres.toFixed(2) };
  }

  if (zone.type === "Fence") {
    return { service: "Fence Installation", unit: "linear ft", unitPrice: "18", quantity: Math.round(zone.lengthFt || zone.perimeterFeet).toString() };
  }

  if (zone.type === "Driveway") {
    return { service: "Gravel Driveway", unit: "sq ft", unitPrice: "3.25", quantity: Math.round(zone.squareFeet).toString() };
  }

  if (zone.type === "HousePad" || zone.type === "Building") {
    return { service: "House Pad Prep", unit: "sq ft", unitPrice: "4.50", quantity: Math.round(zone.squareFeet).toString() };
  }

  if (zone.type === "Property") {
    return { service: "Land Clearing", unit: "acre", unitPrice: "1850", quantity: zone.acres.toFixed(2) };
  }

  const serviceType = getServiceTypeByZoneType(zone.type);
  return {
    service: serviceType.quoteCategory,
    unit: serviceType.unit,
    unitPrice: "0",
    quantity: serviceType.unit === "linear ft"
      ? Math.round(zone.lengthFt || zone.perimeterFeet).toString()
      : serviceType.unit === "sq ft"
        ? Math.round(zone.squareFeet).toString()
        : zone.acres.toFixed(2)
  };
}

function createItemFromZone(zone: ZoneMeasurement, project: ProjectRecord | null, templates: ServiceTemplate[]): QuoteItemFormState {
  const defaults = getDefaultsForZone(zone, project, templates);
  return {
    id: generateItemId(),
    service: defaults.service,
    description: zone.name,
    quantity: defaults.quantity,
    unit: defaults.unit,
    unitPrice: defaults.unitPrice,
    lineTotal: "",
    zoneName: zone.name,
    zoneType: String(zone.type),
    notes: zone.notes
  };
}

function createBlankItem(): QuoteItemFormState {
  return {
    id: generateItemId(),
    service: "Custom",
    description: "",
    quantity: "1",
    unit: "each",
    unitPrice: "0",
    lineTotal: "",
    zoneName: "",
    zoneType: "Custom",
    notes: ""
  };
}

function createCustomItem(description = ""): QuoteItemFormState {
  return {
    ...createBlankItem(),
    description
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function QuotesPage({ userId, userEmail, projects, clients, quotes, errorMessage }: QuotesPageProps) {
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project");
  const [quoteMode, setQuoteMode] = useState<QuoteMode>("edit");
  const [formState, setFormState] = useState<QuoteFormState>(emptyQuoteForm);
  const [items, setItems] = useState<QuoteItemFormState[]>([]);
  const [savedQuotes, setSavedQuotes] = useState<QuoteRecord[]>(quotes);
  const [serviceTemplates] = useState<ServiceTemplate[]>(() => loadStoredTemplates());
  const [message, setMessage] = useState<string | null>(errorMessage ? getReadableQuoteError(errorMessage) : null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingQuoteId, setUpdatingQuoteId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === formState.projectId) ?? null,
    [formState.projectId, projects]
  );

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === formState.clientId) ?? null,
    [clients, formState.clientId]
  );

  const zoneMeasurements = useMemo(() => getProjectZones(selectedProject), [selectedProject]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + getLineTotal(item), 0), [items]);
  const discountAmount = Math.min(Math.max(parseMoney(formState.discount), 0), subtotal);
  const taxableSubtotal = Math.max(subtotal - discountAmount, 0);
  const taxAmount = taxableSubtotal * Math.max(parseMoney(formState.taxPercent), 0) / 100;
  const grandTotal = taxableSubtotal + taxAmount;
  const depositRequired =
    formState.depositMode === "amount"
      ? Math.min(Math.max(parseMoney(formState.depositAmount), 0), grandTotal)
      : grandTotal * Math.max(parseMoney(formState.depositPercent), 0) / 100;
  const balanceDue = Math.max(grandTotal - depositRequired, 0);
  const importedMeasurementCount = items.filter((item) => item.zoneName.trim()).length;

  function updateFormField<K extends keyof QuoteFormState>(field: K, value: QuoteFormState[K]) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function saveLocalQuoteDraft(reason: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "acrex-local-quote-draft",
        JSON.stringify({
          reason,
          savedAt: new Date().toISOString(),
          formState,
          items,
          totals: {
            subtotal,
            discountAmount,
            taxAmount,
            depositRequired,
            grandTotal
          },
          projectId: selectedProject?.id ?? null,
          clientId: selectedClient?.id ?? null
        })
      );
    }
    setMessage(`${reason} Your quote was preserved locally in this browser. Backend work needed: apply the current Supabase quote tables/policies before production saving.`);
  }

  function addMeasurementToQuote(zone: ZoneMeasurement) {
    if (!selectedProject) {
      setMessage("Select a project before adding measurements to a quote.");
      return;
    }

    if (zone.type === "Excluded") {
      setMessage("Excluded areas are not added as billable quote lines by default.");
      return;
    }

    setItems((current) => [...current, createItemFromZone(zone, selectedProject, serviceTemplates)]);
    setMessage(`✓ ${zone.name} added as an editable quote line.`);
  }

  function handleProjectChange(projectId: string) {
    const nextProject = projects.find((project) => project.id === projectId) ?? null;
    setFormState((current) => ({
      ...current,
      projectId,
      clientId: nextProject?.client_id ?? current.clientId
    }));
    setItems([]);
    setMessage(nextProject ? "Project selected. Choose which available measurements to add to the quote." : null);
  }

  useEffect(() => {
    if (!requestedProjectId || formState.projectId === requestedProjectId) return;
    if (!projects.some((project) => project.id === requestedProjectId)) return;
    handleProjectChange(requestedProjectId);
  // Query-driven project preload should run only when project availability changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.projectId, projects, requestedProjectId]);

  function updateItem(id: string, field: keyof QuoteItemFormState, value: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: value,
          lineTotal: field === "quantity" || field === "unitPrice" ? "" : item.lineTotal
        };
      })
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function handleServiceChange(id: string, service: QuoteService) {
    const template = getTemplateForService(service, serviceTemplates);
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              service,
              unit: template?.unitType ?? item.unit,
              unitPrice: template ? String(template.defaultUnitPrice) : item.unitPrice,
              notes: template?.notes ?? item.notes
            }
          : item
      )
    );
  }

  async function markQuoteAccepted(quote: QuoteRecord) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      saveLocalQuoteDraft("Supabase is not configured.");
      return;
    }

    setUpdatingQuoteId(quote.id);
    setMessage(null);
    const { data, error } = await supabase
      .from("quotes")
      .update({ status: "Accepted" })
      .eq("id", quote.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    setUpdatingQuoteId(null);

    if (error) {
      setMessage(getReadableQuoteError(error.message));
      return;
    }

    const updatedQuote = normalizeQuote(data);
    setSavedQuotes((current) => current.map((item) => (item.id === updatedQuote.id ? updatedQuote : item)));
    setMessage(`✓ Quote ${updatedQuote.quote_number} marked accepted.`);
  }

  async function handleSaveQuote() {
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    if (!selectedProject) {
      setMessage("Select a project before saving a quote.");
      return;
    }

    if (!items.length) {
      setMessage("Add at least one quote item before saving.");
      return;
    }

    setIsSaving(true);

    const quotePayload = {
      user_id: userId,
      project_id: selectedProject.id,
      client_id: selectedClient?.id ?? null,
      quote_number: generateQuoteNumber(),
      status: formState.status,
      project_name: selectedProject.project_name,
      client_name: selectedClient?.name ?? selectedProject.customer_name ?? null,
      address: selectedProject.address ?? null,
      subtotal,
      total: grandTotal,
      notes: buildQuoteNotes(formState)
    };

    const { data: quoteData, error: quoteError } = await supabase.from("quotes").insert(quotePayload).select("*").single();

    if (quoteError) {
      setIsSaving(false);
      saveLocalQuoteDraft(getReadableQuoteError(quoteError.message));
      return;
    }

    const savedQuote = normalizeQuote(quoteData);
    const itemPayload = items.map((item, index) => ({
      quote_id: savedQuote.id,
      user_id: userId,
      service: item.service,
      description: item.description.trim() || null,
      quantity: parseQuantity(item.quantity),
      unit: item.unit.trim() || "each",
      unit_price: parseMoney(item.unitPrice),
      total: getLineTotal(item),
      zone_name: item.zoneName.trim() || null,
      zone_type: item.zoneType.trim() || null,
      notes: item.notes.trim() || null,
      sort_order: index
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemPayload);

    if (itemsError) {
      await supabase.from("quotes").delete().eq("id", savedQuote.id).eq("user_id", userId);
      setIsSaving(false);
      saveLocalQuoteDraft(getReadableQuoteError(itemsError.message));
      return;
    }

    setSavedQuotes((current) => [savedQuote, ...current]);
    setIsSaving(false);
    setMessage(`✓ Quote ${savedQuote.quote_number} saved and linked to ${selectedProject.project_name}.`);
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
            <h1>Quotes</h1>
            <p>Build estimates from project measurements, edit line items, and prepare a customer-ready quote.</p>
          </div>
          <div className="quote-header-actions">
            <div className="quote-mode-tabs" aria-label="Quote mode">
              <button className={quoteMode === "edit" ? "active" : ""} type="button" onClick={() => setQuoteMode("edit")}>
                Edit
              </button>
              <button className={quoteMode === "preview" ? "active" : ""} type="button" onClick={() => setQuoteMode("preview")}>
                Preview
              </button>
            </div>
            <button type="button" onClick={() => setMessage("Export coming soon. Quote preview is ready for review.")}>Export PDF</button>
            <button type="button" onClick={() => setMessage("Print-ready quote preview coming soon.")}>Print</button>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        {message ? <p className="projects-error">{message}</p> : null}

        {quoteMode === "edit" ? (
        <>
        <section className="quote-builder-grid quote-estimating-grid">
          <section className="quote-builder-card quote-project-card">
            <div className="quote-card-heading">
              <div>
                <span>Project / Customer Info</span>
                <strong>{selectedProject?.project_name ?? "Select a project"}</strong>
              </div>
              <select value={formState.status} onChange={(event) => updateFormField("status", event.target.value as QuoteStatus)}>
                {quoteStatuses.map((status) => (
                  <option key={status} value={status}>
                    {getQuoteStatusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="quote-setup-grid">
              <label>
                Project
                <select value={formState.projectId} onChange={(event) => handleProjectChange(event.target.value)}>
                  <option value="">Choose saved project...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Client
                <select value={formState.clientId} onChange={(event) => updateFormField("clientId", event.target.value)}>
                  <option value="">No client selected</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}{client.company ? ` - ${client.company}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="quote-pulled-data">
              <div>
                <span>Address</span>
                <strong>{selectedProject?.address || "No project selected"}</strong>
              </div>
              <div>
                <span>Client</span>
                <strong>{selectedClient?.name || selectedProject?.customer_name || "No client linked"}</strong>
              </div>
              <div>
                <span>Zones</span>
                <strong>{zoneMeasurements.length} measured zone{zoneMeasurements.length === 1 ? "" : "s"}</strong>
              </div>
            </div>
          </section>

          <section className="quote-builder-card quote-measurements-card">
            <div className="quote-card-heading">
              <div>
                <span>Available Measurements</span>
                <strong>{importedMeasurementCount ? `${importedMeasurementCount} imported` : `${zoneMeasurements.length} available`}</strong>
              </div>
            </div>
            <div className="zone-measurements-list">
              {zoneMeasurements.length ? (
                zoneMeasurements.map((zone) => (
                  <div className="available-measurement-row" key={`${zone.name}-${zone.type}`}>
                    <span>
                      <strong>{zone.name}</strong>
                      <small>{formatMeasurementValue(zone)}</small>
                    </span>
                    <button type="button" onClick={() => addMeasurementToQuote(zone)} disabled={zone.type === "Excluded"}>
                      {zone.type === "Excluded" ? "Not Billable" : "Add to Quote"}
                    </button>
                  </div>
                ))
              ) : (
                <span>Select a saved project with drawn zones to pull measurements into the quote.</span>
              )}
            </div>
          </section>

          <section className="quote-builder-card quote-terms-card">
            <div className="quote-card-heading">
              <div>
                <span>Notes / Terms</span>
                <strong>Proposal details</strong>
              </div>
            </div>
            <label className="quote-notes-field">
              Scope of work
              <textarea
                value={formState.scopeOfWork}
                onChange={(event) => updateFormField("scopeOfWork", event.target.value)}
                placeholder="Describe the work included in this quote..."
              />
            </label>
            <label className="quote-notes-field">
              Customer notes
              <textarea
                value={formState.customerNotes}
                onChange={(event) => updateFormField("customerNotes", event.target.value)}
                placeholder="Notes visible to the customer..."
              />
            </label>
            <label className="quote-notes-field">
              Exclusions
              <textarea
                value={formState.exclusions}
                onChange={(event) => updateFormField("exclusions", event.target.value)}
                placeholder="List anything not included, such as permits, hauling, materials, or unknown site conditions..."
              />
            </label>
            <label className="quote-notes-field">
              Payment terms
              <textarea
                value={formState.paymentTerms}
                onChange={(event) => updateFormField("paymentTerms", event.target.value)}
                placeholder="Deposit, payment due date, late fees, or approval terms..."
              />
            </label>
            <label className="quote-notes-field">
              Estimated timeline
              <textarea
                value={formState.estimatedTimeline}
                onChange={(event) => updateFormField("estimatedTimeline", event.target.value)}
                placeholder="Example: 2-3 working days after approval and weather window..."
              />
            </label>
            <label className="quote-notes-field">
              Internal notes
              <textarea
                value={formState.notes}
                onChange={(event) => updateFormField("notes", event.target.value)}
                placeholder="Private notes or assumptions..."
              />
            </label>
          </section>

          <aside className="quote-summary-card">
            <span>Quote Total</span>
            <strong>{formatCurrency(subtotal)}</strong>
            <small>{items.length} line item{items.length === 1 ? "" : "s"}</small>
            <div className="quote-total-inputs">
              <label>
                Discount
                <input value={formState.discount} onChange={(event) => updateFormField("discount", event.target.value)} inputMode="decimal" />
              </label>
              <label>
                Tax %
                <input value={formState.taxPercent} onChange={(event) => updateFormField("taxPercent", event.target.value)} inputMode="decimal" />
              </label>
              <label>
                Deposit
                <select value={formState.depositMode} onChange={(event) => updateFormField("depositMode", event.target.value as QuoteFormState["depositMode"])}>
                  <option value="percent">Percent</option>
                  <option value="amount">Amount</option>
                </select>
              </label>
              {formState.depositMode === "percent" ? (
                <label>
                  Deposit %
                  <input value={formState.depositPercent} onChange={(event) => updateFormField("depositPercent", event.target.value)} inputMode="decimal" />
                </label>
              ) : (
                <label>
                  Deposit $
                  <input value={formState.depositAmount} onChange={(event) => updateFormField("depositAmount", event.target.value)} inputMode="decimal" />
                </label>
              )}
            </div>
            <div className="quote-total-breakdown">
              <span>Imported measurements <strong>{importedMeasurementCount}</strong></span>
              <span>Subtotal <strong>{formatCurrency(subtotal)}</strong></span>
              <span>Discount <strong>-{formatCurrency(discountAmount)}</strong></span>
              <span>Tax <strong>{formatCurrency(taxAmount)}</strong></span>
              <span>Grand total <strong>{formatCurrency(grandTotal)}</strong></span>
              <span>Deposit required <strong>{formatCurrency(depositRequired)}</strong></span>
              <span>Balance due <strong>{formatCurrency(balanceDue)}</strong></span>
            </div>
            <button className={isSaving ? "is-processing" : ""} type="button" onClick={handleSaveQuote} disabled={isSaving}>
              {isSaving ? "Saving Quote..." : "Save Quote"}
            </button>
            <button type="button" onClick={() => setMessage("Export coming soon. Quote preview is ready for review.")}>
              Export Quote
            </button>
          </aside>
        </section>

        <section className="quote-items-card">
          <div className="quote-card-heading">
            <div>
              <span>Services</span>
              <strong>Line Items</strong>
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, createCustomItem()])}>
              Add Custom Item
            </button>
          </div>
          <div className="quote-custom-presets" aria-label="Common custom quote items">
            {["Mobilization", "Fuel surcharge", "Haul-off", "Equipment time", "Labor", "Materials", "Disposal", "Minimum job charge"].map((preset) => (
              <button type="button" key={preset} onClick={() => setItems((current) => [...current, createCustomItem(preset)])}>
                {preset}
              </button>
            ))}
          </div>

          <div className="quote-items-table">
            <div className="quote-items-header">
              <span>Service</span>
              <span>Description</span>
              <span>Source Measurement</span>
              <span>Quantity</span>
              <span>Unit</span>
              <span>Unit Rate</span>
              <span>Line Total</span>
              <span>Notes</span>
              <span />
            </div>

            {items.length ? (
              items.map((item) => (
                <div className="quote-item-row" key={item.id}>
                  <select value={item.service} onChange={(event) => handleServiceChange(item.id, event.target.value as QuoteService)}>
                    {quoteServices.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                  <input value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} placeholder="Scope description" />
                  <span className="quote-source-measurement">{item.zoneName || "Manual item"}</span>
                  <input value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} inputMode="decimal" />
                  <input value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} />
                  <input value={item.unitPrice} onChange={(event) => updateItem(item.id, "unitPrice", event.target.value)} inputMode="decimal" />
                  <strong className="quote-line-total">{formatCurrency(parseQuantity(item.quantity) * parseMoney(item.unitPrice))}</strong>
                  <input value={item.notes} onChange={(event) => updateItem(item.id, "notes", event.target.value)} placeholder="Notes" />
                  <button type="button" onClick={() => removeItem(item.id)}>
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <div className="projects-empty-state">
                <strong>No quote items yet</strong>
                <span>Select a project to pull zone measurements or add a custom service.</span>
                <button className="empty-state-action" type="button" onClick={() => setItems((current) => [...current, createCustomItem()])}>Add Custom Item</button>
              </div>
            )}
          </div>
        </section>
        </>
        ) : null}

        {quoteMode === "preview" ? (
        <section className="quote-preview-card">
          <div className="quote-card-heading">
            <div>
              <span>Customer Report Preview</span>
              <strong>{selectedProject?.project_name ?? "Select a project"}</strong>
            </div>
            <button type="button" onClick={() => setMessage("PDF export coming soon. Preview is ready for review.")}>PDF Preview</button>
          </div>
          <div className="quote-preview-document">
            <header>
              <AcrexLogo className="quote-preview-logo" href="" width={118} height={36} />
              <div>
                <span>Professional Quote Preview</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
            </header>
            <dl>
              <div>
                <dt>Customer</dt>
                <dd>{selectedClient?.name || selectedProject?.customer_name || "No client selected"}</dd>
              </div>
              <div>
                <dt>Property</dt>
                <dd>{selectedProject?.address || "No property selected"}</dd>
              </div>
              <div>
                <dt>Measured Zones</dt>
                <dd>{zoneMeasurements.length}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{getQuoteStatusLabel(formState.status)}</dd>
              </div>
            </dl>
            <div className="report-map-placeholder">
              <span>Map Preview</span>
              <strong>Project map snapshot placeholder</strong>
            </div>
            <div className="quote-zone-breakdown">
              <strong>Zone Breakdown</strong>
              {zoneMeasurements.length ? (
                zoneMeasurements.map((zone) => (
                  <div key={`${zone.name}-${zone.type}-preview`}>
                    <span>{zone.name} · {zone.type}</span>
                    <small>{formatNumber(zone.acres)} ac · {formatNumber(zone.squareFeet)} sq ft · {formatNumber(zone.perimeterFeet)} lf</small>
                  </div>
                ))
              ) : (
                <p>No measured zones selected.</p>
              )}
            </div>
            <div className="quote-preview-lines">
              {items.length ? (
                items.map((item) => (
                  <div key={item.id}>
                    <span>{item.description || item.service}</span>
                    <small>{item.quantity} {item.unit} @ {formatCurrency(parseMoney(item.unitPrice))}</small>
                    <strong>{formatCurrency(getLineTotal(item))}</strong>
                  </div>
                ))
              ) : (
                <p>Add line items to populate this homeowner-ready preview.</p>
              )}
            </div>
            <div className="quote-preview-totals">
              <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
              <div><span>Discount</span><strong>-{formatCurrency(discountAmount)}</strong></div>
              <div><span>Tax</span><strong>{formatCurrency(taxAmount)}</strong></div>
              <div><span>Deposit required</span><strong>{formatCurrency(depositRequired)}</strong></div>
              <div><span>Grand total</span><strong>{formatCurrency(grandTotal)}</strong></div>
            </div>
            <div className="quote-preview-terms">
              <div><strong>Scope of work</strong><p>{formState.scopeOfWork || "Scope will appear here."}</p></div>
              <div><strong>Customer notes</strong><p>{formState.customerNotes || "No customer notes added."}</p></div>
              <div><strong>Exclusions</strong><p>{formState.exclusions || "No exclusions listed."}</p></div>
              <div><strong>Payment terms</strong><p>{formState.paymentTerms || "Payment terms will appear here."}</p></div>
              <div><strong>Estimated timeline</strong><p>{formState.estimatedTimeline || "Timeline will appear here."}</p></div>
            </div>
            <p>Disclaimer: Parcel lines, measurements, and AI/pricing suggestions are estimates. Verify access, site conditions, materials, and local requirements before final approval.</p>
          </div>
        </section>
        ) : null}

        <section className="quotes-table-card">
          <div className="quote-card-heading">
            <div>
              <span>Saved Quotes</span>
              <strong>{savedQuotes.length} quote{savedQuotes.length === 1 ? "" : "s"}</strong>
            </div>
          </div>

          <div className="quotes-table">
            <div className="quotes-table-header">
              <span>Quote</span>
              <span>Project</span>
              <span>Client</span>
              <span>Status</span>
              <span>Total</span>
              <span>Updated</span>
              <span />
            </div>

            {savedQuotes.length ? (
              savedQuotes.map((quote) => (
                <article className="quote-row" key={quote.id}>
                  <strong>{quote.quote_number}</strong>
                  <span>{quote.project_name || "No project"}</span>
                  <span>{quote.client_name || "No client"}</span>
                  <span className={`project-status-pill quote-status-${quote.status.toLowerCase()}`}>{getQuoteStatusLabel(quote.status)}</span>
                  <span>{formatCurrency(quote.total)}</span>
                  <span>{formatDate(quote.updated_at)}</span>
                  <div className="quote-row-actions">
                    {quote.status === "Accepted" ? (
                      <Link href="/invoices">Create Invoice</Link>
                    ) : (
                      <button
                        className={updatingQuoteId === quote.id ? "is-processing" : ""}
                        type="button"
                        onClick={() => markQuoteAccepted(quote)}
                        disabled={updatingQuoteId === quote.id}
                      >
                        {updatingQuoteId === quote.id ? "Updating..." : "Mark Approved"}
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="projects-empty-state">
                <strong>No quotes saved</strong>
                <span>Create a quote from a saved project to see it here.</span>
                <Link className="empty-state-action" href="/projects">Open Projects</Link>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
