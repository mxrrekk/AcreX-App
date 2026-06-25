import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/settings/settings-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AcrexUserSettings } from "@/lib/settings/user-settings";
import type { UsageCounts } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

type UserProfile = {
  id: string;
  email: string;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_source?: string | null;
  apple_original_transaction_id?: string | null;
  apple_product_id?: string | null;
  apple_expires_at?: string | null;
  last_entitlement_check_at?: string | null;
  created_at?: string | null;
};

async function safeCount(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  table: string,
  userId: string
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

export default async function SettingsRoute() {
  const supabase = createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: storedSettings }, projectsCount, quotesCount, aiEstimateCount, exportCount, invoiceCount] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    safeCount(supabase, "projects", user.id),
    safeCount(supabase, "quotes", user.id),
    safeCount(supabase, "ai_estimate_snapshots", user.id),
    safeCount(supabase, "exports", user.id),
    safeCount(supabase, "invoices", user.id)
  ]);
  const profileRow = (profile ?? {}) as Partial<UserProfile>;
  const rawSubscriptionSource = profileRow.subscription_source ?? "none";
  const subscriptionSource =
    rawSubscriptionSource === "stripe" || rawSubscriptionSource === "apple" || rawSubscriptionSource === "none"
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
        appleOriginalTransactionId: profileRow.apple_original_transaction_id ?? null,
        appleProductId: profileRow.apple_product_id ?? null,
        appleExpiresAt: profileRow.apple_expires_at ?? null,
        lastEntitlementCheckAt: profileRow.last_entitlement_check_at ?? null,
        createdAt: profileRow.created_at ?? user.created_at ?? null
      }}
      usage={{
        projects: projectsCount,
        quotes: quotesCount,
        aiEstimates: aiEstimateCount,
        exports: exportCount,
        invoices: invoiceCount
      } satisfies UsageCounts}
    />
  );
}
