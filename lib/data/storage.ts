import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InvoiceRecord,
  ProjectRecord,
  QuoteRecord,
  SavedProjectMapData,
  SavedZoneProperties
} from "@/lib/projects/types";
import { deleteQuoteLines, insertQuoteLines, readQuoteLines } from "@/lib/data/quote-lines";
import { recordProjectActivity } from "@/lib/data/activity";

export const ACREX_FILES_BUCKET = "acrex-files";

type DataResult<T> = {
  data: T | null;
  error: string | null;
};

type ProjectWrite = Partial<ProjectRecord> & Pick<ProjectRecord, "user_id">;

export type DrawingWrite = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  service_type?: string | null;
  zone_type?: string | null;
  geometry_type: string;
  geometry_geojson: Feature<Polygon | LineString, SavedZoneProperties>;
  color?: string | null;
  unit?: string | null;
  quantity?: number | null;
  area_acres?: number | null;
  area_square_feet?: number | null;
  length_feet?: number | null;
  perimeter_feet?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  centroid?: SavedZoneProperties["centroid"] | null;
  parcel_id?: string | null;
  location_source?: string | null;
  visible?: boolean;
  locked?: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type QuoteLineWrite = {
  id?: string;
  service: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unit_price?: number | null;
  total: number;
  drawing_id?: string | null;
  zone_name?: string | null;
  zone_type?: string | null;
  notes?: string | null;
  source_snapshot?: Record<string, unknown> | null;
  sort_order?: number;
};

export type InvoiceLineWrite = {
  id?: string;
  quote_line_item_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  notes?: string | null;
  sort_order?: number;
};

export type AttachmentRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  export_id: string | null;
  file_type: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  is_public: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExportRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  export_type: string;
  status: string;
  file_name: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  is_public: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExportRecordInput = {
  userId: string;
  exportType: string;
  fileName: string;
  projectId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  isPublic?: boolean;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type FileUploadInput = {
  userId: string;
  file: File | Blob;
  fileName: string;
  fileType: string;
  projectId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  exportId?: string | null;
  isPublic?: boolean;
  metadata?: Record<string, unknown>;
};

export async function getProjects(
  supabase: SupabaseClient,
  userId: string
): Promise<DataResult<ProjectRecord[]>> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return error ? resultError(error.message) : { data: (data ?? []) as ProjectRecord[], error: null };
}

export async function getProjectDrawings(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<DataResult<DrawingWrite[]>> {
  const { data, error } = await supabase
    .from("drawings")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: true });
  return error ? resultError(error.message) : { data: (data ?? []) as DrawingWrite[], error: null };
}

export async function getProjectQuotes(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<DataResult<QuoteRecord[]>> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  return error ? resultError(error.message) : { data: (data ?? []) as QuoteRecord[], error: null };
}

export async function getProjectInvoices(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<DataResult<InvoiceRecord[]>> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  return error ? resultError(error.message) : { data: (data ?? []) as InvoiceRecord[], error: null };
}

export async function getUserSettings(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return error ? resultError(error.message) : { data, error: null };
}

function resultError<T>(message: string): DataResult<T> {
  return { data: null, error: message };
}

function missingFoundationTable(error: { code?: string; message?: string } | null | undefined, table: string) {
  return error?.code === "PGRST205" || Boolean(
    error?.message?.includes(table) &&
    (error.message.includes("schema cache") || error.message.includes("Could not find the table"))
  );
}

function missingFoundationTableMessage(message: string, table: string) {
  return message.includes(table) &&
    (message.includes("schema cache") || message.includes("Could not find the table"));
}

function mapDataFeatures(mapData: SavedProjectMapData | null | undefined) {
  if (!mapData) return [];
  if (mapData.type === "FeatureCollection") return mapData.features;
  return [mapData];
}

function drawingQuantity(properties: SavedZoneProperties) {
  const zoneType = properties.zoneType;
  if (zoneType === "Fence") return properties.lengthFt ?? properties.perimeterFeet ?? 0;
  if (zoneType === "Driveway" && properties.geometryType === "line") {
    return properties.lengthFt ?? properties.perimeterFeet ?? 0;
  }
  return properties.areaAcres ?? properties.acres ?? properties.areaSqFt ?? properties.squareFeet ?? 0;
}

