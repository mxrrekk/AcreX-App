"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AppSidebar, type AppSidebarKey } from "@/components/ui/app-sidebar";
import type { Feature, Polygon } from "geojson";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatAcres, formatFeet, formatSquareFeet } from "@/lib/geo/format";
import type { ProjectMeasurements } from "@/lib/geo/measurements";
import {
  createChecklistFromService,
  defaultProjectTags,
  getGlobalStorageKey,
  getProjectStorageKey,
  noteTypes,
  readStoredValue,
  writeStoredValue,
  type ProjectActivity,
  type ProjectChecklistItem,
  type ProjectNote,
  type ProjectNoteType,
  type ProjectSnapshot,
  type ProjectTagStore
} from "@/lib/projects/operations";
import type { ParcelLookupState } from "@/lib/projects/parcels";
import {
  calculateProjectEstimate,
  calculateTemplateLineTotal,
  defaultProfitInputs,
  defaultServiceTemplates,
  getTemplateForZone,
  getTemplateQuantity,
  mergeServiceTemplates,
  profitInputsStorageKey,
  serviceTemplatesStorageKey,
  type ProfitInputs,
  type ServiceTemplate
} from "@/lib/projects/pricing";
import type { ClientRecord, InvoiceRecord, ProjectFormState, ProjectRecord, ProjectStatus, QuoteRecord, SavedProjectMapData, WorkZone, ZoneType } from "@/lib/projects/types";
import { zoneColors, zoneLabels } from "@/lib/projects/zones";

type DashboardShellProps = {
  userEmail: string;
};

type AddressDetails = {
  address: string;
  latitude: number;
  longitude: number;
  county?: string | null;
  parcelId?: string | null;
};

type DashboardToast = {
  id: string;
  message: string;
};

type DashboardDraft = {
  activeProjectId: string | null;
  address: string;
  addressDetails: AddressDetails | null;
  projectForm: ProjectFormState;
  mapData: SavedProjectMapData | null;
  measurements: ProjectMeasurements | null;
  savedAt: string;
};

type ServiceEstimateLine = {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  total: number;
};

const AcrexMap = dynamic(() => import("@/components/map/acrex-map").then((module) => module.AcrexMap), {
  ssr: false,
  loading: () => (
    <div className="map-loading-state" aria-label="Loading map">
      <span className="skeleton-block skeleton-search" />
      <span className="skeleton-block skeleton-toolbar" />
    </div>
  )
});

const emptyProjectForm: ProjectFormState = {
  projectName: "Untitled Project",
  customerName: "",
  clientId: "",
  address: "",
  serviceType: "Land Clearing",
  pricePerAcre: "",
  status: "Draft"
};

const projectStatuses: ProjectStatus[] = ["Draft", "Estimating", "Quoted", "Won", "Lost", "Completed", "Archived"];
type DashboardPanelKey = "search" | "layers" | "measurements" | "quote" | "project" | "settings";

function getDraftKey(userEmail: string) {
  return `acrex-dashboard-draft:${userEmail}`;
}

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function getAvatarLabel(email: string) {
  return (email.trim()[0] ?? "A").toUpperCase();
}

function sumZoneAcres(zones: WorkZone[], types: ZoneType[]) {
  return zones
    .filter((zone) => types.includes(zone.type))
    .reduce((total, zone) => total + zone.acres, 0);
}

function sumZoneLength(zones: WorkZone[], types: ZoneType[]) {
  return zones
    .filter((zone) => types.includes(zone.type))
    .reduce((total, zone) => total + (zone.lengthFt ?? zone.perimeterFeet), 0);
}

