import { redirect } from "next/navigation";
import { QuotesPage } from "@/components/quotes/quotes-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientRecord, ProjectRecord } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

function normalizeProject(row: unknown): ProjectRecord {
  return row as ProjectRecord;
}

function normalizeClient(row: unknown): ClientRecord {
  return row as ClientRecord;
}

type QuotesRouteProps = {
  searchParams?: {
    project?: string;
    measurement?: string;
  };
};

export default async function QuotesRoute({ searchParams }: QuotesRouteProps) {
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

  const [{ data: projects, error: projectsError }, { data: clients, error: clientsError }] = await Promise.all([
    supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("clients").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
  ]);

  return (
    <QuotesPage
      userId={user.id}
      userEmail={user.email ?? "Contractor"}
      projects={(projects ?? []).map(normalizeProject)}
      clients={(clients ?? []).map(normalizeClient)}
      initialProjectId={searchParams?.project ?? null}
      initialMeasurementId={searchParams?.measurement ?? null}
      errorMessage={projectsError?.message ?? clientsError?.message ?? null}
    />
  );
}
