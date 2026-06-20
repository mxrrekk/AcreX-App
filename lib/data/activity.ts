import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectActivityType =
  | "project_created"
  | "project_updated"
  | "drawing_added"
  | "drawing_updated"
  | "drawing_deleted"
  | "quote_created"
  | "quote_edited"
  | "invoice_created"
  | "file_uploaded"
  | "export_generated";

export type ProjectActivityRecord = {
  id: string;
  user_id: string;
  project_id: string;
  event_type: ProjectActivityType;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function missingActivityTable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "PGRST205" || Boolean(error?.message?.includes("project_activity"));
}

export async function recordProjectActivity(
  supabase: SupabaseClient,
  input: {
    userId: string;
    projectId: string;
    eventType: ProjectActivityType;
    entityType: string;
    entityId?: string | null;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("project_activity")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      description: input.description,
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();
  if (error && missingActivityTable(error)) return { data: null, error: null };
  return { data: data as ProjectActivityRecord | null, error: error?.message ?? null };
}

export async function getProjectActivity(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
) {
  const { data, error } = await supabase
    .from("project_activity")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error && missingActivityTable(error)) return { data: [], error: null };
  return { data: (data ?? []) as ProjectActivityRecord[], error: error?.message ?? null };
}
