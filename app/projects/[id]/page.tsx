import { notFound, redirect } from "next/navigation";
import { ProjectDetailPage } from "@/components/projects/project-detail-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withResolvedProjectLocation } from "@/lib/projects/project-location";
import { auditProjectIntegrity } from "@/lib/data/integrity";
import { readQuoteLines } from "@/lib/data/quote-lines";
import { getProjectDrawings, projectDrawingsFromMapData } from "@/lib/data/storage";
import type { ClientRecord, InvoiceRecord, ProjectRecord, QuoteItemRecord, QuoteRecord } from "@/lib/projects/types";

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
  const projectRecord = withResolvedProjectLocation(project as ProjectRecord);
  const quoteRecords = (quotes ?? []) as QuoteRecord[];
  const [drawingResult, quoteLineResult, settingsResult] = await Promise.all([
    getProjectDrawings(supabase, user.id, params.id),
    readQuoteLines(supabase, user.id, { quoteIds: quoteRecords.map((quote) => quote.id) }),
    supabase.from("user_settings").select("pricing_defaults").eq("user_id", user.id).maybeSingle()
  ]);
  const drawings = drawingResult.error
    ? projectDrawingsFromMapData(projectRecord.polygon_geojson, user.id, projectRecord.id)
    : drawingResult.data ?? [];
  const integrityIssues = auditProjectIntegrity({
    project: projectRecord,
    drawings,
    quotes: quoteRecords,
    quoteLines: (quoteLineResult.data ?? []) as QuoteItemRecord[],
    invoices: (invoices ?? []) as InvoiceRecord[],
    pricingDefaults: (settingsResult.data?.pricing_defaults as Record<string, unknown> | undefined) ?? null
  });

  return (
    <ProjectDetailPage
      project={projectRecord}
      client={(clients ?? []).find((client) => client.id === project.client_id) as ClientRecord | undefined}
      quotes={quoteRecords}
      invoices={(invoices ?? []) as InvoiceRecord[]}
      integrityIssues={integrityIssues}
      userEmail={user.email ?? "Contractor"}
    />
  );
}
