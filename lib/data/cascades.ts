import type { InvoiceRecord, QuoteRecord } from "@/lib/projects/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CascadeResult = {
  ok: boolean;
  message: string;
};

function isMissingOptionalRelation(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table") ||
    normalized.includes("relation") && normalized.includes("not found")
  );
}

async function deleteProjectScopedRows(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  projectId: string
): Promise<CascadeResult> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (!error || isMissingOptionalRelation(error.message)) return { ok: true, message: "Deleted" };
  return { ok: false, message: error.message };
}

export async function cascadeDeleteProject({
  supabase,
  userId,
  projectId
}: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
}): Promise<CascadeResult> {
  const [
    { data: quoteRows, error: quoteReadError },
    { data: invoiceRows, error: invoiceReadError },
    { data: attachmentRows, error: attachmentReadError }
  ] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, project_id, quote_number, status")
        .eq("project_id", projectId)
        .eq("user_id", userId),
      supabase
        .from("invoices")
        .select("id, project_id, invoice_number, status")
        .eq("project_id", projectId)
        .eq("user_id", userId),
      supabase
        .from("attachments")
        .select("storage_path")
        .eq("project_id", projectId)
        .eq("user_id", userId)
    ]);
  if (quoteReadError || invoiceReadError) {
    return {
      ok: false,
      message: quoteReadError?.message ?? invoiceReadError?.message ?? "Related records could not be verified."
    };
  }
  const dependentDeletes = [
    "invoice_line_items",
    "quote_line_items",
    "attachments",
    "exports",
    "ai_estimate_snapshots",
    "measurements",
    "project_activity",
    "drawings"
  ];
  for (const table of dependentDeletes) {
    const result = await deleteProjectScopedRows(supabase, table, userId, projectId);
    if (!result.ok) return result;
  }

  const { error: invoiceError } = await supabase.from("invoices").delete().eq("project_id", projectId).eq("user_id", userId);
  if (invoiceError) return { ok: false, message: invoiceError.message };

  const { error: quoteError } = await supabase.from("quotes").delete().eq("project_id", projectId).eq("user_id", userId);
  if (quoteError) return { ok: false, message: quoteError.message };

  const { error: projectError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (projectError) return { ok: false, message: projectError.message };

  const storagePaths = attachmentReadError
    ? []
    : (attachmentRows ?? []).map((attachment) => attachment.storage_path).filter(Boolean);
  const storageApi = (supabase as SupabaseClient & {
    storage?: { from: (bucket: string) => { remove: (paths: string[]) => Promise<{ error: { message: string } | null }> } };
  }).storage;
  if (storageApi && storagePaths.length > 0) {
    const { error: storageError } = await storageApi.from("acrex-files").remove(storagePaths);
    if (storageError) {
      return {
        ok: true,
        message: "Project deleted. One or more stored files need cleanup."
      };
    }
  }
  return { ok: true, message: "Project deleted" };
}

export async function cascadeDeleteQuote({
  supabase,
  userId,
  quote
}: {
  supabase: SupabaseClient;
  userId: string;
  quote: QuoteRecord;
}): Promise<CascadeResult> {
  const [{ data: currentQuote, error: quoteReadError }, { data: invoiceRows, error: invoiceReadError }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, status")
        .eq("id", quote.id)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("invoices")
        .select("id, quote_id, invoice_number, status")
        .eq("quote_id", quote.id)
        .eq("user_id", userId)
    ]);
  if (quoteReadError || invoiceReadError || !currentQuote) {
    return {
      ok: false,
      message: quoteReadError?.message ?? invoiceReadError?.message ?? "Quote could not be verified."
    };
  }
  if (currentQuote.status !== "Draft") {
    return { ok: false, message: `${currentQuote.status} quotes must be preserved.` };
  }
  const linkedInvoices = (invoiceRows ?? []) as Pick<InvoiceRecord, "id" | "quote_id" | "invoice_number" | "status">[];
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
  const { data: currentInvoice, error: readError } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", invoice.id)
    .eq("user_id", userId)
    .single();
  if (readError || !currentInvoice) {
    return { ok: false, message: readError?.message ?? "Invoice could not be verified." };
  }
  if (currentInvoice.status !== "Draft") {
    return { ok: false, message: `${currentInvoice.status} invoices must be preserved.` };
  }
  const { error } = await supabase.from("invoices").delete().eq("id", invoice.id).eq("user_id", userId);
  return error ? { ok: false, message: error.message } : { ok: true, message: "Invoice deleted" };
}
