import type { Metadata, Viewport } from "next";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import "./globals.css";
import "./space-management.css";

export const metadata: Metadata = {
  title: "Acrex | Property Quoting Workspace",
  description:
    "Acrex is a property quoting workspace for outdoor contractors. Enter an address, mark work areas, calculate measurements, and generate professional quotes faster.",
  icons: {
    icon: "/assets/acrex-logo.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050908"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