export function projectDrawingsFromMapData(
  mapData: SavedProjectMapData | null | undefined,
  userId: string,
  projectId: string
): DrawingWrite[] {
  return mapDataFeatures(mapData).map((feature, index) => {
    const properties = feature.properties ?? {};
    const id = String(feature.id ?? properties.createdAt ?? `${projectId}-drawing-${index + 1}`);
    return {
      id,
      user_id: userId,
      project_id: projectId,
      name: properties.label ?? properties.zoneName ?? `Drawing ${index + 1}`,
      service_type: properties.serviceTypeLabel ?? properties.serviceType ?? null,
      zone_type: properties.zoneType ?? null,
      geometry_type: properties.geometryType ?? properties.shapeType ?? feature.geometry.type.toLowerCase(),
      geometry_geojson: feature,
      color: properties.color ?? null,
      unit: properties.unit ?? null,
      quantity: drawingQuantity(properties),
      area_acres: properties.areaAcres ?? properties.acres ?? null,
      area_square_feet: properties.areaSqFt ?? properties.squareFeet ?? null,
      length_feet: properties.lengthFt ?? null,
      perimeter_feet: properties.perimeterFeet ?? null,
      address: properties.address ?? null,
      latitude: properties.latitude ?? properties.centroid?.latitude ?? null,
      longitude: properties.longitude ?? properties.centroid?.longitude ?? null,
      centroid: properties.centroid ?? null,
      parcel_id: properties.parcelId ?? null,
      location_source: properties.locationSource ?? null,
      visible: properties.visible ?? properties.zoneVisible ?? true,
      locked: properties.zoneLocked ?? false,
      notes: properties.zoneNotes ?? null,
      metadata: {
        quoteCategory: properties.quoteCategory ?? null,
        defaultRateType: properties.defaultRateType ?? null,
        serviceTypeId: properties.serviceTypeId ?? null
      }
    };
  });
}

export async function saveDrawing(
  supabase: SupabaseClient,
  drawing: DrawingWrite
): Promise<DataResult<DrawingWrite>> {
  const { data, error } = await supabase
    .from("drawings")
    .upsert(drawing, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return resultError(error.message);
  const { error: measurementError } = await supabase.from("measurements").upsert(
    {
      user_id: drawing.user_id,
      project_id: drawing.project_id,
      drawing_id: drawing.id,
      quantity: drawing.quantity ?? 0,
      unit: drawing.unit ?? "each",
      area_acres: drawing.area_acres ?? null,
      area_square_feet: drawing.area_square_feet ?? null,
      length_feet: drawing.length_feet ?? null,
      perimeter_feet: drawing.perimeter_feet ?? null,
      metadata: drawing.metadata ?? {}
    },
    { onConflict: "drawing_id" }
  );
  return measurementError
    ? resultError(measurementError.message)
    : await (async () => {
        await recordProjectActivity(supabase, {
          userId: drawing.user_id,
          projectId: drawing.project_id,
          eventType: "drawing_updated",
          entityType: "drawing",
          entityId: drawing.id,
          description: `${drawing.name} saved.`
        });
        return { data: data as DrawingWrite, error: null };
      })();
}

export async function syncProjectDrawings(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  mapData: SavedProjectMapData | null | undefined
): Promise<DataResult<DrawingWrite[]>> {
  const drawings = projectDrawingsFromMapData(mapData, userId, projectId);
  const ids = drawings.map((drawing) => drawing.id);

  const { data: existingRows, error: readError } = await supabase
    .from("drawings")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId);
  if (readError) return resultError(readError.message);
  const obsoleteIds = (existingRows ?? [])
    .map((row) => String(row.id))
    .filter((id) => !ids.includes(id));
  if (obsoleteIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("drawings")
      .delete()
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .in("id", obsoleteIds);
    if (deleteError) return resultError(deleteError.message);
  }

  if (drawings.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from("drawings")
    .upsert(drawings, { onConflict: "id" })
    .select("*");
  if (error) return resultError(error.message);

  const { error: measurementError } = await supabase.from("measurements").upsert(
    drawings.map((drawing) => ({
      user_id: drawing.user_id,
      project_id: drawing.project_id,
      drawing_id: drawing.id,
      quantity: drawing.quantity ?? 0,
      unit: drawing.unit ?? "each",
      area_acres: drawing.area_acres ?? null,
      area_square_feet: drawing.area_square_feet ?? null,
      length_feet: drawing.length_feet ?? null,
      perimeter_feet: drawing.perimeter_feet ?? null,
      metadata: drawing.metadata ?? {}
    })),
    { onConflict: "drawing_id" }
  );
  return measurementError
    ? resultError(measurementError.message)
    : { data: (data ?? []) as DrawingWrite[], error: null };
}

export async function saveProject(
  supabase: SupabaseClient,
  project: ProjectWrite
): Promise<DataResult<ProjectRecord>> {
  const payload = { ...project };
  const query = payload.id
    ? supabase.from("projects").update(payload).eq("id", payload.id).eq("user_id", payload.user_id)
    : supabase.from("projects").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error || !data) return resultError(error?.message ?? "Project could not be saved.");

  const savedProject = data as ProjectRecord;
  const drawingsResult = await syncProjectDrawings(
    supabase,
    savedProject.user_id,
    savedProject.id,
    savedProject.polygon_geojson
  );
  if (drawingsResult.error && !missingFoundationTableMessage(drawingsResult.error, "drawings")) {
    return resultError(drawingsResult.error);
  }
  await recordProjectActivity(supabase, {
    userId: savedProject.user_id,
    projectId: savedProject.id,
    eventType: payload.id ? "project_updated" : "project_created",
    entityType: "project",
    entityId: savedProject.id,
    description: payload.id ? "Project updated." : "Project created."
  });
  return { data: savedProject, error: null };
}

