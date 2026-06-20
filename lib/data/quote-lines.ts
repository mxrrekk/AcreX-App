import type { SupabaseClient } from "@supabase/supabase-js";

export const QUOTE_LINE_ITEMS_TABLE = "quote_line_items";
export const LEGACY_QUOTE_ITEMS_TABLE = "quote_items";

function missingRelation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "PGRST205" || Boolean(error?.message?.includes("quote_line_items"));
}

export async function readQuoteLines(
  supabase: SupabaseClient,
  userId: string,
  options: { quoteId?: string; quoteIds?: string[] } = {}
) {
  async function read(table: string) {
    let query = supabase.from(table).select("*").eq("user_id", userId);
    if (options.quoteId) query = query.eq("quote_id", options.quoteId);
    if (options.quoteIds?.length) query = query.in("quote_id", options.quoteIds);
    return query;
  }

  const primary = await read(QUOTE_LINE_ITEMS_TABLE);
  if (!primary.error || !missingRelation(primary.error)) return primary;
  return read(LEGACY_QUOTE_ITEMS_TABLE);
}

export async function deleteQuoteLines(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string
) {
  const primary = await supabase
    .from(QUOTE_LINE_ITEMS_TABLE)
    .delete()
    .eq("quote_id", quoteId)
    .eq("user_id", userId);
  if (!primary.error || !missingRelation(primary.error)) return primary;
  return supabase
    .from(LEGACY_QUOTE_ITEMS_TABLE)
    .delete()
    .eq("quote_id", quoteId)
    .eq("user_id", userId);
}

export async function insertQuoteLines(
  supabase: SupabaseClient,
  lines: Array<Record<string, unknown>>
) {
  if (lines.length === 0) return { data: [], error: null };
  const primary = await supabase.from(QUOTE_LINE_ITEMS_TABLE).insert(lines);
  if (!primary.error || !missingRelation(primary.error)) return primary;
  const legacyLines = lines.map(({ project_id, drawing_id, source_snapshot, ...line }) => line);
  return supabase.from(LEGACY_QUOTE_ITEMS_TABLE).insert(legacyLines);
}
