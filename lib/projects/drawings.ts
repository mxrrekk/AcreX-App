import type { ProjectRecord, SavedZoneProperties, ZoneType } from "@/lib/projects/types";

export type ProjectDrawing = {
  id: string;
  projectId: string;
  projectName: string;
  address: string;
  name: string;
  zoneType: ZoneType | string;
  serviceType: string;
  quoteCategory: string;
  color: string;
  quantity: number;
  unit: "acres" | "sq ft" | "linear feet";
  billable: boolean;
  createdAt: string | null;
};

const fallbackColors: Record<string, string> = {
  Property: "#7fd957",
  Grass: "#4fca5a",
  Brush: "#f97316",
  Woods: "#1f7a3d",
  Fence: "#8b5cf6",
  Driveway: "#9aa4ad",
  HousePad: "#b88352",
  Building: "#60a5fa",
  Excluded: "#ef4444",
  Custom: "#64b5ff"
};

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function quoteCategoryFor(properties: SavedZoneProperties) {
  if (properties.zoneType === "Brush") return "Forestry Mulching / Brush Clearing";
  if (properties.zoneType === "Grass") return "Mowing";
  if (properties.zoneType === "Woods") return "Land Clearing";
  if (properties.zoneType === "Fence") return "Fence Installation";
  if (properties.zoneType === "Driveway") return "Gravel Driveway";
  if (properties.zoneType === "HousePad") return "House Pad Prep";
  if (properties.zoneType === "Excluded") return "Non-billable";
  if (properties.quoteCategory) return String(properties.quoteCategory);
  return properties.serviceTypeLabel ?? "Custom";
}

export function getProjectDrawings(project: ProjectRecord): ProjectDrawing[] {
  const mapData = project.polygon_geojson;
  if (!mapData) return [];
  const features = mapData.type === "FeatureCollection" ? mapData.features : [mapData];

  return features.map((feature, index) => {
    const properties = feature.properties ?? {};
    const zoneType = properties.zoneType ?? "Custom";
    const isLine =
      feature.geometry.type === "LineString" ||
      properties.geometryType === "line" ||
      properties.shapeType === "line" ||
      zoneType === "Fence";
    const isSquareFeet =
      !isLine &&
      (properties.unit === "sq ft" || zoneType === "Driveway" || zoneType === "HousePad" || zoneType === "Building");
    const quantity = isLine
      ? numberValue(properties.lengthFt ?? properties.perimeterFeet)
      : isSquareFeet
        ? numberValue(properties.areaSqFt ?? properties.squareFeet)
        : numberValue(properties.areaAcres ?? properties.acres);
    const quoteCategory = quoteCategoryFor(properties);

    return {
      id: String(feature.id ?? properties.createdAt ?? `${project.id}-${index}`),
      projectId: project.id,
      projectName: project.project_name,
      address: project.address ?? "",
      name: properties.zoneName ?? properties.label ?? `${String(zoneType).replace("HousePad", "House Pad")} ${index + 1}`,
      zoneType,
      serviceType: properties.serviceTypeLabel ?? quoteCategory,
      quoteCategory,
      color: properties.color ?? fallbackColors[String(zoneType)] ?? fallbackColors.Custom,
      quantity,
      unit: isLine ? "linear feet" : isSquareFeet ? "sq ft" : "acres",
      billable: zoneType !== "Excluded" && quoteCategory !== "Non-billable",
      createdAt: properties.createdAt ?? null
    };
  });
}

export function formatDrawingQuantity(drawing: ProjectDrawing) {
  if (drawing.unit === "acres") return `${drawing.quantity.toFixed(drawing.quantity < 1 ? 3 : 2)} acres`;
  return `${Math.round(drawing.quantity).toLocaleString()} ${drawing.unit}`;
}
