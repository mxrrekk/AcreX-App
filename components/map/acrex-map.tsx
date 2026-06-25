"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { LngLatBoundsLike, Map as MapboxMap, Marker as MapboxMarker, Popup as MapboxPopup } from "mapbox-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import {
  booleanPointInPolygon as turfBooleanPointInPolygon,
  centroid as turfCentroid,
  circle as turfCircle,
  distance as turfDistance,
  length as turfLength,
  lineString as turfLineString,
  point as turfPoint
} from "@turf/turf";
import { calculatePolygonMeasurements, type ProjectMeasurements } from "@/lib/geo/measurements";
import { formatAcres, formatFeet, formatSquareFeet } from "@/lib/geo/format";
import { mapStyleOptions, mapStyles, type MapStyle } from "@/lib/map/styles";
import type { ParcelBoundaryFeature, ParcelLookupState } from "@/lib/projects/parcels";
import type { DrawingLocationSource, SavedProjectMapData, WorkZone, ZoneType } from "@/lib/projects/types";
import { defaultServiceType, getServiceTypeById, getServiceTypeByZoneType, serviceTypes, type ActiveServiceType } from "@/lib/projects/service-types";
import { zoneColors, zoneLabels, zoneTypes } from "@/lib/projects/zones";

type AcrexMapProps = {
  onMeasurementsChange: (measurements: ProjectMeasurements | null) => void;
  onAddressChange: (address: string) => void;
  onPolygonChange?: (polygon: Feature<Polygon> | null) => void;
  onZonesChange?: (zones: WorkZone[]) => void;
  onDrawingStateCommit?: (
    zones: WorkZone[],
    deletedZones: WorkZone[],
    reason: "create" | "edit" | "delete" | "undo"
  ) => boolean | Promise<boolean>;
  onSelectedZonesChange?: (zones: WorkZone[]) => void;
  onAddressDetailsChange?: (details: AddressDetails | null) => void;
  onParcelLookupChange?: (lookup: ParcelLookupState) => void;
  activeProjectId?: string | null;
  onSaveProject?: () => void | Promise<void>;
  isSavingProject?: boolean;
  resetKey?: number;
  initialPolygon?: SavedProjectMapData | null;
  initialAddress?: string | null;
  initialSelectedDrawingId?: string | null;
  searchMountId?: string;
  useParcelRequestKey?: number;
  onToolPanelChange?: (panel: ActiveMapPanel) => void;
  explorerRequest?: {
    id: number;
    type: ZoneType | null;
  };
  initialMapStyle?: MapStyle;
  onMapStyleChange?: (style: MapStyle) => void;
  onViewModeChange?: (is3D: boolean) => void;
  onMobileNotice?: (message: string) => void;
  quotedZoneNames?: string[];
  mobileCommand?: {
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
};

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const baldwinCountyCenter: [number, number] = [-87.7461, 30.6592];
const defaultMapView = {
  center: baldwinCountyCenter,
  zoom: 10.2
};
type DrawMode = "select" | "draw" | "edit" | "measure" | "circle";

// Mapbox GL automatically requests high-DPI tiles using the browser device pixel ratio.
// Rural imagery resolution varies by provider coverage, so cap close zoom before excessive
// raster overzoom makes the source look softer without revealing additional ground detail.
const maximumUsableZoom = 19.5;
const terrainSourceId = "acrex-terrain-dem";
const buildingSourceId = "acrex-buildings";
const buildingLayerId = "acrex-3d-buildings";
type DrawFeatureProperties = {
  zoneName?: string;
  zoneType?: ZoneType;
  zoneNotes?: string;
  zoneLocked?: boolean;
  zoneVisible?: boolean;
  shapeType?: "polygon" | "line" | "circle";
  radiusFeet?: number;
  circumferenceFeet?: number;
  acres?: number;
  squareFeet?: number;
  perimeterFeet?: number;
  serviceTypeId?: string;
  serviceType?: string;
  serviceTypeLabel?: string;
  geometryType?: "polygon" | "line" | "circle";
  color?: string;
  unit?: "acre" | "sq ft" | "linear ft" | "each";
  areaAcres?: number;
  areaSqFt?: number;
  lengthFt?: number;
  label?: string;
  quoteCategory?: string;
  defaultRateType?: string;
  visible?: boolean;
  createdAt?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  centroid?: {
    latitude: number;
    longitude: number;
  };
  parcelId?: string | null;
  locationSource?: DrawingLocationSource;
};

type AddressDetails = {
  address: string;
  latitude: number;
  longitude: number;
  county?: string | null;
  parcelId?: string | null;
  source?: DrawingLocationSource;
};

type RecentSearch = AddressDetails & {
  id: string;
};

type DrawingLocation = {
  address: string;
  latitude: number;
  longitude: number;
  centroid: {
    latitude: number;
    longitude: number;
  };
  parcelId: string | null;
  source: DrawingLocationSource;
};

type LayerVisibility = Record<ZoneType, boolean>;
type ActiveMapPanel = "draw" | "layers" | "explorer" | null;

type DrawShapeFeature = Feature<Polygon | LineString, DrawFeatureProperties>;
type DrawSnapshot = FeatureCollection<Polygon | LineString, DrawFeatureProperties>;

type LinearMeasurement = {
  points: [number, number][];
  feet: number;
};

type CircleMeasurement = {
  radiusFeet: number;
  area: ProjectMeasurements;
  circumferenceFeet: number;
};

type MobileDrawingDraft = {
  points: [number, number][];
  geometry: "line" | "polygon";
  serviceType: ActiveServiceType;
};

type MobileDrawingMetrics = {
  segmentFeet: number[];
  totalFeet: number;
  area: ProjectMeasurements | null;
};

const recentSearchesKey = "acrex-recent-searches";
const mobileDraftSourceId = "acrex-mobile-draft";
const mobileDraftLabelsSourceId = "acrex-mobile-draft-labels";
const explorerGroupOrder: ZoneType[] = ["Grass", "Brush", "Woods", "Fence", "Driveway", "HousePad", "Excluded", "Custom", "Property", "Building"];
const explorerGroupLabels: Partial<Record<ZoneType, string>> = {
  Grass: "Grass / Mowing",
  Brush: "Brush Clearing",
  Woods: "Woods / Timber",
  Fence: "Fence",
  Driveway: "Driveway",
  HousePad: "House Pad",
  Excluded: "Exclusion",
  Custom: "Custom",
  Property: "Property",
  Building: "Building"
};
const emptyFeatureCollection: FeatureCollection = {
  type: "FeatureCollection",
  features: []
};
const defaultLayerVisibility = zoneTypes.reduce<LayerVisibility>((current, type) => {
  current[type] = true;
  return current;
}, {} as LayerVisibility);
const hiddenFilter = ["!=", "zoneVisible", false];
const emptyPolygonCollection: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: []
};
function getZoneColorExpression(fallbackColor = zoneColors.Custom) {
  return [
  "match",
    ["coalesce", ["get", "user_zoneType"], ["get", "zoneType"]],
  "Property",
  zoneColors.Property,
  "Grass",
  zoneColors.Grass,
  "Brush",
  zoneColors.Brush,
  "Woods",
  zoneColors.Woods,
  "Fence",
  zoneColors.Fence,
  "Driveway",
  zoneColors.Driveway,
  "HousePad",
  zoneColors.HousePad,
  "Building",
  zoneColors.Building,
  "Excluded",
  zoneColors.Excluded,
  "Custom",
  zoneColors.Custom,
    fallbackColor
  ];
}

function getFeatureColorExpression(fallbackColor = zoneColors.Custom) {
  return ["coalesce", ["get", "user_color"], ["get", "color"], getZoneColorExpression(fallbackColor)];
}

const featureColorExpression = getFeatureColorExpression();
const zoneFillOpacityExpression = [
  "case",
  ["==", ["get", "active"], "true"],
  ["case", ["==", ["get", "zoneType"], "Property"], 0.14, 0.32],
  ["case", ["==", ["get", "zoneType"], "Property"], 0.08, 0.18]
];

function isPolygonFeature(feature: GeoJSON.Feature): feature is Feature<Polygon> {
  return feature.geometry.type === "Polygon";
}

function isLineFeature(feature: GeoJSON.Feature): feature is Feature<LineString> {
  return feature.geometry.type === "LineString";
}

function isDrawShapeFeature(feature: GeoJSON.Feature): feature is DrawShapeFeature {
  return isPolygonFeature(feature) || isLineFeature(feature);
}

function isFeatureCollection(value: SavedProjectMapData): value is Extract<SavedProjectMapData, { type: "FeatureCollection" }> {
  return value.type === "FeatureCollection";
}

function isZoneType(value: unknown): value is ZoneType {
  return typeof value === "string" && zoneTypes.includes(value as ZoneType);
}

function getZoneDefaults(type: ZoneType, index: number) {
  const serviceType = getServiceTypeByZoneType(type);
  return {
    name: type === "Custom" ? `Custom Zone ${index}` : `${serviceType.shortLabel} ${index}`,
    type,
    notes: ""
  };
}

function getServiceDefaults(serviceType: ActiveServiceType, index: number) {
  const geometryLabel = serviceType.geometry === "line" ? "Line" : "Area";
  return {
    name: `${serviceType.shortLabel} ${geometryLabel} ${index}`,
    type: serviceType.zoneType,
    notes: ""
  };
}

function getShapeFeatureId(feature: DrawShapeFeature) {
  return String(feature.id ?? crypto.randomUUID());
}

function calculateLineFeet(coordinates: number[][]) {
  if (coordinates.length < 2) return 0;
  return turfLength(turfLineString(coordinates), { units: "kilometers" }) * 3280.839895;
}

function getMobileDrawingMetrics(draft: MobileDrawingDraft | null): MobileDrawingMetrics {
  if (!draft) return { segmentFeet: [], totalFeet: 0, area: null };
  const segmentFeet = draft.points.slice(1).map((point, index) =>
    turfDistance(draft.points[index], point, { units: "miles" }) * 5280
  );
  if (draft.geometry === "line") {
    return {
      segmentFeet,
      totalFeet: segmentFeet.reduce((total, feet) => total + feet, 0),
      area: null
    };
  }
  if (draft.points.length < 3) {
    return {
      segmentFeet,
      totalFeet: segmentFeet.reduce((total, feet) => total + feet, 0),
      area: null
    };
  }
  const ring = [...draft.points, draft.points[0]];
  return {
    segmentFeet: [
      ...segmentFeet,
      turfDistance(draft.points[draft.points.length - 1], draft.points[0], { units: "miles" }) * 5280
    ],
    totalFeet: calculateLineFeet(ring),
    area: calculatePolygonMeasurements([ring])
  };
}

function isMobileDrawingLayout() {
  return typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1024px) and (orientation: portrait), (max-width: 700px)").matches;
}

function getShapeMeasurements(feature: DrawShapeFeature): ProjectMeasurements {
  if (feature.geometry.type === "Polygon") return calculatePolygonMeasurements(feature.geometry.coordinates);
  const lengthFt = calculateLineFeet(feature.geometry.coordinates as number[][]);
  return {
    acres: 0,
    squareFeet: 0,
    perimeterFeet: lengthFt
  };
}

function formatShapeMeasurement(zone: WorkZone) {
  if (zone.geometryType === "line" || zone.type === "Fence") return `${formatFeet(zone.lengthFt ?? zone.perimeterFeet)} ft`;
  if ((zone.defaultRateType === "per_sq_ft" || zone.type === "Driveway" || zone.type === "HousePad" || zone.type === "Building") && zone.squareFeet > 0) {
    return `${formatSquareFeet(zone.squareFeet)} sq ft`;
  }
  return `${formatAcres(zone.acres)} ac`;
}

function formatSavedShapeMeasurement(zone: WorkZone) {
  if (zone.geometryType === "line" || zone.type === "Fence") {
    return `${formatFeet(zone.lengthFt ?? zone.perimeterFeet)} linear ft`;
  }
  if ((zone.defaultRateType === "per_sq_ft" || zone.type === "Driveway" || zone.type === "HousePad" || zone.type === "Building") && zone.squareFeet > 0) {
    return `${formatSquareFeet(zone.squareFeet)} sq ft`;
  }
  return `${formatAcres(zone.acres)} acres`;
}

function getFeatureCoordinates(feature: DrawShapeFeature): [number, number][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates.flat().map(([lng, lat]) => [lng, lat] as [number, number]);
  }
  return feature.geometry.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]);
}

function setDrawLayerFallbackColor(map: MapboxMap | null, color: string) {
  if (!map) return;
  const colorExpression = getFeatureColorExpression(color) as never;
  ["acrex-polygon-fill-inactive", "acrex-polygon-fill-active"].forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, "fill-color", colorExpression);
    map.setPaintProperty(layerId, "fill-outline-color", colorExpression);
  });
  ["acrex-polygon-line-inactive", "acrex-polygon-line-active", "acrex-line-inactive", "acrex-line-active"].forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, "line-color", colorExpression);
  });
}

function fitMapToFeatures(map: MapboxMap, features: DrawShapeFeature[]) {
  const coordinates = features.flatMap(getFeatureCoordinates);
  if (!coordinates.length) return;

  const lngValues = coordinates.map(([lng]) => lng);
  const latValues = coordinates.map(([, lat]) => lat);
  const bounds: LngLatBoundsLike = [
    [Math.min(...lngValues), Math.min(...latValues)],
    [Math.max(...lngValues), Math.max(...latValues)]
  ];
  map.fitBounds(bounds, {
    padding: { top: 110, right: 110, bottom: 130, left: 130 },
    maxZoom: 17.2,
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    duration: 950,
    essential: true
  });
}

function fitMapToPolygon(map: MapboxMap, polygon: Feature<Polygon>) {
  fitMapToFeatures(map, [polygon as DrawShapeFeature]);
}

function cloneShapeFeature(feature: DrawShapeFeature): DrawShapeFeature {
  return JSON.parse(JSON.stringify(feature)) as DrawShapeFeature;
}

function createSnapshot(features: DrawShapeFeature[]): DrawSnapshot {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => cloneShapeFeature(feature))
  };
}

function areSnapshotsEqual(a: DrawSnapshot | null | undefined, b: DrawSnapshot | null | undefined) {
  return JSON.stringify(a ?? emptyFeatureCollection) === JSON.stringify(b ?? emptyFeatureCollection);
}

function offsetPolygonCoordinates(coordinates: number[][][], offset = 0.00018) {
  return coordinates.map((ring) => ring.map(([lng, lat]) => [lng + offset, lat - offset]));
}

function offsetLineCoordinates(coordinates: number[][], offset = 0.00018) {
  return coordinates.map(([lng, lat]) => [lng + offset, lat - offset]);
}

function getCountyFromContext(context: Array<{ id?: string; text?: string }> | undefined) {
  const county = context?.find((item) => item.id?.startsWith("district") && item.text?.toLowerCase().includes("county"));
  return county?.text ?? null;
}

function getStoredRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(recentSearchesKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as RecentSearch[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function storeRecentSearch(search: RecentSearch) {
  const current = getStoredRecentSearches().filter((item) => item.address !== search.address);
  const next = [search, ...current].slice(0, 10);
  window.localStorage.setItem(recentSearchesKey, JSON.stringify(next));
  return next;
}

function createEmptyLineFeature(): Feature<LineString> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: []
    },
    properties: {}
  };
}

