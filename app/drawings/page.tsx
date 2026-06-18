import { redirect } from "next/navigation";
import { DrawingsPage } from "@/components/drawings/drawings-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withResolvedProjectLocation } from "@/lib/projects/project-location";
import type { ProjectRecord } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

export default async function DrawingsRoute() {
  const supabase = createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <DrawingsPage
      userId={user.id}
      userEmail={user.email ?? "Contractor"}
      projects={((data ?? []) as ProjectRecord[]).map(withResolvedProjectLocation)}
      errorMessage={error?.message ?? null}
    />
  );
}