export async function saveQuote(
  supabase: SupabaseClient,
  quote: Partial<QuoteRecord> & Pick<QuoteRecord, "user_id" | "quote_number">,
  lines: QuoteLineWrite[]
): Promise<DataResult<QuoteRecord>> {
  const { data: previousQuote, error: previousQuoteError } = quote.id
    ? await supabase
        .from("quotes")
        .select("*")
        .eq("id", quote.id)
        .eq("user_id", quote.user_id)
        .maybeSingle()
    : { data: null, error: null };
  if (previousQuoteError) return resultError(previousQuoteError.message);
  const { data: previousLines, error: previousLinesError } = quote.id
    ? await readQuoteLines(supabase, quote.user_id, { quoteId: quote.id })
    : { data: [], error: null };
  if (previousLinesError) return resultError(previousLinesError.message);

  async function restorePreviousQuote(quoteId: string) {
    if (!previousQuote) {
      await supabase.from("quotes").delete().eq("id", quoteId).eq("user_id", quote.user_id);
      return;
    }
    await supabase
      .from("quotes")
      .update({
        project_id: previousQuote.project_id,
        client_id: previousQuote.client_id,
        quote_number: previousQuote.quote_number,
        status: previousQuote.status,
        project_name: previousQuote.project_name,
        client_name: previousQuote.client_name,
        address: previousQuote.address,
        subtotal: previousQuote.subtotal,
        total: previousQuote.total,
        notes: previousQuote.notes
      })
      .eq("id", previousQuote.id)
      .eq("user_id", quote.user_id);
  }

  async function restorePreviousLines(quoteId: string) {
    await deleteQuoteLines(supabase, quote.user_id, quoteId);
    if (!previousLines?.length) return;
    await insertQuoteLines(
      supabase,
      previousLines.map((item) => ({
        quote_id: item.quote_id,
        user_id: item.user_id,
        project_id: (item as QuoteLineWrite & { project_id?: string | null }).project_id,
        drawing_id: (item as QuoteLineWrite & { drawing_id?: string | null }).drawing_id,
        service: item.service,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: item.total,
        zone_name: item.zone_name,
        zone_type: item.zone_type,
        notes: item.notes,
        source_snapshot: (item as QuoteLineWrite & { source_snapshot?: Record<string, unknown> | null }).source_snapshot,
        sort_order: item.sort_order
      }))
    );
  }

  const query = quote.id
    ? supabase.from("quotes").update(quote).eq("id", quote.id).eq("user_id", quote.user_id)
    : supabase.from("quotes").insert(quote);
  const { data, error } = await query.select("*").single();
  if (error || !data) return resultError(error?.message ?? "Quote could not be saved.");
  const savedQuote = data as QuoteRecord;

  const { error: deleteError } = await deleteQuoteLines(supabase, savedQuote.user_id, savedQuote.id);
  if (deleteError) {
    await restorePreviousQuote(savedQuote.id);
    return resultError(deleteError.message);
  }

  if (lines.length > 0) {
    const { error: lineError } = await insertQuoteLines(
      supabase,
      lines.map((line, index) => ({
        ...line,
        quote_id: savedQuote.id,
        project_id: savedQuote.project_id,
        user_id: savedQuote.user_id,
        sort_order: line.sort_order ?? index
      }))
    );
    if (lineError) {
      await restorePreviousLines(savedQuote.id);
      await restorePreviousQuote(savedQuote.id);
      return resultError(lineError.message);
    }
  }
  if (savedQuote.project_id) {
    await recordProjectActivity(supabase, {
      userId: savedQuote.user_id,
      projectId: savedQuote.project_id,
      eventType: quote.id ? "quote_edited" : "quote_created",
      entityType: "quote",
      entityId: savedQuote.id,
      description: `Quote ${savedQuote.quote_number} ${quote.id ? "updated" : "created"}.`
    });
  }
  return { data: savedQuote, error: null };
}

