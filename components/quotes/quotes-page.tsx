"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { defaultServiceTemplates, getTemplateQuantity, mergeServiceTemplates, serviceTemplatesStorageKey, type ServiceTemplate } from "@/lib/projects/pricing";
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
};

const quoteStatuses: QuoteStatus[] = ["Draft", "Sent", "Accepted", "Declined"];
const quoteServices: QuoteService[] = [
  "Mowing",
  "Brush Clearing",
  "Forestry Mulching",
  "Land Clearing",
  "Driveway Prep",
  "House Pad",
  "Fencing",
  "Sod",
  "Irrigation",
  "Custom"
];

const emptyQuoteForm: QuoteFormState = {
  projectId: "",
  clientId: "",
  status: "Draft",
  notes: ""
};

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
  if (item.lineTotal.trim()) return parseMoney(item.lineTotal);
  return parseQuantity(item.quantity) * parseMoney(item.unitPrice);
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
        notes: properties.zoneNotes || ""
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
        notes: properties.zoneNotes || ""
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
        notes: ""
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

function getTemplateForService(service: QuoteService, templates: ServiceTemplate[]) {
  return templates.find((template) => template.serviceName === service && template.active !== false);
}

function getSuggestedTemplateForZone(zone: ZoneMeasurement, project: ProjectRecord | null, templates: ServiceTemplate[]) {
  const projectService = (project?.service_type ?? "").toLowerCase();
  const zoneText = `${zone.name} ${zone.type} ${zone.notes}`.toLowerCase();

  if (projectService.includes("fenc") || zoneText.includes("fenc")) {
    return getTemplateForService("Fencing", templates);
  }

  if (zone.type === "Grass") return getTemplateForService("Mowing", templates);
  if (zone.type === "Brush") return getTemplateForService("Brush Clearing", templates);
  if (zone.type === "Driveway") return getTemplateForService("Driveway Prep", templates);
  if (zone.type === "Building") return getTemplateForService("House Pad", templates);
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
  const matchingTemplate = getSuggestedTemplateForZone(zone, project, templates);
  if (matchingTemplate) {
    const quantity = getTemplateQuantity(
      zone.type as ZoneType,
      zone.acres,
      zone.squareFeet,
      zone.perimeterFeet,
      matchingTemplate
    );
    const unitPrice =
      quantity > 0 && matchingTemplate.minimumCharge > 0
        ? Math.max(matchingTemplate.defaultUnitPrice, matchingTemplate.minimumCharge / quantity)
        : matchingTemplate.defaultUnitPrice;
    return {
      service: matchingTemplate.serviceName,
      unit: matchingTemplate.unitType,
      unitPrice: unitPrice.toFixed(2),
      quantity: matchingTemplate.unitType === "sq ft" || matchingTemplate.unitType === "linear ft" ? Math.round(quantity).toString() : quantity.toFixed(2)
    };
  }

  if (zone.type === "Grass") {
    return { service: "Mowing", unit: "acre", unitPrice: "85", quantity: zone.acres.toFixed(2) };
  }

  if (zone.type === "Brush") {
    return { service: "Brush Clearing", unit: "acre", unitPrice: "950", quantity: zone.acres.toFixed(2) };
  }

  if (zone.type === "Driveway") {
    return { service: "Driveway Prep", unit: "sq ft", unitPrice: "3.25", quantity: Math.round(zone.squareFeet).toString() };
  }

  if (zone.type === "Building") {
    return { service: "House Pad", unit: "sq ft", unitPrice: "4.50", quantity: Math.round(zone.squareFeet).toString() };
  }

  if (zone.type === "Property") {
    return { service: "Land Clearing", unit: "acre", unitPrice: "1850", quantity: zone.acres.toFixed(2) };
  }

  return { service: "Custom", unit: "acre", unitPrice: "0", quantity: zone.acres.toFixed(2) };
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function QuotesPage({ userId, userEmail, projects, clients, quotes, errorMessage }: QuotesPageProps) {
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

  function handleProjectChange(projectId: string) {
    const nextProject = projects.find((project) => project.id === projectId) ?? null;
    const nextZones = getProjectZones(nextProject).filter((zone) => zone.type !== "Excluded");
    setFormState((current) => ({
      ...current,
      projectId,
      clientId: nextProject?.client_id ?? current.clientId
    }));
    setItems(nextZones.map((zone) => createItemFromZone(zone, nextProject, serviceTemplates)));
    setMessage(null);
  }

  function updateItem(id: string, field: keyof QuoteItemFormState, value: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: value,
          lineTotal: field === "quantity" || field === "unitPrice" ? "" : field === "lineTotal" ? value : item.lineTotal
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
      setMessage("Supabase is not configured.");
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
      total: subtotal,
      notes: formState.notes.trim() || null
    };

    const { data: quoteData, error: quoteError } = await supabase.from("quotes").insert(quotePayload).select("*").single();

    if (quoteError) {
      setIsSaving(false);
      setMessage(getReadableQuoteError(quoteError.message));
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
      setMessage(getReadableQuoteError(itemsError.message));
      return;
    }

    setSavedQuotes((current) => [savedQuote, ...current]);
    setIsSaving(false);
    setMessage(`✓ Quote ${savedQuote.quote_number} saved and linked to ${selectedProject.project_name}.`);
  }

  return (
    <main className="quotes-page">
      <aside className="projects-sidebar">
        <Link className="dashboard-brand projects-brand" href="/" aria-label="Acrex home">
          <Image src="/assets/acrex-logo.png" alt="Acrex" width={154} height={46} priority />
        </Link>
        <nav className="projects-nav" aria-label="Quote navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/clients">Clients</Link>
          <Link className="active" href="/quotes">Quotes</Link>
          <Link href="/invoices">Invoices</Link>
        </nav>
      </aside>

      <section className="quotes-workspace">
        <header className="projects-header">
          <div>
            <span>Quote Builder</span>
            <h1>Professional Quotes</h1>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        {message ? <p className="projects-error">{message}</p> : null}

        <section className="quote-builder-grid">
          <section className="quote-builder-card">
            <div className="quote-card-heading">
              <div>
                <span>Quote Setup</span>
                <strong>{selectedProject?.project_name ?? "Select a project"}</strong>
              </div>
              <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as QuoteStatus }))}>
                {quoteStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
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
                <select value={formState.clientId} onChange={(event) => setFormState((current) => ({ ...current, clientId: event.target.value }))}>
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

            <div className="zone-measurements-list">
              {zoneMeasurements.length ? (
                zoneMeasurements.map((zone) => (
                  <span key={`${zone.name}-${zone.type}`}>
                    {zone.name} · {zone.type} · {formatNumber(zone.acres)} ac · {formatNumber(zone.squareFeet)} sq ft · {formatNumber(zone.perimeterFeet)} lf
                  </span>
                ))
              ) : (
                <span>Select a saved project with drawn zones to pull measurements into the quote.</span>
              )}
            </div>

            <label className="quote-notes-field">
              Notes
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional terms, scope notes, or assumptions..."
              />
            </label>
          </section>

          <aside className="quote-summary-card">
            <span>Quote Total</span>
            <strong>{formatCurrency(subtotal)}</strong>
            <small>{items.length} line item{items.length === 1 ? "" : "s"}</small>
            <div className="quote-total-breakdown">
              <span>Subtotal <strong>{formatCurrency(subtotal)}</strong></span>
              <span>Total <strong>{formatCurrency(subtotal)}</strong></span>
            </div>
            <button className={isSaving ? "is-processing" : ""} type="button" onClick={handleSaveQuote} disabled={isSaving}>
              {isSaving ? "Saving Quote..." : "Save Quote"}
            </button>
          </aside>
        </section>

        <section className="quote-items-card">
          <div className="quote-card-heading">
            <div>
              <span>Services</span>
              <strong>Line Items</strong>
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, createBlankItem()])}>
              Add Item
            </button>
          </div>

          <div className="quote-items-table">
            <div className="quote-items-header">
              <span>Service</span>
              <span>Description</span>
              <span>Qty</span>
              <span>Unit</span>
                  <span>Unit Price</span>
                  <span>Materials</span>
                  <span>Total</span>
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
                  <input value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} inputMode="decimal" />
                  <input value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} />
                  <input value={item.unitPrice} onChange={(event) => updateItem(item.id, "unitPrice", event.target.value)} inputMode="decimal" />
                  <input value={item.notes} onChange={(event) => updateItem(item.id, "notes", event.target.value)} placeholder="Materials or notes" />
                  <input
                    value={item.lineTotal}
                    onChange={(event) => updateItem(item.id, "lineTotal", event.target.value)}
                    inputMode="decimal"
                    placeholder={formatCurrency(parseQuantity(item.quantity) * parseMoney(item.unitPrice))}
                    aria-label="Line total override"
                  />
                  <button type="button" onClick={() => removeItem(item.id)}>
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div className="projects-empty-state">
                <strong>No quote items yet</strong>
                <span>Select a project to pull zone measurements or add a custom service.</span>
                <button className="empty-state-action" type="button" onClick={() => setItems((current) => [...current, createBlankItem()])}>Add Custom Item</button>
              </div>
            )}
          </div>
        </section>

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
              <Image src="/assets/acrex-logo.png" alt="Acrex" width={118} height={36} />
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
            <p>Disclaimer: Parcel lines, measurements, and AI/pricing suggestions are estimates. Verify access, site conditions, materials, and local requirements before final approval.</p>
          </div>
        </section>

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
                  <span className={`project-status-pill quote-status-${quote.status.toLowerCase()}`}>{quote.status}</span>
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
                        {updatingQuoteId === quote.id ? "Updating..." : "Mark Accepted"}
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
