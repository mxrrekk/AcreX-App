import { NextResponse } from "next/server";

const parcelProvider = process.env.PARCEL_PROVIDER ?? "regrid";
const regridApiKey = process.env.REGRID_API_KEY ?? "";
const reportAllApiKey = process.env.REPORTALL_API_KEY ?? "";

function getParcelConfig() {
  if (parcelProvider === "reportall") {
    return { provider: "reportall", apiKey: reportAllApiKey };
  }

  return { provider: "regrid", apiKey: regridApiKey };
}

function parseCoordinate(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = parseCoordinate(url.searchParams.get("lat"));
  const longitude = parseCoordinate(url.searchParams.get("lng"));
  const config = getParcelConfig();

  if (latitude === null || longitude === null) {
    return NextResponse.json({ status: "error", message: "Latitude and longitude are required." }, { status: 400 });
  }

  if (!config.apiKey) {
    return NextResponse.json({
      status: "disabled",
      provider: config.provider,
      message: "Parcel boundaries require a parcel data provider API key. Draw manually for now."
    });
  }

  return NextResponse.json(
    {
      status: "not_configured",
      provider: config.provider,
      message: "Parcel provider credentials are present, but the provider adapter has not been connected yet. Draw manually for now.",
      coordinates: { latitude, longitude }
    },
    { status: 501 }
  );
}
