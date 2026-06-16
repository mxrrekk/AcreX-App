"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  onSelectedZonesChange?: (zones: WorkZone[]) => void;
  onAddressDetailsChange?: (details: AddressDetails | null) => void;
  onParcelLookupChange?: (lookup: ParcelLookupState) => void;
  activeProjectId?: string | null;
  resetKey?: number;
  initialPolygon?: SavedProjectMapData | null;
  initialAddress?: string | null;
  searchMountId?: string;
  useParcelRequestKey?: number;
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
  serviceTypeLabel?: string;
  geometryType?: "polygon" | "line" | "circle";
  color?: string;
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
const zoneColorExpression = [
  "match",
  ["get", "zoneType"],
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
  zoneColors.Custom
];
const featureColorExpression = ["coalesce", ["get", "color"], zoneColorExpression];
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
  return {
    name: serviceType.zoneType === "Custom" ? `Custom Zone ${index}` : `${serviceType.shortLabel} ${index}`,
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

function getFeatureCoordinates(feature: DrawShapeFeature): [number, number][] {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates.flat().map(([lng, lat]) => [lng, lat] as [number, number]);
  }
  return feature.geometry.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]);
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
  onSelectedZonesChange,
  onAddressDetailsChange,
  onParcelLookupChange,
  activeProjectId,
  resetKey = 0,
  initialPolygon,
  initialAddress,
  searchMountId,
  useParcelRequestKey = 0
}: AcrexMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
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
  const refreshZonesRef = useRef<() => void>(() => undefined);
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
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [, setLinearMeasurement] = useState<LinearMeasurement | null>(null);
  const [, setCircleMeasurement] = useState<CircleMeasurement | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [savePill, setSavePill] = useState<{ id: string; message: string; color: string } | null>(null);
  const selectedZoneIdsRef = useRef<string[]>([]);

  useEffect(() => {
    onMeasurementsChangeRef.current = onMeasurementsChange;
    onAddressChangeRef.current = onAddressChange;
    onPolygonChangeRef.current = onPolygonChange;
    onZonesChangeRef.current = onZonesChange;
    onSelectedZonesChangeRef.current = onSelectedZonesChange;
    onAddressDetailsChangeRef.current = onAddressDetailsChange;
    onParcelLookupChangeRef.current = onParcelLookupChange;
  }, [onMeasurementsChange, onAddressChange, onPolygonChange, onZonesChange, onSelectedZonesChange, onAddressDetailsChange, onParcelLookupChange]);

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

  function applySnapshot(snapshot: DrawSnapshot) {
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
    refreshZonesRef.current();
  }

  function undoDrawChange() {
    if (historyRef.current.length <= 1) return;
    const current = historyRef.current[historyRef.current.length - 1];
    const previous = historyRef.current[historyRef.current.length - 2];
    redoRef.current = [current, ...redoRef.current].slice(0, 60);
    historyRef.current = historyRef.current.slice(0, -1);
    applySnapshot(previous);
    setHistoryState();
  }

  function redoDrawChange() {
    const next = redoRef.current[0];
    if (!next) return;
    redoRef.current = redoRef.current.slice(1);
    historyRef.current = [...historyRef.current, next].slice(-60);
    applySnapshot(next);
    setHistoryState();
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
        const existingCount = draw.getAll().features.filter(isDrawShapeFeature).length;
        const serviceType = activeServiceTypeRef.current;
        features.filter(isDrawShapeFeature).forEach((feature, featureIndex) => {
          if (!feature.id) return;
          const properties = (feature.properties ?? {}) as DrawFeatureProperties;
          const defaults = getServiceDefaults(serviceType, existingCount + featureIndex);
          const zoneType = isZoneType(properties.zoneType) ? properties.zoneType : defaults.type;
          const effectiveService = properties.serviceTypeId ? getServiceTypeById(properties.serviceTypeId) : serviceType;
          const geometryType = isLineFeature(feature) ? "line" : properties.shapeType === "circle" ? "circle" : effectiveService.geometry;
          const visible = layerVisibilityRef.current[zoneType];
          draw.setFeatureProperty(String(feature.id), "zoneType", zoneType);
          draw.setFeatureProperty(String(feature.id), "zoneName", properties.zoneName ?? defaults.name);
          draw.setFeatureProperty(String(feature.id), "zoneNotes", properties.zoneNotes ?? defaults.notes);
          draw.setFeatureProperty(String(feature.id), "zoneLocked", properties.zoneLocked ?? false);
          draw.setFeatureProperty(String(feature.id), "zoneVisible", visible);
          draw.setFeatureProperty(String(feature.id), "shapeType", geometryType);
          draw.setFeatureProperty(String(feature.id), "serviceTypeId", effectiveService.id);
          draw.setFeatureProperty(String(feature.id), "serviceTypeLabel", effectiveService.label);
          draw.setFeatureProperty(String(feature.id), "geometryType", geometryType);
          draw.setFeatureProperty(String(feature.id), "color", effectiveService.color);
          draw.setFeatureProperty(String(feature.id), "label", properties.label ?? defaults.name);
          draw.setFeatureProperty(String(feature.id), "quoteCategory", effectiveService.quoteCategory);
          draw.setFeatureProperty(String(feature.id), "defaultRateType", effectiveService.defaultRateType);
          draw.setFeatureProperty(String(feature.id), "visible", visible);
          draw.setFeatureProperty(String(feature.id), "createdAt", properties.createdAt ?? new Date().toISOString());
        });
      };

      const updateMeasurements = () => {
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
          return;
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
            serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
            geometryType,
            color: properties.color ?? serviceType.color,
            areaAcres: zoneMeasurements.acres,
            areaSqFt: zoneMeasurements.squareFeet,
            lengthFt,
            label: properties.label ?? zoneName,
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
                serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
                geometryType,
                color: properties.color ?? serviceType.color,
                areaAcres: zoneMeasurements.acres,
                areaSqFt: zoneMeasurements.squareFeet,
                lengthFt,
                label: properties.label ?? zoneName,
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
      };

      refreshZonesRef.current = updateMeasurements;

      const handleDrawCreate = (event: { features: GeoJSON.Feature[] }) => {
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
            message: `${createdZone.name} saved • ${formatShapeMeasurement(createdZone)}`,
            color: createdZone.color ?? zoneColors[createdZone.type]
          });
          window.setTimeout(() => {
            setSavePill((current) => (current?.id === createdZone.id ? null : current));
          }, 5200);
        }
        setActiveMode("select");
      };

      const handleDrawUpdate = (event: { features: GeoJSON.Feature[] }) => {
        if (restoreLockedFeatures(event.features)) return;
        updateMeasurements();
        pushHistorySnapshot();
      };

      const handleDrawDelete = () => {
        if (isApplyingHistoryRef.current) return;
        updateMeasurements();
        pushHistorySnapshot();
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
              serviceTypeLabel: serviceType.label,
              geometryType: "circle",
              color: serviceType.color,
              label: `${serviceType.shortLabel} Circle`,
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
            color: serviceType.color
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
        refreshZonesRef.current = () => undefined;
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
        serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
        geometryType,
        color: properties.color ?? serviceType.color,
        areaAcres: zoneMeasurements.acres,
        areaSqFt: zoneMeasurements.squareFeet,
        lengthFt,
        label: properties.label ?? zoneName,
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
            serviceTypeLabel: properties.serviceTypeLabel ?? serviceType.label,
            geometryType,
            color: properties.color ?? serviceType.color,
            areaAcres: zoneMeasurements.acres,
            areaSqFt: zoneMeasurements.squareFeet,
            lengthFt,
            label: properties.label ?? zoneName,
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
    if (selectedFeatures.length) {
      draw.trash();
    } else {
      const unlocked = draw.getAll().features.filter((feature) => !((feature.properties ?? {}) as DrawFeatureProperties).zoneLocked);
      unlocked.forEach((feature) => {
        if (feature.id) draw.delete(String(feature.id));
      });
    }

    setActiveMode("select");
    refreshZonesRef.current();
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

  function applyServiceTypeToSelectedZone(serviceType: ActiveServiceType) {
    const draw = drawRef.current;
    if (!draw || !selectedZone || selectedZone.locked) return false;

    draw.setFeatureProperty(selectedZone.id, "zoneType", serviceType.zoneType);
    draw.setFeatureProperty(selectedZone.id, "zoneVisible", layerVisibilityRef.current[serviceType.zoneType]);
    draw.setFeatureProperty(selectedZone.id, "serviceTypeId", serviceType.id);
    draw.setFeatureProperty(selectedZone.id, "serviceTypeLabel", serviceType.label);
    draw.setFeatureProperty(selectedZone.id, "geometryType", selectedZone.geometryType ?? serviceType.geometry);
    draw.setFeatureProperty(selectedZone.id, "color", serviceType.color);
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
    const map = mapRef.current;
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
    setActiveServiceType(serviceType);
    activeServiceTypeRef.current = serviceType;
    setActiveZoneType(serviceType.zoneType);
    const map = mapRef.current;
    if (map?.getLayer("acrex-circle-preview-fill")) {
      map.setPaintProperty("acrex-circle-preview-fill", "fill-color", serviceType.color);
      map.setPaintProperty("acrex-circle-preview-line", "line-color", serviceType.color);
    }
    if (!applyServiceTypeToSelectedZone(serviceType)) {
      setDrawMode("draw");
    }
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
        serviceTypeLabel: serviceType.label,
        geometryType: serviceType.geometry,
        color: serviceType.color,
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
      {!searchMountId ? <div className="map-search-bar" ref={searchContainerRef} /> : null}
      <div className="draw-toolbar" aria-label="Drawing toolbar">
        <div className="service-type-card-list" aria-label="Service type">
          <span>Measure</span>
          {serviceTypes.map((serviceType) => (
            <button
              className={activeServiceType.id === serviceType.id ? "active service-type-card" : "service-type-card"}
              key={serviceType.id}
              type="button"
              onClick={() => handleServiceTypeSelect(serviceType)}
            >
              <i style={{ background: serviceType.color }} />
              <strong>{serviceType.label}</strong>
              <small>{serviceType.geometry === "line" ? "Line" : "Polygon"} · {serviceType.unit}</small>
            </button>
          ))}
        </div>
        <button className={activeMode === "select" ? "active" : ""} type="button" onClick={() => setDrawMode("select")}>
          Select
        </button>
        <button className={activeMode === "draw" ? "active" : ""} type="button" onClick={() => setDrawMode("draw")}>
          Draw
        </button>
        <button className={activeMode === "circle" ? "active" : ""} type="button" onClick={() => setDrawMode("circle")}>
          Circle
        </button>
        <button className={activeMode === "edit" ? "active" : ""} type="button" onClick={() => setDrawMode("edit")}>
          Edit
        </button>
        <button type="button" onClick={deleteBoundary} disabled={!hasPolygon}>
          Delete
        </button>
        <button className={activeMode === "measure" ? "active" : ""} type="button" onClick={() => setDrawMode("measure")}>
          Measure
        </button>
        <div className="draw-toolbar-split" aria-hidden="true" />
        <button type="button" onClick={undoDrawChange} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={redoDrawChange} disabled={!canRedo}>
          Redo
        </button>
      </div>
      <div className="map-layer-chips" aria-label="Layer visibility">
        <button className={parcelLinesVisible ? "active" : ""} type="button" onClick={toggleParcelLines}>
          <i style={{ background: zoneColors.Property }} />
          Parcel
        </button>
        {serviceTypes.map((serviceType) => (
          <button
            className={layerVisibility[serviceType.zoneType] ? "active" : ""}
            key={serviceType.id}
            type="button"
            onClick={() => toggleLayer(serviceType.zoneType)}
          >
            <i style={{ background: serviceType.color }} />
            {serviceType.shortLabel}
          </button>
        ))}
      </div>
      <div className="map-view-controls" aria-label="Map view controls">
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
      {recentSearches.length ? (
        <div className="recent-searches-panel" aria-label="Recent searches">
          <span>Recent Searches</span>
          {recentSearches.slice(0, 4).map((search) => (
            <button key={search.id} type="button" onClick={() => openRecentSearch(search)}>
              {search.address}
            </button>
          ))}
        </div>
      ) : null}
      {savePill ? (
        <div className="shape-save-pill" style={{ "--zone-color": savePill.color } as CSSProperties}>
          <strong>{savePill.message}</strong>
          <button type="button" onClick={() => setDrawMode("draw")}>Draw Another</button>
          <button type="button" onClick={undoDrawChange}>Undo</button>
        </div>
      ) : null}
      {workZones.length ? (
        <div className="map-measurement-pills" aria-label="Map measurement labels">
          {workZones.filter((zone) => zone.visible !== false).slice(-4).map((zone) => (
            <span key={zone.id} style={{ "--zone-color": zone.color ?? zoneColors[zone.type] } as CSSProperties}>
              {zone.name} • {formatShapeMeasurement(zone)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="map-canvas" ref={mapContainerRef} aria-label="Mapbox property map" />
      <div className="parcel-note">Parcel lines require a parcel data provider.</div>
      <div className="zone-editor" aria-label="Selected zone details">
        <div className="zone-editor-heading">
          <span>{selectedZones.length > 1 ? "Selected Zones" : "Selected Zone"}</span>
          <strong style={selectedZone ? { color: selectedZone.color ?? zoneColors[selectedZone.type] } : undefined}>
            {selectedZones.length > 1 ? `${selectedZones.length} zones` : selectedZone ? selectedZone.serviceTypeLabel ?? zoneLabels[selectedZone.type] : activeServiceType.label}
          </strong>
        </div>
        {selectedZone ? (
          <div className="zone-editor-actions">
            <button type="button" onClick={toggleSelectedZoneLock}>
              {selectedZone.locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" onClick={duplicateSelectedZone}>
              Duplicate
            </button>
          </div>
        ) : null}
        <label>
          Type
          <select
            value={selectedZone?.type ?? activeZoneType}
            disabled={!selectedZone || selectedZone.locked}
            onChange={(event) => handleActiveZoneTypeChange(event.target.value as ZoneType)}
          >
            {zoneTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            value={selectedZone?.name ?? ""}
            placeholder="Select or draw a zone"
            disabled={!selectedZone || selectedZone.locked}
            onChange={(event) => updateSelectedZoneProperty("zoneName", event.target.value)}
          />
        </label>
        <label>
          Notes
          <textarea
            value={selectedZone?.notes ?? ""}
            placeholder="Access, obstacles, slope, gate notes..."
            disabled={!selectedZone || selectedZone.locked}
            onChange={(event) => updateSelectedZoneProperty("zoneNotes", event.target.value)}
          />
        </label>
        <div className="zone-editor-measurements">
          <span>{selectedZone ? formatShapeMeasurement(selectedZone) : "--"}</span>
          <span>{selectedZone ? `${formatSquareFeet(selectedZone.squareFeet)} sq ft` : "-- sq ft"}</span>
          <span>{selectedZone ? `${formatFeet(selectedZone.lengthFt ?? selectedZone.perimeterFeet)} linear ft` : "-- linear ft"}</span>
        </div>
      </div>
    </>
  );
}
