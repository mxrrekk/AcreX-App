import { redirect } from "next/navigation";
import { InvoicesPage } from "@/components/invoices/invoices-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readQuoteLines } from "@/lib/data/quote-lines";
import { defaultUserSettings, normalizeUserSettings, type AcrexUserSettings } from "@/lib/settings/user-settings";
import type { ClientRecord, InvoiceRecord, QuoteItemRecord, QuoteRecord } from "@/lib/projects/types";

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

function normalizeQuoteLine(row: unknown): QuoteItemRecord {
  return row as QuoteItemRecord;
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

  const [
    { data: quotes, error: quotesError },
    { data: invoices, error: invoicesError },
    { data: quoteLines, error: quoteLinesError },
    { data: invoiceLines },
    { data: clients },
    { data: storedSettings }
  ] = await Promise.all([
    supabase.from("quotes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    readQuoteLines(supabase, user.id),
    supabase.from("invoice_line_items").select("*").eq("user_id", user.id).order("sort_order", { ascending: true }),
    supabase.from("clients").select("*").eq("user_id", user.id),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle()
  ]);
  const settings = storedSettings
    ? normalizeUserSettings({
        company: storedSettings.company_profile,
        quoteDefaults: storedSettings.quote_defaults,
        pricing: storedSettings.pricing_defaults,
        drawing: storedSettings.drawing_defaults,
        map: storedSettings.map_defaults,
        updatedAt: storedSettings.updated_at
      } as Partial<AcrexUserSettings>)
    : defaultUserSettings;

  return (
    <InvoicesPage
      userId={user.id}
      userEmail={user.email ?? "Contractor"}
      quotes={(quotes ?? []).map(normalizeQuote)}
      quoteLines={(quoteLines ?? []).map(normalizeQuoteLine)}
      invoiceLines={(invoiceLines ?? []) as Array<Record<string, unknown>>}
      clients={(clients ?? []) as ClientRecord[]}
      settings={settings}
      invoices={(invoices ?? []).map(normalizeInvoice)}
      initialQuoteId={searchParams?.quote ?? null}
      errorMessage={quotesError?.message ?? invoicesError?.message ?? quoteLinesError?.message ?? null}
    />
  );
}
