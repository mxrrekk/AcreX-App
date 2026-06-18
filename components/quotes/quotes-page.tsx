"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { getTemplateForZone, mergeServiceTemplates, serviceTemplatesStorageKey, type ServiceTemplate } from "@/lib/projects/pricing";
import type { ClientRecord, ProjectRecord, QuoteStatus, SavedZoneProperties, ZoneType } from "@/lib/projects/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type QuotesPageProps = {
  userId: string;
  userEmail: string;
  projects: ProjectRecord[];
  clients: ClientRecord[];
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
  quoteCategory: string;
  quantity: number;
  unit: string;
  color: string;
  billable: boolean;
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

const initialCostLines: CostLine[] = [
  { id: "labor", category: "labor", name: "Labor", amount: "", notes: "" },
  { id: "equipment", category: "equipment", name: "Equipment", amount: "", notes: "" },
  { id: "fuel", category: "fuel", name: "Fuel surcharge", amount: "", notes: "" },
  { id: "mobilization", category: "mobilization", name: "Mobilization", amount: "", notes: "" },
  { id: "haul-off", category: "haul-off", name: "Haul-off", amount: "", notes: "" },
  { id: "disposal", category: "disposal", name: "Disposal", amount: "", notes: "" },
  { id: "minimum", category: "minimum", name: "Minimum job charge", amount: "", notes: "" }
];