export async function saveInvoice(
  supabase: SupabaseClient,
  invoice: Partial<InvoiceRecord> & Pick<InvoiceRecord, "user_id" | "quote_id" | "invoice_number">,
  lines: InvoiceLineWrite[]
): Promise<DataResult<InvoiceRecord>> {
  const { data: previousInvoice, error: previousInvoiceError } = invoice.id
    ? await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoice.id)
        .eq("user_id", invoice.user_id)
        .maybeSingle()
    : { data: null, error: null };
  if (previousInvoiceError) return resultError(previousInvoiceError.message);

  const { data: previousLines, error: previousLinesError } = invoice.id
    ? await supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", invoice.id)
        .eq("user_id", invoice.user_id)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (previousLinesError && !missingFoundationTable(previousLinesError, "invoice_line_items")) {
    return resultError(previousLinesError.message);
  }

  async function restorePreviousInvoice(invoiceId: string) {
    if (!previousInvoice) {
      await supabase.from("invoices").delete().eq("id", invoiceId).eq("user_id", invoice.user_id);
      return;
    }
    await supabase
      .from("invoices")
      .update({
        quote_id: previousInvoice.quote_id,
        project_id: previousInvoice.project_id,
        client_id: previousInvoice.client_id,
        invoice_number: previousInvoice.invoice_number,
        status: previousInvoice.status,
        project_name: previousInvoice.project_name,
        client_name: previousInvoice.client_name,
        address: previousInvoice.address,
        subtotal: previousInvoice.subtotal,
        total: previousInvoice.total,
        due_date: previousInvoice.due_date,
        notes: previousInvoice.notes
      })
      .eq("id", previousInvoice.id)
      .eq("user_id", invoice.user_id);
  }

  async function restorePreviousInvoiceLines(invoiceId: string) {
    await supabase
      .from("invoice_line_items")
      .delete()
      .eq("invoice_id", invoiceId)
      .eq("user_id", invoice.user_id);
    if (!previousLines?.length) return;
    await supabase.from("invoice_line_items").insert(
      previousLines.map((line) => ({
        invoice_id: line.invoice_id,
        quote_line_item_id: line.quote_line_item_id,
        project_id: line.project_id,
        user_id: line.user_id,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        total: line.total,
        notes: line.notes,
        sort_order: line.sort_order
      }))
    );
  }

  const query = invoice.id
    ? supabase.from("invoices").update(invoice).eq("id", invoice.id).eq("user_id", invoice.user_id)
    : supabase.from("invoices").insert(invoice);
  const { data, error } = await query.select("*").single();
  if (error || !data) return resultError(error?.message ?? "Invoice could not be saved.");
  const savedInvoice = data as InvoiceRecord;

  const { error: deleteError } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", savedInvoice.id)
    .eq("user_id", savedInvoice.user_id);
  if (deleteError) {
    if (missingFoundationTable(deleteError, "invoice_line_items")) {
      return { data: savedInvoice, error: null };
    }
    await restorePreviousInvoice(savedInvoice.id);
    return resultError(deleteError.message);
  }

  if (lines.length > 0) {
    const { error: lineError } = await supabase.from("invoice_line_items").insert(
      lines.map((line, index) => ({
        ...line,
        invoice_id: savedInvoice.id,
        project_id: savedInvoice.project_id,
        user_id: savedInvoice.user_id,
        sort_order: line.sort_order ?? index
      }))
    );
    if (lineError) {
      await restorePreviousInvoiceLines(savedInvoice.id);
      await restorePreviousInvoice(savedInvoice.id);
      return resultError(lineError.message);
    }
  }
  if (savedInvoice.project_id) {
    await recordProjectActivity(supabase, {
      userId: savedInvoice.user_id,
      projectId: savedInvoice.project_id,
      eventType: "invoice_created",
      entityType: "invoice",
      entityId: savedInvoice.id,
      description: `Invoice ${savedInvoice.invoice_number} created.`
    });
  }
  return { data: savedInvoice, error: null };
}

