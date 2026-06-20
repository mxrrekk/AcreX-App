import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectActivity } from "@/lib/data/activity";
import { auditProjectIntegrity, type IntegrityIssue } from "@/lib/data/integrity";
import { readQuoteLines } from "@/lib/data/quote-lines";
import {
  getProjectDrawings,
  projectDrawingsFromMapData,
  type AttachmentRecord,
  type DrawingWrite
} from "@/lib/data/storage";
import type {
  ClientRecord,
  InvoiceRecord,
  ProjectRecord,
  QuoteItemRecord,
  QuoteRecord
} from "@/lib/projects/types";

export const ACREX_BACKUP_FORMAT = "acrex-project-backup";
export const ACREX_BACKUP_VERSION = 1;

export type AcrexProjectBackup = {
  format: typeof ACREX_BACKUP_FORMAT;
  version: typeof ACREX_BACKUP_VERSION;
  exportedAt: string;
  restore: {
    strategy: "create-new-project";
    originalProjectId: string;
    relationshipsUseOriginalIds: boolean;
  };
  project: ProjectRecord;
  client: ClientRecord | null;
  drawings: DrawingWrite[];
  measurements: Array<Record<string, unknown>>;
  quotes: QuoteRecord[];
  quoteLineItems: QuoteItemRecord[];
  invoices: InvoiceRecord[];
  invoiceLineItems: Array<Record<string, unknown>>;
  files: AttachmentRecord[];
  exports: Array<Record<string, unknown>>;
  settingsSnapshot: Record<string, unknown> | null;
  aiEstimateSnapshots: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  integrity: IntegrityIssue[];
};

function missingTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

async function optionalRows(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  projectId?: string
) {
  let query = supabase.from(table).select("*").eq("user_id", userId);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error && missingTable(error)) return [];
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function createProjectBackup(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<AcrexProjectBackup> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  if (projectError || !project) throw new Error(projectError?.message ?? "Project was not found.");
  const projectRecord = project as ProjectRecord;

  const [
    clientResult,
    drawingResult,
    quoteResult,
    invoiceResult,
    measurements,
    invoiceLineItems,
    files,
    exports,
    settingsRows,
    aiEstimateSnapshots,
    activityResult
  ] = await Promise.all([
    projectRecord.client_id
      ? supabase.from("clients").select("*").eq("id", projectRecord.client_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getProjectDrawings(supabase, userId, projectId),
    supabase.from("quotes").select("*").eq("project_id", projectId).eq("user_id", userId),
    supabase.from("invoices").select("*").eq("project_id", projectId).eq("user_id", userId),
    optionalRows(supabase, "measurements", userId, projectId),
    optionalRows(supabase, "invoice_line_items", userId, projectId),
    optionalRows(supabase, "attachments", userId, projectId),
    optionalRows(supabase, "exports", userId, projectId),
    optionalRows(supabase, "user_settings", userId),
    optionalRows(supabase, "ai_estimate_snapshots", userId, projectId),
    getProjectActivity(supabase, userId, projectId)
  ]);

  if (quoteResult.error) throw new Error(quoteResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  const quotes = (quoteResult.data ?? []) as QuoteRecord[];
  const quoteLinesResult = await readQuoteLines(supabase, userId, { quoteIds: quotes.map((quote) => quote.id) });
  if (quoteLinesResult.error) throw new Error(quoteLinesResult.error.message);

  const drawings = drawingResult.error
    ? projectDrawingsFromMapData(projectRecord.polygon_geojson, userId, projectId)
    : drawingResult.data ?? [];
  const quoteLineItems = (quoteLinesResult.data ?? []) as QuoteItemRecord[];
  const invoices = (invoiceResult.data ?? []) as InvoiceRecord[];
  const settingsSnapshot = settingsRows[0] ?? null;

  return {
    format: ACREX_BACKUP_FORMAT,
    version: ACREX_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    restore: {
      strategy: "create-new-project",
      originalProjectId: projectId,
      relationshipsUseOriginalIds: true
    },
    project: projectRecord,
    client: (clientResult.data as ClientRecord | null) ?? null,
    drawings,
    measurements,
    quotes,
    quoteLineItems,
    invoices,
    invoiceLineItems,
    files: files as AttachmentRecord[],
    exports,
    settingsSnapshot,
    aiEstimateSnapshots,
    activity: activityResult.data,
    integrity: auditProjectIntegrity({
      project: projectRecord,
      drawings,
      quotes,
      quoteLines: quoteLineItems,
      invoices,
      pricingDefaults: (settingsSnapshot?.pricing_defaults as Record<string, unknown> | undefined) ?? null
    })
  };
}

export function validateProjectBackup(value: unknown): value is AcrexProjectBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<AcrexProjectBackup>;
  return backup.format === ACREX_BACKUP_FORMAT &&
    backup.version === ACREX_BACKUP_VERSION &&
    Boolean(backup.project?.id) &&
    Array.isArray(backup.drawings) &&
    Array.isArray(backup.quotes) &&
    Array.isArray(backup.invoices) &&
    Array.isArray(backup.files);
}
