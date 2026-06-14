export function formatAcres(acres: number | null) {
  if (acres === null || Number.isNaN(acres)) return "0.000";
  return acres < 1 ? acres.toFixed(3) : acres.toFixed(2);
}

export function formatSquareFeet(squareFeet: number | null) {
  if (squareFeet === null || Number.isNaN(squareFeet)) return "0";
  return Math.round(squareFeet).toLocaleString();
}

export function formatFeet(feet: number | null) {
  if (feet === null || Number.isNaN(feet)) return "0";
  return Math.round(feet).toLocaleString();
}
