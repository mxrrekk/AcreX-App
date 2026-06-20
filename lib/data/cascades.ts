import type { InvoiceRecord, QuoteRecord } from "@/lib/projects/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CascadeResult = {
  ok: boolean;
  message: string;
};

export async function cascadeDeleteProject({
  supabase,
  userId,
  projectId,
  quotes,
  invoices
}: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
}): Promise<CascadeResult> {
  const projectQuotes = quotes.filter((quote) => quote.project_id === projectId);
  const projectInvoices = invoices.filter((invoice) => invoice.project_id === projectId);
  const protectedQuote = projectQuotes.find((quote) => quote.status !== "Draft");
  const protectedInvoice = projectInvoices.find((invoice) => invoice.status !== "Draft");

  if (protectedInvoice) {
    return {
      ok: false,
      message: `Project cannot be deleted while invoice ${protectedInvoice.invoice_number} is ${protectedInvoice.status.toLowerCase()}.`
    };
  }
  if (protectedQuote) {
    return {
      ok: false,
      message: `Project cannot be deleted while quote ${protectedQuote.quote_number} is ${protectedQuote.status.toLowerCase()}.`
    };
  }

  const { error: invoiceError } = await supabase
    .from("invoices")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "Draft");
  if (invoiceError) return { ok: false, message: invoiceError.message };

  const { error: quoteError } = await supabase
    .from("quotes")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "Draft");
  if (quoteError) return { ok: false, message: quoteError.message };

  const { error: projectError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  return projectError
    ? { ok: false, message: projectError.message }
    : { ok: true, message: "Project deleted" };
}

export async function cascadeDeleteQuote({
  supabase,
  userId,
  quote,
  invoices
}: {
  supabase: SupabaseClient;
  userId: string;
  quote: QuoteRecord;
  invoices: InvoiceRecord[];
}): Promise<CascadeResult> {
  if (quote.status !== "Draft") {
    return { ok: false, message: `${quote.status} quotes must be preserved.` };
  }
  const linkedInvoices = invoices.filter((invoice) => invoice.quote_id === quote.id);
  const protectedInvoice = linkedInvoices.find((invoice) => invoice.status !== "Draft");
  if (protectedInvoice) {
    return {
      ok: false,
      message: `Quote cannot be deleted while invoice ${protectedInvoice.invoice_number} is ${protectedInvoice.status.toLowerCase()}.`
    };
  }

  const { error: invoiceError } = await supabase
    .from("invoices")
    .delete()
    .eq("quote_id", quote.id)
    .eq("user_id", userId)
    .eq("status", "Draft");
  if (invoiceError) return { ok: false, message: invoiceError.message };

  const { error } = await supabase.from("quotes").delete().eq("id", quote.id).eq("user_id", userId);
  return error ? { ok: false, message: error.message } : { ok: true, message: "Quote deleted" };
}

export async function deleteDraftInvoice({
  supabase,
  userId,
  invoice
}: {
  supabase: SupabaseClient;
  userId: string;
  invoice: InvoiceRecord;
}): Promise<CascadeResult> {
  if (invoice.status !== "Draft") {
    return { ok: false, message: `${invoice.status} invoices must be preserved.` };
  }
  const { error } = await supabase.from("invoices").delete().eq("id", invoice.id).eq("user_id", userId);
  return error ? { ok: false, message: error.message } : { ok: true, message: "Invoice deleted" };
}
