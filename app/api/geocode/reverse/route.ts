import { NextResponse } from "next/server";

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

function parseCoordinate(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = parseCoordinate(url.searchParams.get("lat"));
  const longitude = parseCoordinate(url.searchParams.get("lng"));

  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  if (!mapboxToken) {
    return NextResponse.json({ address: null, status: "not_configured" });
  }

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(longitude)},${encodeURIComponent(latitude)}.json?access_token=${encodeURIComponent(mapboxToken)}&country=us&limit=1`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      return NextResponse.json({ address: null, status: "unavailable" });
    }

    const data = (await response.json()) as { features?: Array<{ place_name?: string }> };
    return NextResponse.json({
      address: data.features?.[0]?.place_name ?? null,
      status: data.features?.[0]?.place_name ? "found" : "not_found"
    });
  } catch {
    return NextResponse.json({ address: null, status: "unavailable" });
  }
}
