import { NextResponse } from "next/server";
import { createProjectBackup } from "@/lib/data/backup";
import { recordProjectActivity } from "@/lib/data/activity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const backup = await createProjectBackup(supabase, user.id, params.id);
    const fileName = `${backup.project.project_name || "acrex-project"}-backup.json`
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .toLowerCase();
    const { data: exportRow } = await supabase
      .from("exports")
      .insert({
        user_id: user.id,
        project_id: params.id,
        export_type: "project_backup_json",
        status: "ready",
        file_name: fileName,
        mime_type: "application/json",
        metadata: {
          backupVersion: backup.version,
          integrityIssueCount: backup.integrity.length
        }
      })
      .select("id")
      .maybeSingle();
    await recordProjectActivity(supabase, {
      userId: user.id,
      projectId: params.id,
      eventType: "export_generated",
      entityType: "export",
      entityId: exportRow?.id ?? null,
      description: `${fileName} generated.`
    });
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project backup could not be created." },
      { status: 500 }
    );
  }
}
