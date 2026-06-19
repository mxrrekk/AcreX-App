import type { CapacitorConfig } from "@capacitor/cli";

const configuredServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const serverUrl =
  configuredServerUrl || (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3001");

const config: CapacitorConfig = {
  appId: "com.getacrex.app",
  appName: "AcreX",
  webDir: "capacitor-web",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://")
      }
    : undefined,
  ios: {
    scheme: "AcreX"
  }
};

export default config;
