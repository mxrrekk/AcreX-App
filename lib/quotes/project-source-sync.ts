import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteQuoteLines, insertQuoteLines, readQuoteLines } from "@/lib/data/quote-lines";
import {
  reconcileSourceLinkedLines,
  type MeasurementSource,
  type SourceLinkedLine
} from "@/lib/quotes/source-sync";

type SavedQuotePayload = {
  lineItems?: Array<SourceLinkedLine & { notes?: string }>;
  materials?: Array<{ quantity?: string; unitCost?: string }>;
  costLines?: Array<{ amount?: string }>;
  discount?: number;
  taxPercent?: number;
  totals?: Record<string, number>;
};

type QuoteRow = {
  id: string;
  status: string;
  notes: string | null;
  subtotal: number;
  total: number;
};

type QuoteItemRow = {
  quote_id: string;
  user_id: string;
  service: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  zone_name: string | null;
  zone_type: string | null;
  notes: string | null;
  sort_order: number;
};

type SyncResult = {
  ok: boolean;
  message: string;
  updatedQuoteIds: string[];
};

type QuoteRollback = {
  quote: QuoteRow;
  items: QuoteItemRow[];
};

function numberValue(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateDraftQuote(payload: SavedQuotePayload) {
  const services = (payload.lineItems ?? []).reduce(
    (total, line) => total + numberValue(line.quantity) * numberValue(line.rate),
    0
  );
  const materials = (payload.materials ?? []).reduce(
    (total, item) => total + numberValue(item.quantity) * numberValue(item.unitCost),
    0
  );
  const costs = (payload.costLines ?? []).reduce(
    (total, item) => total + numberValue(item.amount),
    0
  );
  const taxable = Math.max(services + materials + costs - Number(payload.discount ?? 0), 0);
  const total = taxable * (1 + Number(payload.taxPercent ?? 0) / 100);
  return { services, materials, total };
}

function quoteItemsFromLines(
  quoteId: string,
  userId: string,
  lines: Array<SourceLinkedLine & { notes?: string }>
) {
  return lines.map((line, index) => ({
    quote_id: quoteId,
    user_id: userId,
    service: line.serviceName || "Custom",
    description: line.description,
    quantity: numberValue(line.quantity),
    unit: line.unit,
    unit_price: numberValue(line.rate),
    total: numberValue(line.quantity) * numberValue(line.rate),
    zone_name: line.sourceMeasurement,
    zone_type: line.zoneType,
    notes: line.notes ?? "",
    sort_order: index
  }));
}

async function replaceQuoteItems(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  items: Array<Record<string, unknown>>
) {
  const { error: deleteError } = await deleteQuoteLines(supabase, userId, quoteId);
  if (deleteError) return deleteError;
  if (!items.length) return null;
  const { error: insertError } = await insertQuoteLines(supabase, items);
  return insertError;
}

async function rollbackQuotes(
  supabase: SupabaseClient,
  userId: string,
  rollbacks: QuoteRollback[]
) {
  for (const rollback of [...rollbacks].reverse()) {
    await supabase
      .from("quotes")
      .update({
        notes: rollback.quote.notes,
        subtotal: rollback.quote.subtotal,
        total: rollback.quote.total
      })
      .eq("id", rollback.quote.id)
      .eq("user_id", userId);
    await replaceQuoteItems(
      supabase,
      userId,
      rollback.quote.id,
      rollback.items.map((item) => ({
        quote_id: item.quote_id,
        user_id: item.user_id,
        service: item.service,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: item.total,
        zone_name: item.zone_name,
        zone_type: item.zone_type,
        notes: item.notes,
        sort_order: item.sort_order
      }))
    );
    await supabase
      .from("invoices")
      .update({ total: rollback.quote.total })
      .eq("quote_id", rollback.quote.id)
      .eq("user_id", userId)
      .eq("status", "Draft");
  }
}

export async function syncProjectQuotesToSources({
  supabase,
  userId,
  projectId,
  sources
}: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  sources: MeasurementSource[];
}): Promise<SyncResult> {
  const { data: quoteRows, error: quoteReadError } = await supabase
    .from("quotes")
    .select("id, status, notes, subtotal, total")
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (quoteReadError) {
    return { ok: false, message: quoteReadError.message, updatedQuoteIds: [] };
  }

  const rollbacks: QuoteRollback[] = [];
  const updatedQuoteIds: string[] = [];
  for (const row of (quoteRows ?? []) as QuoteRow[]) {
    if (!row.notes) continue;
    let payload: SavedQuotePayload;
    try {
      payload = JSON.parse(row.notes) as SavedQuotePayload;
    } catch {
      continue;
    }

    const currentLines = payload.lineItems ?? [];
    const protectedLines =
      row.status === "Draft"
        ? currentLines
        : currentLines.map((line) => ({ ...line, sourceManuallyEdited: true }));
    const reconciled = reconcileSourceLinkedLines(protectedLines, sources);
    if (!reconciled.changed) continue;

    const { data: previousItems, error: itemReadError } = row.status === "Draft"
      ? await readQuoteLines(supabase, userId, { quoteId: row.id })
      : { data: [], error: null };
    if (itemReadError) {
      await rollbackQuotes(supabase, userId, rollbacks);
      return { ok: false, message: itemReadError.message, updatedQuoteIds: [] };
    }

    const rollback: QuoteRollback = {
      quote: row,
      items: (previousItems ?? []) as QuoteItemRow[]
    };
    payload.lineItems = reconciled.lines;
    const quoteUpdate: Record<string, unknown> = { notes: JSON.stringify(payload) };
    let nextTotal = row.total;
    if (row.status === "Draft") {
      const totals = calculateDraftQuote(payload);
      nextTotal = totals.total;
      quoteUpdate.subtotal = totals.services;
      quoteUpdate.total = totals.total;
      payload.totals = {
        ...(payload.totals ?? {}),
        services: totals.services,
        materials: totals.materials,
        grandTotal: totals.total
      };
      quoteUpdate.notes = JSON.stringify(payload);
    }

    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update(quoteUpdate)
      .eq("id", row.id)
      .eq("user_id", userId);
    if (quoteUpdateError) {
      await rollbackQuotes(supabase, userId, rollbacks);
      return { ok: false, message: quoteUpdateError.message, updatedQuoteIds: [] };
    }
    rollbacks.push(rollback);

    if (row.status === "Draft") {
      const itemError = await replaceQuoteItems(
        supabase,
        userId,
        row.id,
        quoteItemsFromLines(row.id, userId, reconciled.lines)
      );
      if (itemError) {
        await rollbackQuotes(supabase, userId, rollbacks);
        return { ok: false, message: itemError.message, updatedQuoteIds: [] };
      }

      const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({ total: nextTotal })
        .eq("quote_id", row.id)
        .eq("user_id", userId)
        .eq("status", "Draft");
      if (invoiceUpdateError) {
        await rollbackQuotes(supabase, userId, rollbacks);
        return { ok: false, message: invoiceUpdateError.message, updatedQuoteIds: [] };
      }
    }
    updatedQuoteIds.push(row.id);
  }

  return { ok: true, message: "Linked quote sources synchronized.", updatedQuoteIds };
}
