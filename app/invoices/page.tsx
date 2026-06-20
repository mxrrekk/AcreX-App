import { redirect } from "next/navigation";
import { InvoicesPage } from "@/components/invoices/invoices-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InvoiceRecord, QuoteRecord } from "@/lib/projects/types";

export const dynamic = "force-dynamic";

type InvoicesRouteProps = {
  searchParams?: {
    quote?: string;
  };
};

function normalizeInvoice(row: unknown): InvoiceRecord {
  return row as InvoiceRecord;
}

function normalizeQuote(row: unknown): QuoteRecord {
  return row as QuoteRecord;
}

export default async function InvoicesRoute({ searchParams }: InvoicesRouteProps) {
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

  const [{ data: quotes, error: quotesError }, { data: invoices, error: invoicesError }] = await Promise.all([
    supabase.from("quotes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
  ]);

  return (
    <InvoicesPage
      userId={user.id}
      userEmail={user.email ?? "Contractor"}
      quotes={(quotes ?? []).map(normalizeQuote)}
      invoices={(invoices ?? []).map(normalizeInvoice)}
      initialQuoteId={searchParams?.quote ?? null}
      errorMessage={quotesError?.message ?? invoicesError?.message ?? null}
    />
  );
}
