import { redirect } from "next/navigation";
import { ProjectsPage } from "@/components/projects/projects-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientRecord, ProjectRecord } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

function normalizeProject(row: unknown): ProjectRecord {
  return row as ProjectRecord;
}

function normalizeClient(row: unknown): ClientRecord {
  return row as ClientRecord;
}

export default async function ProjectsRoute() {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    redirect("/login?setup=supabase");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data, error }, { data: clients, error: clientsError }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("clients").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
  ]);

  return (
    <ProjectsPage
      userId={user.id}
      userEmail={user.email ?? "Contractor"}
      projects={(data ?? []).map(normalizeProject)}
      clients={(clients ?? []).map(normalizeClient)}
      errorMessage={error?.message ?? clientsError?.message ?? null}
    />
  );
}