export async function createExportRecord(
  supabase: SupabaseClient,
  input: ExportRecordInput
): Promise<DataResult<ExportRecord>> {
  const { data, error } = await supabase
    .from("exports")
    .insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      quote_id: input.quoteId ?? null,
      invoice_id: input.invoiceId ?? null,
      export_type: input.exportType,
      status: input.status ?? "ready",
      file_name: input.fileName,
      storage_path: input.storagePath ?? null,
      mime_type: input.mimeType ?? null,
      file_size: input.fileSize ?? null,
      is_public: input.isPublic ?? false,
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();
  if (error || !data) return resultError(error?.message ?? "Export record could not be created.");
  if (input.projectId) {
    await recordProjectActivity(supabase, {
      userId: input.userId,
      projectId: input.projectId,
      eventType: "export_generated",
      entityType: "export",
      entityId: data.id,
      description: `${input.fileName} generated.`,
      metadata: { exportType: input.exportType }
    });
  }
  return { data: data as ExportRecord, error: null };
}

function safeFileName(fileName: string) {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-") || "file";
}

function buildStoragePath(input: FileUploadInput) {
  const parent = input.projectId
    ? `projects/${input.projectId}`
    : input.quoteId
      ? `quotes/${input.quoteId}`
      : input.invoiceId
        ? `invoices/${input.invoiceId}`
        : `exports/${input.exportId ?? "general"}`;
  return `${input.userId}/${parent}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
}

export async function uploadProjectFile(
  supabase: SupabaseClient,
  input: FileUploadInput & { projectId: string }
): Promise<DataResult<AttachmentRecord>> {
  const storagePath = buildStoragePath(input);
  const { error: uploadError } = await supabase.storage
    .from(ACREX_FILES_BUCKET)
    .upload(storagePath, input.file, { contentType: input.file.type || undefined, upsert: false });
  if (uploadError) return resultError(uploadError.message);

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      quote_id: input.quoteId ?? null,
      invoice_id: input.invoiceId ?? null,
      export_id: input.exportId ?? null,
      file_type: input.fileType,
      file_name: input.fileName,
      storage_path: storagePath,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      is_public: input.isPublic ?? false,
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();
  if (!error && data) {
    await recordProjectActivity(supabase, {
      userId: input.userId,
      projectId: input.projectId,
      eventType: "file_uploaded",
      entityType: "attachment",
      entityId: data.id,
      description: `${input.fileName} uploaded.`,
      metadata: { fileType: input.fileType }
    });
    return { data: data as AttachmentRecord, error: null };
  }

  await supabase.storage.from(ACREX_FILES_BUCKET).remove([storagePath]);
  return resultError(error?.message ?? "File metadata could not be saved.");
}

async function uploadExportPdf(
  supabase: SupabaseClient,
  input: FileUploadInput & { exportType: "quote_pdf" | "invoice_pdf" }
): Promise<DataResult<AttachmentRecord>> {
  const { data: exportRow, error: exportError } = await supabase
    .from("exports")
    .insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      quote_id: input.quoteId ?? null,
      invoice_id: input.invoiceId ?? null,
      export_type: input.exportType,
      status: "generating",
      file_name: input.fileName,
      mime_type: input.file.type || "application/pdf",
      file_size: input.file.size,
      is_public: input.isPublic ?? false,
      metadata: input.metadata ?? {}
    })
    .select("id")
    .single();
  if (exportError || !exportRow) return resultError(exportError?.message ?? "Export record could not be created.");

  const uploaded = await uploadProjectFile(supabase, {
    ...input,
    projectId: input.projectId as string,
    exportId: exportRow.id,
    fileType: input.exportType
  });
  if (uploaded.error || !uploaded.data) {
    await supabase.from("exports").delete().eq("id", exportRow.id).eq("user_id", input.userId);
    return uploaded;
  }

  const { error: updateError } = await supabase
    .from("exports")
    .update({ status: "ready", storage_path: uploaded.data.storage_path })
    .eq("id", exportRow.id)
    .eq("user_id", input.userId);
  if (!updateError && input.projectId) {
    await recordProjectActivity(supabase, {
      userId: input.userId,
      projectId: input.projectId,
      eventType: "export_generated",
      entityType: "export",
      entityId: exportRow.id,
      description: `${input.fileName} generated.`,
      metadata: { exportType: input.exportType }
    });
  }
  return updateError ? resultError(updateError.message) : uploaded;
}

export async function uploadQuotePdf(
  supabase: SupabaseClient,
  input: FileUploadInput & { projectId: string; quoteId: string }
) {
  return uploadExportPdf(supabase, { ...input, exportType: "quote_pdf" });
}

export async function uploadInvoicePdf(
  supabase: SupabaseClient,
  input: FileUploadInput & { projectId: string; invoiceId: string }
) {
  return uploadExportPdf(supabase, { ...input, exportType: "invoice_pdf" });
}

export async function getProjectFiles(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<DataResult<AttachmentRecord[]>> {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return error ? resultError(error.message) : { data: (data ?? []) as AttachmentRecord[], error: null };
}

export async function deleteProjectFile(
  supabase: SupabaseClient,
  userId: string,
  attachment: Pick<AttachmentRecord, "id" | "storage_path">
): Promise<DataResult<true>> {
  const { data: ownedFile, error: readError } = await supabase
    .from("attachments")
    .select("id, storage_path")
    .eq("id", attachment.id)
    .eq("user_id", userId)
    .single();
  if (readError || !ownedFile) return resultError(readError?.message ?? "File could not be verified.");

  const { error: storageError } = await supabase.storage
    .from(ACREX_FILES_BUCKET)
    .remove([ownedFile.storage_path]);
  if (storageError) return resultError(storageError.message);

  const { error: metadataError } = await supabase
    .from("attachments")
    .delete()
    .eq("id", ownedFile.id)
    .eq("user_id", userId);
  return metadataError ? resultError(metadataError.message) : { data: true, error: null };
}

export async function saveUserSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: {
    company_profile?: Record<string, unknown>;
    quote_defaults?: Record<string, unknown>;
    pricing_defaults?: Record<string, unknown>;
    drawing_defaults?: Record<string, unknown>;
    map_defaults?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...settings }, { onConflict: "user_id" })
    .select("*")
    .single();
  return error ? resultError(error.message) : { data, error: null };
}

export async function saveAiEstimateSnapshot(
  supabase: SupabaseClient,
  input: {
    userId: string;
    projectId: string;
    quoteId?: string | null;
    context: Record<string, unknown>;
    suggestion: Record<string, unknown>;
    model?: string | null;
    confidenceScore?: number | null;
  }
) {
  const { data, error } = await supabase
    .from("ai_estimate_snapshots")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      quote_id: input.quoteId ?? null,
      context_snapshot: input.context,
      suggestion_snapshot: input.suggestion,
      model: input.model ?? null,
      confidence_score: input.confidenceScore ?? null
    })
    .select("*")
    .single();
  return error ? resultError(error.message) : { data, error: null };
}

export function drawingsToFeatureCollection(drawings: DrawingWrite[]): SavedProjectMapData {
  return {
    type: "FeatureCollection",
    features: drawings.map((drawing) => drawing.geometry_geojson)
  } as FeatureCollection<Polygon | LineString, SavedZoneProperties>;
}
