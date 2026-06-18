"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { LngLatBoundsLike, Map as MapboxMap } from "mapbox-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import { circle as turfCircle, distance as turfDistance, length as turfLength, lineString as turfLineString } from "@turf/turf";
import { calculatePolygonMeasurements, type ProjectMeasurements } from "@/lib/geo/measurements";
import { formatAcres, formatFeet, formatSquareFeet } from "@/lib/geo/format";
import type { ParcelBoundaryFeature, ParcelLookupState } from "@/lib/projects/parcels";
import type { SavedProjectMapData, WorkZone, ZoneType } from "@/lib/projects/types";
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
    reason: "delete" | "undo"
  ) => boolean | Promise<boolean>;
  onSelectedZonesChange?: (zones: WorkZone[]) => void;
  onAddressDetailsChange?: (details: AddressDetails | null) => void;
  onParcelLookupChange?: (lookup: ParcelLookupState) => void;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  quotedZoneNames?: string[];
  onSaveProject?: () => void | Promise<void>;
  isSavingProject?: boolean;
  resetKey?: number;
  initialPolygon?: SavedProjectMapData | null;
  initialAddress?: string | null;
  searchMountId?: string;
  useParcelRequestKey?: number;
  onToolPanelChange?: (panel: ActiveMapPanel) => void;
  explorerRequest?: {
    id: number;
    type: ZoneType | null;
  };
};

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const baldwinCountyCenter: [number, number] = [-87.7461, 30.6592];
const defaultMapView = {
  center: baldwinCountyCenter,
  zoom: 10.2
};
const mapStyles = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  street: "mapbox://styles/mapbox/streets-v12"
} as const;
type DrawMode = "select" | "draw" | "edit" | "measure" | "circle";
type MapStyle = keyof typeof mapStyles;
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
};

type AddressDetails = {
  address: string;
  latitude: number;
  longitude: number;
  county?: string | null;
  parcelId?: string | null;
};

