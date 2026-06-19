"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AppSidebar, type AppSidebarKey } from "@/components/ui/app-sidebar";
import type { Feature, Polygon } from "geojson";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatAcres, formatFeet, formatSquareFeet } from "@/lib/geo/format";
import type { ProjectMeasurements } from "@/lib/geo/measurements";
import { mapStyleOptions, mapStyles, type MapStyle } from "@/lib/map/styles";
import {
  createChecklistFromService,
  defaultProjectTags,
  getDashboardDraftKey,
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
import { withResolvedProjectLocation } from "@/lib/projects/project-location";
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
import { serviceTypes } from "@/lib/projects/service-types";
import type { ClientRecord, DrawingLocationSource, InvoiceRecord, ProjectFormState, ProjectRecord, ProjectStatus, QuoteItemRecord, QuoteRecord, SavedProjectMapData, WorkZone, ZoneType } from "@/lib/projects/types";
import { zoneColors, zoneLabels } from "@/lib/projects/zones";
import { defaultUserSettings, loadUserSettings } from "@/lib/settings/user-settings";

type DashboardShellProps = {
  userId: string;
  userEmail: string;
};

type AddressDetails = {
  address: string;
  latitude: number;
  longitude: number;
  county?: string | null;
  parcelId?: string | null;
  source?: DrawingLocationSource;
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
  titleManuallyEdited?: boolean;
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
type DashboardPanelKey = "search" | "layers" | "measurements" | "quote" | "project";
type MobileSheetKey = "draw" | "project" | "quote" | "layers" | "more" | "shape";
type MobileSheetSize = "collapsed" | "half" | "full";
type MobileMapCommand = {
  id: number;
  action:
    | "draw-service"
    | "layers"
    | "locate"
    | "map-style"
    | "toggle-3d"
    | "reset-view"
    | "rename-selected"
    | "service-selected"
    | "color-selected"
    | "toggle-selected"
    | "zoom-selected"
    | "delete-selected"
    | "clear-selection";
  value?: string;
};

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

function normalizeQuoteItem(row: unknown): QuoteItemRecord {
  return row as QuoteItemRecord;
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
  projectName: string,
  titleManuallyEdited: boolean
): SavedProjectMapData {
  return {
    type: "FeatureCollection",
    properties: {
      status,
      address,
      projectName,
      titleManuallyEdited
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
        createdAt: zone.createdAt,
        address: zone.address,
        latitude: zone.latitude,
        longitude: zone.longitude,
        centroid: zone.centroid,
        parcelId: zone.parcelId,
        locationSource: zone.locationSource
      }
    }))
  };
}

function getPreferredDrawingLocation(zones: WorkZone[], selectedZones: WorkZone[] = []) {
  const selectedIds = new Set(selectedZones.map((zone) => zone.id));
  const candidates = [
    ...selectedZones,
    ...[...zones]
      .filter((zone) => !selectedIds.has(zone.id))
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
  ];

  return candidates.find(
    (zone) =>
      Boolean(zone.address?.trim()) ||
      (Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude))
  ) ?? null;
}

function getDrawingAddress(zones: WorkZone[], fallback: string, selectedZones: WorkZone[] = []) {
  const location = getPreferredDrawingLocation(zones, selectedZones);
  if (location?.address?.trim()) return location.address.trim();
  if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
    return `Lat: ${location?.latitude?.toFixed(6)}, Lng: ${location?.longitude?.toFixed(6)}`;
  }
  return fallback;
}

function getAutoProjectTitle(address: string, customerName = "") {
  const normalizedAddress = address.trim();
  if (!normalizedAddress || normalizedAddress === "No address selected") return "Untitled Project";
  const titleAddress = normalizedAddress.replace(/^Lat:\s*/i, "Lat ");
  const normalizedCustomer = customerName.trim();
  return normalizedCustomer
    ? `${normalizedCustomer} - ${titleAddress}`
    : `${titleAddress} Estimate`;
}

function getSavedTitleManualState(project: ProjectRecord) {
  const mapData = project.polygon_geojson;
  if (isFeatureCollection(mapData) && typeof mapData.properties?.titleManuallyEdited === "boolean") {
    return mapData.properties.titleManuallyEdited;
  }

  const savedName = project.project_name?.trim() || "Untitled Project";
  if (savedName === "Untitled Project") return false;
  return savedName !== getAutoProjectTitle(project.address ?? "", project.customer_name ?? "");
}