function sumSelectedMeasurements(zones: WorkZone[]): ProjectMeasurements {
  return zones.reduce<ProjectMeasurements>(
    (total, zone) => ({
      acres: total.acres + zone.acres,
      squareFeet: total.squareFeet + zone.squareFeet,
      perimeterFeet: total.perimeterFeet + zone.perimeterFeet
    }),
    { acres: 0, squareFeet: 0, perimeterFeet: 0 }
  );
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

function formatZoneMeasurement(zone: WorkZone) {
  if (zone.geometryType === "line" || zone.type === "Fence") return `${formatFeet(zone.lengthFt ?? zone.perimeterFeet)} ft`;
  if ((zone.defaultRateType === "per_sq_ft" || zone.type === "Driveway" || zone.type === "HousePad" || zone.type === "Building") && zone.squareFeet > 0) {
    return `${formatSquareFeet(zone.squareFeet)} sq ft`;
  }
  return `${formatAcres(zone.acres)} ac`;
}

function getMeasurementGroupLabel(zone: WorkZone) {
  if (zone.type === "Brush") return "Brush";
  if (zone.type === "Grass") return "Grass";
  if (zone.type === "Fence") return "Fence";
  if (zone.type === "Driveway") return "Driveway";
  if (zone.type === "HousePad" || zone.type === "Building") return "House Pad";
  if (zone.type === "Excluded") return "Exclusion";
  if (zone.type === "Property") return "Property";
  if (zone.type === "Woods") return "Woods";
  return zone.serviceTypeLabel ?? zoneLabels[zone.type] ?? zone.type;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getQuoteStatusForProject(projectId: string | null, quotes: QuoteRecord[]) {
  if (!projectId) return "Not Created";
  return quotes.find((quote) => quote.project_id === projectId)?.status ?? "Not Created";
}

function getInvoiceStatusForProject(projectId: string | null, invoices: InvoiceRecord[]) {
  if (!projectId) return "Not Created";
  return invoices.find((invoice) => invoice.project_id === projectId)?.status ?? "Not Created";
}

function getCalculatorResult(type: string, measurements: ProjectMeasurements | null) {
  const acres = measurements?.acres ?? 0;
  const squareFeet = measurements?.squareFeet ?? 0;
  const perimeterFeet = measurements?.perimeterFeet ?? 0;

  if (type === "Fence linear feet") return `${formatFeet(perimeterFeet)} linear ft`;
  if (type === "Sod square footage") return `${formatSquareFeet(squareFeet)} sq ft`;
  if (type === "Gravel amount") return `${formatNumber((squareFeet * 0.33) / 27, 1)} cubic yd at 4 in depth`;
  if (type === "Mulch amount") return `${formatNumber((squareFeet * 0.25) / 27, 1)} cubic yd at 3 in depth`;
  if (type === "Topsoil amount") return `${formatNumber((squareFeet * 0.5) / 27, 1)} cubic yd at 6 in depth`;
  if (type === "Concrete cubic yards") return `${formatNumber((squareFeet * 0.33) / 27, 1)} cubic yd at 4 in slab`;
  if (type === "Driveway stone") return `${formatNumber((squareFeet * 0.5) / 27, 1)} cubic yd at 6 in depth`;
  if (type === "Forestry mulching acreage") return `${formatAcres(acres)} ac`;
  return `${formatAcres(acres)} ac`;
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

function loadStoredProfitInputs() {
  if (typeof window === "undefined") return defaultProfitInputs;
  try {
    const stored = window.localStorage.getItem(profitInputsStorageKey);
    if (!stored) return defaultProfitInputs;
    return { ...defaultProfitInputs, ...(JSON.parse(stored) as Partial<ProfitInputs>) };
  } catch {
    return defaultProfitInputs;
  }
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && projectStatuses.includes(value as ProjectStatus);
}

function isFeatureCollection(data: SavedProjectMapData | null): data is Extract<SavedProjectMapData, { type: "FeatureCollection" }> {
  return data?.type === "FeatureCollection";
}

function getPanelClass(activePanel: DashboardPanelKey | null, panel: DashboardPanelKey, className: string) {
  return `${className} dashboard-tab-panel${activePanel === panel ? " is-active" : ""}`;
}

function getProjectStatus(project: ProjectRecord | null): ProjectStatus {
  const mapData = project?.polygon_geojson ?? null;
  const status = isFeatureCollection(mapData) ? mapData.properties?.status : null;
  return isProjectStatus(status) ? status : "Draft";
}

function createSavedProjectMapData(
  zones: WorkZone[],
  status: ProjectStatus,
  address: string,
  projectName: string
): SavedProjectMapData {
  return {
    type: "FeatureCollection",
    properties: {
      status,
      address,
      projectName
    },
    features: zones.map((zone) => ({
      ...zone.feature,
      properties: {
        ...(zone.feature.properties ?? {}),
        zoneName: zone.name,
        zoneType: zone.type,
        zoneNotes: zone.notes,
        zoneLocked: zone.locked,
        zoneVisible: zone.feature.properties?.zoneVisible ?? true,
        acres: zone.acres,
        squareFeet: zone.squareFeet,
        perimeterFeet: zone.perimeterFeet,
        serviceTypeId: zone.serviceTypeId,
        serviceTypeLabel: zone.serviceTypeLabel,
        geometryType: zone.geometryType,
        color: zone.color,
        areaAcres: zone.areaAcres ?? zone.acres,
        areaSqFt: zone.areaSqFt ?? zone.squareFeet,
        lengthFt: zone.lengthFt,
        label: zone.label ?? zone.name,
        quoteCategory: zone.quoteCategory,
        defaultRateType: zone.defaultRateType,
        visible: zone.visible ?? true,
        createdAt: zone.createdAt
      }
    }))
  };
}

function normalizeProject(row: unknown): ProjectRecord {
  return row as ProjectRecord;
}

function normalizeClient(row: unknown): ClientRecord {
  return row as ClientRecord;
}

function normalizeQuote(row: unknown): QuoteRecord {
  return row as QuoteRecord;
}

function normalizeInvoice(row: unknown): InvoiceRecord {
  return row as InvoiceRecord;
}

async function getCurrentUserId(supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>) {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user.id;
}

export function DashboardShell({ userEmail }: DashboardShellProps) {
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project");
  const [measurements, setMeasurements] = useState<ProjectMeasurements | null>(null);
  const [address, setAddress] = useState("No address selected");
  const [polygon, setPolygon] = useState<Feature<Polygon> | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [mapResetKey, setMapResetKey] = useState(0);
  const [activePanel, setActivePanel] = useState<DashboardPanelKey | null>(null);
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [selectedZones, setSelectedZones] = useState<WorkZone[]>([]);
  const [draftMapData, setDraftMapData] = useState<SavedProjectMapData | null>(null);
  const [addressDetails, setAddressDetails] = useState<AddressDetails | null>(null);
  const [parcelLookup, setParcelLookup] = useState<ParcelLookupState>({
    status: "idle",
    message: "Search an address to check parcel boundary availability."
  });
  const [useParcelRequestKey, setUseParcelRequestKey] = useState(0);
  const [serviceTemplates, setServiceTemplates] = useState<ServiceTemplate[]>(defaultServiceTemplates);
  const [profitInputs, setProfitInputs] = useState<ProfitInputs>(defaultProfitInputs);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [tagStore, setTagStore] = useState<ProjectTagStore>({});
  const [customTag, setCustomTag] = useState("");
  const requestedPanel = searchParams.get("panel");
  const requestedSection = searchParams.get("section");
  const sidebarActiveKey: AppSidebarKey =
    requestedPanel === "measurements"
      ? "drawings"
      : requestedPanel === "project" && requestedSection === "exports"
        ? "exports"
        : requestedPanel === "settings" && requestedSection === "account"
          ? "account"
          : requestedPanel === "settings"
            ? "settings"
            : "map";
  const [checklistItems, setChecklistItems] = useState<ProjectChecklistItem[]>([]);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [newChecklistText, setNewChecklistText] = useState("");
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<ProjectNoteType>("General");
  const [activityLog, setActivityLog] = useState<ProjectActivity[]>([]);
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [calculatorType, setCalculatorType] = useState("Fence linear feet");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const previousZoneSnapshotRef = useRef<string>("");
  const lastDraftJsonRef = useRef<string>("");

  const showToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message }].slice(-3));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2800);
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === projectForm.clientId) ?? null,
    [clients, projectForm.clientId]
  );
  const pricePerAcre = Number(projectForm.pricePerAcre);
  const normalizedPricePerAcre = Number.isFinite(pricePerAcre) && pricePerAcre > 0 ? pricePerAcre : 0;
  const estimatedTotal = measurements ? measurements.acres * normalizedPricePerAcre : 0;
  const propertyAcres = sumZoneAcres(workZones, ["Property"]);
  const grassAcres = sumZoneAcres(workZones, ["Grass"]);
  const brushAcres = sumZoneAcres(workZones, ["Brush"]);
  const woodsAcres = sumZoneAcres(workZones, ["Woods"]);
  const drivewayAcres = sumZoneAcres(workZones, ["Driveway"]);
  const drivewaySqFt = sumSelectedMeasurements(workZones.filter((zone) => zone.type === "Driveway")).squareFeet;
  const housePadSqFt = sumSelectedMeasurements(workZones.filter((zone) => zone.type === "HousePad" || zone.type === "Building")).squareFeet;
  const fenceLinearFt = sumZoneLength(workZones, ["Fence"]);
  const buildingAcres = sumZoneAcres(workZones, ["Building", "HousePad"]);
  const excludedAcres = sumZoneAcres(workZones, ["Excluded"]);
  const billableWorkAcres = sumZoneAcres(workZones, ["Grass", "Brush", "Woods", "Driveway", "HousePad", "Custom"]);
  const netBillableAcres = billableWorkAcres;
  const selectedTotals = sumSelectedMeasurements(selectedZones);
  const groupedMeasurements = useMemo(() => {
    return workZones.reduce<Array<{ key: string; color: string; zones: WorkZone[]; total: string }>>((groups, zone) => {
      const key = getMeasurementGroupLabel(zone);
      const color = zone.color ?? zoneColors[zone.type];
      let group = groups.find((item) => item.key === key);
      if (!group) {
        group = { key, color, zones: [], total: "" };
        groups.push(group);
      }
      group.zones.push(zone);
      const acres = group.zones.reduce((total, item) => total + item.acres, 0);
      const squareFeet = group.zones.reduce((total, item) => total + item.squareFeet, 0);
      const lengthFeet = group.zones.reduce((total, item) => total + (item.lengthFt ?? (item.geometryType === "line" ? item.perimeterFeet : 0)), 0);
      if (group.zones.some((item) => item.geometryType === "line" || item.type === "Fence")) {
        group.total = `${formatFeet(lengthFeet)} ft`;
      } else if (group.zones.some((item) => item.defaultRateType === "per_sq_ft" || item.type === "Driveway" || item.type === "HousePad" || item.type === "Building")) {
        group.total = `${formatSquareFeet(squareFeet)} sq ft`;
      } else {
        group.total = `${formatAcres(acres)} ac`;
      }
      return groups;
    }, []);
  }, [workZones]);
  const workflowState = useMemo(() => {
    if (address === "No address selected") return { step: "Search", message: "Start by searching a property address." };
    if (!workZones.length) return { step: "Select Service", message: "Next: choose what you want to measure, then draw on the map." };
    if (!quotes.some((quote) => quote.project_id === activeProjectId)) return { step: "Quote", message: "Measurement saved. Add measurements to your quote." };
    if (!activeProjectId) return { step: "Save", message: "Save this property to keep measurements, notes, and quotes together." };
    return { step: "Export", message: "Project is ready to share or export when needed." };
  }, [activeProjectId, address, quotes, workZones.length]);
  const effectivePanel = activePanel ?? (selectedZones.length ? "measurements" : null);
  const isInspectorOpen = effectivePanel !== null;
  const draftSavedTime = draftSavedAt
    ? new Date(draftSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  const summaryRows = [
    { label: "Parcel total", value: propertyAcres ? `${formatAcres(propertyAcres)} ac` : `${formatAcres(measurements?.acres ?? null)} ac` },
    { label: "Grass total", value: grassAcres ? `${formatAcres(grassAcres)} ac` : "--" },
    { label: "Brush/tree total", value: brushAcres + woodsAcres ? `${formatAcres(brushAcres + woodsAcres)} ac` : "--" },
    { label: "Fence total", value: fenceLinearFt ? `${formatFeet(fenceLinearFt)} ft` : "--" },
    { label: "Driveway/parking total", value: drivewaySqFt ? `${formatSquareFeet(drivewaySqFt)} sq ft` : drivewayAcres ? `${formatAcres(drivewayAcres)} ac` : "--" },
    { label: "House pad total", value: housePadSqFt ? `${formatSquareFeet(housePadSqFt)} sq ft` : "--" },
    { label: "Building total", value: buildingAcres ? `${formatAcres(buildingAcres)} ac` : "--" },
    { label: "Excluded total", value: excludedAcres ? `${formatAcres(excludedAcres)} ac` : "--" },
    { label: "Net billable total", value: netBillableAcres ? `${formatAcres(netBillableAcres)} ac` : "--" }
  ];
  const estimateLines = useMemo<ServiceEstimateLine[]>(() => {
    return workZones
      .filter((zone) => !["Excluded", "Building"].includes(zone.type))
      .map((zone) => {
        const template = getTemplateForZone(zone.type, serviceTemplates);
        const quantity = getTemplateQuantity(zone.type, zone.acres, zone.squareFeet, zone.perimeterFeet, template);
        return {
          id: zone.id,
          label: `${template.serviceName} - ${zone.name}`,
          quantity,
          unit: template.unitType,
          total: calculateTemplateLineTotal(quantity, template)
        };
      });
  }, [serviceTemplates, workZones]);
  const estimatedServicesTotal = estimateLines.reduce((total, line) => total + line.total, 0);
  const projectEstimate = useMemo(
    () => calculateProjectEstimate(workZones, serviceTemplates, profitInputs),
    [profitInputs, serviceTemplates, workZones]
  );
  const recommendedQuote = projectEstimate.estimatedRevenue || estimatedServicesTotal + profitInputs.travelCharge;
  const activeProjectTags = activeProjectId ? tagStore[activeProjectId] ?? [] : [];
  const quoteStatus = getQuoteStatusForProject(activeProjectId, quotes);
  const invoiceStatus = getInvoiceStatusForProject(activeProjectId, invoices);
  const dashboardMetrics = useMemo(() => {
    const now = new Date();
    const thisMonthProjects = projects.filter((project) => {
      const updated = new Date(project.updated_at);
      return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear();
    }).length;
    const quotesSent = quotes.filter((quote) => quote.status === "Sent" || quote.status === "Accepted").length;
    const quotesAccepted = quotes.filter((quote) => quote.status === "Accepted").length;
    const estimatedRevenue = projects.reduce((total, project) => total + Number(project.estimated_total ?? 0), 0);
    const outstandingInvoices = invoices.filter((invoice) => invoice.status !== "Paid").reduce((total, invoice) => total + invoice.total, 0);
    const paidInvoices = invoices.filter((invoice) => invoice.status === "Paid").reduce((total, invoice) => total + invoice.total, 0);
    const averageProfitMargin = projectEstimate.profitMargin || 0;

    return {
      thisMonthProjects,
      quotesSent,
      quotesAccepted,
      estimatedRevenue,
      outstandingInvoices,
      paidInvoices,
      averageProfitMargin
    };
  }, [invoices, projectEstimate.profitMargin, projects, quotes]);
  const globalSearchResults = useMemo(() => {
    const term = globalSearchTerm.trim().toLowerCase();
    const emptyResults = {
      projectMatches: [] as ProjectRecord[],
      clientMatches: [] as ClientRecord[],
      quoteMatches: [] as QuoteRecord[],
      invoiceMatches: [] as InvoiceRecord[],
      activityMatches: [] as ProjectActivity[]
    };
    if (!term) return emptyResults;

    const projectMatches = projects.filter((project) =>
      [project.project_name, project.address ?? "", project.customer_name ?? "", project.service_type ?? "", ...(tagStore[project.id] ?? [])].join(" ").toLowerCase().includes(term)
    );
    const clientMatches = clients.filter((client) =>
      [client.name, client.company ?? "", client.phone ?? "", client.email ?? "", client.address ?? ""].join(" ").toLowerCase().includes(term)
    );
    const quoteMatches = quotes.filter((quote) =>
      [quote.quote_number, quote.project_name ?? "", quote.client_name ?? "", quote.address ?? "", quote.status].join(" ").toLowerCase().includes(term)
    );
    const invoiceMatches = invoices.filter((invoice) =>
      [invoice.invoice_number, invoice.project_name ?? "", invoice.client_name ?? "", invoice.address ?? "", invoice.status].join(" ").toLowerCase().includes(term)
    );
    const activityMatches = activityLog.filter((activity) =>
      [activity.action, activity.description, activity.entity].join(" ").toLowerCase().includes(term)
    );

    return { projectMatches, clientMatches, quoteMatches, invoiceMatches, activityMatches };
  }, [activityLog, clients, globalSearchTerm, invoices, projects, quotes, tagStore]);

  useEffect(() => {
    setServiceTemplates(loadStoredTemplates());
    setProfitInputs(loadStoredProfitInputs());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(serviceTemplatesStorageKey, JSON.stringify(serviceTemplates));
  }, [serviceTemplates]);

  useEffect(() => {
    window.localStorage.setItem(profitInputsStorageKey, JSON.stringify(profitInputs));
  }, [profitInputs]);

  const addActivity = useCallback((action: string, description: string, entity = "Project") => {
    setActivityLog((current) => [
      {
        id: crypto.randomUUID(),
        action,
        description,
        entity,
        createdAt: new Date().toISOString()
      },
      ...current
    ].slice(0, 80));
  }, []);

  useEffect(() => {
    setTagStore(readStoredValue<ProjectTagStore>(getGlobalStorageKey(userEmail, "project-tags"), {}));
  }, [userEmail]);

  useEffect(() => {
    writeStoredValue(getGlobalStorageKey(userEmail, "project-tags"), tagStore);
  }, [tagStore, userEmail]);

  useEffect(() => {
    const checklistKey = getProjectStorageKey(userEmail, activeProjectId, "checklist");
    const notesKey = getProjectStorageKey(userEmail, activeProjectId, "notes");
    const activityKey = getProjectStorageKey(userEmail, activeProjectId, "activity");
    const snapshotsKey = getProjectStorageKey(userEmail, activeProjectId, "snapshots");
    const storedChecklist = readStoredValue<ProjectChecklistItem[]>(checklistKey, []);

    setChecklistItems(storedChecklist.length ? storedChecklist : createChecklistFromService(projectForm.serviceType));
    setProjectNotes(readStoredValue<ProjectNote[]>(notesKey, []));
    setActivityLog(readStoredValue<ProjectActivity[]>(activityKey, []));
    setSnapshots(readStoredValue<ProjectSnapshot[]>(snapshotsKey, []));
    previousZoneSnapshotRef.current = "";
  }, [activeProjectId, projectForm.serviceType, userEmail]);

  useEffect(() => {
    writeStoredValue(getProjectStorageKey(userEmail, activeProjectId, "checklist"), checklistItems);
  }, [activeProjectId, checklistItems, userEmail]);

  useEffect(() => {
    writeStoredValue(getProjectStorageKey(userEmail, activeProjectId, "notes"), projectNotes);
  }, [activeProjectId, projectNotes, userEmail]);

  useEffect(() => {
    writeStoredValue(getProjectStorageKey(userEmail, activeProjectId, "activity"), activityLog.slice(0, 80));
  }, [activeProjectId, activityLog, userEmail]);

  useEffect(() => {
    writeStoredValue(getProjectStorageKey(userEmail, activeProjectId, "snapshots"), snapshots);
  }, [activeProjectId, snapshots, userEmail]);

  useEffect(() => {
    const zoneSnapshot = JSON.stringify(
      workZones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        type: zone.type,
        acres: Number(zone.acres.toFixed(4)),
        squareFeet: Math.round(zone.squareFeet)
      }))
    );
    if (!zoneSnapshot || zoneSnapshot === previousZoneSnapshotRef.current) return;

    if (previousZoneSnapshotRef.current) {
      addActivity("Estimate updated", `${workZones.length} zone${workZones.length === 1 ? "" : "s"} updated from map measurements.`, "Map");
    }
    previousZoneSnapshotRef.current = zoneSnapshot;
  }, [addActivity, workZones]);

  useEffect(() => {
    if (hasRestoredDraft || requestedProjectId) {
      setHasRestoredDraft(true);
      return;
    }

    try {
      const storedDraft = window.localStorage.getItem(getDraftKey(userEmail));
      if (!storedDraft) {
        setHasRestoredDraft(true);
        return;
      }

      const draft = JSON.parse(storedDraft) as DashboardDraft;
      if (!draft || typeof draft !== "object") {
        setHasRestoredDraft(true);
        return;
      }

      setActiveProjectId(draft.activeProjectId ?? null);
      setAddress(draft.address || "No address selected");
      setAddressDetails(draft.addressDetails ?? null);
      setProjectForm({ ...emptyProjectForm, ...(draft.projectForm ?? {}) });
      setMeasurements(draft.measurements ?? null);
      setDraftMapData(draft.mapData ?? null);
      setDraftSavedAt(draft.savedAt ?? null);
      lastDraftJsonRef.current = storedDraft;
      if (draft.mapData) {
        setMapResetKey((current) => current + 1);
      }
      showToast("✓ Draft Restored");
    } catch {
      // Ignore malformed local drafts.
    } finally {
      setHasRestoredDraft(true);
    }
  }, [hasRestoredDraft, requestedProjectId, showToast, userEmail]);

  useEffect(() => {
    if (!hasRestoredDraft) return;
    const hasDraftContent = workZones.length > 0 || address !== "No address selected" || projectForm.projectName !== emptyProjectForm.projectName;
    if (!hasDraftContent) return;

    const timeout = window.setTimeout(() => {
      const projectName = projectForm.projectName.trim() || "Untitled Project";
      const projectAddress = projectForm.address.trim() || address;
      const mapData = workZones.length ? createSavedProjectMapData(workZones, projectForm.status, projectAddress, projectName) : draftMapData;
      const draft: DashboardDraft = {
        activeProjectId,
        address,
        addressDetails,
        projectForm,
        mapData,
        measurements,
        savedAt: new Date().toISOString()
      };
      const nextDraftJson = JSON.stringify(draft);
      if (nextDraftJson === lastDraftJsonRef.current) return;

      window.localStorage.setItem(getDraftKey(userEmail), nextDraftJson);
      lastDraftJsonRef.current = nextDraftJson;
      setDraftSavedAt(draft.savedAt);
      showToast("✓ Draft Saved");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [activeProjectId, address, addressDetails, draftMapData, hasRestoredDraft, measurements, projectForm, showToast, userEmail, workZones]);

  const loadProjects = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setIsLoadingProjects(false);
      setProjectMessage("Supabase is not configured yet. Add your Supabase environment variables to save projects.");
      return;
    }

    setIsLoadingProjects(true);
    const currentUserId = await getCurrentUserId(supabase);

    if (!currentUserId) {
      setIsLoadingProjects(false);
      setProjectMessage("Your session expired. Log in again before loading projects.");
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", currentUserId)
      .order("updated_at", { ascending: false });

    setIsLoadingProjects(false);

    if (error) {
      setProjectMessage(error.message);
      return;
    }

    setProjects((data ?? []).map(normalizeProject));
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadClients = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setIsLoadingClients(false);
      return;
    }

    setIsLoadingClients(true);
    const currentUserId = await getCurrentUserId(supabase);

    if (!currentUserId) {
      setIsLoadingClients(false);
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", currentUserId)
      .order("updated_at", { ascending: false });

    setIsLoadingClients(false);

    if (error) {
      setProjectMessage(error.message.includes("clients") ? "Client table is not set up yet. Apply the Supabase schema before linking clients." : error.message);
      return;
    }

    setClients((data ?? []).map(normalizeClient));
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const loadFinancialRecords = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const currentUserId = await getCurrentUserId(supabase);
    if (!currentUserId) return;

    const [{ data: quoteRows }, { data: invoiceRows }] = await Promise.all([
      supabase.from("quotes").select("*").eq("user_id", currentUserId).order("updated_at", { ascending: false }),
      supabase.from("invoices").select("*").eq("user_id", currentUserId).order("updated_at", { ascending: false })
    ]);

    setQuotes((quoteRows ?? []).map(normalizeQuote));
    setInvoices((invoiceRows ?? []).map(normalizeInvoice));
  }, []);

  useEffect(() => {
    void loadFinancialRecords();
  }, [loadFinancialRecords]);

  useEffect(() => {
    if (!requestedProjectId || !projects.length) return;

    const requestedProject = projects.find((project) => project.id === requestedProjectId);
    if (!requestedProject) return;

    setActiveProjectId(requestedProject.id);
    setAddress(requestedProject.address ?? "No address selected");
    setAddressDetails(null);
    setDraftMapData(null);
    setProjectForm({
      projectName: requestedProject.project_name || "Untitled Project",
      customerName: requestedProject.customer_name ?? "",
      clientId: requestedProject.client_id ?? "",
      address: requestedProject.address ?? "",
      serviceType: requestedProject.service_type ?? "Land Clearing",
      pricePerAcre: requestedProject.price_per_acre ? String(requestedProject.price_per_acre) : "",
      status: getProjectStatus(requestedProject)
    });
    setProjectMessage("Project loaded.");
  }, [projects, requestedProjectId]);

  useEffect(() => {
    if (!requestedPanel) {
      setActivePanel(null);
      return;
    }

    if (requestedPanel === "measurements" || requestedPanel === "project" || requestedPanel === "settings") {
      setActivePanel(requestedPanel);
    }
  }, [requestedPanel]);

  const handleAddressChange = useCallback((nextAddress: string) => {
    setAddress(nextAddress);
    setProjectForm((current) => ({
      ...current,
      address: nextAddress || current.address
    }));
    if (nextAddress) {
      addActivity("Address searched", nextAddress, "Address");
    }
  }, [addActivity]);

  const handleSelectedZonesChange = useCallback((zones: WorkZone[]) => {
    setSelectedZones(zones);
    setActivePanel((current) => {
      if (zones.length) return "measurements";
      return current === "measurements" ? null : current;
    });
  }, []);

  function handleNewProject() {
    setActiveProjectId(null);
    setProjectForm(emptyProjectForm);
    setAddress("No address selected");
    setMeasurements(null);
    setPolygon(null);
    setWorkZones([]);
    setSelectedZones([]);
    setActivePanel(null);
    setDraftMapData(null);
    setAddressDetails(null);
    setMapResetKey((current) => current + 1);
    setProjectMessage("New project ready. Search an address and draw a boundary.");
    showToast("New project ready");
    addActivity("Project created", "Started a new draft project.", "Project");
  }

  async function ensureUserProfile(
    supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>,
    currentUserId: string
  ) {
    const { error } = await supabase.from("users").upsert(
      {
        id: currentUserId,
        email: userEmail
      },
      { onConflict: "id" }
    );

    return error;
  }

  async function handleSaveProject() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setProjectMessage("Supabase is not configured yet. Add your Supabase environment variables to save projects.");
      return;
    }

    if (!workZones.length || !measurements) {
      setProjectMessage("Draw at least one work zone before saving this project.");
      return;
    }

    setIsSavingProject(true);
    setProjectMessage(null);
    const currentUserId = await getCurrentUserId(supabase);

    if (!currentUserId) {
      setIsSavingProject(false);
      setProjectMessage("Your session expired. Log in again before saving this project.");
      return;
    }

    const profileError = await ensureUserProfile(supabase, currentUserId);

    if (profileError) {
      setIsSavingProject(false);
      setProjectMessage(profileError.message);
      return;
    }

    const projectName = projectForm.projectName.trim() || "Untitled Project";
    const projectAddress = projectForm.address.trim() || address;
    const linkedClient = clients.find((client) => client.id === projectForm.clientId) ?? null;
    const savedMapData = createSavedProjectMapData(workZones, projectForm.status, projectAddress, projectName);

    const payload = {
      user_id: currentUserId,
      client_id: linkedClient?.id ?? null,
      project_name: projectName,
      customer_name: linkedClient?.name ?? (projectForm.customerName.trim() || null),
      address: projectAddress,
      polygon_geojson: savedMapData,
      acres: measurements.acres,
      square_feet: measurements.squareFeet,
      service_type: projectForm.serviceType,
      price_per_acre: normalizedPricePerAcre || null,
      estimated_total: recommendedQuote || (normalizedPricePerAcre ? estimatedTotal : null)
    };

    const query = activeProjectId
      ? supabase
          .from("projects")
          .update(payload)
          .eq("id", activeProjectId)
          .eq("user_id", currentUserId)
          .select("*")
          .single()
      : supabase.from("projects").insert(payload).select("*").single();

    const { data, error } = await query;
    setIsSavingProject(false);

    if (error) {
      setProjectMessage(error.message);
      return;
    }

    const savedProject = normalizeProject(data);
    setActiveProjectId(savedProject.id);
    setProjects((current) => {
      const withoutSaved = current.filter((project) => project.id !== savedProject.id);
      return [savedProject, ...withoutSaved];
    });
    setProjectMessage("✓ Project Saved");
    showToast("✓ Project Saved");
    addActivity(activeProjectId ? "Project updated" : "Project created", `${projectName} saved with ${workZones.length} zone${workZones.length === 1 ? "" : "s"}.`, "Project");
    window.setTimeout(() => {
      setProjectMessage((current) => (current === "✓ Project Saved" ? null : current));
    }, 3200);
  }

  function addChecklistItem() {
    const text = newChecklistText.trim();
    if (!text) return;
    setChecklistItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text,
        completed: false,
        updatedAt: new Date().toISOString()
      }
    ]);
    setNewChecklistText("");
    addActivity("Checklist updated", `Added checklist item: ${text}`, "Checklist");
  }

  function updateChecklistItem(id: string, text: string) {
    setChecklistItems((current) =>
      current.map((item) => (item.id === id ? { ...item, text, updatedAt: new Date().toISOString() } : item))
    );
  }

  function toggleChecklistItem(id: string) {
    setChecklistItems((current) =>
      current.map((item) => (item.id === id ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() } : item))
    );
    addActivity("Checklist updated", "Checklist progress changed.", "Checklist");
  }

  function deleteChecklistItem(id: string) {
    setChecklistItems((current) => current.filter((item) => item.id !== id));
    addActivity("Checklist updated", "Checklist item deleted.", "Checklist");
  }

  function addProjectNote() {
    const text = noteText.trim();
    if (!text) return;
    setProjectNotes((current) => [
      {
        id: crypto.randomUUID(),
        text,
        type: noteType,
        createdAt: new Date().toISOString(),
        createdBy: userEmail
      },
      ...current
    ]);
    setNoteText("");
    addActivity("Note added", `${noteType}: ${text}`, "Notes");
  }

  function toggleTag(tag: string) {
    if (!activeProjectId) {
      showToast("Save or load a project before adding tags.");
      return;
    }
    setTagStore((current) => {
      const currentTags = current[activeProjectId] ?? [];
      const nextTags = currentTags.includes(tag) ? currentTags.filter((item) => item !== tag) : [...currentTags, tag];
      return { ...current, [activeProjectId]: nextTags };
    });
    addActivity("Tags updated", `${tag} tag toggled.`, "Tags");
  }

  function addCustomTag() {
    const tag = customTag.trim();
    if (!tag) return;
    toggleTag(tag);
    setCustomTag("");
  }

  function createProjectSnapshot() {
    const snapshot: ProjectSnapshot = {
      id: crypto.randomUUID(),
      name: `${projectForm.projectName || "Project"} snapshot`,
      createdAt: new Date().toISOString(),
      projectName: projectForm.projectName,
      address: projectForm.address || address,
      measurements,
      mapData: workZones.length ? createSavedProjectMapData(workZones, projectForm.status, projectForm.address || address, projectForm.projectName) : draftMapData,
      estimate: {
        revenue: projectEstimate.estimatedRevenue,
        cost: projectEstimate.estimatedCost,
        profit: projectEstimate.estimatedProfit,
        margin: projectEstimate.profitMargin
      }
    };
    setSnapshots((current) => [snapshot, ...current].slice(0, 12));
    addActivity("Snapshot created", snapshot.name, "Snapshot");
    showToast("✓ Snapshot Saved");
  }

  function restoreSnapshot(snapshot: ProjectSnapshot) {
    setProjectForm((current) => ({ ...current, projectName: snapshot.projectName, address: snapshot.address }));
    setAddress(snapshot.address || "No address selected");
    setMeasurements(snapshot.measurements);
    setDraftMapData(snapshot.mapData);
    setMapResetKey((current) => current + 1);
    addActivity("Snapshot restored", snapshot.name, "Snapshot");
    showToast("✓ Snapshot Restored");
  }

  function handleShareProject() {
    setShareMessage("Share links coming soon.");
    showToast("Share links coming soon.");
  }

  return (
    <main className="dashboard-page">
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className="dashboard-toast" key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
      <header className="dashboard-header">
        <div className="dashboard-header-search-wrap">
          <div className="dashboard-header-search" id="dashboard-search-mount" />
        </div>
        <div className="dashboard-header-actions">
          <button className="dashboard-icon-button" type="button" aria-label="Notifications placeholder">
            <span className="dashboard-notification-dot" />
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M10 3.2a3.2 3.2 0 0 0-3.2 3.2v1.3c0 .8-.3 1.6-.8 2.2l-1.1 1.3h10.2L14 9.9a3.5 3.5 0 0 1-.8-2.2V6.4A3.2 3.2 0 0 0 10 3.2Z M8.5 15.8a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
            </svg>
          </button>
          <div className="dashboard-user-chip">
            <span className="dashboard-avatar">{getAvatarLabel(userEmail)}</span>
            <div>
              <strong>{activeProject?.project_name ?? "Map Workspace"}</strong>
              <span>{userEmail}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <AppSidebar active={sidebarActiveKey} ariaLabel="Dashboard navigation" />
        </aside>

        <section className="dashboard-main">
          <section className="dashboard-map-panel">
            <div className="workflow-guide-bar" aria-label="AcreX workflow">
              {["Search", "Select Service", "Draw", "Measurements", "Quote", "Export"].map((step) => (
                <span className={workflowState.step === step ? "active" : ""} key={step}>
                  {step}
                </span>
              ))}
              <strong>{workflowState.message}</strong>
            </div>
            <div className="map-command-bar" aria-label="Quick actions">
              <button type="button" onClick={handleSaveProject} disabled={isSavingProject}>
                {isSavingProject ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={handleShareProject}>Export</button>
            </div>
            <AcrexMap
              activeProjectId={activeProjectId}
              resetKey={mapResetKey}
              initialAddress={activeProject?.address ?? null}
              initialPolygon={activeProject?.polygon_geojson ?? draftMapData}
              onAddressChange={handleAddressChange}
              onAddressDetailsChange={setAddressDetails}
              onMeasurementsChange={setMeasurements}
              onPolygonChange={setPolygon}
              onZonesChange={setWorkZones}
              onSelectedZonesChange={handleSelectedZonesChange}
              onParcelLookupChange={setParcelLookup}
              searchMountId="dashboard-search-mount"
              useParcelRequestKey={useParcelRequestKey}
            />
          </section>

          {isInspectorOpen ? (
          <aside className="dashboard-summary-panel">
            <div className="dashboard-summary-card">
              <div className="dashboard-summary-heading">
                <div>
                  <span>Project Summary</span>
                  <strong>{activeProject?.project_name ?? projectForm.projectName}</strong>
                </div>
                <div className="dashboard-summary-actions">
                  <button className="summary-light-button" type="button" onClick={handleNewProject}>
                    New Project
                  </button>
                  <button
                    className="summary-light-button"
                    type="button"
                    onClick={() => {
                      setSelectedZones([]);
                      setActivePanel(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className={getPanelClass(effectivePanel, "project", "dashboard-metrics-grid")}>
                <span>Projects this month <strong>{dashboardMetrics.thisMonthProjects}</strong></span>
                <span>Quotes sent <strong>{dashboardMetrics.quotesSent}</strong></span>
                <span>Quotes accepted <strong>{dashboardMetrics.quotesAccepted}</strong></span>
                <span>Estimated revenue <strong>{formatCurrency(dashboardMetrics.estimatedRevenue || projectEstimate.estimatedRevenue)}</strong></span>
                <span>Outstanding invoices <strong>{formatCurrency(dashboardMetrics.outstandingInvoices)}</strong></span>
                <span>Paid invoices <strong>{formatCurrency(dashboardMetrics.paidInvoices)}</strong></span>
                <span>Avg margin <strong>{formatNumber(dashboardMetrics.averageProfitMargin, 1)}%</strong></span>
                <span>Upcoming jobs <strong>Coming Soon</strong></span>
              </div>

              <div className={getPanelClass(effectivePanel, "search", "global-search-panel")}>
                <label>
                  Global Search
                  <input
                    value={globalSearchTerm}
                    onChange={(event) => setGlobalSearchTerm(event.target.value)}
                    placeholder="Search projects, clients, quotes, invoices, activity..."
                    type="search"
                  />
                </label>
                {globalSearchTerm.trim() ? (
                  <div className="global-search-results">
                    <div>
                      <strong>Projects</strong>
                      {globalSearchResults.projectMatches.slice(0, 3).map((project) => (
                        <Link href={`/dashboard?project=${project.id}`} key={project.id}>{project.project_name}</Link>
                      ))}
                    </div>
                    <div>
                      <strong>Clients</strong>
                      {globalSearchResults.clientMatches.slice(0, 3).map((client) => (
                        <Link href="/clients" key={client.id}>{client.name}</Link>
                      ))}
                    </div>
                    <div>
                      <strong>Quotes</strong>
                      {globalSearchResults.quoteMatches.slice(0, 3).map((quote) => (
                        <Link href="/quotes" key={quote.id}>{quote.quote_number}</Link>
                      ))}
                    </div>
                    <div>
                      <strong>Invoices</strong>
                      {globalSearchResults.invoiceMatches.slice(0, 3).map((invoice) => (
                        <Link href="/invoices" key={invoice.id}>{invoice.invoice_number}</Link>
                      ))}
                    </div>
                    <div>
                      <strong>Recent Activity</strong>
                      {globalSearchResults.activityMatches.slice(0, 3).map((activity) => (
                        <span key={activity.id}>{activity.description}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="dashboard-summary-address">
                <strong>{address}</strong>
                <span>{isLoadingProjects ? "Loading saved project data..." : `${workZones.length} work zone${workZones.length === 1 ? "" : "s"} marked on the map.`}</span>
                {draftSavedTime ? <small>✓ Draft Saved {draftSavedTime}</small> : null}
              </div>

              <div className={getPanelClass(effectivePanel, "project", "project-health-panel")}>
                <div className="selected-areas-heading">
                  <span>Project Health</span>
                  <strong>{projectForm.status}</strong>
                </div>
                <div className="project-health-grid">
                  <span>Project <strong className={`project-status-pill status-${projectForm.status.toLowerCase()}`}>{projectForm.status}</strong></span>
                  <span>Last modified <strong>{formatDateTime(activeProject?.updated_at)}</strong></span>
                  <span>Last auto-save <strong>{formatDateTime(draftSavedAt)}</strong></span>
                  <span>Client <strong>{selectedClient?.name || "Not assigned"}</strong></span>
                  <span>Quote <strong>{quoteStatus}</strong></span>
                  <span>Invoice <strong>{invoiceStatus}</strong></span>
                  <span>Revenue <strong>{formatCurrency(projectEstimate.estimatedRevenue)}</strong></span>
                  <span>Cost <strong>{formatCurrency(projectEstimate.estimatedCost)}</strong></span>
                  <span>Profit <strong>{formatCurrency(projectEstimate.estimatedProfit)}</strong></span>
                  <span>Margin <strong>{formatNumber(projectEstimate.profitMargin, 1)}%</strong></span>
                  <span>Zones <strong>{workZones.length}</strong></span>
                  <span>Billable area <strong>{formatAcres(netBillableAcres)} ac</strong></span>
                </div>
              </div>

                <div className={getPanelClass(effectivePanel, "project", "tag-panel")}>
                <div className="selected-areas-heading">
                  <span>Project Tags</span>
                  <strong>{activeProjectTags.length || "None"}</strong>
                </div>
                <div className="tag-list">
                  {defaultProjectTags.map((tag) => (
                    <button
                      className={activeProjectTags.includes(tag) ? "active" : ""}
                      type="button"
                      key={tag}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="tag-add-row">
                  <input value={customTag} onChange={(event) => setCustomTag(event.target.value)} placeholder="Add custom tag" />
                  <button type="button" onClick={addCustomTag}>Add</button>
                </div>
              </div>

              {addressDetails ? (
                <div className={getPanelClass(effectivePanel, "search", "address-details-panel")}>
                  <div>
                    <span>Address Details</span>
                    <strong>{addressDetails.address}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Parcel ID</dt>
                      <dd>{addressDetails.parcelId ?? "Pending parcel data"}</dd>
                    </div>
                    <div>
                      <dt>County</dt>
                      <dd>{addressDetails.county ?? "Pending county data"}</dd>
                    </div>
                    <div>
                      <dt>Latitude</dt>
                      <dd>{addressDetails.latitude.toFixed(6)}</dd>
                    </div>
                    <div>
                      <dt>Longitude</dt>
                      <dd>{addressDetails.longitude.toFixed(6)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              <div className={getPanelClass(effectivePanel, "layers", `parcel-boundary-panel parcel-status-${parcelLookup.status}`)}>
                <div>
                  <span>Parcel Lines</span>
                  <strong>
                    {parcelLookup.status === "found"
                      ? "Boundary Found"
                      : parcelLookup.status === "loading"
                        ? "Checking Parcel Data"
                        : "Draw Manually"}
                  </strong>
                </div>
                <p>{parcelLookup.message}</p>
                {parcelLookup.measurements ? (
                  <dl>
                    <div>
                      <dt>Parcel Acres</dt>
                      <dd>{formatAcres(parcelLookup.measurements.acres)} ac</dd>
                    </div>
                    <div>
                      <dt>Square Feet</dt>
                      <dd>{formatSquareFeet(parcelLookup.measurements.squareFeet)} sq ft</dd>
                    </div>
                  </dl>
                ) : null}
                <small>Parcel lines are approximate and not legal survey boundaries.</small>
                <div className="parcel-actions">
                  <button
                    type="button"
                    onClick={() => setUseParcelRequestKey((current) => current + 1)}
                    disabled={parcelLookup.status !== "found"}
                  >
                    Use Parcel Boundary
                  </button>
                  <button type="button" onClick={() => setProjectMessage("Draw manually with the Property type selected.")}>
                    Draw Manually
                  </button>
                </div>
              </div>

              <label className={getPanelClass(effectivePanel, "project", "project-status-control")}>
                Client
                <select
                  value={projectForm.clientId}
                  onChange={(event) => {
                    const nextClient = clients.find((client) => client.id === event.target.value) ?? null;
                    setProjectForm((current) => ({
                      ...current,
                      clientId: event.target.value,
                      customerName: nextClient?.name ?? current.customerName
                    }));
                  }}
                  disabled={isLoadingClients}
                >
                  <option value="">{isLoadingClients ? "Loading clients..." : "No client selected"}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}{client.company ? ` - ${client.company}` : ""}
                    </option>
                  ))}
                </select>
                <span>{selectedClient ? selectedClient.email || selectedClient.phone || "Client linked to this project." : "Create clients on the Clients page, then link them here."}</span>
              </label>

              <label className={getPanelClass(effectivePanel, "project", "project-status-control")}>
                Status
                <select
                  value={projectForm.status}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      status: event.target.value as ProjectStatus
                    }))
                  }
                >
                  {projectStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className={getPanelClass(effectivePanel, "measurements", "dashboard-summary-metrics measurement-totals-pin")}>
                {summaryRows.map((row) => (
                  <div className="summary-metric-row" key={row.label}>
                    <span>{row.label}</span>
                    <strong className="animated-value" key={`${row.label}-${row.value}`}>{row.value}</strong>
                  </div>
                ))}
              </div>

              <div className={getPanelClass(effectivePanel, "measurements", "measurements-by-service-panel")}>
                <div className="selected-areas-heading">
                  <span>Measurements by Service</span>
                  <strong>{workZones.length ? `${workZones.length} saved` : "Empty"}</strong>
                </div>
                {groupedMeasurements.length ? (
                  groupedMeasurements.map((group) => (
                    <div className="measurement-service-group" key={group.key}>
                      <div>
                        <span style={{ "--zone-color": group.color } as CSSProperties} />
                        <strong>{group.key}</strong>
                        <small>{group.total}</small>
                      </div>
                      {group.zones.map((zone) => (
                        <div className="measurement-zone-row" key={zone.id}>
                          <i style={{ background: zone.color ?? zoneColors[zone.type] }} />
                          <div className="measurement-zone-main">
                            <span>{zone.name}</span>
                            <strong>{formatZoneMeasurement(zone)}</strong>
                          </div>
                          <div className="measurement-zone-actions" aria-label={`${zone.name} actions`}>
                            <button type="button" onClick={() => showToast("Select the zone on the map to edit it")}>Edit</button>
                            <button type="button" onClick={() => showToast("Use the map layer controls to hide this zone type")}>Hide</button>
                            <button type="button" onClick={() => showToast("Select the zone on the map, then delete it")}>Delete</button>
                            <Link href={`/quotes?project=${activeProjectId ?? ""}`}>Add to quote</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <p>No measurements yet. Select Grass, Brush, Fence, Driveway, or another service and draw on the map.</p>
                )}
              </div>

              <div className={getPanelClass(effectivePanel, "measurements", "selected-areas-panel")} aria-live="polite">
                <div className="selected-areas-heading">
                  <span>Selected Areas</span>
                  <strong>{selectedZones.length ? `${selectedZones.length} selected` : "None selected"}</strong>
                </div>
                {selectedZones.length ? (
                  <>
                    <div className="selected-areas-list">
                      {selectedZones.map((zone) => (
                        <div className="selected-area-row" key={zone.id}>
                          <div>
                            <strong>{zone.name}</strong>
                            <span className="zone-color-badge" style={{ "--zone-color": zone.color ?? zoneColors[zone.type] } as CSSProperties}>
                              {zone.locked ? "Locked " : ""}{zone.serviceTypeLabel ?? zoneLabels[zone.type]}
                            </span>
                          </div>
                          <dl>
                            <div>
                              <dt>Acres</dt>
                              <dd>{formatAcres(zone.acres)} ac</dd>
                            </div>
                            <div>
                              <dt>Square feet</dt>
                              <dd>{formatSquareFeet(zone.squareFeet)} sq ft</dd>
                            </div>
                            <div>
                              <dt>Perimeter</dt>
                              <dd>{formatFeet(zone.lengthFt ?? zone.perimeterFeet)} linear ft</dd>
                            </div>
                            {zone.notes ? (
                              <div>
                                <dt>Notes</dt>
                                <dd>{zone.notes}</dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                      ))}
                    </div>
                    {selectedZones.length > 1 ? (
                      <div className="selected-areas-total">
                        <span>Combined Selected Total</span>
                        <strong>{formatAcres(selectedTotals.acres)} ac / {formatSquareFeet(selectedTotals.squareFeet)} sq ft</strong>
                        <small>{formatFeet(selectedTotals.perimeterFeet)} linear ft</small>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>Select one or more drawn areas to review acreage, square footage, perimeter, and notes here.</p>
                )}
              </div>

              <div className={getPanelClass(effectivePanel, "quote", "estimator-panel")}>
                <div className="selected-areas-heading">
                  <span>Project Estimator</span>
                  <strong>{formatCurrency(recommendedQuote)}</strong>
                </div>
                <Link className="summary-light-button quote-measurements-link" href={`/quotes${activeProjectId ? `?project=${activeProjectId}` : ""}`}>
                  Add measurements to quote
                </Link>
                <div className="live-estimator-grid">
                  <span>Parcel acreage <strong>{formatAcres(propertyAcres || measurements?.acres || 0)} ac</strong></span>
                  <span>Grass acreage <strong>{formatAcres(grassAcres)} ac</strong></span>
                  <span>Brush acreage <strong>{formatAcres(brushAcres)} ac</strong></span>
                  <span>Driveway <strong>{formatSquareFeet(drivewaySqFt)} sq ft</strong></span>
                  <span>Fence <strong>{formatFeet(fenceLinearFt)} ft</strong></span>
                  <span>Building/excluded <strong>{formatAcres(buildingAcres + excludedAcres)} ac</strong></span>
                  <span>Net billable <strong>{formatAcres(netBillableAcres)} ac</strong></span>
                  <span>Estimated revenue <strong>{formatCurrency(projectEstimate.estimatedRevenue)}</strong></span>
                  <span>Estimated cost <strong>{formatCurrency(projectEstimate.estimatedCost)}</strong></span>
                  <span>Estimated profit <strong>{formatCurrency(projectEstimate.estimatedProfit)}</strong></span>
                  <span>Recommended quote <strong>{formatCurrency(recommendedQuote)}</strong></span>
                </div>
                <div className="estimator-context-grid">
                  <span>
                    Address
                    <strong>{projectForm.address || address}</strong>
                  </span>
                  <span>
                    Client
                    <strong>{selectedClient?.name || projectForm.customerName || "No client linked"}</strong>
                  </span>
                  <span>
                    Service
                    <strong>{projectForm.serviceType}</strong>
                  </span>
                </div>
                {projectEstimate.lines.length ? (
                  <>
                    <div className="estimate-lines">
                      {projectEstimate.lines.map((line) => (
                        <div key={line.id}>
                          <span>{line.serviceName} - {line.zoneName}</span>
                          <strong>{formatCurrency(line.recommendedRevenue)}</strong>
                          <small>
                            {formatNumber(line.quantity)} {line.unit} · {formatNumber(line.productionRate)} {line.unit}/hr · {formatNumber(line.estimatedHours, 1)} hr
                          </small>
                        </div>
                      ))}
                    </div>
                    <div className="estimator-breakdown-grid">
                      <span>Estimated production rate <strong>{formatNumber(projectEstimate.estimatedProductionRate, 2)} units/hr</strong></span>
                      <span>Estimated labor hours <strong>{formatNumber(projectEstimate.estimatedLaborHours, 1)} hr</strong></span>
                      <span>Labor cost <strong>{formatCurrency(projectEstimate.laborCost)}</strong></span>
                      <span>Equipment cost <strong>{formatCurrency(projectEstimate.equipmentCost)}</strong></span>
                      <span>Fuel cost <strong>{formatCurrency(projectEstimate.fuelCost)}</strong></span>
                      <span>Material cost <strong>{formatCurrency(projectEstimate.materialCost)}</strong></span>
                      <span>Dump/disposal cost <strong>{formatCurrency(projectEstimate.disposalCost)}</strong></span>
                      <span>Travel charge <strong>{formatCurrency(projectEstimate.travelCharge)}</strong></span>
                      <span>Other costs <strong>{formatCurrency(projectEstimate.otherCost)}</strong></span>
                      <span>Recommended markup <strong>{formatNumber(projectEstimate.recommendedMarkup, 1)}%</strong></span>
                      <span>Estimated revenue <strong>{formatCurrency(projectEstimate.estimatedRevenue)}</strong></span>
                      <span>Estimated cost <strong>{formatCurrency(projectEstimate.estimatedCost)}</strong></span>
                      <span>Estimated profit <strong>{formatCurrency(projectEstimate.estimatedProfit)}</strong></span>
                      <span>Profit margin <strong>{formatNumber(projectEstimate.profitMargin, 1)}%</strong></span>
                    </div>
                    <p>Estimator updates from zone measurements, production rates, cost inputs, and service templates.</p>
                  </>
                ) : (
                  <p>Draw Grass, Brush, Driveway, Property, or Custom zones to generate a live close estimate.</p>
                )}
              </div>

              <div className={getPanelClass(effectivePanel, "quote", "profit-panel")}>
                <div className="selected-areas-heading">
                  <span>Pricing Inputs</span>
                  <strong>{formatCurrency(projectEstimate.estimatedProfit)}</strong>
                </div>
                <div className="profit-input-grid">
                  {[
                    ["laborRate", "Labor $/hr"],
                    ["estimatedHours", "Extra Hours"],
                    ["fuelCost", "Fuel"],
                    ["equipmentCost", "Equipment"],
                    ["materialCost", "Materials"],
                    ["disposalCost", "Dump"],
                    ["travelCharge", "Travel"],
                    ["otherCost", "Other"],
                    ["markupPercent", "Markup %"]
                  ].map(([field, label]) => (
                    <label key={field}>
                      {label}
                      <input
                        value={String(profitInputs[field as keyof ProfitInputs])}
                        inputMode="decimal"
                        onChange={(event) =>
                          setProfitInputs((current) => ({
                            ...current,
                            [field]: Number(event.target.value) || 0
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="profit-output-grid">
                  <span>Revenue <strong>{formatCurrency(projectEstimate.estimatedRevenue)}</strong></span>
                  <span>Cost <strong>{formatCurrency(projectEstimate.estimatedCost)}</strong></span>
                  <span>Margin <strong>{formatNumber(projectEstimate.profitMargin, 1)}%</strong></span>
                </div>
              </div>

              <details className={getPanelClass(effectivePanel, "settings", "service-template-panel")}>
                <summary>
                  <span>Job Cost Library</span>
                  <strong>{serviceTemplates.filter((template) => template.active !== false).length} active</strong>
                </summary>
                <div className="template-list">
                  {serviceTemplates.map((template) => (
                    <div className="template-row" key={template.id}>
                      <div>
                        <strong>{template.serviceName}</strong>
                        <span>{template.billableZoneTypes.map((type) => zoneLabels[type]).join(", ")}</span>
                      </div>
                      <label>
                        Active
                        <input
                          checked={template.active !== false}
                          type="checkbox"
                          onChange={(event) =>
                            setServiceTemplates((current) =>
                              current.map((item) => (item.id === template.id ? { ...item, active: event.target.checked } : item))
                            )
                          }
                        />
                      </label>
                      <label>
                        Unit
                        <input
                          value={template.unitType}
                          onChange={(event) =>
                            setServiceTemplates((current) =>
                              current.map((item) => (item.id === template.id ? { ...item, unitType: event.target.value } : item))
                            )
                          }
                        />
                      </label>
                      <label>
                        Rate
                        <input
                          value={String(template.defaultUnitPrice)}
                          inputMode="decimal"
                          onChange={(event) =>
                            setServiceTemplates((current) =>
                              current.map((item) =>
                                item.id === template.id ? { ...item, defaultUnitPrice: Number(event.target.value) || 0 } : item
                              )
                            )
                          }
                        />
                      </label>
                      <label>
                        Production/hr
                        <input
                          value={String(template.productionRatePerHour ?? 0)}
                          inputMode="decimal"
                          onChange={(event) =>
                            setServiceTemplates((current) =>
                              current.map((item) =>
                                item.id === template.id ? { ...item, productionRatePerHour: Number(event.target.value) || 0 } : item
                              )
                            )
                          }
                        />
                      </label>
                      <label>
                        Min
                        <input
                          value={String(template.minimumCharge)}
                          inputMode="decimal"
                          onChange={(event) =>
                            setServiceTemplates((current) =>
                              current.map((item) =>
                                item.id === template.id ? { ...item, minimumCharge: Number(event.target.value) || 0 } : item
                              )
                            )
                          }
                        />
                      </label>
                      <small>{template.notes}</small>
                    </div>
                  ))}
                </div>
              </details>

              <div className={getPanelClass(effectivePanel, "project", "workflow-panel")}>
                <span>Workflow</span>
                <div>
                  <strong className={workZones.length ? "done" : ""}>Project</strong>
                  <strong className={projectForm.status === "Quoted" || projectForm.status === "Won" || projectForm.status === "Completed" ? "done" : ""}>Quote</strong>
                  <strong className={projectForm.status === "Won" || projectForm.status === "Completed" ? "done" : ""}>Accepted</strong>
                  <strong>Invoice</strong>
                  <strong>Paid</strong>
                </div>
              </div>

              <div className={getPanelClass(effectivePanel, "project", "checklist-panel")}>
                <div className="selected-areas-heading">
                  <span>Project Checklist</span>
                  <strong>{checklistItems.filter((item) => item.completed).length}/{checklistItems.length}</strong>
                </div>
                <div className="checklist-list">
                  {checklistItems.map((item) => (
                    <div className="checklist-row" key={item.id}>
                      <input checked={item.completed} type="checkbox" onChange={() => toggleChecklistItem(item.id)} />
                      {editingChecklistId === item.id ? (
                        <input
                          value={checklistDraft}
                          onChange={(event) => setChecklistDraft(event.target.value)}
                          onBlur={() => {
                            updateChecklistItem(item.id, checklistDraft.trim() || item.text);
                            setEditingChecklistId(null);
                          }}
                        />
                      ) : (
                        <button
                          className={item.completed ? "completed" : ""}
                          type="button"
                          onClick={() => {
                            setEditingChecklistId(item.id);
                            setChecklistDraft(item.text);
                          }}
                        >
                          {item.text}
                        </button>
                      )}
                      <button type="button" onClick={() => deleteChecklistItem(item.id)}>Delete</button>
                    </div>
                  ))}
                </div>
                <div className="tag-add-row">
                  <input value={newChecklistText} onChange={(event) => setNewChecklistText(event.target.value)} placeholder="Add checklist item" />
                  <button type="button" onClick={addChecklistItem}>Add</button>
                </div>
              </div>

              <div className={getPanelClass(effectivePanel, "project", "notes-panel")}>
                <div className="selected-areas-heading">
                  <span>Notes Timeline</span>
                  <strong>{projectNotes.length}</strong>
                </div>
                <div className="note-compose-row">
                  <select value={noteType} onChange={(event) => setNoteType(event.target.value as ProjectNoteType)}>
                    {noteTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add timestamped project note..." />
                  <button type="button" onClick={addProjectNote}>Add Note</button>
                </div>
                <div className="timeline-list">
                  {projectNotes.map((note) => (
                    <article key={note.id}>
                      <strong>{note.type}</strong>
                      <span>{formatDateTime(note.createdAt)} · {note.createdBy}</span>
                      <p>{note.text}</p>
                    </article>
                  ))}
                  {!projectNotes.length ? <p>No notes yet.</p> : null}
                </div>
              </div>

              <div className={getPanelClass(effectivePanel, "project", "activity-panel")}>
                <div className="selected-areas-heading">
                  <span>Activity Log</span>
                  <strong>{activityLog.length}</strong>
                </div>
                <div className="timeline-list">
                  {activityLog.slice(0, 8).map((activity) => (
                    <article key={activity.id}>
                      <strong>{activity.action}</strong>
                      <span>{formatDateTime(activity.createdAt)} · {activity.entity}</span>
                      <p>{activity.description}</p>
                    </article>
                  ))}
                  {!activityLog.length ? <p>No activity recorded yet.</p> : null}
                </div>
              </div>

              <div className={getPanelClass(effectivePanel, "measurements", "calculator-panel")}>
                <div className="selected-areas-heading">
                  <span>Built-in Calculators</span>
                  <strong>{getCalculatorResult(calculatorType, measurements)}</strong>
                </div>
                <select value={calculatorType} onChange={(event) => setCalculatorType(event.target.value)}>
                  {[
                    "Fence linear feet",
                    "Sod square footage",
                    "Gravel amount",
                    "Mulch amount",
                    "Topsoil amount",
                    "Concrete cubic yards",
                    "Driveway stone",
                    "Forestry mulching acreage",
                    "Mowing acreage"
                  ].map((calculator) => <option key={calculator} value={calculator}>{calculator}</option>)}
                </select>
                <p>Uses the current project measurements when available.</p>
              </div>

              <div className={getPanelClass(effectivePanel, "project", "snapshot-panel")}>
                <div className="selected-areas-heading">
                  <span>Project Snapshots</span>
                  <strong>{snapshots.length}</strong>
                </div>
                <button type="button" onClick={createProjectSnapshot}>Create Snapshot</button>
                <div className="snapshot-list">
                  {snapshots.map((snapshot) => (
                    <div key={snapshot.id}>
                      <span>{snapshot.name}</span>
                      <small>{formatDateTime(snapshot.createdAt)} · {formatCurrency(snapshot.estimate.revenue)}</small>
                      <button type="button" onClick={() => restoreSnapshot(snapshot)}>Restore</button>
                    </div>
                  ))}
                  {!snapshots.length ? <p>No snapshots saved yet.</p> : null}
                </div>
              </div>

              <div className={getPanelClass(effectivePanel, "project", "share-panel")}>
                <div>
                  <span>Share Project</span>
                  <strong>Read-only share links coming soon.</strong>
                </div>
                <button type="button" onClick={handleShareProject}>Share Project</button>
                {shareMessage ? <p>{shareMessage}</p> : null}
              </div>

              <div className={getPanelClass(effectivePanel, "settings", "photo-placeholder-panel")}>
                <span>Project Photos</span>
                <strong>Photos coming soon.</strong>
                <p>Before, during, and after photo storage will be enabled when storage is configured.</p>
                <div>
                  <button type="button" disabled>Before photos</button>
                  <button type="button" disabled>During photos</button>
                  <button type="button" disabled>After photos</button>
                </div>
              </div>

              <div className="dashboard-summary-footer">
                <div className="summary-estimate-card">
                  <span>Estimator Revenue</span>
                  <strong>{formatCurrency(recommendedQuote || estimatedTotal)}</strong>
                </div>
                <button
                  className={`save-project-button${isSavingProject ? " is-processing" : ""}`}
                  type="button"
                  onClick={handleSaveProject}
                  disabled={isSavingProject}
                >
                  {isSavingProject ? "Saving..." : "Save Project"}
                </button>
                <Link className="generate-quote-button" href={`/quotes${activeProjectId ? `?project=${activeProjectId}` : ""}`}>
                  Generate Quote
                </Link>
                {projectMessage ? <p className="project-message">{projectMessage}</p> : null}
              </div>
            </div>

            <div className="dashboard-placeholder-stack">
              <div className="dashboard-placeholder-card">
                <span>Projects</span>
                <strong>{projects.length ? `${projects.length} saved project${projects.length === 1 ? "" : "s"}` : "No saved projects yet"}</strong>
              </div>
              <div className="dashboard-placeholder-card">
                <span>Service Type</span>
                <strong>{projectForm.serviceType}</strong>
              </div>
              <div className="dashboard-placeholder-card">
                <span>AI Assistant</span>
                <strong>Coming Soon</strong>
              </div>
            </div>
          </aside>
          ) : null}
        </section>
      </section>
    </main>
  );
}
