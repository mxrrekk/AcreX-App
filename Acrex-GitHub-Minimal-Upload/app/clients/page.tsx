import { redirect } from "next/navigation";
import { ClientsPage } from "@/components/clients/clients-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientRecord, InvoiceRecord, ProjectRecord, QuoteRecord } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

function normalizeClient(row: unknown): ClientRecord {
  return row as ClientRecord;
}

function normalizeProject(row: unknown): ProjectRecord {
  return row as ProjectRecord;
}

function normalizeQuote(row: unknown): QuoteRecord {
  return row as QuoteRecord;
}

function normalizeInvoice(row: unknown): InvoiceRecord {
  return row as InvoiceRecord;
}

export default async function ClientsRoute() {
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

  const [
    { data: clients, error: clientsError },
    { data: projects, error: projectsError },
    { data: quotes, error: quotesError },
    { data: invoices, error: invoicesError }
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("quotes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
  ]);

  return (
    <ClientsPage
      userId={user.id}
      userEmail={user.email ?? "Contractor"}
      clients={(clients ?? []).map(normalizeClient)}
      projects={(projects ?? []).map(normalizeProject)}
      quotes={(quotes ?? []).map(normalizeQuote)}
      invoices={(invoices ?? []).map(normalizeInvoice)}
      errorMessage={clientsError?.message ?? projectsError?.message ?? quotesError?.message ?? invoicesError?.message ?? null}
    />
  );
}
