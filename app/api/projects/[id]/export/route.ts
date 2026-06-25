import { NextResponse } from "next/server";
import { createProjectBackup } from "@/lib/data/backup";
import { createExportRecord } from "@/lib/data/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUsageGate } from "@/lib/billing/usage-gates";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usageGate = await checkUsageGate(supabase, user.id, "exports");
  if (!usageGate.allowed) {
    return NextResponse.json(
      {
        error: usageGate.message,
        code: "usage_limit_reached",
        upgradeRequired: true,
        metric: usageGate.metric,
        usage: usageGate.usage,
        plan: usageGate.plan
      },
      { status: 402 }
    );
  }

  try {
    const backup = await createProjectBackup(supabase, user.id, params.id);
    const fileName = `${backup.project.project_name || "acrex-project"}-backup.json`
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .toLowerCase();
    await createExportRecord(supabase, {
      userId: user.id,
      projectId: params.id,
      exportType: "project_backup_json",
      status: "ready",
      fileName,
      mimeType: "application/json",
      isPublic: false,
      metadata: {
        backupVersion: backup.version,
        integrityIssueCount: backup.integrity.length
      }
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