function normalizeProject(row: unknown): ProjectRecord {
  return withResolvedProjectLocation(row as ProjectRecord);
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

export function DashboardShell({ userId, userEmail }: DashboardShellProps) {
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project");
  const [measurements, setMeasurements] = useState<ProjectMeasurements | null>(null);
  const [address, setAddress] = useState("No address selected");
  const [polygon, setPolygon] = useState<Feature<Polygon> | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteItemRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [mapResetKey, setMapResetKey] = useState(0);
  const [explorerRequest, setExplorerRequest] = useState<{ id: number; type: ZoneType | null }>({ id: 0, type: null });
  const [activePanel, setActivePanel] = useState<DashboardPanelKey | null>(null);
  const [mobileSheet, setMobileSheet] = useState<MobileSheetKey | null>(null);
  const [mobileSheetSize, setMobileSheetSize] = useState<MobileSheetSize>("half");
  const [mobileMapCommand, setMobileMapCommand] = useState<MobileMapCommand | undefined>(undefined);
  const [preferredMapStyle, setPreferredMapStyle] = useState<MapStyle>(defaultUserSettings.map.preferredStyle);
  const [is3DMapView, setIs3DMapView] = useState(false);
  const [mobileSheetDrag, setMobileSheetDrag] = useState(0);
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
  const sidebarActiveKey: AppSidebarKey =
    requestedPanel === "measurements"
      ? "drawings"
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
  const dashboardDrawerRef = useRef<HTMLElement | null>(null);
  const previousZoneSnapshotRef = useRef<string>("");
  const lastDraftJsonRef = useRef<string>("");
  const drawingPersistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadedRequestedProjectIdRef = useRef<string | null>(null);
  const hasStartedDraftRestoreRef = useRef(false);
  const titleManuallyEditedRef = useRef(false);
  const mobileSheetDragStartRef = useRef<number | null>(null);
  const mobileSheetDragRef = useRef(0);

  useEffect(() => {
    titleManuallyEditedRef.current = titleManuallyEdited;
  }, [titleManuallyEdited]);

  useEffect(() => {
    setPreferredMapStyle(loadUserSettings(userId).map.preferredStyle);
  }, [userId]);

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
  const effectivePanel = activePanel;
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
  const quotedZoneNames = useMemo(() => {
    if (!activeProjectId) return [];
    const projectQuoteIds = new Set(quotes.filter((quote) => quote.project_id === activeProjectId).map((quote) => quote.id));
    return quoteItems
      .filter((item) => projectQuoteIds.has(item.quote_id) && item.zone_name)
      .map((item) => item.zone_name as string);
  }, [activeProjectId, quoteItems, quotes]);
  const activeProjectQuoteTotal = quotes
    .filter((quote) => quote.project_id === activeProjectId)
    .reduce((total, quote) => total + Number(quote.total ?? 0), 0);
  const availableMeasurementCount = workZones.filter((zone) => zone.type !== "Excluded").length;
  const mobileEstimateConfidence = Math.min(
    100,
    (activeProjectId ? 25 : 0) +
      (availableMeasurementCount > 0 ? 25 : 0) +
      (serviceTemplates.some((template) => template.active !== false) ? 20 : 0) +
      (projectForm.address ? 15 : 0) +
      (projectForm.clientId ? 15 : 0)
  );
  const selectedMobileZone = selectedZones.length === 1 ? selectedZones[0] : null;
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
    if (hasStartedDraftRestoreRef.current) return;
    hasStartedDraftRestoreRef.current = true;
    if (hasRestoredDraft || requestedProjectId) {
      setHasRestoredDraft(true);
      return;
    }

    try {
      const storedDraft = window.localStorage.getItem(getDashboardDraftKey(userEmail));
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
      const restoredProjectForm = { ...emptyProjectForm, ...(draft.projectForm ?? {}) };
      setProjectForm(restoredProjectForm);
      const restoredTitleManualState =
        typeof draft.titleManuallyEdited === "boolean"
          ? draft.titleManuallyEdited
          : restoredProjectForm.projectName !== "Untitled Project" &&
            restoredProjectForm.projectName !==
              getAutoProjectTitle(restoredProjectForm.address || draft.address || "", restoredProjectForm.customerName);
      setTitleManuallyEdited(restoredTitleManualState);
      titleManuallyEditedRef.current = restoredTitleManualState;
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
    const hasDraftContent =
      Boolean(activeProjectId) ||
      workZones.length > 0 ||
      address !== "No address selected" ||
      projectForm.projectName !== emptyProjectForm.projectName;
    if (!hasDraftContent) return;

    const timeout = window.setTimeout(() => {
      const projectName = projectForm.projectName.trim() || "Untitled Project";
      const activeProjectAddress = activeProjectId
        ? projects.find((project) => project.id === activeProjectId)?.address
        : null;
      const projectAddress =
        activeProjectAddress ||
        getDrawingAddress(workZones, projectForm.address.trim() || address, selectedZones);
      const mapData =
        activeProjectId || workZones.length
          ? createSavedProjectMapData(
              workZones,
              projectForm.status,
              projectAddress,
              projectName,
              titleManuallyEdited
            )
          : draftMapData;
      const draft: DashboardDraft = {
        activeProjectId,
        address,
        addressDetails,
        projectForm,
        titleManuallyEdited,
        mapData,
        measurements,
        savedAt: new Date().toISOString()
      };
      const nextDraftJson = JSON.stringify(draft);
      if (nextDraftJson === lastDraftJsonRef.current) return;

      window.localStorage.setItem(getDashboardDraftKey(userEmail), nextDraftJson);
      lastDraftJsonRef.current = nextDraftJson;
      setDraftSavedAt(draft.savedAt);
      showToast("✓ Draft Saved");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [activeProjectId, address, addressDetails, draftMapData, hasRestoredDraft, measurements, projectForm, projects, selectedZones, showToast, titleManuallyEdited, userEmail, workZones]);

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

    const normalizedQuotes = (quoteRows ?? []).map(normalizeQuote);
    const quoteIds = normalizedQuotes.map((quote) => quote.id);
    const quoteItemRows = quoteIds.length
      ? await supabase.from("quote_items").select("*").eq("user_id", currentUserId).in("quote_id", quoteIds)
      : { data: [] };

    setQuotes(normalizedQuotes);
    setQuoteItems((quoteItemRows.data ?? []).map(normalizeQuoteItem));
    setInvoices((invoiceRows ?? []).map(normalizeInvoice));
  }, []);

  useEffect(() => {
    void loadFinancialRecords();
  }, [loadFinancialRecords]);

  useEffect(() => {
    if (!requestedProjectId || isLoadingProjects || loadedRequestedProjectIdRef.current === requestedProjectId) return;
    loadedRequestedProjectIdRef.current = requestedProjectId;

    const requestedProject = projects.find((project) => project.id === requestedProjectId);
    if (!requestedProject) return;

    setActiveProjectId(requestedProject.id);
    setAddress(requestedProject.address ?? "No address selected");
    setAddressDetails(null);
    setDraftMapData(null);
    const requestedTitleManualState = getSavedTitleManualState(requestedProject);
    setTitleManuallyEdited(requestedTitleManualState);
    titleManuallyEditedRef.current = requestedTitleManualState;
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
  }, [isLoadingProjects, projects, requestedProjectId]);

  useEffect(() => {
    if (!requestedPanel) {
      setActivePanel(null);
      return;
    }

    if (requestedPanel === "measurements") {
      setActivePanel(requestedPanel);
    }
  }, [requestedPanel]);

  useEffect(() => {
    if (!isInspectorOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dashboardDrawerRef.current?.contains(target)) return;
      if (target.closest(".dashboard-sidebar")) return;
      if (target.closest(".map-tool-controls")) return;
      if (target.closest(".zone-editor")) return;
      setSelectedZones([]);
      setActivePanel(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isInspectorOpen]);

  const handleAddressChange = useCallback((nextAddress: string) => {
    setAddress(nextAddress);
    setProjectForm((current) => ({
      ...current,
      address: nextAddress || current.address,
      projectName:
        !titleManuallyEditedRef.current && nextAddress
          ? getAutoProjectTitle(nextAddress, current.customerName)
          : current.projectName
    }));
    if (nextAddress) {
      addActivity("Address searched", nextAddress, "Address");
    }
  }, [addActivity]);

  const sendMobileMapCommand = useCallback((action: MobileMapCommand["action"], value?: string) => {
    setMobileMapCommand({ id: Date.now(), action, value });
  }, []);

  const handleSelectedZonesChange = useCallback((zones: WorkZone[]) => {
    setSelectedZones(zones);
    if (!zones.length) {
      setMobileSheet((current) => (current === "shape" ? null : current));
    }
  }, []);

  const handleMapToolPanelChange = useCallback((panel: "draw" | "layers" | "explorer" | null) => {
    if (!panel) return;
    setActivePanel(null);
    if (
      panel === "explorer" &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1024px) and (orientation: portrait)").matches
    ) {
      setMobileSheet("shape");
      setMobileSheetSize("collapsed");
    }
  }, []);

  function openMobileSheet(sheet: MobileSheetKey) {
    setMobileSheet((current) => (current === sheet ? null : sheet));
    setMobileSheetSize("half");
    setMobileSheetDrag(0);
  }

  function handleMobileSheetPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    mobileSheetDragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleMobileSheetPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (mobileSheetDragStartRef.current === null) return;
    const delta = event.clientY - mobileSheetDragStartRef.current;
    mobileSheetDragRef.current = delta;
    setMobileSheetDrag(delta);
  }

  function handleMobileSheetPointerUp() {
    const delta = mobileSheetDragRef.current;
    mobileSheetDragStartRef.current = null;
    mobileSheetDragRef.current = 0;
    setMobileSheetDrag(0);
    if (delta < -90) {
      setMobileSheetSize((current) => (current === "collapsed" ? "half" : "full"));
    } else if (delta > 90) {
      setMobileSheetSize((current) => (current === "full" ? "half" : "collapsed"));
    }
  }

  function cycleMobileSheetSize() {
    setMobileSheetSize((current) => current === "collapsed" ? "half" : current === "half" ? "full" : "collapsed");
  }

  const handleDrawingStateCommit = useCallback(
    async (zones: WorkZone[], deletedZones: WorkZone[], reason: "delete" | "undo") => {
      const currentProject = activeProjectId
        ? projects.find((project) => project.id === activeProjectId) ?? null
        : null;
      if (activeProjectId && !currentProject) {
        setActiveProjectId(null);
      }

      const projectName = projectForm.projectName.trim() || currentProject?.project_name || "Untitled Project";
      const projectAddress =
        currentProject?.address ||
        getDrawingAddress(zones, projectForm.address.trim() || address);
      const mapData = createSavedProjectMapData(
        zones,
        projectForm.status,
        projectAddress,
        projectName,
        titleManuallyEditedRef.current
      );
      const totals = sumSelectedMeasurements(zones);
      if (currentProject) {
        const optimisticProject: ProjectRecord = {
          ...currentProject,
          polygon_geojson: mapData,
          acres: totals.acres,
          square_feet: totals.squareFeet,
          updated_at: new Date().toISOString()
        };
        setProjects((current) =>
          current.map((project) => (project.id === currentProject.id ? optimisticProject : project))
        );
      }
      setDraftMapData(mapData);

      const draft: DashboardDraft = {
        activeProjectId: currentProject?.id ?? null,
        address,
        addressDetails,
        projectForm,
        titleManuallyEdited: titleManuallyEditedRef.current,
        mapData,
        measurements: zones.length ? totals : null,
        savedAt: new Date().toISOString()
      };
      const draftJson = JSON.stringify(draft);
      window.localStorage.setItem(getDashboardDraftKey(userEmail), draftJson);
      lastDraftJsonRef.current = draftJson;
      setDraftSavedAt(draft.savedAt);

      if (!currentProject) return true;

      let persisted = true;
      const operation = async () => {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) {
          persisted = false;
          return;
        }
        const currentUserId = await getCurrentUserId(supabase);
        if (!currentUserId) {
          persisted = false;
          return;
        }
        const { error } = await supabase
          .from("projects")
          .update({
            polygon_geojson: mapData,
            acres: totals.acres,
            square_feet: totals.squareFeet,
            estimated_total: zones.length ? calculateProjectEstimate(zones, serviceTemplates, profitInputs).estimatedRevenue : 0
          })
          .eq("id", currentProject.id)
          .eq("user_id", currentUserId);
        if (error) {
          persisted = false;
          if (process.env.NODE_ENV === "development") {
            console.error("[Drawing delete] Project update failed.", {
              projectId: currentProject.id,
              message: error.message
            });
          }
        }
      };

      const queuedOperation = drawingPersistenceQueueRef.current.then(operation, operation);
      drawingPersistenceQueueRef.current = queuedOperation.then(() => undefined, () => undefined);
      await queuedOperation;

      if (!persisted) {
        setProjects((current) =>
          current.map((project) => (project.id === currentProject.id ? currentProject : project))
        );
        setDraftMapData(currentProject.polygon_geojson);
        setProjectMessage("Save Failed: drawing changes could not be saved. The prior drawing state was restored.");
        return false;
      }

      setProjectMessage(reason === "delete" ? "Drawing deleted" : "Drawing restored");
      addActivity(
        reason === "delete" ? "Drawing deleted" : "Drawing restored",
        reason === "delete"
          ? `${deletedZones.length || 1} drawing${deletedZones.length === 1 ? "" : "s"} removed from ${projectName}.`
          : `A recently deleted drawing was restored to ${projectName}.`,
        "Map"
      );
      window.setTimeout(() => {
        setProjectMessage((current) =>
          current === "Drawing deleted" || current === "Drawing restored" ? null : current
        );
      }, 3200);
      return true;
    },
    [
      activeProjectId,
      addActivity,
      address,
      addressDetails,
      profitInputs,
      projectForm,
      projects,
      serviceTemplates,
      userEmail
    ]
  );

  function handleNewProject() {
    setActiveProjectId(null);
    setProjectForm(emptyProjectForm);
    setTitleManuallyEdited(false);
    titleManuallyEditedRef.current = false;
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
      setProjectMessage("Save Failed: project storage is not configured.");
      return;
    }

    if (!workZones.length || !measurements) {
      setProjectMessage("Save Failed: draw at least one work zone first.");
      return;
    }

    setIsSavingProject(true);
    setProjectMessage(null);
    const currentUserId = await getCurrentUserId(supabase);

    if (!currentUserId) {
      setIsSavingProject(false);
      setProjectMessage("Save Failed: your session expired. Log in again.");
      return;
    }

    const profileError = await ensureUserProfile(supabase, currentUserId);

    if (profileError) {
      setIsSavingProject(false);
      setProjectMessage(`Save Failed: ${profileError.message}`);
      return;
    }

    const projectAddress = getDrawingAddress(
      workZones,
      projectForm.address.trim() || address,
      selectedZones
    );
    const linkedClient = clients.find((client) => client.id === projectForm.clientId) ?? null;
    const customerName = linkedClient?.name ?? projectForm.customerName;
    const projectName = titleManuallyEditedRef.current
      ? projectForm.projectName.trim() || "Untitled Project"
      : getAutoProjectTitle(projectAddress, customerName);
    const savedMapData = createSavedProjectMapData(
      workZones,
      projectForm.status,
      projectAddress,
      projectName,
      titleManuallyEditedRef.current
    );

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

    const existingProjectId =
      activeProjectId && projects.some((project) => project.id === activeProjectId) ? activeProjectId : null;
    const query = existingProjectId
      ? supabase
          .from("projects")
          .update(payload)
          .eq("id", existingProjectId)
          .eq("user_id", currentUserId)
          .select("*")
          .single()
      : supabase.from("projects").insert(payload).select("*").single();

    const { data, error } = await query;
    setIsSavingProject(false);

    if (error) {
      setProjectMessage(`Save Failed: ${error.message}`);
      return;
    }

    const savedProject = normalizeProject(data);
    setActiveProjectId(savedProject.id);
    setAddress(savedProject.address || projectAddress);
    setProjectForm((current) => ({
      ...current,
      projectName: savedProject.project_name || projectName,
      address: savedProject.address || projectAddress
    }));
    setProjects((current) => {
      const withoutSaved = current.filter((project) => project.id !== savedProject.id);
      return [savedProject, ...withoutSaved];
    });
    setProjectMessage("Saved to Project");
    showToast("Saved to Project");
    addActivity(existingProjectId ? "Project updated" : "Project created", `${projectName} saved with ${workZones.length} zone${workZones.length === 1 ? "" : "s"}.`, "Project");
    window.setTimeout(() => {
      setProjectMessage((current) => (current === "Saved to Project" ? null : current));
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
      address: getDrawingAddress(workZones, projectForm.address || address, selectedZones),
      measurements,
      mapData: workZones.length
        ? createSavedProjectMapData(
            workZones,
            projectForm.status,
            getDrawingAddress(workZones, projectForm.address || address, selectedZones),
            projectForm.projectName,
            titleManuallyEdited
          )
        : draftMapData,
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
    setTitleManuallyEdited(true);
    titleManuallyEditedRef.current = true;
    setAddress(snapshot.address || "No address selected");
    setMeasurements(snapshot.measurements);
    setDraftMapData(snapshot.mapData);
    setMapResetKey((current) => current + 1);
    addActivity("Snapshot restored", snapshot.name, "Snapshot");
    showToast("✓ Snapshot Restored");
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
        <div className="dashboard-header-actions map-hidden-tools">
          <div className="dashboard-user-chip">
            <span className="dashboard-avatar">{getAvatarLabel(userEmail)}</span>
            <div>
              <strong>{projectForm.projectName || activeProject?.project_name || "Map Workspace"}</strong>
              <span>{userEmail}</span>
            </div>
          </div>
        </div>
        <Link className="mobile-profile-button" href="/settings?tab=account" aria-label="Open account settings">
          {getAvatarLabel(userEmail)}
        </Link>
      </header>

      <section className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <AppSidebar active={sidebarActiveKey} ariaLabel="Dashboard navigation" />
        </aside>

        <section className={`dashboard-main${isInspectorOpen ? " is-inspector-open" : ""}`}>
          <section className="dashboard-map-panel">
            <AcrexMap
              activeProjectId={activeProjectId}
              onSaveProject={handleSaveProject}
              isSavingProject={isSavingProject}
              resetKey={mapResetKey}
              initialAddress={activeProject?.address ?? null}
              initialPolygon={activeProject?.polygon_geojson ?? draftMapData}
              onAddressChange={handleAddressChange}
              onAddressDetailsChange={setAddressDetails}
              onMeasurementsChange={setMeasurements}
              onPolygonChange={setPolygon}
              onZonesChange={setWorkZones}
              onDrawingStateCommit={handleDrawingStateCommit}
              onSelectedZonesChange={handleSelectedZonesChange}
              onParcelLookupChange={setParcelLookup}
              onToolPanelChange={handleMapToolPanelChange}
              explorerRequest={explorerRequest}
              initialMapStyle={preferredMapStyle}
              onMapStyleChange={setPreferredMapStyle}
              onViewModeChange={setIs3DMapView}
              onMobileNotice={showToast}
              quotedZoneNames={quotedZoneNames}
              mobileCommand={mobileMapCommand}
              searchMountId="dashboard-search-mount"
              useParcelRequestKey={useParcelRequestKey}
            />
          </section>

          <div className="mobile-map-controls" aria-label="Map controls">
            <button
              type="button"
              className={mobileSheet === "layers" ? "active" : ""}
              onClick={() => openMobileSheet("layers")}
              aria-label="Open map view controls"
              aria-expanded={mobileSheet === "layers"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 4 8 4-8 4-8-4 8-4Zm-8 9 8 4 8-4M4 18l8 4 8-4" /></svg>
            </button>
            <button type="button" onClick={() => sendMobileMapCommand("locate")} aria-label="Show my location">
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            </button>
          </div>

          <nav className="mobile-map-action-bar" aria-label="Map actions">
            {[
              ["draw", "Draw"],
              ["project", "Project"],
              ["quote", "Quote"],
              ["more", "More"]
            ].map(([sheet, label]) => (
              <button
                type="button"
                key={sheet}
                className={mobileSheet === sheet ? "active" : ""}
                onClick={() => openMobileSheet(sheet as MobileSheetKey)}
              >
                <i aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {mobileSheet ? (
            <section
              className={`mobile-map-sheet is-${mobileSheetSize}`}
              style={{ "--sheet-drag": `${Math.max(mobileSheetDrag, -120)}px` } as CSSProperties}
              role="dialog"
              aria-label={`${mobileSheet} workspace`}
            >
              <div
                className="mobile-sheet-drag-zone"
                onPointerDown={handleMobileSheetPointerDown}
                onPointerMove={handleMobileSheetPointerMove}
                onPointerUp={handleMobileSheetPointerUp}
                onPointerCancel={handleMobileSheetPointerUp}
              >
                <button
                  type="button"
                  className="mobile-sheet-handle"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onPointerCancel={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    cycleMobileSheetSize();
                  }}
                  aria-label="Change bottom sheet height"
                />
                <div>
                  <span>
                    {mobileSheet === "draw" ? "Draw a service" :
                      mobileSheet === "project" ? "Current project" :
                      mobileSheet === "quote" ? "Quote snapshot" :
                      mobileSheet === "layers" ? "Map view" :
                      mobileSheet === "shape" ? "Drawing inspector" : "More"}
                  </span>
                  <strong>
                    {mobileSheet === "shape" && selectedMobileZone
                      ? selectedMobileZone.name
                      : mobileSheet === "project"
                        ? projectForm.projectName
                        : mobileSheet === "quote"
                          ? formatCurrency(activeProjectQuoteTotal || recommendedQuote)
                          : mobileSheet === "draw"
                            ? "Choose what to measure"
                            : mobileSheet === "layers"
                              ? mapStyles[preferredMapStyle].label
                            : "Workspace shortcuts"}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (mobileSheet === "shape") sendMobileMapCommand("clear-selection");
                    setMobileSheet(null);
                  }}
                  aria-label="Close bottom sheet"
                >
                  ×
                </button>
              </div>

              <div className="mobile-sheet-content">
                {mobileSheet === "draw" ? (
                  <div className="mobile-draw-services">
                    {serviceTypes.filter((service) => service.id !== "property-boundary").map((service) => (
                      <button
                        type="button"
                        key={service.id}
                        onClick={() => {
                          sendMobileMapCommand("draw-service", service.id);
                          setMobileSheet(null);
                        }}
                      >
                        <i style={{ background: service.color }} />
                        <span>{service.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {mobileSheet === "project" ? (
                  <>
                    <div className="mobile-sheet-stats">
                      <span>Address<strong>{projectForm.address || address}</strong></span>
                      <span>Save status<strong>{isSavingProject ? "Saving…" : draftSavedTime ? `Saved ${draftSavedTime}` : "Unsaved"}</strong></span>
                      <span>Drawings<strong>{workZones.length}</strong></span>
                      <span>Quote total<strong>{formatCurrency(activeProjectQuoteTotal)}</strong></span>
                    </div>
                    <div className="mobile-sheet-actions">
                      {activeProjectId ? <Link href={`/projects/${activeProjectId}`}>Open Project</Link> : <button type="button" disabled>Save project first</button>}
                      <button type="button" onClick={() => void handleSaveProject()} disabled={isSavingProject}>
                        {isSavingProject ? "Saving…" : "Save Drawing"}
                      </button>
                      <button type="button" className="secondary" onClick={() => {
                        handleNewProject();
                        setMobileSheet(null);
                      }}>New Project</button>
                    </div>
                  </>
                ) : null}

                {mobileSheet === "quote" ? (
                  <>
                    <div className="mobile-sheet-stats">
                      <span>Current total<strong>{formatCurrency(activeProjectQuoteTotal || recommendedQuote)}</strong></span>
                      <span>Confidence<strong>{mobileEstimateConfidence}%</strong></span>
                      <span>Measurements<strong>{availableMeasurementCount}</strong></span>
                      <span>Quote status<strong>{quoteStatus}</strong></span>
                    </div>
                    <div className="mobile-sheet-actions">
                      <Link href={activeProjectId ? `/quotes?project=${activeProjectId}` : "/quotes"}>Build Estimate</Link>
                      <Link className="secondary" href={activeProjectId ? `/quotes?project=${activeProjectId}` : "/quotes"}>Open Full Quote</Link>
                    </div>
                  </>
                ) : null}

                {mobileSheet === "more" ? (
                  <>
                    <section className="mobile-map-style-picker" aria-label="Map style">
                      <span>Map style</span>
                      <div>
                        {mapStyleOptions.map((style) => (
                          <button
                            type="button"
                            className={preferredMapStyle === style.id ? "active" : ""}
                            key={style.id}
                            onClick={() => {
                              setPreferredMapStyle(style.id);
                              sendMobileMapCommand("map-style", style.id);
                            }}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </section>
                    <div className="mobile-more-links">
                      <Link href="/drawings">Drawings</Link>
                      <Link href="/clients">Clients</Link>
                      <Link href="/invoices">Invoices</Link>
                      <button type="button" disabled>Exports <small>Coming soon</small></button>
                      <Link href="/settings">Settings</Link>
                      <Link href="/settings?tab=account">Account</Link>
                    </div>
                  </>
                ) : null}

                {mobileSheet === "layers" ? (
                  <div className="mobile-layer-workspace">
                    <section className="mobile-map-style-picker" aria-label="Map style">
                      <span>Map style</span>
                      <div>
                        {mapStyleOptions.map((style) => (
                          <button
                            type="button"
                            className={preferredMapStyle === style.id ? "active" : ""}
                            key={style.id}
                            onClick={() => {
                              setPreferredMapStyle(style.id);
                              sendMobileMapCommand("map-style", style.id);
                            }}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </section>
                    <div className="mobile-layer-actions">
                      <button
                        type="button"
                        onClick={() => sendMobileMapCommand("layers")}
                        disabled={parcelLookup.status !== "found"}
                      >
                        <span>Parcel boundaries</span>
                        <small>
                          {parcelLookup.status === "found"
                            ? "Show or hide parcel lines"
                            : parcelLookup.status === "disabled"
                              ? "Provider not configured"
                              : "No parcel data at this location"}
                        </small>
                      </button>
                      <button
                        type="button"
                        className={is3DMapView ? "active" : ""}
                        onClick={() => sendMobileMapCommand("toggle-3d")}
                      >
                        <span>{is3DMapView ? "Return to 2D" : "Enable 3D terrain"}</span>
                        <small>{is3DMapView ? "North-up drawing view" : "Tilt and rotate the property"}</small>
                      </button>
                      <button type="button" onClick={() => sendMobileMapCommand("reset-view")}>
                        <span>Reset view</span>
                        <small>Return to 2D and north-up</small>
                      </button>
                    </div>
                  </div>
                ) : null}

                {mobileSheet === "shape" && selectedMobileZone ? (
                  <>
                    <div className="mobile-shape-summary">
                      <i style={{ background: selectedMobileZone.color ?? zoneColors[selectedMobileZone.type] }} />
                      <span>
                        <strong>{selectedMobileZone.serviceTypeLabel ?? zoneLabels[selectedMobileZone.type]}</strong>
                        {formatZoneMeasurement(selectedMobileZone)}
                      </span>
                      <small>{quotedZoneNames.includes(selectedMobileZone.name) ? "Added to quote" : "Not quoted"}</small>
                    </div>
                    <div className="mobile-shape-fields">
                      <label>
                        Drawing name
                        <input
                          value={selectedMobileZone.name}
                          onChange={(event) => sendMobileMapCommand("rename-selected", event.target.value)}
                        />
                      </label>
                      <label>
                        Service type
                        <select
                          value={selectedMobileZone.serviceTypeId}
                          onChange={(event) => sendMobileMapCommand("service-selected", event.target.value)}
                        >
                          {serviceTypes.filter((service) => service.id !== "property-boundary").map((service) => (
                            <option value={service.id} key={service.id}>{service.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Color
                        <input
                          type="color"
                          value={selectedMobileZone.color ?? zoneColors[selectedMobileZone.type]}
                          onChange={(event) => sendMobileMapCommand("color-selected", event.target.value)}
                        />
                      </label>
                      <div className="mobile-shape-location">
                        <span>Location</span>
                        <strong>{selectedMobileZone.address || projectForm.address || address || "Address unavailable"}</strong>
                        <small>
                          {typeof selectedMobileZone.latitude === "number" && typeof selectedMobileZone.longitude === "number"
                            ? `${selectedMobileZone.latitude.toFixed(6)}, ${selectedMobileZone.longitude.toFixed(6)}`
                            : selectedMobileZone.centroid
                              ? `${selectedMobileZone.centroid.latitude.toFixed(6)}, ${selectedMobileZone.centroid.longitude.toFixed(6)}`
                              : "Coordinates unavailable"}
                        </small>
                      </div>
                    </div>
                    <div className="mobile-sheet-actions mobile-shape-actions">
                      {activeProjectId ? (
                        <Link href={`/quotes?project=${activeProjectId}&measurement=${encodeURIComponent(selectedMobileZone.id)}`}>Add to Quote</Link>
                      ) : (
                        <button type="button" onClick={() => void handleSaveProject()}>Save before quote</button>
                      )}
                      <Link className="secondary" href="/drawings">Open Drawing</Link>
                      <button type="button" className="secondary" onClick={() => sendMobileMapCommand("zoom-selected")}>Zoom To</button>
                      <button type="button" className="secondary" onClick={() => sendMobileMapCommand("toggle-selected")}>
                        {selectedMobileZone.visible === false ? "Show" : "Hide"}
                      </button>
                      <button type="button" className="danger" onClick={() => {
                        sendMobileMapCommand("delete-selected");
                        setMobileSheet(null);
                      }}>Delete</button>
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {isInspectorOpen ? (
          <aside className="dashboard-summary-panel" ref={dashboardDrawerRef}>
            <div className="dashboard-summary-card">
              <div className="dashboard-summary-heading">
                <div>
                  <span>
                    {effectivePanel === "measurements"
                      ? "Drawing Inspector"
                      : effectivePanel === "quote"
                          ? "Map Estimate Reference"
                          : effectivePanel === "search"
                            ? "Property Search"
                            : effectivePanel === "layers"
                              ? "Map Layers"
                              : "Map Inspector"}
                  </span>
                  <strong>{activeProject?.address ?? projectForm.address ?? address}</strong>
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

              <label className="project-status-control">
                Project Title
                <input
                  value={projectForm.projectName}
                  onChange={(event) => {
                    setTitleManuallyEdited(true);
                    titleManuallyEditedRef.current = true;
                    setProjectForm((current) => ({
                      ...current,
                      projectName: event.target.value
                    }));
                  }}
                  placeholder="Project title"
                />
                <span>
                  {titleManuallyEdited
                    ? "Custom title. Address updates will not overwrite it."
                    : "Updates automatically from the current project address."}
                </span>
              </label>

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
                    title={parcelLookup.status !== "found" ? "Search an address with an available parcel boundary first." : undefined}
                  >
                    Use Parcel Boundary
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
                      customerName: nextClient?.name ?? "",
                      projectName: titleManuallyEditedRef.current
                        ? current.projectName
                        : getAutoProjectTitle(
                            current.address || address,
                            nextClient?.name ?? ""
                          )
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
                {projectMessage ? <p className="project-message">{projectMessage}</p> : null}
              </div>
            </div>

          </aside>
          ) : null}
        </section>
      </section>
    </main>
  );
}
