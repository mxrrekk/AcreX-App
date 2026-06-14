import { createBrowserClient } from "@supabase/ssr";
import { hasSupabaseConfig, supabaseAnonKey, supabaseUrl } from "./config";

export function createSupabaseBrowserClient() {
  if (!hasSupabaseConfig) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
