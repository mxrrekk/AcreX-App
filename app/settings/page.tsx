import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/settings/settings-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();
  const profileRow = (profile ?? {}) as Partial<UserProfile>;
  const rawSubscriptionSource = profileRow.subscription_source ?? "free";
  const subscriptionSource =
    rawSubscriptionSource === "stripe" || rawSubscriptionSource === "apple_future" || rawSubscriptionSource === "free"
      ? rawSubscriptionSource
      : "manual";

  return (
    <SettingsPage
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
