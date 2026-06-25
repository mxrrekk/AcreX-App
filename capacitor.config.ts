import type { CapacitorConfig } from "@capacitor/cli";

const configuredServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const nativeEntryPath = process.env.CAPACITOR_NATIVE_ENTRY_PATH?.trim() || "/app";
const serverUrlWithNativeEntry = configuredServerUrl
  ? new URL(nativeEntryPath, configuredServerUrl.endsWith("/") ? configuredServerUrl : `${configuredServerUrl}/`).toString()
  : undefined;
const serverUrl =
  serverUrlWithNativeEntry || (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3001/app");

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
