import { area, length, lineString, polygon } from "@turf/turf";

export type ProjectMeasurements = {
  acres: number;
  squareFeet: number;
  perimeterFeet: number;
};

const squareFeetPerSquareMeter = 10.76391041671;
const squareFeetPerAcre = 43560;
const feetPerKilometer = 3280.839895;

function isSamePosition(a: number[], b: number[]) {
  return a[0] === b[0] && a[1] === b[1];
}

function isValidPosition(position: number[]) {
  return position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]);
}

function closeRing(ring: number[][]) {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return isSamePosition(first, last) ? ring : [...ring, first];
}

function normalizePolygonCoordinates(coordinates: number[][][]) {
  const rings = coordinates
    .map((ring) => closeRing(ring.filter(isValidPosition)))
    .filter((ring) => ring.length >= 4);

  return rings.length ? rings : null;
}

export function calculatePolygonMeasurements(coordinates: number[][][]): ProjectMeasurements {
  const normalizedCoordinates = normalizePolygonCoordinates(coordinates);
  if (!normalizedCoordinates) {
    return {
      acres: 0,
      squareFeet: 0,
      perimeterFeet: 0
    };
  }

  const turfPolygon = polygon(normalizedCoordinates);
  const squareMeters = area(turfPolygon);
  const squareFeet = squareMeters * squareFeetPerSquareMeter;
  const outerRing = normalizedCoordinates[0] ?? [];
  const perimeterKilometers = outerRing.length > 1 ? length(lineString(outerRing), { units: "kilometers" }) : 0;

  return {
    acres: squareFeet / squareFeetPerAcre,
    squareFeet,
    perimeterFeet: perimeterKilometers * feetPerKilometer
  };
}
