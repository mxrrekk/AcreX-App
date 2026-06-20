import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/settings/settings-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AcrexUserSettings } from "@/lib/settings/user-settings";

export const dynamic = "force-dynamic";

type UserProfile = {
  id: string;
  email: string;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_source?: string | null;
  created_at?: string | null;
};

export default async function SettingsRoute() {
  const supabase = createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: storedSettings }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle()
  ]);
  const profileRow = (profile ?? {}) as Partial<UserProfile>;
  const rawSubscriptionSource = profileRow.subscription_source ?? "free";
  const subscriptionSource =
    rawSubscriptionSource === "stripe" || rawSubscriptionSource === "apple_future" || rawSubscriptionSource === "free"
      ? rawSubscriptionSource
      : "manual";

  return (
    <SettingsPage
      storedSettings={storedSettings ? {
        company: storedSettings.company_profile,
        quoteDefaults: storedSettings.quote_defaults,
        pricing: storedSettings.pricing_defaults,
        drawing: storedSettings.drawing_defaults,
        map: storedSettings.map_defaults,
        updatedAt: storedSettings.updated_at
      } as Partial<AcrexUserSettings> : null}
      account={{
        id: user.id,
        name:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "",
        email: user.email ?? profileRow.email ?? "",
        plan: profileRow.plan ?? "free",
        subscriptionStatus: profileRow.subscription_status ?? "inactive",
        subscriptionSource,
        createdAt: profileRow.created_at ?? user.created_at ?? null
      }}
    />
  );
}