const emptyNotes: QuoteNotes = {
  scopeOfWork: "",
  customerNotes: "",
  exclusions: "",
  paymentTerms: "",
  estimatedTimeline: ""
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
  if (properties.quoteCategory) return String(properties.quoteCategory);
  if (properties.serviceTypeLabel) return properties.serviceTypeLabel;
  if (properties.zoneType === "Brush") return "Forestry Mulching";
  if (properties.zoneType === "Grass") return "Mowing";
  if (properties.zoneType === "Fence") return "Fence Installation";
  if (properties.zoneType === "Driveway") return "Gravel Driveway";
  if (properties.zoneType === "HousePad") return "House Pad Prep";
  if (properties.zoneType === "Woods") return "Land Clearing";
  if (properties.zoneType === "Excluded") return "Non-billable";
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
      quoteCategory,
      quantity,
      unit,
      color,
      billable
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

export function QuotesPage({
  userId,
  userEmail,
  projects,
  clients,
  initialProjectId,
  initialMeasurementId,
  errorMessage
}: QuotesPageProps) {
  const initialProject = projects.find((project) => project.id === initialProjectId) ?? projects[0] ?? null;
  const autoAddedMeasurementRef = useRef<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject?.id ?? "");
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const projectClient = useMemo(
    () => clients.find((client) => client.id === selectedProject?.client_id) ?? null,
    [clients, selectedProject?.client_id]
  );
  const [selectedClientId, setSelectedClientId] = useState(projectClient?.id ?? "");
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? projectClient ?? null;
  const [quoteNumber, setQuoteNumber] = useState(() => `Q-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
  const [status, setStatus] = useState<QuoteUiStatus>("Draft");
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [costLines, setCostLines] = useState<CostLine[]>(initialCostLines);
  const [discount, setDiscount] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [depositPercent, setDepositPercent] = useState("");
  const [notes, setNotes] = useState<QuoteNotes>(emptyNotes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedTemplates, setSavedTemplates] = useState<ServiceTemplate[] | null>(null);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  useEffect(() => {
    setSavedTemplates(loadSavedServiceTemplates());
    setTemplatesLoaded(true);
  }, []);

  useEffect(() => {
    const clientId = selectedProject?.client_id ?? "";
    setSelectedClientId(clientId);
  }, [selectedProject?.client_id]);

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
      materials,
      costLines,
      discount: discountAmount,
      taxPercent: parseAmount(taxPercent),
      depositPercent: parseAmount(depositPercent),
      depositRequired,
      materialsSubtotal,
      laborEquipmentSubtotal,
      mobilization
    };

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
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
      })
      .select("*")
      .single();

    if (quoteError || !quote) {
      setSaveState("error");
      setSaveMessage(quoteError?.message ?? "Quote could not be saved.");
      return;
    }

    if (lineItems.length > 0) {
      const { error: itemsError } = await supabase.from("quote_items").insert(
        lineItems.map((item, index) => ({
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
        }))
      );

      if (itemsError) {
        setSaveState("error");
        setSaveMessage(itemsError.message);
        return;
      }
    }

    setSaveState("saved");
    setSaveMessage("Quote saved to project.");
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
                  <input value={quoteNumber} onChange={(event) => setQuoteNumber(event.target.value)} />
                </label>
                <label>
                  Status
                  <select value={status} onChange={(event) => setStatus(event.target.value as QuoteUiStatus)}>
                    <option>Draft</option>
                    <option>Sent</option>
                    <option>Approved</option>
                    <option>Declined</option>
                  </select>
                </label>
                <label>
                  Project
                  <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
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
                  <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
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
                <span className="quote-ai-status">Layout ready</span>
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

              <div className="quote-ai-composer">
                <div>
                  <strong>AI estimate workspace</strong>
                  <p>Structured recommendations and review controls will appear here when the estimator phase is connected.</p>
                </div>
                <button type="button" disabled title="AI estimator connection is scheduled for the next phase">
                  AI setup pending
                </button>
              </div>

              <div className="quote-ai-review-empty">
                <span>Recommendation review</span>
                <p>Suggested services, materials, costs, scope, and terms will appear here for approval—never automatically.</p>
              </div>
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
                    return (
                      <div className="available-measurement-row quote-measurement-row" key={measurement.id}>
                        <i style={{ background: measurement.color }} aria-hidden="true" />
                        <span>
                          <strong>{measurement.label}</strong>
                          <small>
                            {measurement.serviceType} · {formatMeasurement(measurement.quantity, measurement.unit)}
                          </small>
                        </span>
                        <button
                          type="button"
                          onClick={() => addMeasurementToQuote(measurement)}
                          disabled={!measurement.billable || isAdded}
                        >
                          {!measurement.billable ? "Non-billable" : isAdded ? "Added" : "Add to Quote"}
                        </button>
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
                <button type="button" onClick={() => setLineItems((items) => [...items, createBlankLineItem()])}>
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
                  <span>Action</span>
                </div>
                {lineItems.length > 0 ? (
                  lineItems.map((item) => (
                    <div className="quote-editor-row quote-editor-line-grid" key={item.id}>
                      <input value={item.serviceName} onChange={(event) => updateLineItem(item.id, { serviceName: event.target.value })} />
                      <input value={item.description} onChange={(event) => updateLineItem(item.id, { description: event.target.value })} />
                      <span className="quote-source-measurement">{item.sourceMeasurement}</span>
                      <input value={item.quantity} inputMode="decimal" onChange={(event) => updateLineItem(item.id, { quantity: event.target.value })} />
                      <input value={item.unit} onChange={(event) => updateLineItem(item.id, { unit: event.target.value })} />
                      <input value={item.rate} inputMode="decimal" placeholder="0.00" onChange={(event) => updateLineItem(item.id, { rate: event.target.value })} />
                      <strong className="quote-line-total">{formatCurrency(lineTotal(item))}</strong>
                      <input value={item.notes} onChange={(event) => updateLineItem(item.id, { notes: event.target.value })} />
                      <button type="button" onClick={() => setLineItems((items) => items.filter((line) => line.id !== item.id))}>
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="quote-empty-state">Add measurements or create a manual service line to start the quote.</p>
                )}
              </div>
            </section>

            <section className="quote-items-card" aria-label="Materials">
              <div className="quote-card-heading">
                <div>
                  <span>Materials</span>
                  <strong>Editable material list</strong>
                </div>
                <button type="button" onClick={() => setMaterials((items) => [...items, createMaterial()])}>
                  Add Material
                </button>
              </div>
              <div className="quote-custom-presets">
                {commonMaterials.map((material) => (
                  <button type="button" key={material} onClick={() => setMaterials((items) => [...items, createMaterial(material)])}>
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
                      <input value={item.name} onChange={(event) => updateMaterial(item.id, { name: event.target.value })} />
                      <input value={item.quantity} inputMode="decimal" onChange={(event) => updateMaterial(item.id, { quantity: event.target.value })} />
                      <input value={item.unit} onChange={(event) => updateMaterial(item.id, { unit: event.target.value })} />
                      <input value={item.unitCost} inputMode="decimal" placeholder="0.00" onChange={(event) => updateMaterial(item.id, { unitCost: event.target.value })} />
                      <strong className="quote-line-total">{formatCurrency(materialTotal(item))}</strong>
                      <input value={item.notes} onChange={(event) => updateMaterial(item.id, { notes: event.target.value })} />
                      <button type="button" onClick={() => setMaterials((items) => items.filter((material) => material.id !== item.id))}>
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
                  onClick={() =>
                    setCostLines((items) => [...items, { id: createId("cost"), category: "other", name: "Other cost", amount: "", notes: "" }])
                  }
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
                {costLines.map((item) => (
                  <div className="quote-editor-row quote-editor-cost-grid" key={item.id}>
                    <select value={item.category} onChange={(event) => updateCostLine(item.id, { category: event.target.value as CostLine["category"] })}>
                      <option value="labor">Labor</option>
                      <option value="equipment">Equipment</option>
                      <option value="fuel">Fuel surcharge</option>
                      <option value="mobilization">Mobilization</option>
                      <option value="haul-off">Haul-off</option>
                      <option value="disposal">Disposal</option>
                      <option value="minimum">Minimum job charge</option>
                      <option value="other">Other</option>
                    </select>
                    <input value={item.name} onChange={(event) => updateCostLine(item.id, { name: event.target.value })} />
                    <input value={item.amount} inputMode="decimal" placeholder="0.00" onChange={(event) => updateCostLine(item.id, { amount: event.target.value })} />
                    <input value={item.notes} onChange={(event) => updateCostLine(item.id, { notes: event.target.value })} />
                    <button type="button" onClick={() => setCostLines((items) => items.filter((line) => line.id !== item.id))}>
                      Delete
                    </button>
                  </div>
                ))}
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
                  <textarea value={notes.scopeOfWork} onChange={(event) => setNotes((state) => ({ ...state, scopeOfWork: event.target.value }))} />
                </label>
                <label className="quote-notes-field">
                  Customer notes
                  <textarea value={notes.customerNotes} onChange={(event) => setNotes((state) => ({ ...state, customerNotes: event.target.value }))} />
                </label>
                <label className="quote-notes-field">
                  Exclusions
                  <textarea value={notes.exclusions} onChange={(event) => setNotes((state) => ({ ...state, exclusions: event.target.value }))} />
                </label>
                <label className="quote-notes-field">
                  Payment terms
                  <textarea value={notes.paymentTerms} onChange={(event) => setNotes((state) => ({ ...state, paymentTerms: event.target.value }))} />
                </label>
                <label className="quote-notes-field">
                  Estimated timeline
                  <textarea value={notes.estimatedTimeline} onChange={(event) => setNotes((state) => ({ ...state, estimatedTimeline: event.target.value }))} />
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
                <span>Quote confidence</span>
                <strong>Not calculated</strong>
              </div>
              <p>Confidence and uncertainty warnings will appear after the AI estimate is reviewed.</p>
            </div>

            <div className="quote-total-inputs">
              <label>
                Discount
                <input value={discount} inputMode="decimal" placeholder="0.00" onChange={(event) => setDiscount(event.target.value)} />
              </label>
              <label>
                Tax %
                <input value={taxPercent} inputMode="decimal" placeholder="0" onChange={(event) => setTaxPercent(event.target.value)} />
              </label>
              <label>
                Deposit %
                <input value={depositPercent} inputMode="decimal" placeholder="0" onChange={(event) => setDepositPercent(event.target.value)} />
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
              <button type="button" className="secondary" disabled title="Quote preview is coming in the quote actions phase">
                Preview Quote
                <small>Coming soon</small>
              </button>
              <div className="quote-summary-action-grid">
                <button type="button" className="secondary" disabled title="PDF export is coming in the quote actions phase">
                  Export PDF
                  <small>Coming soon</small>
                </button>
                <button type="button" className="secondary" disabled title="Customer sending is coming in the quote actions phase">
                  Send
                  <small>Coming soon</small>
                </button>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
