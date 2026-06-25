import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://getacrex.com/app";

const config: CapacitorConfig = {
  appId: "com.getacrex.app",
  appName: "AcreX Edge",
  webDir: "capacitor-web",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
        allowNavigation: ["getacrex.com", "www.getacrex.com"]
      }
    : undefined,
  ios: {
    scheme: "AcreX"
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#000000",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