function createPointCollection(points: [number, number][]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: point
      },
      properties: {}
    }))
  };
}

function getParcelMeasurements(parcel: ParcelBoundaryFeature): ProjectMeasurements {
  const measured = calculatePolygonMeasurements(parcel.geometry.coordinates);
  return {
    acres: Number(parcel.properties?.acres ?? measured.acres),
    squareFeet: Number(parcel.properties?.squareFeet ?? measured.squareFeet),
    perimeterFeet: measured.perimeterFeet
  };
}

function getFeatureCentroid(feature: DrawShapeFeature): [number, number] {
  try {
    const point = turfCentroid(feature);
    const [longitude, latitude] = point.geometry.coordinates;
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [longitude, latitude];
  } catch {
    // Fall through to the first valid drawing coordinate.
  }
  return getFeatureCoordinates(feature)[0] ?? defaultMapView.center;
}

function coordinateAddress(latitude: number, longitude: number) {
  return `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
}

function isSearchNearDrawing(search: AddressDetails | null, center: [number, number]) {
  if (!search) return false;
  return turfDistance([search.longitude, search.latitude], center, { units: "miles" }) <= 0.75;
}

export function AcrexMap({
  onMeasurementsChange,
  onAddressChange,
  onPolygonChange,
  onZonesChange,
  onDrawingStateCommit,
  onSelectedZonesChange,
  onAddressDetailsChange,
  onParcelLookupChange,
  activeProjectId,
  onSaveProject,
  isSavingProject = false,
  resetKey = 0,
  initialPolygon,
  initialAddress,
  initialSelectedDrawingId,
  searchMountId,
  useParcelRequestKey = 0,
  onToolPanelChange,
  explorerRequest,
  initialMapStyle = "satellite-streets",
  onMapStyleChange,
  onViewModeChange,
  onMobileNotice,
  quotedZoneNames = [],
  mobileCommand
}: AcrexMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const mapControlsRef = useRef<HTMLDivElement | null>(null);
  const selectedZoneNameInputRef = useRef<HTMLInputElement | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxglRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const userLocationMarkerRef = useRef<MapboxMarker | null>(null);
  const addressMarkerRef = useRef<MapboxMarker | null>(null);
  const addressPopupRef = useRef<MapboxPopup | null>(null);
  const onMeasurementsChangeRef = useRef(onMeasurementsChange);
  const onAddressChangeRef = useRef(onAddressChange);
  const onPolygonChangeRef = useRef(onPolygonChange);
  const onZonesChangeRef = useRef(onZonesChange);
  const onSelectedZonesChangeRef = useRef(onSelectedZonesChange);
  const onAddressDetailsChangeRef = useRef(onAddressDetailsChange);
  const onParcelLookupChangeRef = useRef(onParcelLookupChange);
  const activeZoneTypeRef = useRef<ZoneType>("Property");
  const activeServiceTypeRef = useRef<ActiveServiceType>(defaultServiceType);
  const activeModeRef = useRef<DrawMode>("select");
  const workZonesRef = useRef<WorkZone[]>([]);
  const layerVisibilityRef = useRef<LayerVisibility>(defaultLayerVisibility);
  const lockedFeatureRef = useRef<Record<string, DrawShapeFeature>>({});
  const historyRef = useRef<DrawSnapshot[]>([]);
  const redoRef = useRef<DrawSnapshot[]>([]);
  const isApplyingHistoryRef = useRef(false);
  const spaceRestoreModeRef = useRef<DrawMode | null>(null);
  const measurePointsRef = useRef<[number, number][]>([]);
  const circleCenterRef = useRef<[number, number] | null>(null);
  const mobileDrawingDraftRef = useRef<MobileDrawingDraft | null>(null);
  const finishMobileDrawingRef = useRef<(feature: DrawShapeFeature) => void>(() => undefined);
  const refreshZonesRef = useRef<() => WorkZone[]>(() => []);
  const onDrawingStateCommitRef = useRef(onDrawingStateCommit);
  const loadedProjectKeyRef = useRef<string | null | undefined>(undefined);
  const selectedParcelRef = useRef<ParcelBoundaryFeature | null>(null);
  const currentSearchRef = useRef<AddressDetails | null>(null);
  const latestDrawingLocationIdRef = useRef<string | null>(null);
  const activeMapPanelRef = useRef<ActiveMapPanel>(null);
  const is3DViewRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [measurements, setMeasurements] = useState<ProjectMeasurements | null>(null);
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [activeZoneType, setActiveZoneType] = useState<ZoneType>("Property");
  const [activeServiceType, setActiveServiceType] = useState<ActiveServiceType>(defaultServiceType);
  const [activeMode, setActiveMode] = useState<DrawMode>("select");
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>(initialMapStyle);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [is3DView, setIs3DView] = useState(false);
  const [viewNotice, setViewNotice] = useState<string | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(defaultLayerVisibility);
  const [parcelLinesVisible, setParcelLinesVisible] = useState(true);
  const [activeMapPanel, setActiveMapPanel] = useState<ActiveMapPanel>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [, setLinearMeasurement] = useState<LinearMeasurement | null>(null);
  const [, setCircleMeasurement] = useState<CircleMeasurement | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mobileDrawingDraft, setMobileDrawingDraft] = useState<MobileDrawingDraft | null>(null);
  const [savePill, setSavePill] = useState<{ id: string; message: string; color: string; type: ZoneType } | null>(null);
  const [drawingDeleteNotice, setDrawingDeleteNotice] = useState<{ count: number; snapshot: DrawSnapshot } | null>(null);
  const drawingDeleteNoticeRef = useRef<{ count: number; snapshot: DrawSnapshot } | null>(null);
  const [customDrawColor, setCustomDrawColor] = useState(zoneColors.Custom);
  const [explorerFilter, setExplorerFilter] = useState<ZoneType | null>(null);
  const [inspectorView, setInspectorView] = useState<"summary" | "more">("summary");
  const selectedZoneIdsRef = useRef<string[]>([]);
  const mobileDrawingMetrics = getMobileDrawingMetrics(mobileDrawingDraft);

  useEffect(() => {
    onMeasurementsChangeRef.current = onMeasurementsChange;
    onAddressChangeRef.current = onAddressChange;
    onPolygonChangeRef.current = onPolygonChange;
    onZonesChangeRef.current = onZonesChange;
    onDrawingStateCommitRef.current = onDrawingStateCommit;
    onSelectedZonesChangeRef.current = onSelectedZonesChange;
    onAddressDetailsChangeRef.current = onAddressDetailsChange;
    onParcelLookupChangeRef.current = onParcelLookupChange;
  }, [onMeasurementsChange, onAddressChange, onPolygonChange, onZonesChange, onDrawingStateCommit, onSelectedZonesChange, onAddressDetailsChange, onParcelLookupChange]);

  useEffect(() => {
    activeZoneTypeRef.current = activeZoneType;
  }, [activeZoneType]);

  useEffect(() => {
    activeServiceTypeRef.current = activeServiceType;
  }, [activeServiceType]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    layerVisibilityRef.current = layerVisibility;
  }, [layerVisibility]);

  useEffect(() => {
    selectedZoneIdsRef.current = selectedZoneIds;
  }, [selectedZoneIds]);

  useEffect(() => {
    activeMapPanelRef.current = activeMapPanel;
  }, [activeMapPanel]);

  useEffect(() => {
    is3DViewRef.current = is3DView;
  }, [is3DView]);

  useEffect(() => {
    if (activeMapPanel !== "explorer") return;

    function closeInspectorOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || mapControlsRef.current?.contains(target)) return;
      clearSelectedZone();
      setActiveMapPanel(null);
      onToolPanelChange?.(null);
    }

    window.addEventListener("pointerdown", closeInspectorOnOutsideClick);
    return () => window.removeEventListener("pointerdown", closeInspectorOnOutsideClick);
  // The inspector owns this click-away lifecycle and reads the current map refs directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapPanel, onToolPanelChange]);

  useEffect(() => {
    setRecentSearches(getStoredRecentSearches());
  }, []);

  const selectedZones = workZones.filter((zone) => selectedZoneIds.includes(zone.id));
  const selectedZone = selectedZones.length === 1 ? selectedZones[0] : null;
  const selectedZoneIsQuoted = Boolean(selectedZone && quotedZoneNames.includes(selectedZone.name));
  const allExplorerGroups = explorerGroupOrder
    .map((type) => ({
      type,
      label: explorerGroupLabels[type] ?? zoneLabels[type],
      zones: workZones.filter((zone) => zone.type === type)
    }))
    .filter((group) => group.zones.length > 0);
  const explorerGroups = explorerFilter
    ? allExplorerGroups.filter((group) => group.type === explorerFilter || (explorerFilter === "HousePad" && group.type === "Building"))
    : allExplorerGroups;

  function setHistoryState() {
    setCanUndo(historyRef.current.length > 1);
    setCanRedo(redoRef.current.length > 0);
  }

  function getCurrentSnapshot(): DrawSnapshot {
    const features = drawRef.current?.getAll().features.filter(isDrawShapeFeature) ?? [];
    return createSnapshot(features);
  }

  function pushHistorySnapshot() {
    if (isApplyingHistoryRef.current) return;
    const snapshot = getCurrentSnapshot();
    const previous = historyRef.current[historyRef.current.length - 1];
    if (areSnapshotsEqual(previous, snapshot)) return;

    historyRef.current = [...historyRef.current, snapshot].slice(-60);
    redoRef.current = [];
    setHistoryState();
  }

  function resetHistory(snapshot = getCurrentSnapshot()) {
    historyRef.current = [snapshot];
    redoRef.current = [];
    setHistoryState();
  }

  function applySnapshot(snapshot: DrawSnapshot, commitReason?: "undo") {
    const draw = drawRef.current;
    if (!draw) return;

    isApplyingHistoryRef.current = true;
    draw.deleteAll();
    if (snapshot.features.length) {
      draw.add(snapshot);
    }
    isApplyingHistoryRef.current = false;
    selectedZoneIdsRef.current = [];
    setSelectedZoneIds([]);
    onSelectedZonesChangeRef.current?.([]);
    const zones = refreshZonesRef.current();
    if (commitReason) {
      void onDrawingStateCommitRef.current?.(zones, [], commitReason);
    }
  }

  function undoDrawChange() {
    if (historyRef.current.length <= 1) return;
    const current = historyRef.current[historyRef.current.length - 1];
    const previous = historyRef.current[historyRef.current.length - 2];
    redoRef.current = [current, ...redoRef.current].slice(0, 60);
    historyRef.current = historyRef.current.slice(0, -1);
    drawingDeleteNoticeRef.current = null;
    setDrawingDeleteNotice(null);
    applySnapshot(previous, "undo");
    setHistoryState();
  }

  function redoDrawChange() {
    const next = redoRef.current[0];
    if (!next) return;
    redoRef.current = redoRef.current.slice(1);
    historyRef.current = [...historyRef.current, next].slice(-60);
    drawingDeleteNoticeRef.current = null;
    setDrawingDeleteNotice(null);
    applySnapshot(next, "undo");
    setHistoryState();
  }

  function restoreDeletedDrawing() {
    if (!drawingDeleteNotice) return;
    const snapshot = drawingDeleteNotice.snapshot;
    drawingDeleteNoticeRef.current = null;
    setDrawingDeleteNotice(null);
    historyRef.current = [...historyRef.current, snapshot].slice(-60);
    redoRef.current = [];
    applySnapshot(snapshot, "undo");
    setHistoryState();
  }

  function commitDrawingDeletion(deletedZones: WorkZone[], previousSnapshot: DrawSnapshot) {
    const zones = refreshZonesRef.current();
    pushHistorySnapshot();
    const notice = {
      count: Math.max(deletedZones.length, 1),
      snapshot: previousSnapshot
    };
    drawingDeleteNoticeRef.current = notice;
    setDrawingDeleteNotice(notice);
    void Promise.resolve(onDrawingStateCommitRef.current?.(zones, deletedZones, "delete") ?? true).then((saved) => {
      if (saved) return;
      drawingDeleteNoticeRef.current = null;
      setDrawingDeleteNotice(null);
      historyRef.current = [...historyRef.current, previousSnapshot].slice(-60);
      applySnapshot(previousSnapshot, "undo");
      setHistoryState();
    });
  }

  useEffect(() => {
    if (!drawingDeleteNotice) return;
    const timeout = window.setTimeout(() => {
      drawingDeleteNoticeRef.current = null;
      setDrawingDeleteNotice(null);
      const features = drawRef.current?.getAll().features.filter(isDrawShapeFeature) ?? [];
      historyRef.current = [createSnapshot(features)];
      redoRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }, 6500);
    return () => window.clearTimeout(timeout);
  }, [drawingDeleteNotice]);

  function sealExpiredDrawingDeletion() {
    if (!drawingDeleteNoticeRef.current) return;
    drawingDeleteNoticeRef.current = null;
    setDrawingDeleteNotice(null);
    resetHistory(getCurrentSnapshot());
  }

  function updateLinearMeasurement(points: [number, number][], previewPoint?: [number, number]) {
    const map = mapRef.current;
    const coordinates = previewPoint ? [...points, previewPoint] : points;
    const feet = coordinates.length > 1 ? turfLength(turfLineString(coordinates), { units: "kilometers" }) * 3280.839895 : 0;
    const lineSource = map?.getSource("acrex-measure-line") as { setData?: (data: Feature<LineString>) => void } | undefined;
    const pointSource = map?.getSource("acrex-measure-points") as { setData?: (data: FeatureCollection<Point>) => void } | undefined;

    lineSource?.setData?.({
      ...createEmptyLineFeature(),
      geometry: {
        type: "LineString",
        coordinates
      }
    });
    pointSource?.setData?.(createPointCollection(points));
    setLinearMeasurement(points.length ? { points, feet } : null);
  }

  function clearLinearMeasurement() {
    measurePointsRef.current = [];
    updateLinearMeasurement([]);
  }

  function updateMobileDrawingPreview(draft = mobileDrawingDraftRef.current) {
    const map = mapRef.current;
    const draftSource = map?.getSource(mobileDraftSourceId) as {
      setData?: (data: FeatureCollection<Polygon | LineString | Point>) => void;
    } | undefined;
    const labelsSource = map?.getSource(mobileDraftLabelsSourceId) as {
      setData?: (data: FeatureCollection<Point>) => void;
    } | undefined;

    if (!draft || !draft.points.length) {
      draftSource?.setData?.(emptyFeatureCollection as FeatureCollection<Polygon | LineString | Point>);
      labelsSource?.setData?.(emptyFeatureCollection as FeatureCollection<Point>);
      return;
    }

    const features: Array<Feature<Polygon | LineString | Point>> = draft.points.map((coordinates, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { kind: "vertex", index: index + 1 }
    }));
    if (draft.points.length >= 2) {
      const coordinates = draft.geometry === "polygon" && draft.points.length >= 3
        ? [...draft.points, draft.points[0]]
        : draft.points;
      features.unshift({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { kind: "outline", color: draft.serviceType.color }
      });
    }
    if (draft.geometry === "polygon" && draft.points.length >= 3) {
      features.unshift({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...draft.points, draft.points[0]]] },
        properties: { kind: "fill", color: draft.serviceType.color }
      });
    }

    const metrics = getMobileDrawingMetrics(draft);
    const labelSegments = draft.geometry === "polygon" && draft.points.length >= 3
      ? [...draft.points.slice(1).map((point, index) => [draft.points[index], point] as [[number, number], [number, number]]), [draft.points[draft.points.length - 1], draft.points[0]] as [[number, number], [number, number]]]
      : draft.points.slice(1).map((point, index) => [draft.points[index], point] as [[number, number], [number, number]]);
    const labelFeatures: Feature<Point>[] = labelSegments.map(([start, end], index) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
      },
      properties: {
        label: `${formatFeet(metrics.segmentFeet[index] ?? 0)} ft`
      }
    }));

    draftSource?.setData?.({ type: "FeatureCollection", features });
    labelsSource?.setData?.({ type: "FeatureCollection", features: labelFeatures });
  }

  function ensureMobileDrawingLayers() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource(mobileDraftSourceId)) {
      map.addSource(mobileDraftSourceId, {
        type: "geojson",
        data: emptyFeatureCollection
      });
      map.addLayer({
        id: "acrex-mobile-draft-fill",
        type: "fill",
        source: mobileDraftSourceId,
        filter: ["==", ["get", "kind"], "fill"],
        paint: {
          "fill-color": ["coalesce", ["get", "color"], "#7fd957"],
          "fill-opacity": 0.2
        }
      });
      map.addLayer({
        id: "acrex-mobile-draft-line-casing",
        type: "line",
        source: mobileDraftSourceId,
        filter: ["==", ["get", "kind"], "outline"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "rgba(4, 9, 7, 0.9)",
          "line-width": 7
        }
      });
      map.addLayer({
        id: "acrex-mobile-draft-line",
        type: "line",
        source: mobileDraftSourceId,
        filter: ["==", ["get", "kind"], "outline"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#7fd957"],
          "line-width": 4
        }
      });
      map.addLayer({
        id: "acrex-mobile-draft-points",
        type: "circle",
        source: mobileDraftSourceId,
        filter: ["==", ["get", "kind"], "vertex"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f5fff1",
          "circle-stroke-color": "#234d2d",
          "circle-stroke-width": 2.5
        }
      });
    }
    if (!map.getSource(mobileDraftLabelsSourceId)) {
      map.addSource(mobileDraftLabelsSourceId, {
        type: "geojson",
        data: emptyFeatureCollection
      });
      map.addLayer({
        id: "acrex-mobile-draft-labels",
        type: "symbol",
        source: mobileDraftLabelsSourceId,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
          "text-padding": 4
        },
        paint: {
          "text-color": "#f5fff1",
          "text-halo-color": "rgba(4, 9, 7, 0.92)",
          "text-halo-width": 2
        }
      });
    }
    updateMobileDrawingPreview();
  }

  function updateCirclePreview(center: [number, number] | null, edge?: [number, number]) {
    const map = mapRef.current;
    const source = map?.getSource("acrex-circle-preview") as { setData?: (data: FeatureCollection<Polygon>) => void } | undefined;
    if (!center || !edge) {
      source?.setData?.(emptyFeatureCollection as FeatureCollection<Polygon>);
      setCircleMeasurement(null);
      return;
    }

    const radiusMiles = turfDistance(center, edge, { units: "miles" });
    const preview = turfCircle(center, radiusMiles, {
      steps: 80,
      units: "miles",
      properties: {}
    }) as Feature<Polygon>;
    const area = calculatePolygonMeasurements(preview.geometry.coordinates);
    const radiusFeet = radiusMiles * 5280;
    const circumferenceFeet = 2 * Math.PI * radiusFeet;
    source?.setData?.({
      type: "FeatureCollection",
      features: [preview]
    });
    setCircleMeasurement({ radiusFeet, area, circumferenceFeet });
  }

  function ensureMeasurementLayers() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (!map.getSource("acrex-measure-line")) {
      map.addSource("acrex-measure-line", {
        type: "geojson",
        data: createEmptyLineFeature()
      });
      map.addLayer({
        id: "acrex-measure-line",
        type: "line",
        source: "acrex-measure-line",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#f5fff1",
          "line-width": 3,
          "line-dasharray": [1.2, 1.2]
        }
      });
    }

    if (!map.getSource("acrex-measure-points")) {
      map.addSource("acrex-measure-points", {
        type: "geojson",
        data: createPointCollection([])
      });
      map.addLayer({
        id: "acrex-measure-points",
        type: "circle",
        source: "acrex-measure-points",
        paint: {
          "circle-radius": 4,
          "circle-color": "#f5fff1",
          "circle-stroke-color": "#7fd957",
          "circle-stroke-width": 2
        }
      });
    }

    if (!map.getSource("acrex-circle-preview")) {
      map.addSource("acrex-circle-preview", {
        type: "geojson",
        data: emptyFeatureCollection
      });
      map.addLayer({
        id: "acrex-circle-preview-fill",
        type: "fill",
        source: "acrex-circle-preview",
        paint: {
          "fill-color": zoneColors[activeZoneTypeRef.current],
          "fill-opacity": 0.18
        }
      });
      map.addLayer({
        id: "acrex-circle-preview-line",
        type: "line",
        source: "acrex-circle-preview",
        paint: {
          "line-color": zoneColors[activeZoneTypeRef.current],
          "line-width": 3,
          "line-dasharray": [1.5, 1.2]
        }
      });
    }

    updateLinearMeasurement(measurePointsRef.current);
    if (circleCenterRef.current) updateCirclePreview(circleCenterRef.current);
    ensureMobileDrawingLayers();
  }

  function ensureParcelLayers() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (!map.getSource("acrex-parcel-lines")) {
      map.addSource("acrex-parcel-lines", {
        type: "geojson",
        data: emptyPolygonCollection
      });
      map.addLayer({
        id: "acrex-parcel-lines",
        type: "line",
        source: "acrex-parcel-lines",
        paint: {
          "line-color": "rgba(245,255,241,0.56)",
          "line-width": 1,
          "line-opacity": parcelLinesVisible ? 0.8 : 0
        }
      });
    }

    if (!map.getSource("acrex-selected-parcel")) {
      map.addSource("acrex-selected-parcel", {
        type: "geojson",
        data: emptyPolygonCollection
      });
      map.addLayer({
        id: "acrex-selected-parcel-fill",
        type: "fill",
        source: "acrex-selected-parcel",
        paint: {
          "fill-color": zoneColors.Property,
          "fill-opacity": parcelLinesVisible ? 0.1 : 0
        }
      });
      map.addLayer({
        id: "acrex-selected-parcel-casing",
        type: "line",
        source: "acrex-selected-parcel",
        paint: {
          "line-color": "rgba(4, 9, 7, 0.88)",
          "line-width": parcelLinesVisible ? 5 : 0,
          "line-opacity": parcelLinesVisible ? 0.9 : 0
        }
      });
      map.addLayer({
        id: "acrex-selected-parcel-line",
        type: "line",
        source: "acrex-selected-parcel",
        paint: {
          "line-color": zoneColors.Property,
          "line-width": parcelLinesVisible ? 2.2 : 0,
          "line-opacity": parcelLinesVisible ? 0.95 : 0
        }
      });
    }
  }

  function ensure3DResources(enabled = is3DViewRef.current) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (!map.getSource(terrainSourceId)) {
      map.addSource(terrainSourceId, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14
      });
    }

    if (!map.getSource(buildingSourceId)) {
      map.addSource(buildingSourceId, {
        type: "vector",
        url: "mapbox://mapbox.mapbox-streets-v8"
      });
    }

    if (!map.getLayer(buildingLayerId)) {
      const firstLabelLayer = map.getStyle().layers?.find(
        (layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"])
      )?.id;
      map.addLayer(
        {
          id: buildingLayerId,
          type: "fill-extrusion",
          source: buildingSourceId,
          "source-layer": "building",
          minzoom: 15,
          layout: {
            visibility: enabled ? "visible" : "none"
          },
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["zoom"],
              15,
              "#657067",
              18,
              "#9aa79d"
            ],
            "fill-extrusion-height": ["coalesce", ["get", "height"], 3],
            "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.72,
            "fill-extrusion-vertical-gradient": true
          }
        },
        firstLabelLayer
      );
    } else {
      map.setLayoutProperty(buildingLayerId, "visibility", enabled ? "visible" : "none");
    }

    map.setTerrain(enabled ? { source: terrainSourceId, exaggeration: 1.15 } : null);
    map.setFog(enabled
      ? {
          color: "rgb(218, 226, 220)",
          "high-color": "rgb(124, 148, 166)",
          "horizon-blend": 0.08,
          "space-color": "rgb(8, 14, 12)",
          "star-intensity": 0
        }
      : null);
  }

  function setMapViewMode(next3D: boolean, options: { announce?: boolean; resetCenter?: boolean } = {}) {
    const map = mapRef.current;
    if (!map) return;

    const pausedDrawing = next3D && activeModeRef.current !== "select";
    if (pausedDrawing) {
      setMobileDrawingDraftState(null);
      drawRef.current?.changeMode("simple_select");
      circleCenterRef.current = null;
      measurePointsRef.current = [];
      updateCirclePreview(null);
      updateLinearMeasurement([]);
      activeModeRef.current = "select";
      setActiveMode("select");
    }

    is3DViewRef.current = next3D;
    setIs3DView(next3D);
    onViewModeChange?.(next3D);
    ensure3DResources(next3D);

    if (next3D) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.easeTo({
        pitch: 52,
        bearing: map.getBearing() === 0 ? -18 : map.getBearing(),
        duration: 850,
        essential: true
      });
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.easeTo({
        center: options.resetCenter ? defaultMapView.center : map.getCenter(),
        zoom: options.resetCenter ? defaultMapView.zoom : map.getZoom(),
        pitch: 0,
        bearing: 0,
        duration: 700,
        essential: true
      });
    }

    if (options.announce) {
      setViewNotice(pausedDrawing
        ? "Drawing paused while 3D view is active"
        : next3D
          ? "3D terrain view enabled"
          : "Reset to 2D north-up view");
      window.setTimeout(() => setViewNotice(null), 2400);
    }
  }

  function resetMapView() {
    setMapViewMode(false, { announce: true, resetCenter: false });
  }

  function removeAddressMarker() {
    addressPopupRef.current?.remove();
    addressMarkerRef.current?.remove();
    addressPopupRef.current = null;
    addressMarkerRef.current = null;
  }

  function showAddressMarker(details: AddressDetails) {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl) return;

    removeAddressMarker();

    const markerElement = document.createElement("button");
    markerElement.type = "button";
    markerElement.className = "acrex-address-marker";
    markerElement.setAttribute("aria-label", `Address pin: ${details.address}`);
    markerElement.innerHTML = "<span aria-hidden=\"true\"></span>";

    const popupElement = document.createElement("div");
    popupElement.className = "acrex-address-marker-popup";
    const addressText = document.createElement("strong");
    addressText.textContent = details.address;
    const metaText = document.createElement("small");
    metaText.textContent = `Lat ${details.latitude.toFixed(5)}, Lng ${details.longitude.toFixed(5)}`;
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.textContent = "Hide pin";
    hideButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeAddressMarker();
      onMobileNotice?.("Address pin hidden.");
    });
    popupElement.append(addressText, metaText, hideButton);

    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 20,
      className: "acrex-address-popup"
    }).setDOMContent(popupElement);

    const marker = new mapboxgl.Marker({
      element: markerElement,
      anchor: "bottom"
    })
      .setLngLat([details.longitude, details.latitude])
      .setPopup(popup)
      .addTo(map);

    addressPopupRef.current = popup;
    addressMarkerRef.current = marker;
  }

  function removeUserLocationMarker() {
    userLocationMarkerRef.current?.remove();
    userLocationMarkerRef.current = null;
  }

  function showUserLocation(longitude: number, latitude: number) {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl) return;

    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.setLngLat([longitude, latitude]);
      return;
    }

    const markerElement = document.createElement("div");
    markerElement.className = "acrex-user-location-marker";
    markerElement.setAttribute("aria-label", "Your current location");
    const markerDot = document.createElement("span");
    markerElement.appendChild(markerDot);
    userLocationMarkerRef.current = new mapboxgl.Marker({
      element: markerElement,
      anchor: "center"
    })
      .setLngLat([longitude, latitude])
      .addTo(map);
  }

  function setParcelVisibility(visible: boolean) {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("acrex-parcel-lines")) {
      map.setPaintProperty("acrex-parcel-lines", "line-opacity", visible ? 0.8 : 0);
    }
    if (map.getLayer("acrex-selected-parcel-fill")) {
      map.setPaintProperty("acrex-selected-parcel-fill", "fill-opacity", visible ? 0.1 : 0);
    }
    if (map.getLayer("acrex-selected-parcel-line")) {
      map.setPaintProperty("acrex-selected-parcel-line", "line-opacity", visible ? 0.95 : 0);
      map.setPaintProperty("acrex-selected-parcel-line", "line-width", visible ? 2.2 : 0);
    }
    if (map.getLayer("acrex-selected-parcel-casing")) {
      map.setPaintProperty("acrex-selected-parcel-casing", "line-opacity", visible ? 0.9 : 0);
      map.setPaintProperty("acrex-selected-parcel-casing", "line-width", visible ? 5 : 0);
    }
  }

  function updateParcelSources(selectedParcel: ParcelBoundaryFeature | null, surroundingParcels?: FeatureCollection<Polygon> | null) {
    const map = mapRef.current;
    if (!map) return;
    ensureParcelLayers();
    const selectedSource = map.getSource("acrex-selected-parcel") as { setData?: (data: FeatureCollection<Polygon>) => void } | undefined;
    const surroundingSource = map.getSource("acrex-parcel-lines") as { setData?: (data: FeatureCollection<Polygon>) => void } | undefined;

    selectedSource?.setData?.(
      selectedParcel
        ? {
            type: "FeatureCollection",
            features: [selectedParcel]
          }
        : emptyPolygonCollection
    );
    surroundingSource?.setData?.(surroundingParcels ?? emptyPolygonCollection);
    setParcelVisibility(parcelLinesVisible);
  }

  function getImmediateDrawingLocation(feature: DrawShapeFeature): DrawingLocation {
    const [longitude, latitude] = getFeatureCentroid(feature);
    const parcel = selectedParcelRef.current;
    const insideSelectedParcel = parcel
      ? turfBooleanPointInPolygon(turfPoint([longitude, latitude]), parcel)
      : false;
    const parcelAddress = insideSelectedParcel ? parcel?.properties?.address?.trim() : "";
    const search = currentSearchRef.current;

    if (parcelAddress) {
      return {
        address: parcelAddress,
        latitude,
        longitude,
        centroid: { latitude, longitude },
        parcelId: parcel?.properties?.parcelId ?? null,
        source: "parcel" as const
      };
    }

    if (isSearchNearDrawing(search, [longitude, latitude])) {
      return {
        address: search?.address ?? coordinateAddress(latitude, longitude),
        latitude,
        longitude,
        centroid: { latitude, longitude },
        parcelId: insideSelectedParcel ? parcel?.properties?.parcelId ?? search?.parcelId ?? null : search?.parcelId ?? null,
        source: "search" as const
      };
    }

    return {
      address: coordinateAddress(latitude, longitude),
      latitude,
      longitude,
      centroid: { latitude, longitude },
      parcelId: insideSelectedParcel ? parcel?.properties?.parcelId ?? null : null,
      source: "coordinates" as const
    };
  }

  function applyDrawingLocation(featureId: string, location: DrawingLocation) {
    const draw = drawRef.current;
    if (!draw?.get(featureId)) return;
    draw.setFeatureProperty(featureId, "address", location.address);
    draw.setFeatureProperty(featureId, "latitude", location.latitude);
    draw.setFeatureProperty(featureId, "longitude", location.longitude);
    draw.setFeatureProperty(featureId, "centroid", location.centroid);
    draw.setFeatureProperty(featureId, "parcelId", location.parcelId);
    draw.setFeatureProperty(featureId, "locationSource", location.source);
    refreshZonesRef.current();
    if (latestDrawingLocationIdRef.current !== featureId) return;
    onAddressChangeRef.current(location.address);
    onAddressDetailsChangeRef.current?.({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      parcelId: location.parcelId,
      source: location.source
    });
  }

  async function reverseGeocode(latitude: number, longitude: number) {
    try {
      const response = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { address?: string | null };
      return data.address?.trim() || null;
    } catch {
      return null;
    }
  }

  async function resolveDrawingLocation(feature: DrawShapeFeature) {
    if (!feature.id) return;
    const featureId = String(feature.id);
    const immediate = getImmediateDrawingLocation(feature);
    applyDrawingLocation(featureId, immediate);
    if (immediate.source !== "coordinates") return;

    const centroidAddress = await reverseGeocode(immediate.latitude, immediate.longitude);
    if (centroidAddress) {
      applyDrawingLocation(featureId, {
        ...immediate,
        address: centroidAddress,
        source: "reverse_geocode"
      });
      void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "edit");
      return;
    }

    const mapCenter = mapRef.current?.getCenter();
    if (!mapCenter) return;
    const centerAddress = await reverseGeocode(mapCenter.lat, mapCenter.lng);
    if (!centerAddress) return;
    applyDrawingLocation(featureId, {
      address: centerAddress,
      latitude: immediate.latitude,
      longitude: immediate.longitude,
      centroid: immediate.centroid,
      parcelId: null,
      source: "reverse_geocode"
    });
    void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "edit");
  }

  async function lookupParcelBoundary(center: [number, number]) {
    const loadingState: ParcelLookupState = {
      status: "loading",
      message: "Checking parcel boundary data..."
    };
    onParcelLookupChangeRef.current?.(loadingState);

    try {
      const response = await fetch(`/api/parcels?lat=${encodeURIComponent(center[1])}&lng=${encodeURIComponent(center[0])}`);
      const data = (await response.json()) as {
        status?: ParcelLookupState["status"] | "not_configured";
        provider?: string;
        message?: string;
        selectedParcel?: ParcelBoundaryFeature | null;
        surroundingParcels?: FeatureCollection<Polygon> | null;
      };

      if (data.status === "found" && data.selectedParcel) {
        const measurements = getParcelMeasurements(data.selectedParcel);
        selectedParcelRef.current = data.selectedParcel;
        updateParcelSources(data.selectedParcel, data.surroundingParcels ?? null);
        if (mapRef.current) fitMapToPolygon(mapRef.current, data.selectedParcel);
        const parcelCenter = getFeatureCentroid(data.selectedParcel as DrawShapeFeature);
        const parcelAddress = data.selectedParcel.properties?.address?.trim();
        const matchingSearch = isSearchNearDrawing(currentSearchRef.current, parcelCenter)
          ? currentSearchRef.current
          : null;
        const candidateAddress = parcelAddress || matchingSearch?.address;
        if (candidateAddress) {
          const parcelDetails: AddressDetails = {
            address: candidateAddress,
            longitude: parcelCenter[0],
            latitude: parcelCenter[1],
            parcelId: data.selectedParcel.properties?.parcelId ?? null,
            source: parcelAddress ? "parcel" : "search"
          };
          onAddressChangeRef.current(candidateAddress);
          onAddressDetailsChangeRef.current?.(parcelDetails);
        }
        onParcelLookupChangeRef.current?.({
          status: "found",
          provider: data.provider ?? null,
          message: data.message ?? "Parcel boundary found.",
          selectedParcel: data.selectedParcel,
          surroundingParcels: data.surroundingParcels ?? null,
          measurements
        });
        return;
      }

      selectedParcelRef.current = null;
      updateParcelSources(null, null);
      onParcelLookupChangeRef.current?.({
        status: data.status === "disabled" ? "disabled" : data.status === "not_configured" ? "disabled" : "not_found",
        provider: data.provider ?? null,
        message: data.message ?? "No parcel boundary was found. Draw manually for now.",
        selectedParcel: null,
        surroundingParcels: null,
        measurements: null
      });
    } catch {
      selectedParcelRef.current = null;
      updateParcelSources(null, null);
      onParcelLookupChangeRef.current?.({
        status: "error",
        message: "Parcel lookup is unavailable right now. Draw manually for now.",
        selectedParcel: null,
        surroundingParcels: null,
        measurements: null
      });
    }
  }

  function syncLayerVisibility(nextVisibility = layerVisibilityRef.current) {
    const draw = drawRef.current;
    if (!draw) return;

    draw.getAll().features.filter(isDrawShapeFeature).forEach((feature) => {
      const properties = (feature.properties ?? {}) as DrawFeatureProperties;
      const type = isZoneType(properties.zoneType) ? properties.zoneType : "Property";
      if (feature.id) {
        draw.setFeatureProperty(String(feature.id), "zoneVisible", nextVisibility[type]);
        draw.setFeatureProperty(String(feature.id), "visible", nextVisibility[type]);
      }
    });
  }

  function restoreLockedFeatures(features: GeoJSON.Feature[]) {
    const draw = drawRef.current;
    if (!draw) return false;

    const lockedUpdates = features
      .filter(isDrawShapeFeature)
      .filter((feature) => feature.id && lockedFeatureRef.current[String(feature.id)]);

    if (!lockedUpdates.length) return false;

    isApplyingHistoryRef.current = true;
    lockedUpdates.forEach((feature) => {
      const id = String(feature.id);
      draw.delete(id);
      draw.add(lockedFeatureRef.current[id]);
    });
    isApplyingHistoryRef.current = false;
    refreshZonesRef.current();
    return true;
  }

  function fitMapToCurrentZones() {
    const map = mapRef.current;
    const features = drawRef.current?.getAll().features.filter(isDrawShapeFeature) ?? [];
    if (!map || !features.length) return false;
    fitMapToFeatures(map, features);
    return true;
  }

  useEffect(() => {
    if (!mapboxToken) {
      setMapError(null);
      return;
    }

    let isMounted = true;
    let cleanup = () => undefined;

    async function loadMap() {
      const [{ default: mapboxgl }, { default: MapboxDraw }, { default: MapboxGeocoder }] =
        await Promise.all([
          import("mapbox-gl"),
          import("@mapbox/mapbox-gl-draw"),
          import("@mapbox/mapbox-gl-geocoder")
        ]);

      if (!isMounted || !mapContainerRef.current) return;

      mapboxgl.accessToken = mapboxToken;
      mapboxglRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyles[initialMapStyle].url,
        center: defaultMapView.center,
        zoom: defaultMapView.zoom,
        maxZoom: maximumUsableZoom,
        pitch: 0,
        bearing: 0,
        fadeDuration: 260,
        antialias: true,
        attributionControl: false
      });
      mapRef.current = map;

      map.once("load", () => {
        ensureMeasurementLayers();
        ensureParcelLayers();
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.resize();
        setMapReady(true);
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "bottom-right");
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 96, unit: "imperial" }), "bottom-left");
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");

      let resizeFrame = 0;
      const resizeMap = () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          map.resize();
        });
      };
      const resizeObserver = new ResizeObserver(resizeMap);
      resizeObserver.observe(mapContainerRef.current);
      if (mapContainerRef.current.parentElement) {
        resizeObserver.observe(mapContainerRef.current.parentElement);
      }
      window.addEventListener("resize", resizeMap);

      const geocoder = new MapboxGeocoder({
        accessToken: mapboxToken,
        mapboxgl,
        marker: false,
        placeholder: "Search address...",
        countries: "us"
      });

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        defaultMode: "simple_select",
        userProperties: true,
        styles: [
          {
            id: "acrex-polygon-fill-inactive",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"], ["!=", "active", "true"], hiddenFilter],
            paint: {
              "fill-color": featureColorExpression,
              "fill-outline-color": featureColorExpression,
              "fill-opacity": zoneFillOpacityExpression
            }
          },
          {
            id: "acrex-polygon-fill-active",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"], ["==", "active", "true"], hiddenFilter],
            paint: {
              "fill-color": featureColorExpression,
              "fill-outline-color": featureColorExpression,
              "fill-opacity": zoneFillOpacityExpression
            }
          },
          {
            id: "acrex-polygon-casing-inactive",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"], ["!=", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": "rgba(4, 9, 7, 0.82)",
              "line-width": 5,
              "line-opacity": 0.84
            }
          },
          {
            id: "acrex-polygon-casing-active",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"], ["==", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": "#f5fff1",
              "line-width": 7,
              "line-opacity": 0.96
            }
          },
          {
            id: "acrex-polygon-line-inactive",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"], ["!=", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": featureColorExpression,
              "line-width": 3,
              "line-blur": 0
            }
          },
          {
            id: "acrex-polygon-line-active",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"], ["==", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": featureColorExpression,
              "line-width": 4.5,
              "line-blur": 0
            }
          },
          {
            id: "acrex-line-casing-inactive",
            type: "line",
            filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"], ["!=", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": "rgba(4, 9, 7, 0.82)",
              "line-width": 7,
              "line-opacity": 0.84
            }
          },
          {
            id: "acrex-line-casing-active",
            type: "line",
            filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"], ["==", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": "#f5fff1",
              "line-width": 9,
              "line-opacity": 0.96
            }
          },
          {
            id: "acrex-line-inactive",
            type: "line",
            filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"], ["!=", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": featureColorExpression,
              "line-width": 4,
              "line-opacity": 0.9
            }
          },
          {
            id: "acrex-line-active",
            type: "line",
            filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"], ["==", "active", "true"], hiddenFilter],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": featureColorExpression,
              "line-width": 6,
              "line-opacity": 1
            }
          },
          {
            id: "acrex-polygon-midpoint",
            type: "circle",
            filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"], hiddenFilter],
            paint: {
              "circle-radius": 4.5,
              "circle-color": "#7fd957",
              "circle-stroke-color": "rgba(4, 9, 7, 0.9)",
              "circle-stroke-width": 1.5
            }
          },
          {
            id: "acrex-polygon-vertex",
            type: "circle",
            filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"], hiddenFilter],
            paint: {
              "circle-radius": 6,
              "circle-color": "#f5fff1",
              "circle-stroke-color": "#234d2d",
              "circle-stroke-width": 2.5
            }
          }
        ]
      });

      const searchMount = searchMountId ? document.getElementById(searchMountId) : searchContainerRef.current;

      if (searchMount) {
        const geocoderControl = geocoder as unknown as { onAdd: (mapInstance: unknown) => HTMLElement };
        searchMount.innerHTML = "";
        searchMount.appendChild(geocoderControl.onAdd(map));
      }

      map.addControl(draw);
      drawRef.current = draw;

      geocoder.on("result", (event) => {
        const result = event.result as {
          place_name?: string;
          center?: [number, number];
          context?: Array<{ id?: string; text?: string }>;
        } | undefined;
        const center = Array.isArray(result?.center) ? (result.center as [number, number]) : null;
        if (result?.place_name) {
          onAddressChangeRef.current(result.place_name);
        }
        if (center) {
          const addressDetails: AddressDetails = {
            address: result?.place_name ?? "Selected address",
            longitude: center[0],
            latitude: center[1],
            county: getCountyFromContext(result?.context),
            parcelId: null,
            source: "search"
          };
          currentSearchRef.current = addressDetails;
          onAddressDetailsChangeRef.current?.(addressDetails);
          setRecentSearches(storeRecentSearch({ ...addressDetails, id: `${center[0]}:${center[1]}:${Date.now()}` }));
          showAddressMarker(addressDetails);
          map.flyTo({ center, zoom: 16.4, duration: 950, essential: true });
          void lookupParcelBoundary(center);
        }
      });

      const assignZoneDefaults = (features: GeoJSON.Feature[]) => {
        const createdFeatures = features.filter(isDrawShapeFeature);
        const serviceType = activeServiceTypeRef.current;
        const existingCount = draw
          .getAll()
          .features.filter(isDrawShapeFeature)
          .filter((feature) => !createdFeatures.some((created) => created.id === feature.id))
          .filter((feature) => {
            const properties = (feature.properties ?? {}) as DrawFeatureProperties;
            return properties.serviceTypeId === serviceType.id || properties.zoneType === serviceType.zoneType;
          }).length;
        createdFeatures.forEach((feature, featureIndex) => {
          if (!feature.id) return;
          const properties = (feature.properties ?? {}) as DrawFeatureProperties;
          const defaults = getServiceDefaults(serviceType, existingCount + featureIndex + 1);
          const zoneType = serviceType.zoneType;
          const geometryType = isLineFeature(feature) ? "line" : properties.shapeType === "circle" ? "circle" : serviceType.geometry;
          const visible = layerVisibilityRef.current[zoneType];
          draw.setFeatureProperty(String(feature.id), "zoneType", zoneType);
          draw.setFeatureProperty(String(feature.id), "zoneName", properties.zoneName ?? defaults.name);
          draw.setFeatureProperty(String(feature.id), "zoneNotes", properties.zoneNotes ?? defaults.notes);
          draw.setFeatureProperty(String(feature.id), "zoneLocked", properties.zoneLocked ?? false);
          draw.setFeatureProperty(String(feature.id), "zoneVisible", visible);
          draw.setFeatureProperty(String(feature.id), "shapeType", geometryType);
          draw.setFeatureProperty(String(feature.id), "serviceTypeId", serviceType.id);
          draw.setFeatureProperty(String(feature.id), "serviceType", serviceType.id);
          draw.setFeatureProperty(String(feature.id), "serviceTypeLabel", serviceType.label);
          draw.setFeatureProperty(String(feature.id), "geometryType", geometryType);
          draw.setFeatureProperty(String(feature.id), "color", serviceType.color);
          draw.setFeatureProperty(String(feature.id), "label", properties.label ?? serviceType.label);
          draw.setFeatureProperty(String(feature.id), "unit", serviceType.unit);
          draw.setFeatureProperty(String(feature.id), "quoteCategory", serviceType.quoteCategory);
          draw.setFeatureProperty(String(feature.id), "defaultRateType", serviceType.defaultRateType);
          draw.setFeatureProperty(String(feature.id), "visible", visible);
          draw.setFeatureProperty(String(feature.id), "createdAt", properties.createdAt ?? new Date().toISOString());
          const location = getImmediateDrawingLocation(feature);
          draw.setFeatureProperty(String(feature.id), "address", location.address);
          draw.setFeatureProperty(String(feature.id), "latitude", location.latitude);
          draw.setFeatureProperty(String(feature.id), "longitude", location.longitude);
          draw.setFeatureProperty(String(feature.id), "centroid", location.centroid);
          draw.setFeatureProperty(String(feature.id), "parcelId", location.parcelId);
          draw.setFeatureProperty(String(feature.id), "locationSource", location.source);
        });
      };

      const updateMeasurements = (): WorkZone[] => {
        const shapes = draw.getAll().features.filter(isDrawShapeFeature);

        if (!shapes.length) {
          onMeasurementsChangeRef.current(null);
          onPolygonChangeRef.current?.(null);
          onZonesChangeRef.current?.([]);
          onSelectedZonesChangeRef.current?.([]);
          setMeasurements(null);
          setWorkZones([]);
          workZonesRef.current = [];
          setHasPolygon(false);
          selectedZoneIdsRef.current = [];
          setSelectedZoneIds([]);
          return [];
        }

        const primaryPolygon = shapes.find((feature): feature is Feature<Polygon, DrawFeatureProperties> => feature.geometry.type === "Polygon") ?? null;
        const zones = shapes.map<WorkZone>((feature, index) => {
          const properties = (feature.properties ?? {}) as DrawFeatureProperties;
          const serviceType = properties.serviceTypeId ? getServiceTypeById(properties.serviceTypeId) : getServiceTypeByZoneType(properties.zoneType);
          const defaults = getServiceDefaults(serviceType, index + 1);
          const zoneMeasurements = getShapeMeasurements(feature);
          const zoneType = isZoneType(properties.zoneType) ? properties.zoneType : defaults.type;
          const zoneName = properties.zoneName?.trim() || defaults.name;
          const zoneNotes = properties.zoneNotes?.trim() ?? "";
          const zoneLocked = Boolean(properties.zoneLocked);
          const zoneVisible = properties.zoneVisible !== false;
          const geometryType = isLineFeature(feature) ? "line" : properties.shapeType === "circle" ? "circle" : serviceType.geometry;
          const lengthFt = geometryType === "line" ? zoneMeasurements.perimeterFeet : undefined;
          return {
            id: getShapeFeatureId(feature),
            name: zoneName,
            type: zoneType,
            acres: zoneMeasurements.acres,
            squareFeet: zoneMeasurements.squareFeet,
            perimeterFeet: zoneMeasurements.perimeterFeet,
            locked: zoneLocked,
            notes: zoneNotes,
            serviceTypeId: serviceType.id,
            serviceType: properties.serviceType ?? serviceType.id,
            serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
            geometryType,
            color: properties.color ?? serviceType.color,
            unit: properties.unit ?? serviceType.unit,
            areaAcres: zoneMeasurements.acres,
            areaSqFt: zoneMeasurements.squareFeet,
            lengthFt,
            label: properties.label ?? serviceType.label,
            quoteCategory: properties.quoteCategory ?? serviceType.quoteCategory,
            defaultRateType: serviceType.defaultRateType,
            visible: zoneVisible,
            createdAt: properties.createdAt ?? new Date().toISOString(),
            address: properties.address,
            latitude: properties.latitude,
            longitude: properties.longitude,
            centroid: properties.centroid,
            parcelId: properties.parcelId ?? null,
            locationSource: properties.locationSource,
            feature: {
              ...feature,
              properties: {
                ...(feature.properties ?? {}),
                zoneName,
                zoneType,
                zoneNotes,
                zoneLocked,
                zoneVisible,
                acres: zoneMeasurements.acres,
                squareFeet: zoneMeasurements.squareFeet,
                perimeterFeet: zoneMeasurements.perimeterFeet,
                serviceTypeId: serviceType.id,
                serviceType: properties.serviceType ?? serviceType.id,
                serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
                geometryType,
                color: properties.color ?? serviceType.color,
                unit: properties.unit ?? serviceType.unit,
                areaAcres: zoneMeasurements.acres,
                areaSqFt: zoneMeasurements.squareFeet,
                lengthFt,
                label: properties.label ?? serviceType.label,
                quoteCategory: properties.quoteCategory ?? serviceType.quoteCategory,
                defaultRateType: serviceType.defaultRateType,
                visible: zoneVisible,
                createdAt: properties.createdAt ?? new Date().toISOString(),
                address: properties.address,
                latitude: properties.latitude,
                longitude: properties.longitude,
                centroid: properties.centroid,
                parcelId: properties.parcelId ?? null,
                locationSource: properties.locationSource
              }
            }
          };
        });

        const totals = zones.reduce<ProjectMeasurements>(
          (current, zone) => {
            return {
              acres: current.acres + zone.acres,
              squareFeet: current.squareFeet + zone.squareFeet,
              perimeterFeet: current.perimeterFeet + zone.perimeterFeet
            };
          },
          { acres: 0, squareFeet: 0, perimeterFeet: 0 }
        );

        onMeasurementsChangeRef.current(totals);
        onPolygonChangeRef.current?.(primaryPolygon);
        onZonesChangeRef.current?.(zones);
        setMeasurements(totals);
        setWorkZones(zones);
        workZonesRef.current = zones;
        setHasPolygon(true);
        const nextIds = selectedZoneIdsRef.current.filter((id) => zones.some((zone) => zone.id === id));
        selectedZoneIdsRef.current = nextIds;
        setSelectedZoneIds(nextIds);
        onSelectedZonesChangeRef.current?.(zones.filter((zone) => nextIds.includes(zone.id)));
        return zones;
      };

      refreshZonesRef.current = updateMeasurements;

      const completeCreatedFeatures = (features: GeoJSON.Feature[]) => {
        sealExpiredDrawingDeletion();
        assignZoneDefaults(features);
        updateMeasurements();
        pushHistorySnapshot();
        const createdFeature = features.find(isDrawShapeFeature);
        const nextIds = createdFeature?.id ? [String(createdFeature.id)] : [];
        latestDrawingLocationIdRef.current = nextIds[0] ?? null;
        selectedZoneIdsRef.current = nextIds;
        setSelectedZoneIds(nextIds);
        const selected = workZonesRef.current.filter((zone) => nextIds.includes(zone.id));
        onSelectedZonesChangeRef.current?.(selected);
        const createdZone = selected[0] ?? workZonesRef.current.find((zone) => zone.id === nextIds[0]);
        if (createdZone) {
          setSavePill({
            id: createdZone.id,
            message: `${createdZone.name} saved • ${formatSavedShapeMeasurement(createdZone)}`,
            color: createdZone.color ?? zoneColors[createdZone.type],
            type: createdZone.type
          });
          window.setTimeout(() => {
            setSavePill((current) => (current?.id === createdZone.id ? null : current));
          }, 8000);
        }
        features.filter(isDrawShapeFeature).forEach((feature) => {
          void resolveDrawingLocation(feature);
        });
        void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "create");
        setActiveMode("select");
        activeModeRef.current = "select";
        setActiveMapPanel("explorer");
        onToolPanelChange?.("explorer");
      };

      finishMobileDrawingRef.current = (feature) => {
        const addedIds = draw.add(feature);
        const addedId = String((Array.isArray(addedIds) ? addedIds[0] : feature.id) ?? feature.id);
        const addedFeature = draw.get(addedId);
        if (!addedFeature || !isDrawShapeFeature(addedFeature)) return;
        completeCreatedFeatures([addedFeature]);
        draw.changeMode("simple_select", { featureIds: [addedId] });
      };

      const handleDrawCreate = (event: { features: GeoJSON.Feature[] }) => {
        completeCreatedFeatures(event.features);
      };

      const handleDrawUpdate = (event: { features: GeoJSON.Feature[] }) => {
        sealExpiredDrawingDeletion();
        if (restoreLockedFeatures(event.features)) return;
        updateMeasurements();
        pushHistorySnapshot();
        const updatedFeature = event.features.find(isDrawShapeFeature);
        if (updatedFeature?.id) {
          latestDrawingLocationIdRef.current = String(updatedFeature.id);
          void resolveDrawingLocation(updatedFeature);
        }
        void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "edit");
      };

      const handleDrawDelete = (event: { features: GeoJSON.Feature[] }) => {
        if (isApplyingHistoryRef.current) return;
        const deletedFeatures = event.features.filter(isDrawShapeFeature);
        const deletedIds = new Set(
          deletedFeatures
            .map((feature) => (feature.id ? String(feature.id) : ""))
            .filter(Boolean)
        );
        const deletedZones = workZonesRef.current.filter((zone) => deletedIds.has(zone.id));
        const remainingFeatures = draw.getAll().features.filter(isDrawShapeFeature);
        const previousSnapshot = createSnapshot([...remainingFeatures, ...deletedFeatures]);
        updateMeasurements();
        commitDrawingDeletion(deletedZones, previousSnapshot);
      };

      const handleSelectionChange = (event: { features: GeoJSON.Feature[] }) => {
        if (mobileDrawingDraftRef.current) {
          if (event.features.length) draw.changeMode("simple_select", { featureIds: [] });
          return;
        }
        const nextIds = event.features
          .filter(isDrawShapeFeature)
          .map((feature) => (feature.id ? String(feature.id) : ""))
          .filter(Boolean);
        selectedZoneIdsRef.current = nextIds;
        setSelectedZoneIds(nextIds);
        onSelectedZonesChangeRef.current?.(workZonesRef.current.filter((zone) => nextIds.includes(zone.id)));
        if (nextIds.length) {
          setInspectorView("summary");
          setActiveMapPanel("explorer");
          onToolPanelChange?.("explorer");
        } else if (activeMapPanelRef.current === "explorer") {
          setActiveMapPanel(null);
          onToolPanelChange?.(null);
        }
      };

      const handleDrawRender = () => {
        if (activeModeRef.current !== "draw" && activeModeRef.current !== "edit") return;
        const shapes = draw.getAll().features.filter(isDrawShapeFeature);
        const activeShape = draw.getSelected().features.find(isDrawShapeFeature) ?? shapes[shapes.length - 1];
        if (!activeShape) return;
        try {
          const live = getShapeMeasurements(activeShape);
          setMeasurements(live);
        } catch {
          // Drawing can pass through invalid intermediate geometry before the polygon is complete.
        }
      };

      const handleMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
        const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        if (activeModeRef.current === "measure") {
          measurePointsRef.current = [...measurePointsRef.current, point];
          updateLinearMeasurement(measurePointsRef.current);
          return;
        }

        if (activeModeRef.current === "circle") {
          const center = circleCenterRef.current;
          if (!center) {
            circleCenterRef.current = point;
            updateCirclePreview(point);
            return;
          }

          const radiusMiles = turfDistance(center, point, { units: "miles" });
          if (radiusMiles <= 0) return;
          const serviceType = activeServiceTypeRef.current;
          const circleId = crypto.randomUUID();
          const circleFeature = turfCircle(center, radiusMiles, {
            steps: 80,
            units: "miles",
            properties: {
              zoneType: serviceType.zoneType,
              zoneName: `${serviceType.shortLabel} Circle`,
              zoneNotes: "",
              zoneLocked: false,
              zoneVisible: layerVisibilityRef.current[serviceType.zoneType],
              shapeType: "circle",
              radiusFeet: radiusMiles * 5280,
              circumferenceFeet: 2 * Math.PI * radiusMiles * 5280,
              serviceTypeId: serviceType.id,
              serviceType: serviceType.id,
              serviceTypeLabel: serviceType.label,
              geometryType: "circle",
              color: serviceType.color,
              unit: serviceType.unit,
              label: serviceType.label,
              quoteCategory: serviceType.quoteCategory,
              defaultRateType: serviceType.defaultRateType,
              visible: layerVisibilityRef.current[serviceType.zoneType],
              createdAt: new Date().toISOString()
            }
          }) as Feature<Polygon, DrawFeatureProperties>;
          circleFeature.id = circleId;
          draw.add(circleFeature);
          latestDrawingLocationIdRef.current = circleId;
          void resolveDrawingLocation(circleFeature);
          circleCenterRef.current = null;
          updateCirclePreview(null);
          updateMeasurements();
          pushHistorySnapshot();
          setSavePill({
            id: circleId,
            message: `${serviceType.shortLabel} Circle saved`,
            color: serviceType.color,
            type: serviceType.zoneType
          });
          setActiveMode("select");
        }
      };

      const handleMapMouseMove = (event: { lngLat: { lng: number; lat: number } }) => {
        const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        if (activeModeRef.current === "measure" && measurePointsRef.current.length) {
          updateLinearMeasurement(measurePointsRef.current, point);
        }
        if (activeModeRef.current === "circle" && circleCenterRef.current) {
          updateCirclePreview(circleCenterRef.current, point);
        }
      };

      map.on("draw.create", handleDrawCreate);
      map.on("draw.update", handleDrawUpdate);
      map.on("draw.delete", handleDrawDelete);
      map.on("draw.selectionchange", handleSelectionChange);
      map.on("draw.render", handleDrawRender);
      map.on("click", handleMapClick);
      map.on("mousemove", handleMapMouseMove);
      resetHistory(createSnapshot([]));

      cleanup = () => {
        window.cancelAnimationFrame(resizeFrame);
        window.removeEventListener("resize", resizeMap);
        resizeObserver.disconnect();
        map.off("draw.create", handleDrawCreate);
        map.off("draw.update", handleDrawUpdate);
        map.off("draw.delete", handleDrawDelete);
        map.off("draw.selectionchange", handleSelectionChange);
        map.off("draw.render", handleDrawRender);
        map.off("click", handleMapClick);
        map.off("mousemove", handleMapMouseMove);
        searchContainerRef.current?.replaceChildren();
        if (searchMountId) {
          document.getElementById(searchMountId)?.replaceChildren();
        }
        drawRef.current = null;
        mapRef.current = null;
        mapboxglRef.current = null;
        finishMobileDrawingRef.current = () => undefined;
        userLocationMarkerRef.current?.remove();
        userLocationMarkerRef.current = null;
        addressPopupRef.current?.remove();
        addressMarkerRef.current?.remove();
        addressPopupRef.current = null;
        addressMarkerRef.current = null;
        refreshZonesRef.current = () => [];
        setMapReady(false);
        map.remove();
      };
    }

    void loadMap().catch((error) => {
      setMapError(error instanceof Error ? error.message : "Mapbox failed to load.");
    });

    return () => {
      isMounted = false;
      cleanup();
    };
  // Mapbox owns this lifecycle; callback refs above keep handlers fresh without recreating the map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMountId]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !mapReady) return;
    const projectLoadKey = `${activeProjectId ?? "new"}:${resetKey}:${initialSelectedDrawingId ?? "default"}`;
    if (loadedProjectKeyRef.current === projectLoadKey) return;

    loadedProjectKeyRef.current = projectLoadKey;
    currentSearchRef.current = null;
    latestDrawingLocationIdRef.current = null;
    setMobileDrawingDraftState(null);
    selectedParcelRef.current = null;
    updateParcelSources(null, null);

    isApplyingHistoryRef.current = true;
    draw.deleteAll();
    isApplyingHistoryRef.current = false;

    if (!initialPolygon) {
      setHasPolygon(false);
      setMeasurements(null);
      setWorkZones([]);
      workZonesRef.current = [];
      selectedZoneIdsRef.current = [];
      setSelectedZoneIds([]);
      onMeasurementsChangeRef.current(null);
      onPolygonChangeRef.current?.(null);
      onZonesChangeRef.current?.([]);
      onSelectedZonesChangeRef.current?.([]);
      lockedFeatureRef.current = {};
      resetHistory(createSnapshot([]));
      return;
    }

    const featuresToAdd = (isFeatureCollection(initialPolygon)
      ? initialPolygon.features
      : [
          {
            ...initialPolygon,
            properties: {
              zoneType: "Property" as const,
              zoneName: "Property 1",
              zoneNotes: "",
              ...(initialPolygon.properties ?? {})
            }
          }
        ]).filter(isDrawShapeFeature);

    const addedIds = draw.add({
      type: "FeatureCollection",
      features: featuresToAdd
    });

    const nextZones = featuresToAdd.map<WorkZone>((feature, index) => {
      const properties = (feature.properties ?? {}) as DrawFeatureProperties;
      const serviceType = properties.serviceTypeId ? getServiceTypeById(properties.serviceTypeId) : getServiceTypeByZoneType(properties.zoneType);
      const defaultType = isZoneType(properties.zoneType) ? properties.zoneType : serviceType.zoneType;
      const defaults = getServiceDefaults(getServiceTypeByZoneType(defaultType), index + 1);
      const zoneMeasurements = getShapeMeasurements(feature);
      const zoneType = isZoneType(properties.zoneType) ? properties.zoneType : defaults.type;
      const zoneName = properties.zoneName?.trim() || defaults.name;
      const zoneNotes = properties.zoneNotes?.trim() ?? "";
      const zoneLocked = Boolean(properties.zoneLocked);
      const zoneVisible = properties.zoneVisible !== false;
      const geometryType = isLineFeature(feature) ? "line" : properties.shapeType === "circle" ? "circle" : serviceType.geometry;
      const lengthFt = geometryType === "line" ? zoneMeasurements.perimeterFeet : undefined;
      return {
        id: addedIds[index] ?? getShapeFeatureId(feature),
        name: zoneName,
        type: zoneType,
        acres: zoneMeasurements.acres,
        squareFeet: zoneMeasurements.squareFeet,
        perimeterFeet: zoneMeasurements.perimeterFeet,
        locked: zoneLocked,
        notes: zoneNotes,
        serviceTypeId: serviceType.id,
        serviceType: properties.serviceType ?? serviceType.id,
        serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
        geometryType,
        color: properties.color ?? serviceType.color,
        unit: properties.unit ?? serviceType.unit,
        areaAcres: zoneMeasurements.acres,
        areaSqFt: zoneMeasurements.squareFeet,
        lengthFt,
        label: properties.label ?? serviceType.label,
        quoteCategory: properties.quoteCategory ?? serviceType.quoteCategory,
        defaultRateType: serviceType.defaultRateType,
        visible: zoneVisible,
        createdAt: properties.createdAt ?? new Date().toISOString(),
        address: properties.address,
        latitude: properties.latitude,
        longitude: properties.longitude,
        centroid: properties.centroid,
        parcelId: properties.parcelId ?? null,
        locationSource: properties.locationSource,
        feature: {
          ...feature,
          id: addedIds[index] ?? feature.id,
          properties: {
            ...(feature.properties ?? {}),
            zoneName,
            zoneType,
            zoneNotes,
            zoneLocked,
            zoneVisible,
            acres: zoneMeasurements.acres,
            squareFeet: zoneMeasurements.squareFeet,
            perimeterFeet: zoneMeasurements.perimeterFeet,
            serviceTypeId: serviceType.id,
            serviceType: properties.serviceType ?? serviceType.id,
            serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
            geometryType,
            color: properties.color ?? serviceType.color,
            unit: properties.unit ?? serviceType.unit,
            areaAcres: zoneMeasurements.acres,
            areaSqFt: zoneMeasurements.squareFeet,
            lengthFt,
            label: properties.label ?? serviceType.label,
            quoteCategory: properties.quoteCategory ?? serviceType.quoteCategory,
            defaultRateType: serviceType.defaultRateType,
            visible: zoneVisible,
            createdAt: properties.createdAt ?? new Date().toISOString(),
            address: properties.address,
            latitude: properties.latitude,
            longitude: properties.longitude,
            centroid: properties.centroid,
            parcelId: properties.parcelId ?? null,
            locationSource: properties.locationSource
          }
        }
      };
    });

    const nextMeasurements = nextZones.reduce<ProjectMeasurements>(
      (total, zone) => ({
        acres: total.acres + zone.acres,
        squareFeet: total.squareFeet + zone.squareFeet,
        perimeterFeet: total.perimeterFeet + zone.perimeterFeet
      }),
      { acres: 0, squareFeet: 0, perimeterFeet: 0 }
    );

    setMeasurements(nextMeasurements);
    setWorkZones(nextZones);
    workZonesRef.current = nextZones;
    const requestedSelectedZone = initialSelectedDrawingId
      ? nextZones.find((zone) => zone.id === initialSelectedDrawingId)
      : null;
    const initialSelectedIds = requestedSelectedZone?.id
      ? [requestedSelectedZone.id]
      : nextZones[0]?.id
        ? [nextZones[0].id]
        : [];
    selectedZoneIdsRef.current = initialSelectedIds;
    setSelectedZoneIds(initialSelectedIds);
    setHasPolygon(true);
    lockedFeatureRef.current = nextZones.reduce<Record<string, DrawShapeFeature>>((current, zone) => {
      if (zone.locked) current[zone.id] = cloneShapeFeature(zone.feature);
      return current;
    }, {});
    syncLayerVisibility();
    onMeasurementsChangeRef.current(nextMeasurements);
    const loadedPrimaryPolygon = (featuresToAdd.find((feature) => feature.geometry.type === "Polygon") as Feature<Polygon, DrawFeatureProperties> | undefined) ?? null;
    onPolygonChangeRef.current?.(loadedPrimaryPolygon);
    onZonesChangeRef.current?.(nextZones);
    onSelectedZonesChangeRef.current?.(nextZones.filter((zone) => initialSelectedIds.includes(zone.id)));
    nextZones.forEach((zone) => {
      if (zone.address && Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude)) return;
      const loadedFeature = draw.get(zone.id);
      if (loadedFeature && isDrawShapeFeature(loadedFeature)) {
        void resolveDrawingLocation(loadedFeature);
      }
    });

    if (requestedSelectedZone) {
      draw.changeMode("simple_select", { featureIds: [requestedSelectedZone.id] });
      setMapPanel("explorer");
    }

    if (mapRef.current) {
      fitMapToFeatures(mapRef.current, requestedSelectedZone ? [requestedSelectedZone.feature] : featuresToAdd);
    }
    resetHistory(getCurrentSnapshot());

    if (initialAddress) {
      onAddressChangeRef.current(initialAddress);
    }
  // Loading a project should not recreate map history helpers or reset the map instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, resetKey, initialPolygon, initialAddress, initialSelectedDrawingId, mapReady]);

  function setMobileDrawingDraftState(next: MobileDrawingDraft | null) {
    mobileDrawingDraftRef.current = next;
    setMobileDrawingDraft(next);
    updateMobileDrawingPreview(next);
  }

  function startMobileDrawing(serviceType = activeServiceTypeRef.current) {
    const draw = drawRef.current;
    if (!draw) return;
    draw.changeMode("simple_select", { featureIds: [] });
    selectedZoneIdsRef.current = [];
    setSelectedZoneIds([]);
    onSelectedZonesChangeRef.current?.([]);
    const nextDraft: MobileDrawingDraft = {
      points: [],
      geometry: serviceType.geometry === "line" ? "line" : "polygon",
      serviceType
    };
    setMobileDrawingDraftState(nextDraft);
    ensureMobileDrawingLayers();
    activeModeRef.current = "draw";
    setActiveMode("draw");
    setMapPanel(null);
  }

  function addMobileDrawingPoint() {
    const map = mapRef.current;
    const draft = mobileDrawingDraftRef.current;
    if (!map || !draft) return;
    const center = map.getCenter();
    setMobileDrawingDraftState({
      ...draft,
      points: [...draft.points, [center.lng, center.lat]]
    });
  }

  function undoMobileDrawingPoint() {
    const draft = mobileDrawingDraftRef.current;
    if (!draft?.points.length) return;
    setMobileDrawingDraftState({
      ...draft,
      points: draft.points.slice(0, -1)
    });
  }

  function cancelMobileDrawing() {
    setMobileDrawingDraftState(null);
    drawRef.current?.changeMode("simple_select", { featureIds: [] });
    activeModeRef.current = "select";
    setActiveMode("select");
  }

  function finishMobileDrawing() {
    const draft = mobileDrawingDraftRef.current;
    if (!draft) return;
    const minimumPoints = draft.geometry === "line" ? 2 : 3;
    if (draft.points.length < minimumPoints) return;

    const featureId = crypto.randomUUID();
    const feature: DrawShapeFeature = draft.geometry === "line"
      ? {
          type: "Feature",
          id: featureId,
          geometry: {
            type: "LineString",
            coordinates: draft.points
          },
          properties: {}
        }
      : {
          type: "Feature",
          id: featureId,
          geometry: {
            type: "Polygon",
            coordinates: [[...draft.points, draft.points[0]]]
          },
          properties: {}
        };
    setMobileDrawingDraftState(null);
    finishMobileDrawingRef.current(feature);
  }

  function setDrawMode(mode: DrawMode) {
    const draw = drawRef.current;
    if (!draw) return;

    if (mode !== "select" && is3DViewRef.current) {
      setMapViewMode(false);
      mapRef.current?.jumpTo({ pitch: 0, bearing: 0 });
      setViewNotice("Drawing works best in 2D view");
      window.setTimeout(() => setViewNotice(null), 2600);
    }

    circleCenterRef.current = null;
    updateCirclePreview(null);

    if (mode === "draw") {
      if (isMobileDrawingLayout()) {
        startMobileDrawing();
        return;
      }
      if (activeServiceTypeRef.current.geometry === "line") {
        draw.changeMode("draw_line_string");
      } else {
        draw.changeMode("draw_polygon");
      }
    }

    if (mode === "select") {
      setMobileDrawingDraftState(null);
      draw.changeMode("simple_select");
    }

    if (mode === "measure") {
      draw.changeMode("simple_select");
    }

    if (mode === "circle") {
      draw.changeMode("simple_select");
      clearLinearMeasurement();
    }

    if (mode === "edit") {
      const selected = draw.getSelected().features[0] ?? draw.getAll().features[0];
      const properties = (selected?.properties ?? {}) as DrawFeatureProperties;
      if (selected?.id && !properties.zoneLocked) {
        draw.changeMode("direct_select", { featureId: String(selected.id) });
      } else {
        draw.changeMode("simple_select");
      }
    }

    setActiveMode(mode);
    activeModeRef.current = mode;
  }

  function deleteBoundary() {
    const draw = drawRef.current;
    if (!draw) return;

    const featuresToDelete = draw.getSelected().features.filter(isDrawShapeFeature);
    if (!featuresToDelete.length) return;
    const deletedIds = new Set(featuresToDelete.map((feature) => (feature.id ? String(feature.id) : "")).filter(Boolean));
    const deletedZones = workZonesRef.current.filter((zone) => deletedIds.has(zone.id));
    const previousSnapshot = getCurrentSnapshot();
    isApplyingHistoryRef.current = true;
    featuresToDelete.forEach((feature) => {
      if (feature.id) draw.delete(String(feature.id));
    });
    isApplyingHistoryRef.current = false;
    commitDrawingDeletion(deletedZones, previousSnapshot);

    setActiveMode("select");
  }

  function clearSelectedZone() {
    const draw = drawRef.current;
    selectedZoneIdsRef.current = [];
    setSelectedZoneIds([]);
    onSelectedZonesChangeRef.current?.([]);
    setInspectorView("summary");
    draw?.changeMode("simple_select", { featureIds: [] });
  }

  function selectExplorerZone(zone: WorkZone, zoomToZone = false) {
    const draw = drawRef.current;
    if (!draw) return;

    draw.changeMode("simple_select", { featureIds: [zone.id] });
    const nextIds = [zone.id];
    selectedZoneIdsRef.current = nextIds;
    setSelectedZoneIds(nextIds);
    onSelectedZonesChangeRef.current?.([zone]);
    setInspectorView("summary");
    setActiveMode("select");
    setActiveMapPanel("explorer");
    onToolPanelChange?.("explorer");

    if (zoomToZone && mapRef.current) {
      fitMapToFeatures(mapRef.current, [zone.feature as DrawShapeFeature]);
    }
  }

  function deleteExplorerZone(zone: WorkZone) {
    const draw = drawRef.current;
    if (!draw) return;
    const previousSnapshot = getCurrentSnapshot();
    isApplyingHistoryRef.current = true;
    draw.delete(zone.id);
    isApplyingHistoryRef.current = false;
    if (selectedZoneIdsRef.current.includes(zone.id)) {
      clearSelectedZone();
    }
    commitDrawingDeletion([zone], previousSnapshot);
  }

  function changeMapStyle(nextStyle: MapStyle) {
    const map = mapRef.current;
    setIsStyleMenuOpen(false);
    if (!map || nextStyle === mapStyle) return;

    setMapStyle(nextStyle);
    onMapStyleChange?.(nextStyle);
    map.setStyle(mapStyles[nextStyle].url, {
      diff: false,
      localFontFamily: "",
      localIdeographFontFamily: ""
    });
    map.once("style.load", () => {
      ensureMeasurementLayers();
      ensureParcelLayers();
      ensure3DResources(is3DViewRef.current);
      updateParcelSources(selectedParcelRef.current);
      syncLayerVisibility();
      map.resize();
    });
  }

  useEffect(() => {
    if (!mapReady || initialMapStyle === mapStyle) return;
    changeMapStyle(initialMapStyle);
  // The style transition is intentionally driven only by the persisted preference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMapStyle, mapReady]);

  function updateSelectedZoneProperty(field: keyof DrawFeatureProperties, value: string) {
    const draw = drawRef.current;
    if (!draw || !selectedZone) return;

    draw.setFeatureProperty(selectedZone.id, "zoneLocked", false);
    delete lockedFeatureRef.current[selectedZone.id];
    draw.setFeatureProperty(selectedZone.id, field, value);
    if (field === "zoneType" && isZoneType(value)) {
      setActiveZoneType(value);
      draw.setFeatureProperty(selectedZone.id, "zoneVisible", layerVisibilityRef.current[value]);
    }
    refreshZonesRef.current();
    pushHistorySnapshot();
    void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "edit");
  }

  function updateSelectedZoneColor(color: string) {
    const draw = drawRef.current;
    if (!draw || !selectedZone) return;
    draw.setFeatureProperty(selectedZone.id, "zoneLocked", false);
    delete lockedFeatureRef.current[selectedZone.id];
    draw.setFeatureProperty(selectedZone.id, "color", color);
    refreshZonesRef.current();
    pushHistorySnapshot();
    void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "edit");
  }

  function zoomToSelectedZone() {
    if (!selectedZone || !mapRef.current) return;
    fitMapToFeatures(mapRef.current, [selectedZone.feature as DrawShapeFeature]);
  }

  function applyServiceTypeToSelectedZone(serviceType: ActiveServiceType) {
    const draw = drawRef.current;
    if (!draw || !selectedZone) return false;

    draw.setFeatureProperty(selectedZone.id, "zoneLocked", false);
    delete lockedFeatureRef.current[selectedZone.id];
    draw.setFeatureProperty(selectedZone.id, "previousServiceTypeLabel", selectedZone.serviceTypeLabel ?? zoneLabels[selectedZone.type]);
    draw.setFeatureProperty(selectedZone.id, "previousQuoteCategory", selectedZone.quoteCategory ?? selectedZone.serviceTypeLabel ?? zoneLabels[selectedZone.type]);
    draw.setFeatureProperty(selectedZone.id, "serviceTypeChangedAt", new Date().toISOString());
    draw.setFeatureProperty(selectedZone.id, "zoneType", serviceType.zoneType);
    draw.setFeatureProperty(selectedZone.id, "zoneVisible", layerVisibilityRef.current[serviceType.zoneType]);
    draw.setFeatureProperty(selectedZone.id, "serviceTypeId", serviceType.id);
    draw.setFeatureProperty(selectedZone.id, "serviceType", serviceType.id);
    draw.setFeatureProperty(selectedZone.id, "serviceTypeLabel", serviceType.label);
    draw.setFeatureProperty(selectedZone.id, "geometryType", selectedZone.geometryType ?? serviceType.geometry);
    draw.setFeatureProperty(selectedZone.id, "color", serviceType.color);
    draw.setFeatureProperty(selectedZone.id, "unit", serviceType.unit);
    draw.setFeatureProperty(selectedZone.id, "label", serviceType.label);
    draw.setFeatureProperty(selectedZone.id, "quoteCategory", serviceType.quoteCategory);
    draw.setFeatureProperty(selectedZone.id, "defaultRateType", serviceType.defaultRateType);
    draw.setFeatureProperty(selectedZone.id, "visible", layerVisibilityRef.current[serviceType.zoneType]);
    refreshZonesRef.current();
    pushHistorySnapshot();
    void onDrawingStateCommitRef.current?.(workZonesRef.current, [], "edit");
    return true;
  }

  function handleActiveZoneTypeChange(nextType: ZoneType) {
    const nextServiceType = getServiceTypeByZoneType(nextType);
    setActiveServiceType(nextServiceType);
    activeServiceTypeRef.current = nextServiceType;
    setActiveZoneType(nextServiceType.zoneType);
    activeZoneTypeRef.current = nextServiceType.zoneType;
    const map = mapRef.current;
    setDrawLayerFallbackColor(map, nextServiceType.color);
    if (map?.getLayer("acrex-circle-preview-fill")) {
      map.setPaintProperty("acrex-circle-preview-fill", "fill-color", nextServiceType.color);
      map.setPaintProperty("acrex-circle-preview-line", "line-color", nextServiceType.color);
    }

    if (applyServiceTypeToSelectedZone(nextServiceType)) {
      return;
    }

    if (drawRef.current && !selectedZone) {
      setDrawMode("draw");
    }
  }

  function handleServiceTypeSelect(serviceType: ActiveServiceType) {
    const selectedServiceType =
      serviceType.zoneType === "Custom"
        ? {
            ...serviceType,
            color: customDrawColor
          }
        : serviceType;
    setActiveServiceType(selectedServiceType);
    activeServiceTypeRef.current = selectedServiceType;
    setActiveZoneType(selectedServiceType.zoneType);
    activeZoneTypeRef.current = selectedServiceType.zoneType;
    const map = mapRef.current;
    setDrawLayerFallbackColor(map, selectedServiceType.color);
    if (map?.getLayer("acrex-circle-preview-fill")) {
      map.setPaintProperty("acrex-circle-preview-fill", "fill-color", selectedServiceType.color);
      map.setPaintProperty("acrex-circle-preview-line", "line-color", selectedServiceType.color);
    }
    selectedZoneIdsRef.current = [];
    setSelectedZoneIds([]);
    onSelectedZonesChangeRef.current?.([]);
    setDrawMode("draw");
    setMapPanel(null);
  }

  function handleCustomDrawColorChange(color: string) {
    setCustomDrawColor(color);
    if (activeServiceType.zoneType !== "Custom") return;
    const nextServiceType = {
      ...activeServiceType,
      color
    };
    setActiveServiceType(nextServiceType);
    activeServiceTypeRef.current = nextServiceType;
    setDrawLayerFallbackColor(mapRef.current, color);
  }

  function handleSelectedZoneServiceTypeChange(serviceTypeId: string) {
    const serviceType = getServiceTypeById(serviceTypeId);
    setActiveServiceType(serviceType);
    activeServiceTypeRef.current = serviceType;
    setActiveZoneType(serviceType.zoneType);
    activeZoneTypeRef.current = serviceType.zoneType;
    setDrawLayerFallbackColor(mapRef.current, serviceType.color);
    applyServiceTypeToSelectedZone(serviceType);
  }

  const setMapPanel = useCallback((panel: ActiveMapPanel) => {
    setActiveMapPanel(panel);
    onToolPanelChange?.(panel);
  }, [onToolPanelChange]);

  const toggleMapPanel = useCallback((panel: Exclude<ActiveMapPanel, null>) => {
    const nextPanel = activeMapPanel === panel ? null : panel;
    setActiveMapPanel(nextPanel);
    onToolPanelChange?.(nextPanel);
  }, [activeMapPanel, onToolPanelChange]);

  function drawAnotherFromPill() {
    clearSelectedZone();
    setSavePill(null);
    setDrawMode("draw");
  }

  function toggleSelectedZoneVisibility() {
    const draw = drawRef.current;
    if (!draw || !selectedZone) return;

    const nextVisible = selectedZone.visible === false;
    draw.setFeatureProperty(selectedZone.id, "zoneVisible", nextVisible);
    draw.setFeatureProperty(selectedZone.id, "visible", nextVisible);
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function deleteSelectedZone() {
    if (!selectedZone) return;
    deleteExplorerZone(selectedZone);
  }

  useEffect(() => {
    if (!mobileCommand?.id) return;

    if (mobileCommand.action === "draw-service" && mobileCommand.value) {
      handleServiceTypeSelect(getServiceTypeById(mobileCommand.value));
      return;
    }
    if (mobileCommand.action === "layers") {
      toggleParcelLines();
      return;
    }
    if (mobileCommand.action === "map-style" && mobileCommand.value && mobileCommand.value in mapStyles) {
      changeMapStyle(mobileCommand.value as MapStyle);
      return;
    }
    if (mobileCommand.action === "toggle-3d") {
      setMapViewMode(!is3DViewRef.current, { announce: true });
      return;
    }
    if (mobileCommand.action === "reset-view") {
      resetMapView();
      return;
    }
    if (mobileCommand.action === "locate") {
      if (userLocationMarkerRef.current) {
        removeUserLocationMarker();
        onMobileNotice?.("Location marker hidden.");
        return;
      }
      if (!navigator.geolocation || !mapRef.current) {
        onMobileNotice?.("Location is not available on this device.");
        return;
      }
      onMobileNotice?.("Finding your location…");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          showUserLocation(position.coords.longitude, position.coords.latitude);
          mapRef.current?.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: Math.max(mapRef.current?.getZoom() ?? 14, 15),
            essential: true
          });
          onMobileNotice?.("Location found.");
        },
        (error) => {
          onMobileNotice?.(
            error.code === error.PERMISSION_DENIED
              ? "Allow AcreX location access in device settings."
              : "Your location could not be determined."
          );
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
      return;
    }
    if (mobileCommand.action === "rename-selected" && typeof mobileCommand.value === "string") {
      updateSelectedZoneProperty("zoneName", mobileCommand.value);
      return;
    }
    if (mobileCommand.action === "service-selected" && mobileCommand.value) {
      handleSelectedZoneServiceTypeChange(mobileCommand.value);
      return;
    }
    if (mobileCommand.action === "color-selected" && mobileCommand.value) {
      updateSelectedZoneColor(mobileCommand.value);
      return;
    }
    if (mobileCommand.action === "toggle-selected") {
      toggleSelectedZoneVisibility();
      return;
    }
    if (mobileCommand.action === "zoom-selected") {
      zoomToSelectedZone();
      return;
    }
    if (mobileCommand.action === "delete-selected") {
      deleteSelectedZone();
      return;
    }
    if (mobileCommand.action === "clear-selection") {
      clearSelectedZone();
      setMapPanel(null);
    }
  // Command IDs intentionally trigger imperative Mapbox actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileCommand?.id, onMobileNotice]);

  function toggleLayer(type: ZoneType) {
    setLayerVisibility((current) => {
      const next = {
        ...current,
        [type]: !current[type]
      };
      layerVisibilityRef.current = next;
      syncLayerVisibility(next);
      refreshZonesRef.current();
      return next;
    });
  }

  function toggleParcelLines() {
    setParcelLinesVisible((current) => {
      const next = !current;
      setParcelVisibility(next);
      return next;
    });
  }

  function addParcelBoundaryToDraw() {
    const draw = drawRef.current;
    const parcel = selectedParcelRef.current;
    if (!draw || !parcel) return;

    const measurements = getParcelMeasurements(parcel);
    const serviceType = getServiceTypeByZoneType("Property");
    const feature: Feature<Polygon, DrawFeatureProperties> = {
      type: "Feature",
      geometry: JSON.parse(JSON.stringify(parcel.geometry)) as Polygon,
      id: crypto.randomUUID(),
      properties: {
        ...(parcel.properties ?? {}),
        address: parcel.properties?.address ?? undefined,
        zoneName: "Parcel Boundary",
        zoneType: "Property",
        zoneNotes: "Parcel lines are approximate and not legal survey boundaries.",
        zoneLocked: false,
        zoneVisible: layerVisibilityRef.current.Property,
        acres: measurements.acres,
        squareFeet: measurements.squareFeet,
        perimeterFeet: measurements.perimeterFeet,
        serviceTypeId: serviceType.id,
        serviceType: serviceType.id,
        serviceTypeLabel: serviceType.label,
        geometryType: serviceType.geometry,
        color: serviceType.color,
        unit: serviceType.unit,
        areaAcres: measurements.acres,
        areaSqFt: measurements.squareFeet,
        label: "Parcel Boundary",
        quoteCategory: serviceType.quoteCategory,
        defaultRateType: serviceType.defaultRateType,
        visible: layerVisibilityRef.current.Property,
        createdAt: new Date().toISOString()
      }
    };
    const ids = draw.add(feature);
    const addedId = Array.isArray(ids) ? ids[0] : feature.id;
    if (addedId) {
      latestDrawingLocationIdRef.current = String(addedId);
      const addedFeature = draw.get(String(addedId));
      if (addedFeature && isDrawShapeFeature(addedFeature)) {
        void resolveDrawingLocation(addedFeature);
      }
      draw.changeMode("simple_select", { featureIds: [String(addedId)] });
      const nextIds = [String(addedId)];
      selectedZoneIdsRef.current = nextIds;
      setSelectedZoneIds(nextIds);
    }
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function openRecentSearch(search: RecentSearch) {
    const map = mapRef.current;
    onAddressChangeRef.current(search.address);
    onAddressDetailsChangeRef.current?.(search);
    currentSearchRef.current = search;
    showAddressMarker(search);
    map?.flyTo({
      center: [search.longitude, search.latitude],
      zoom: 16.4,
      duration: 950,
      essential: true
    });
  }

  function clearTransientDrawing() {
    if (mobileDrawingDraftRef.current) {
      cancelMobileDrawing();
      return;
    }
    circleCenterRef.current = null;
    updateCirclePreview(null);
    clearLinearMeasurement();
    drawRef.current?.changeMode("simple_select");
    setActiveMode("select");
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const isModifier = event.metaKey || event.ctrlKey;

      if (isModifier && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redoDrawChange();
        return;
      }

      if (isModifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoDrawChange();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearTransientDrawing();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteBoundary();
        return;
      }

      if (event.code === "Space" && !spaceRestoreModeRef.current) {
        event.preventDefault();
        spaceRestoreModeRef.current = activeModeRef.current;
        drawRef.current?.changeMode("simple_select");
        mapRef.current?.getCanvas().classList.add("is-temporary-pan");
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space" || !spaceRestoreModeRef.current) return;
      event.preventDefault();
      const mode = spaceRestoreModeRef.current;
      spaceRestoreModeRef.current = null;
      mapRef.current?.getCanvas().classList.remove("is-temporary-pan");
      if (mode === "draw" || mode === "circle" || mode === "measure") {
        setDrawMode(mode);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  });

  useEffect(() => {
    if (useParcelRequestKey > 0) {
      addParcelBoundaryToDraw();
    }
  // This effect is intentionally keyed to an external button command.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useParcelRequestKey]);

  useEffect(() => {
    if (!explorerRequest?.id) return;
    setExplorerFilter(explorerRequest.type);
    setMapPanel("explorer");
  }, [explorerRequest?.id, explorerRequest?.type, setMapPanel]);

  useEffect(() => {
    if (!activeMapPanel) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && mapControlsRef.current?.contains(target)) return;
      setMapPanel(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [activeMapPanel, setMapPanel]);

  if (!mapboxToken || mapError) {
    return (
      <div className="map-warning">
        <span>Map setup needed</span>
        <h2>Mapbox Token Missing</h2>
        <p>
          The Mapbox access token is not configured. To display the map, add your token to the environment variable:
        </p>
        <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>
        {mapError ? <small>{mapError}</small> : null}
      </div>
    );
  }

  return (
    <>
      {drawingDeleteNotice ? (
        <div className="toast-stack" aria-live="polite">
          <div className="dashboard-toast has-action">
            <span>{drawingDeleteNotice.count === 1 ? "Drawing deleted" : `${drawingDeleteNotice.count} drawings deleted`}</span>
            <button type="button" onClick={restoreDeletedDrawing}>Undo</button>
          </div>
        </div>
      ) : null}
      {!searchMountId ? <div className="map-search-bar" ref={searchContainerRef} /> : null}
      <div className="map-tool-controls" ref={mapControlsRef}>
        <div className="draw-toolbar" aria-label="Drawing toolbar">
          <button
            className={activeMapPanel === "draw" || activeMode === "draw" ? "active" : ""}
            type="button"
            onClick={() => {
              if (activeMapPanel !== "draw") clearSelectedZone();
              toggleMapPanel("draw");
            }}
            aria-expanded={activeMapPanel === "draw"}
            aria-haspopup="menu"
          >
            <i className="draw-active-color" style={{ background: activeServiceType.color }} aria-hidden="true" />
            <span>Draw</span>
            <small>{activeServiceType.shortLabel}</small>
          </button>
          {activeMapPanel === "draw" ? (
            <div className="draw-service-menu" role="menu" aria-label="Draw service type">
              <div className="map-popover-heading">
                <span>Draw Type</span>
                <button type="button" onClick={() => setMapPanel(null)} aria-label="Close draw tools">
                  Close
                </button>
              </div>
              {serviceTypes.filter((serviceType) => serviceType.id !== "property-boundary").map((serviceType) => (
                <button
                  className={activeServiceType.id === serviceType.id ? "active" : ""}
                  key={serviceType.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeServiceType.id === serviceType.id}
                  style={
                    {
                      "--service-color": serviceType.zoneType === "Custom" ? customDrawColor : serviceType.color
                    } as CSSProperties
                  }
                  onClick={() => handleServiceTypeSelect(serviceType)}
                >
                  <i style={{ background: serviceType.zoneType === "Custom" ? customDrawColor : serviceType.color }} />
                  <span>{serviceType.shortLabel}</span>
                </button>
              ))}
              <label className="custom-draw-color">
                <span>Custom color</span>
                <input
                  type="color"
                  value={customDrawColor}
                  onChange={(event) => handleCustomDrawColorChange(event.target.value)}
                />
                <code>{customDrawColor}</code>
              </label>
            </div>
          ) : null}
          <button
            className={activeMapPanel === "explorer" ? "active" : ""}
            type="button"
            onClick={() => {
              if (activeMapPanel !== "explorer") clearSelectedZone();
              setExplorerFilter(null);
              toggleMapPanel("explorer");
            }}
            aria-expanded={activeMapPanel === "explorer"}
            aria-haspopup="dialog"
          >
            Inspect
          </button>
        </div>
        {activeMapPanel === "explorer" ? (
          <section className="project-explorer-panel" role="dialog" aria-label="Drawing Inspector">
            <div className="project-explorer-heading">
              <div>
                <span>Drawing Inspector</span>
                <strong>
                  {selectedZone
                    ? selectedZone.name
                    : explorerFilter
                    ? `${explorerGroupLabels[explorerFilter] ?? zoneLabels[explorerFilter]} drawings`
                    : activeProjectId
                      ? `${workZones.length} saved drawing${workZones.length === 1 ? "" : "s"}`
                      : "Unsaved project"}
                </strong>
              </div>
              <div className="project-explorer-heading-actions">
                {selectedZone ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearSelectedZone();
                      window.setTimeout(() => setMapPanel("explorer"), 0);
                    }}
                  >
                    All Drawings
                  </button>
                ) : null}
                {explorerFilter ? (
                  <button type="button" onClick={() => setExplorerFilter(null)}>
                    Show All
                  </button>
                ) : null}
                <button type="button" onClick={() => setMapPanel(null)} aria-label="Close Drawing Inspector">
                  Close
                </button>
              </div>
            </div>

            {selectedZone ? (
              <div className="project-explorer-selected">
                <div className="zone-inspector-title">
                  <i style={{ background: selectedZone.color ?? zoneColors[selectedZone.type] }} aria-hidden="true" />
                  <span>
                    <strong>{selectedZone.name}</strong>
                    <small>{selectedZone.serviceTypeLabel ?? zoneLabels[selectedZone.type]}</small>
                  </span>
                  <em className={selectedZoneIsQuoted ? "is-quoted" : ""}>
                    {selectedZoneIsQuoted ? "Quoted" : "Not quoted"}
                  </em>
                </div>
                {inspectorView === "summary" ? (
                  <div className="project-explorer-subview">
                    <dl className="zone-inspector-details is-summary">
                      <div>
                        <dt>{selectedZone.geometryType === "line" ? "Length" : "Area"}</dt>
                        <dd>{formatShapeMeasurement(selectedZone)}</dd>
                      </div>
                      <div>
                        <dt>Project</dt>
                        <dd>{activeProjectId ? "Saved" : "Not saved"}</dd>
                      </div>
                      <div>
                        <dt>Quote</dt>
                        <dd>{selectedZoneIsQuoted ? "Added to quote" : "Available"}</dd>
                      </div>
                      <div>
                        <dt>Visibility</dt>
                        <dd>{selectedZone.visible === false ? "Hidden" : "Visible"}</dd>
                      </div>
                    </dl>
                    <div className="project-explorer-fields is-quick-edit">
                      <label className="project-explorer-inline-field">
                        <span>Name</span>
                        <input
                          ref={selectedZoneNameInputRef}
                          value={selectedZone.name}
                          onChange={(event) => updateSelectedZoneProperty("zoneName", event.target.value)}
                        />
                      </label>
                      <label className="project-explorer-inline-field">
                        <span>Service</span>
                        <select
                          value={selectedZone.serviceTypeId ?? getServiceTypeByZoneType(selectedZone.type).id}
                          onChange={(event) => handleSelectedZoneServiceTypeChange(event.target.value)}
                        >
                          {serviceTypes.filter((serviceType) => serviceType.id !== "property-boundary").map((serviceType) => (
                            <option key={serviceType.id} value={serviceType.id}>
                              {serviceType.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="project-explorer-color-field">
                        <span>Color</span>
                        <span className="project-explorer-color-control">
                          <i style={{ background: selectedZone.color ?? zoneColors[selectedZone.type] }} aria-hidden="true" />
                          <strong>{selectedZone.color ?? zoneColors[selectedZone.type]}</strong>
                          <input
                            aria-label="Choose drawing color"
                            type="color"
                            value={selectedZone.color ?? zoneColors[selectedZone.type]}
                            onChange={(event) => updateSelectedZoneColor(event.target.value)}
                          />
                        </span>
                      </label>
                    </div>
                    <div className="project-explorer-actions">
                      {activeProjectId ? (
                        <a
                          className="primary"
                          href={selectedZoneIsQuoted
                            ? `/quotes?project=${activeProjectId}`
                            : `/quotes?project=${activeProjectId}&measurement=${encodeURIComponent(selectedZone.id)}`}
                        >
                          {selectedZoneIsQuoted ? "Open Quote" : "Add to Quote"}
                        </a>
                      ) : null}
                      {activeProjectId ? (
                        <a href={`/projects/${activeProjectId}`}>Open Project</a>
                      ) : (
                        <button type="button" onClick={() => void onSaveProject?.()} disabled={!onSaveProject || isSavingProject}>
                          {isSavingProject ? "Saving..." : "Save to Project"}
                        </button>
                      )}
                      <button type="button" onClick={zoomToSelectedZone}>Zoom To</button>
                      <button type="button" onClick={toggleSelectedZoneVisibility}>
                        {selectedZone.visible === false ? "Show" : "Hide"}
                      </button>
                      <button className="danger" type="button" onClick={deleteSelectedZone}>Delete</button>
                      <button type="button" onClick={() => setInspectorView("more")}>Location</button>
                    </div>
                  </div>
                ) : (
                  <div className="project-explorer-subview">
                    <div className="project-explorer-subview-heading">
                      <div><span>Drawing location</span><strong>{selectedZone.name}</strong></div>
                      <button type="button" onClick={() => setInspectorView("summary")}>Back</button>
                    </div>
                    <dl className="zone-inspector-details is-location">
                      <div>
                        <dt>Location</dt>
                        <dd title={selectedZone.address ?? undefined}>{selectedZone.address ?? "Resolving drawing location..."}</dd>
                      </div>
                      <div>
                        <dt>Coordinates</dt>
                        <dd>
                          {Number.isFinite(selectedZone.latitude) && Number.isFinite(selectedZone.longitude)
                            ? `${selectedZone.latitude?.toFixed(6)}, ${selectedZone.longitude?.toFixed(6)}`
                            : "Resolving..."}
                        </dd>
                      </div>
                    </dl>
                    <div className="project-explorer-actions is-more">
                      <button type="button" onClick={toggleSelectedZoneVisibility}>
                        {selectedZone.visible === false ? "Show Drawing" : "Hide Drawing"}
                      </button>
                      <button className="danger" type="button" onClick={deleteSelectedZone}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ) : explorerGroups.length ? (
              <div className="project-explorer-groups">
                {explorerGroups.map((group) => (
                  <section className="project-explorer-group" key={group.type}>
                    <header>
                      <span>{group.label}</span>
                      <small>{group.zones.length}</small>
                    </header>
                    <div>
                      {group.zones.map((zone) => {
                        const isSelected = selectedZoneIds.includes(zone.id);
                        return (
                          <article className={`project-explorer-row${isSelected ? " is-selected" : ""}`} key={zone.id}>
                            <button className="project-explorer-row-main" type="button" onClick={() => selectExplorerZone(zone)}>
                              <i style={{ background: zone.color ?? zoneColors[zone.type] }} aria-hidden="true" />
                              <span>
                                <strong>{zone.name}</strong>
                                <small>{zone.serviceTypeLabel ?? explorerGroupLabels[zone.type] ?? zoneLabels[zone.type]}</small>
                              </span>
                              <span className="project-explorer-measurement">{formatShapeMeasurement(zone)}</span>
                            </button>

                            <div className="project-explorer-actions">
                              <button type="button" onClick={() => selectExplorerZone(zone, true)}>Zoom To</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="project-explorer-empty">
                <strong>No drawings yet</strong>
                <p>Choose Draw, select a service type, and mark the work area on the map.</p>
              </div>
            )}
          </section>
        ) : null}
        <div className="map-layer-chips" aria-label="Layer visibility">
          <button
            className={activeMapPanel === "layers" || parcelLinesVisible ? "active" : ""}
            type="button"
            onClick={() => {
              if (activeMapPanel !== "layers") clearSelectedZone();
              toggleMapPanel("layers");
            }}
            aria-expanded={activeMapPanel === "layers"}
            aria-haspopup="dialog"
          >
            <i style={{ background: zoneColors.Property }} />
            Layers
          </button>
          {activeMapPanel === "layers" ? (
            <div className="map-layers-popover" role="dialog" aria-label="Layer controls">
              <div className="map-popover-heading">
                <span>Layers</span>
                <button type="button" onClick={() => setMapPanel(null)} aria-label="Close layers">
                  Close
                </button>
              </div>
              <button className={parcelLinesVisible ? "active" : ""} type="button" onClick={toggleParcelLines}>
                <i style={{ background: zoneColors.Property }} />
                Parcel boundaries
              </button>
            </div>
          ) : null}
        </div>
        <div className="map-style-control">
          <div className="map-view-mode-controls">
            <button
              className="map-style-icon-button"
              type="button"
              onClick={() => setIsStyleMenuOpen((current) => !current)}
              aria-label="Choose map style"
              aria-expanded={isStyleMenuOpen}
              aria-haspopup="dialog"
              title={`Map style: ${mapStyles[mapStyle].label}`}
            >
              {mapStyle === "satellite" || mapStyle === "satellite-streets" ? (
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M3.2 5.2 7.4 3.5l5.2 2 4.2-1.7v11l-4.2 1.7-5.2-2-4.2 1.7v-11Z" />
                  <path d="M7.4 3.5v11M12.6 5.5v11" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M10 2.8 3.4 6.2 10 9.6l6.6-3.4L10 2.8Z" />
                  <path d="m3.4 10 6.6 3.4 6.6-3.4M3.4 13.8l6.6 3.4 6.6-3.4" />
                </svg>
              )}
            </button>
            <button
              className={`map-3d-button${is3DView ? " active" : ""}`}
              type="button"
              onClick={() => setMapViewMode(!is3DViewRef.current, { announce: true })}
              aria-pressed={is3DView}
            >
              {is3DView ? "2D" : "3D"}
            </button>
            <button className="map-reset-view-button" type="button" onClick={resetMapView}>
              Reset View
            </button>
          </div>
          {isStyleMenuOpen ? (
            <div className="map-style-menu" role="dialog" aria-label="Map style">
              <div className="map-popover-heading">
                <span>Map style</span>
                <button type="button" onClick={() => setIsStyleMenuOpen(false)} aria-label="Close map styles">Close</button>
              </div>
              {mapStyleOptions.map((style) => (
                <button
                  className={mapStyle === style.id ? "active" : ""}
                  type="button"
                  key={style.id}
                  onClick={() => changeMapStyle(style.id)}
                >
                  <span>{style.label}</span>
                  <small>{style.description}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {viewNotice ? <div className="map-view-notice" role="status">{viewNotice}</div> : null}
      {savePill ? (
        <div className="shape-save-pill" style={{ "--zone-color": savePill.color } as CSSProperties} role="status">
          <strong>{savePill.message}</strong>
          <div className="shape-save-pill-actions">
            <button type="button" onClick={drawAnotherFromPill}>Draw Another</button>
            <button
              type="button"
              onClick={() => {
                const zone = workZonesRef.current.find((item) => item.id === savePill.id);
                if (zone) selectExplorerZone(zone);
                setSavePill(null);
              }}
            >
              Inspect Drawing
            </button>
          </div>
        </div>
      ) : null}
      <div className="map-canvas" ref={mapContainerRef} aria-label="Mapbox property map" />
      {mobileDrawingDraft ? (
        <>
          <div className="mobile-drawing-crosshair" aria-hidden="true">
            <span />
          </div>
          <section className="mobile-drawing-control" aria-label={`Drawing ${mobileDrawingDraft.serviceType.shortLabel}`}>
            <div className="mobile-drawing-status">
              <i style={{ background: mobileDrawingDraft.serviceType.color }} aria-hidden="true" />
              <span>
                <small>Drawing {mobileDrawingDraft.geometry === "line" ? "line" : "area"}</small>
                <strong>{mobileDrawingDraft.serviceType.shortLabel}</strong>
              </span>
              <dl>
                <div>
                  <dt>Points</dt>
                  <dd>{mobileDrawingDraft.points.length}</dd>
                </div>
                {mobileDrawingDraft.geometry === "line" ? (
                  <div>
                    <dt>Total</dt>
                    <dd>{formatFeet(mobileDrawingMetrics.totalFeet)} ft</dd>
                  </div>
                ) : (
                  <>
                    <div>
                      <dt>Area</dt>
                      <dd>
                        {mobileDrawingMetrics.area
                          ? `${formatAcres(mobileDrawingMetrics.area.acres)} ac`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Perimeter</dt>
                      <dd>{formatFeet(mobileDrawingMetrics.totalFeet)} ft</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
            {mobileDrawingDraft.geometry === "polygon" && mobileDrawingMetrics.area ? (
              <p>{formatSquareFeet(mobileDrawingMetrics.area.squareFeet)} sq ft</p>
            ) : (
              <p>Move the map until the target is over the next point.</p>
            )}
            <div className="mobile-drawing-actions">
              <button className="primary" type="button" onClick={addMobileDrawingPoint}>
                Add Point
              </button>
              <button type="button" onClick={undoMobileDrawingPoint} disabled={!mobileDrawingDraft.points.length}>
                Undo Point
              </button>
              <button
                className="finish"
                type="button"
                onClick={finishMobileDrawing}
                disabled={mobileDrawingDraft.points.length < (mobileDrawingDraft.geometry === "line" ? 2 : 3)}
              >
                Finish
              </button>
              <button className="cancel" type="button" onClick={cancelMobileDrawing}>
                Cancel
              </button>
            </div>
          </section>
        </>
      ) : null}
      <div className="parcel-note">Parcel lines require a parcel data provider.</div>
    </>
  );
}
