import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { ProjectMeasurements } from "@/lib/geo/measurements";

export type ParcelBoundaryFeature = Feature<
  Polygon,
  {
    parcelId?: string | null;
    address?: string | null;
    acres?: number | null;
    squareFeet?: number | null;
  }
>;

export type ParcelLookupState = {
  status: "idle" | "loading" | "disabled" | "not_found" | "found" | "error";
  message: string;
  provider?: string | null;
  selectedParcel?: ParcelBoundaryFeature | null;
  surroundingParcels?: FeatureCollection<Polygon> | null;
  measurements?: ProjectMeasurements | null;
};
