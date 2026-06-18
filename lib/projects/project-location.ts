import type { ProjectRecord, SavedProjectMapData, SavedZoneProperties } from "@/lib/projects/types";

function cleanAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const address = value.trim();
  return address && address !== "No address selected" ? address : "";
}

function coordinateAddress(properties: SavedZoneProperties | undefined) {
  if (!Number.isFinite(properties?.latitude) || !Number.isFinite(properties?.longitude)) return "";
  return `Lat: ${properties?.latitude?.toFixed(6)}, Lng: ${properties?.longitude?.toFixed(6)}`;
}

function getDrawingAddress(mapData: SavedProjectMapData | null) {
  if (!mapData) return "";

  if (mapData.type === "FeatureCollection") {
    const features = [...mapData.features].sort((left, right) =>
      (right.properties?.createdAt ?? "").localeCompare(left.properties?.createdAt ?? "")
    );
    for (const feature of features) {
      const address = cleanAddress(feature.properties?.address) || coordinateAddress(feature.properties);
      if (address) return address;
    }
    return cleanAddress(mapData.properties?.address);
  }

  return cleanAddress(mapData.properties?.address) || coordinateAddress(mapData.properties);
}

export function getProjectLocationAddress(project: ProjectRecord) {
  return getDrawingAddress(project.polygon_geojson) || cleanAddress(project.address);
}

export function withResolvedProjectLocation(project: ProjectRecord): ProjectRecord {
  const address = getProjectLocationAddress(project);
  const mapData = project.polygon_geojson;
  const savedManualTitleState =
    mapData?.type === "FeatureCollection" ? mapData.properties?.titleManuallyEdited : undefined;
  const currentName = project.project_name?.trim() || "Untitled Project";
  const oldAddress = cleanAddress(project.address);
  const customerName = project.customer_name?.trim() ?? "";
  const oldAutoTitle = oldAddress
    ? customerName
      ? `${customerName} - ${oldAddress}`
      : `${oldAddress} Estimate`
    : "Untitled Project";
  const titleIsAutomatic =
    savedManualTitleState === false ||
    (savedManualTitleState !== true && (currentName === "Untitled Project" || currentName === oldAutoTitle));
  const resolvedName =
    titleIsAutomatic && address
      ? customerName
        ? `${customerName} - ${address}`
        : `${address.replace(/^Lat:\s*/i, "Lat ")} Estimate`
      : currentName;

  if (address === project.address && resolvedName === project.project_name) return project;
  return {
    ...project,
    address: address || project.address,
    project_name: resolvedName
  };
}
