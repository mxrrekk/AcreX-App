import { notFound, redirect } from "next/navigation";
import { ProjectDetailPage } from "@/components/projects/project-detail-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientRecord, InvoiceRecord, ProjectRecord, QuoteRecord } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

export default async function ProjectDetailRoute({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: project },
    { data: clients },
    { data: quotes },
    { data: invoices }
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", params.id).eq("user_id", user.id).single(),
    supabase.from("clients").select("*").eq("user_id", user.id),
    supabase.from("quotes").select("*").eq("project_id", params.id).eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("project_id", params.id).eq("user_id", user.id).order("updated_at", { ascending: false })
  ]);

  if (!project) notFound();

  return (
    <ProjectDetailPage
      project={project as ProjectRecord}
      client={(clients ?? []).find((client) => client.id === project.client_id) as ClientRecord | undefined}
      quotes={(quotes ?? []) as QuoteRecord[]}
      invoices={(invoices ?? []) as InvoiceRecord[]}
      userEmail={user.email ?? "Contractor"}
    />
  );
}