type RecentSearch = AddressDetails & {
  id: string;
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

const recentSearchesKey = "acrex-recent-searches";
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
  activeProjectName,
  quotedZoneNames = [],
  onSaveProject,
  isSavingProject = false,
  resetKey = 0,
  initialPolygon,
  initialAddress,
  searchMountId,
  useParcelRequestKey = 0,
  onToolPanelChange,
  explorerRequest
}: AcrexMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const mapControlsRef = useRef<HTMLDivElement | null>(null);
  const selectedZoneNameInputRef = useRef<HTMLInputElement | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
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
  const refreshZonesRef = useRef<() => WorkZone[]>(() => []);
  const onDrawingStateCommitRef = useRef(onDrawingStateCommit);
  const loadedProjectKeyRef = useRef<string | null | undefined>(undefined);
  const selectedParcelRef = useRef<ParcelBoundaryFeature | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [measurements, setMeasurements] = useState<ProjectMeasurements | null>(null);
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [activeZoneType, setActiveZoneType] = useState<ZoneType>("Property");
  const [activeServiceType, setActiveServiceType] = useState<ActiveServiceType>(defaultServiceType);
  const [activeMode, setActiveMode] = useState<DrawMode>("select");
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(defaultLayerVisibility);
  const [parcelLinesVisible, setParcelLinesVisible] = useState(true);
  const [activeMapPanel, setActiveMapPanel] = useState<ActiveMapPanel>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [, setLinearMeasurement] = useState<LinearMeasurement | null>(null);
  const [, setCircleMeasurement] = useState<CircleMeasurement | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [savePill, setSavePill] = useState<{ id: string; message: string; color: string; type: ZoneType } | null>(null);
  const [drawingDeleteNotice, setDrawingDeleteNotice] = useState<{ count: number; snapshot: DrawSnapshot } | null>(null);
  const drawingDeleteNoticeRef = useRef<{ count: number; snapshot: DrawSnapshot } | null>(null);
  const [customDrawColor, setCustomDrawColor] = useState(zoneColors.Custom);
  const [renamingExplorerZoneId, setRenamingExplorerZoneId] = useState<string | null>(null);
  const [changingExplorerZoneId, setChangingExplorerZoneId] = useState<string | null>(null);
  const [explorerFilter, setExplorerFilter] = useState<ZoneType | null>(null);
  const selectedZoneIdsRef = useRef<string[]>([]);

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
    setRecentSearches(getStoredRecentSearches());
  }, []);

  const selectedZones = workZones.filter((zone) => selectedZoneIds.includes(zone.id));
  const selectedZone = selectedZones.length === 1 ? selectedZones[0] : null;
  const selectedZoneQuoted = selectedZone ? quotedZoneNames.includes(selectedZone.name) : false;
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

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyles.satellite,
        center: defaultMapView.center,
        zoom: defaultMapView.zoom,
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
        map.resize();
        setMapReady(true);
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "bottom-right");
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
              "line-blur": 0.35
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
              "line-blur": 0.2
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
              "circle-radius": 4,
              "circle-color": "#7fd957"
            }
          },
          {
            id: "acrex-polygon-vertex",
            type: "circle",
            filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"], hiddenFilter],
            paint: {
              "circle-radius": 5,
              "circle-color": "#f5fff1",
              "circle-stroke-color": "#7fd957",
              "circle-stroke-width": 2
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
            parcelId: null
          };
          onAddressDetailsChangeRef.current?.(addressDetails);
          setRecentSearches(storeRecentSearch({ ...addressDetails, id: `${center[0]}:${center[1]}:${Date.now()}` }));
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
                createdAt: properties.createdAt ?? new Date().toISOString()
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

      const handleDrawCreate = (event: { features: GeoJSON.Feature[] }) => {
        sealExpiredDrawingDeletion();
        assignZoneDefaults(event.features);
        updateMeasurements();
        pushHistorySnapshot();
        const createdFeature = event.features.find(isDrawShapeFeature);
        const nextIds = createdFeature?.id ? [String(createdFeature.id)] : [];
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
        setActiveMode("select");
      };

      const handleDrawUpdate = (event: { features: GeoJSON.Feature[] }) => {
        sealExpiredDrawingDeletion();
        if (restoreLockedFeatures(event.features)) return;
        updateMeasurements();
        pushHistorySnapshot();
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
        const nextIds = event.features
          .filter(isDrawShapeFeature)
          .map((feature) => (feature.id ? String(feature.id) : ""))
          .filter(Boolean);
        selectedZoneIdsRef.current = nextIds;
        setSelectedZoneIds(nextIds);
        onSelectedZonesChangeRef.current?.(workZonesRef.current.filter((zone) => nextIds.includes(zone.id)));
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
    const projectLoadKey = `${activeProjectId ?? "new"}:${resetKey}`;
    if (loadedProjectKeyRef.current === projectLoadKey) return;

    loadedProjectKeyRef.current = projectLoadKey;

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
            createdAt: properties.createdAt ?? new Date().toISOString()
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
    const initialSelectedIds = nextZones[0]?.id ? [nextZones[0].id] : [];
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

    if (mapRef.current) {
      fitMapToFeatures(mapRef.current, featuresToAdd);
    }
    resetHistory(getCurrentSnapshot());

    if (initialAddress) {
      onAddressChangeRef.current(initialAddress);
    }
  // Loading a project should not recreate map history helpers or reset the map instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, resetKey, initialPolygon, initialAddress, mapReady]);

  function setDrawMode(mode: DrawMode) {
    const draw = drawRef.current;
    if (!draw) return;

    circleCenterRef.current = null;
    updateCirclePreview(null);

    if (mode === "draw") {
      if (activeServiceTypeRef.current.geometry === "line") {
        draw.changeMode("draw_line_string");
      } else {
        draw.changeMode("draw_polygon");
      }
    }

    if (mode === "select") {
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
  }

  function deleteBoundary() {
    const draw = drawRef.current;
    if (!draw) return;

    const selectedFeatures = draw.getSelected().features.filter((feature) => !((feature.properties ?? {}) as DrawFeatureProperties).zoneLocked);
    const featuresToDelete = selectedFeatures.length
      ? selectedFeatures
      : draw.getAll().features.filter((feature) => !((feature.properties ?? {}) as DrawFeatureProperties).zoneLocked);
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
    setActiveMode("select");
    setActiveMapPanel(null);
    onToolPanelChange?.(null);

    if (zoomToZone && mapRef.current) {
      fitMapToFeatures(mapRef.current, [zone.feature as DrawShapeFeature]);
    }
  }

  function updateExplorerZoneName(zone: WorkZone, value: string) {
    const draw = drawRef.current;
    if (!draw || zone.locked) return;
    draw.setFeatureProperty(zone.id, "zoneName", value);
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function changeExplorerZoneType(zone: WorkZone, serviceTypeId: string) {
    const draw = drawRef.current;
    if (!draw || zone.locked) return;
    const serviceType = getServiceTypeById(serviceTypeId);
    draw.setFeatureProperty(zone.id, "previousServiceTypeLabel", zone.serviceTypeLabel ?? zoneLabels[zone.type]);
    draw.setFeatureProperty(zone.id, "previousQuoteCategory", zone.quoteCategory ?? zone.serviceTypeLabel ?? zoneLabels[zone.type]);
    draw.setFeatureProperty(zone.id, "serviceTypeChangedAt", new Date().toISOString());

    draw.setFeatureProperty(zone.id, "zoneType", serviceType.zoneType);
    draw.setFeatureProperty(zone.id, "zoneVisible", layerVisibilityRef.current[serviceType.zoneType]);
    draw.setFeatureProperty(zone.id, "serviceTypeId", serviceType.id);
    draw.setFeatureProperty(zone.id, "serviceType", serviceType.id);
    draw.setFeatureProperty(zone.id, "serviceTypeLabel", serviceType.label);
    draw.setFeatureProperty(zone.id, "geometryType", zone.geometryType ?? serviceType.geometry);
    draw.setFeatureProperty(zone.id, "color", serviceType.color);
    draw.setFeatureProperty(zone.id, "unit", serviceType.unit);
    draw.setFeatureProperty(zone.id, "label", serviceType.label);
    draw.setFeatureProperty(zone.id, "quoteCategory", serviceType.quoteCategory);
    draw.setFeatureProperty(zone.id, "defaultRateType", serviceType.defaultRateType);
    draw.setFeatureProperty(zone.id, "visible", layerVisibilityRef.current[serviceType.zoneType]);
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function toggleExplorerZoneVisibility(zone: WorkZone) {
    const draw = drawRef.current;
    if (!draw) return;
    const nextVisible = zone.visible === false;
    draw.setFeatureProperty(zone.id, "zoneVisible", nextVisible);
    draw.setFeatureProperty(zone.id, "visible", nextVisible);
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function deleteExplorerZone(zone: WorkZone) {
    const draw = drawRef.current;
    if (!draw || zone.locked) return;
    const previousSnapshot = getCurrentSnapshot();
    isApplyingHistoryRef.current = true;
    draw.delete(zone.id);
    isApplyingHistoryRef.current = false;
    if (selectedZoneIdsRef.current.includes(zone.id)) {
      clearSelectedZone();
    }
    commitDrawingDeletion([zone], previousSnapshot);
  }

  function resetView() {
    const map = mapRef.current;
    if (!map) return;

    if (fitMapToCurrentZones()) {
      return;
    }

    map.flyTo({
      center: defaultMapView.center,
      zoom: defaultMapView.zoom,
      pitch: 0,
      bearing: 0,
      essential: true
    });
  }

  function changeMapStyle(nextStyle: MapStyle) {
    const map = mapRef.current;
    if (!map || nextStyle === mapStyle) return;

    setMapStyle(nextStyle);
    map.setStyle(mapStyles[nextStyle], {
      localFontFamily: "",
      localIdeographFontFamily: ""
    });
    map.once("style.load", () => {
      ensureMeasurementLayers();
      ensureParcelLayers();
      updateParcelSources(selectedParcelRef.current);
      syncLayerVisibility();
      map.resize();
    });
  }

  function updateSelectedZoneProperty(field: keyof DrawFeatureProperties, value: string) {
    const draw = drawRef.current;
    if (!draw || !selectedZone || selectedZone.locked) return;

    draw.setFeatureProperty(selectedZone.id, field, value);
    if (field === "zoneType" && isZoneType(value)) {
      setActiveZoneType(value);
      draw.setFeatureProperty(selectedZone.id, "zoneVisible", layerVisibilityRef.current[value]);
    }
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function updateSelectedZoneColor(color: string) {
    const draw = drawRef.current;
    if (!draw || !selectedZone || selectedZone.locked) return;
    draw.setFeatureProperty(selectedZone.id, "color", color);
    refreshZonesRef.current();
    pushHistorySnapshot();
  }

  function zoomToSelectedZone() {
    if (!selectedZone || !mapRef.current) return;
    fitMapToFeatures(mapRef.current, [selectedZone.feature as DrawShapeFeature]);
  }

  function applyServiceTypeToSelectedZone(serviceType: ActiveServiceType) {
    const draw = drawRef.current;
    if (!draw || !selectedZone || selectedZone.locked) return false;

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
    setActiveMapPanel((current) => {
      const nextPanel = current === panel ? null : panel;
      onToolPanelChange?.(nextPanel);
      return nextPanel;
    });
  }, [onToolPanelChange]);

  function renameSavedZoneFromPill() {
    if (!savePill) return;
    const zone = workZonesRef.current.find((item) => item.id === savePill.id);
    if (!zone) return;
    selectExplorerZone(zone);
    setSavePill(null);
    window.setTimeout(() => {
      selectedZoneNameInputRef.current?.focus();
      selectedZoneNameInputRef.current?.select();
    }, 0);
  }

  function drawAnotherFromPill() {
    clearSelectedZone();
    setSavePill(null);
    setDrawMode("draw");
  }

  function openDrawingsFromPill() {
    if (!savePill) return;
    clearSelectedZone();
    setExplorerFilter(savePill.type);
    setSavePill(null);
    setMapPanel("explorer");
  }

  function toggleSelectedZoneLock() {
    const draw = drawRef.current;
    if (!draw || !selectedZone) return;

    const nextLocked = !selectedZone.locked;
    draw.setFeatureProperty(selectedZone.id, "zoneLocked", nextLocked);
    if (nextLocked) {
      const feature = draw.get(selectedZone.id);
      if (feature && isDrawShapeFeature(feature)) lockedFeatureRef.current[selectedZone.id] = cloneShapeFeature(feature);
      draw.changeMode("simple_select");
    } else {
      delete lockedFeatureRef.current[selectedZone.id];
    }
    refreshZonesRef.current();
    pushHistorySnapshot();
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
    deleteBoundary();
    clearSelectedZone();
  }

  function duplicateSelectedZone() {
    const draw = drawRef.current;
    if (!draw || !selectedZone) return;

    const source = draw.get(selectedZone.id);
    if (!source || !isDrawShapeFeature(source)) return;

    const duplicate = cloneShapeFeature(source);
    duplicate.id = crypto.randomUUID();
    if (duplicate.geometry.type === "Polygon") {
      duplicate.geometry = {
        ...duplicate.geometry,
        coordinates: offsetPolygonCoordinates(duplicate.geometry.coordinates)
      } as Polygon;
    } else {
      duplicate.geometry = {
        ...duplicate.geometry,
        coordinates: offsetLineCoordinates(duplicate.geometry.coordinates)
      } as LineString;
    }
    duplicate.properties = {
      ...(duplicate.properties ?? {}),
      zoneName: `${selectedZone.name} Copy`,
      zoneLocked: false,
      zoneVisible: layerVisibilityRef.current[selectedZone.type]
    };
    const ids = draw.add(duplicate);
    const duplicateId = Array.isArray(ids) ? ids[0] : duplicate.id;
    refreshZonesRef.current();
    pushHistorySnapshot();
    if (duplicateId) {
      draw.changeMode("simple_select", { featureIds: [String(duplicateId)] });
      const nextIds = [String(duplicateId)];
      selectedZoneIdsRef.current = nextIds;
      setSelectedZoneIds(nextIds);
    }
  }

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
    map?.flyTo({
      center: [search.longitude, search.latitude],
      zoom: 16.4,
      duration: 950,
      essential: true
    });
  }

  function clearTransientDrawing() {
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
                  {explorerFilter
                    ? `${explorerGroupLabels[explorerFilter] ?? zoneLabels[explorerFilter]} drawings`
                    : activeProjectId
                      ? `${workZones.length} saved drawing${workZones.length === 1 ? "" : "s"}`
                      : "Unsaved project"}
                </strong>
              </div>
              <div className="project-explorer-heading-actions">
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

            {explorerGroups.length ? (
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
                        const isRenaming = renamingExplorerZoneId === zone.id;
                        const isChangingType = changingExplorerZoneId === zone.id;
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

                            <div className="project-explorer-status">
                              <span>{zone.visible === false ? "Hidden" : "Visible"}</span>
                              <span>{quotedZoneNames.includes(zone.name) ? "Quoted" : "Not quoted"}</span>
                              <span>{zone.locked ? "Locked" : "Editable"}</span>
                            </div>

                            {isRenaming ? (
                              <label className="project-explorer-inline-field">
                                <span>Drawing name</span>
                                <input
                                  autoFocus
                                  value={zone.name}
                                  disabled={zone.locked}
                                  onChange={(event) => updateExplorerZoneName(zone, event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === "Escape") setRenamingExplorerZoneId(null);
                                  }}
                                />
                              </label>
                            ) : null}

                            {isChangingType ? (
                              <label className="project-explorer-inline-field">
                                <span>Service type</span>
                                <select
                                  autoFocus
                                  value={zone.serviceTypeId ?? getServiceTypeByZoneType(zone.type).id}
                                  disabled={zone.locked}
                                  onChange={(event) => {
                                    changeExplorerZoneType(zone, event.target.value);
                                    setChangingExplorerZoneId(null);
                                  }}
                                >
                                  {serviceTypes.filter((serviceType) => serviceType.id !== "property-boundary").map((serviceType) => (
                                    <option key={serviceType.id} value={serviceType.id}>
                                      {serviceType.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}

                            <div className="project-explorer-actions">
                              <button type="button" onClick={() => selectExplorerZone(zone, true)}>Zoom To</button>
                              <button
                                type="button"
                                disabled={zone.locked}
                                title={zone.locked ? "Select and unlock this drawing before renaming it." : undefined}
                                onClick={() => {
                                  setChangingExplorerZoneId(null);
                                  setRenamingExplorerZoneId((current) => (current === zone.id ? null : zone.id));
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                disabled={zone.locked}
                                title={zone.locked ? "Select and unlock this drawing before changing its service type." : undefined}
                                onClick={() => {
                                  setRenamingExplorerZoneId(null);
                                  setChangingExplorerZoneId((current) => (current === zone.id ? null : zone.id));
                                }}
                              >
                                Change Type
                              </button>
                              <button type="button" onClick={() => toggleExplorerZoneVisibility(zone)}>
                                {zone.visible === false ? "Show" : "Hide"}
                              </button>
                              {activeProjectId ? (
                                <a href={`/quotes?project=${activeProjectId}&measurement=${encodeURIComponent(zone.id)}`}>Add to Quote</a>
                              ) : (
                                <button type="button" disabled title="Save the active project before adding drawings to a quote.">
                                  Add to Quote
                                </button>
                              )}
                              <button
                                className="danger"
                                type="button"
                                disabled={zone.locked}
                                title={zone.locked ? "Select and unlock this drawing before deleting it." : undefined}
                                onClick={() => deleteExplorerZone(zone)}
                              >
                                Delete
                              </button>
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
        <button
          className="map-style-icon-button"
          type="button"
          onClick={() => changeMapStyle(mapStyle === "satellite" ? "street" : "satellite")}
          aria-label={mapStyle === "satellite" ? "Switch to street view" : "Switch to satellite view"}
          title={mapStyle === "satellite" ? "Street view" : "Satellite view"}
        >
          {mapStyle === "satellite" ? (
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
      </div>
      <div className="map-view-controls map-hidden-tools" aria-label="Map view controls">
        <div className="map-style-toggle" role="group" aria-label="Map style">
          <button
            className={mapStyle === "satellite" ? "active" : ""}
            type="button"
            onClick={() => changeMapStyle("satellite")}
          >
            Satellite
          </button>
          <button
            className={mapStyle === "street" ? "active" : ""}
            type="button"
            onClick={() => changeMapStyle("street")}
          >
            Street
          </button>
        </div>
        <button className="map-reset-button" type="button" onClick={resetView}>
          Reset View
        </button>
      </div>
      {savePill ? (
        <div className="shape-save-pill" style={{ "--zone-color": savePill.color } as CSSProperties} role="status">
          <strong>{savePill.message}</strong>
          <div className="shape-save-pill-actions">
            {activeProjectId ? (
              <a href={`/quotes?project=${activeProjectId}&measurement=${encodeURIComponent(savePill.id)}`}>Add to Quote</a>
            ) : (
              <button type="button" disabled title="Save the project before adding this drawing to a quote.">
                Add to Quote
              </button>
            )}
            <button type="button" onClick={renameSavedZoneFromPill}>Rename</button>
            <button type="button" onClick={drawAnotherFromPill}>Draw Another</button>
            <button type="button" onClick={openDrawingsFromPill}>Inspect Drawing</button>
          </div>
        </div>
      ) : null}
      <div className="map-canvas" ref={mapContainerRef} aria-label="Mapbox property map" />
      <div className="parcel-note">Parcel lines require a parcel data provider.</div>
      {selectedZone ? (
        <div className="zone-editor" aria-label="Selected shape inspector">
          <div className="zone-editor-heading">
            <div>
              <span>Selected Shape</span>
              <strong>{selectedZoneQuoted ? "Quoted" : "Not quoted"}</strong>
            </div>
            <button type="button" onClick={clearSelectedZone} aria-label="Close shape inspector">
              Close
            </button>
          </div>
          <div className="zone-inspector-title">
            <i style={{ background: selectedZone.color ?? zoneColors[selectedZone.type] }} />
            <strong>{selectedZone.name}</strong>
            <small>{selectedZone.serviceTypeLabel ?? zoneLabels[selectedZone.type]}</small>
          </div>

          <dl className="zone-inspector-details">
            <div>
              <dt>Area</dt>
              <dd>{formatAcres(selectedZone.acres)} ac</dd>
            </div>
            <div>
              <dt>Square feet</dt>
              <dd>{formatSquareFeet(selectedZone.squareFeet)} sq ft</dd>
            </div>
            <div>
              <dt>{selectedZone.geometryType === "line" || selectedZone.type === "Fence" ? "Length" : "Perimeter"}</dt>
              <dd>{formatFeet(selectedZone.lengthFt ?? selectedZone.perimeterFeet)} ft</dd>
            </div>
            <div>
              <dt>Quote category</dt>
              <dd>{selectedZone.quoteCategory ?? selectedZone.serviceTypeLabel ?? zoneLabels[selectedZone.type]}</dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>{activeProjectId ? activeProjectName || "Active project" : "Unsaved draft"}</dd>
            </div>
            <div>
              <dt>Quote status</dt>
              <dd>{selectedZoneQuoted ? "Quoted" : "Not quoted"}</dd>
            </div>
          </dl>

          <div className="zone-inspector-color-row">
            <span>Color</span>
            <i style={{ background: selectedZone.color ?? zoneColors[selectedZone.type] }} aria-hidden="true" />
            <code>{selectedZone.color ?? zoneColors[selectedZone.type]}</code>
          </div>

          <label>
            Drawing Name
            <input
              ref={selectedZoneNameInputRef}
              value={selectedZone.name}
              disabled={selectedZone.locked}
              onChange={(event) => updateSelectedZoneProperty("zoneName", event.target.value)}
            />
          </label>
          <label>
            Change Service Type
            <select
              value={selectedZone.serviceTypeId ?? getServiceTypeByZoneType(selectedZone.type).id}
              disabled={selectedZone.locked}
              onChange={(event) => handleSelectedZoneServiceTypeChange(event.target.value)}
            >
              {serviceTypes.filter((serviceType) => serviceType.id !== "property-boundary").map((serviceType) => (
                <option key={serviceType.id} value={serviceType.id}>
                  {serviceType.label}
                </option>
              ))}
            </select>
          </label>

          <label className="zone-color-field">
            Change Color
            <span>
              <input
                type="color"
                value={selectedZone.color ?? zoneColors[selectedZone.type]}
                disabled={selectedZone.locked}
                onChange={(event) => updateSelectedZoneColor(event.target.value)}
              />
              <code>{selectedZone.color ?? zoneColors[selectedZone.type]}</code>
            </span>
          </label>

          <div className="zone-editor-primary-actions">
            {activeProjectId ? (
              <>
                <a className="zone-add-quote-link" href={`/quotes?project=${activeProjectId}&measurement=${encodeURIComponent(selectedZone.id)}`}>
                  Add to Quote
                </a>
                <a className="zone-open-quote-link" href={`/quotes?project=${activeProjectId}`}>
                  Open Quote
                </a>
              </>
            ) : (
              <>
                <button type="button" disabled title="Save the project before adding this shape to a quote.">
                  Add to Quote
                </button>
                <button type="button" disabled title="Save the project before opening its quote.">
                  Open Quote
                </button>
              </>
            )}
          </div>

          <div className="zone-editor-actions zone-editor-action-grid">
            <button type="button" onClick={toggleSelectedZoneLock}>
              {selectedZone.locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" onClick={() => void onSaveProject?.()} disabled={!onSaveProject || isSavingProject}>
              {isSavingProject ? "Saving..." : "Save to Project"}
            </button>
            <button type="button" onClick={duplicateSelectedZone}>
              Duplicate
            </button>
            <button type="button" onClick={zoomToSelectedZone}>
              Zoom To
            </button>
            <button type="button" onClick={toggleSelectedZoneVisibility}>
              {selectedZone.visible === false ? "Show" : "Hide"}
            </button>
            <button
              className="danger"
              type="button"
              onClick={deleteSelectedZone}
              disabled={selectedZone.locked}
              title={selectedZone.locked ? "Unlock this drawing before deleting it." : undefined}
            >
              Delete
            </button>
          </div>

          {!activeProjectId ? (
            <small className="zone-inspector-note">Save the project before adding this shape to a quote.</small>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
