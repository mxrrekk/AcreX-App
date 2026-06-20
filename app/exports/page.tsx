import { redirect } from "next/navigation";
import Link from "next/link";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ExportsPage() {
  const supabase = createSupabaseServerClient();
  if (!supabase) redirect("/login");

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_name, address")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <main className="projects-page exports-page">
      <aside className="projects-sidebar">
        <AppSidebar active="exports" ariaLabel="Exports navigation" />
      </aside>
      <section className="projects-workspace">
        <header className="projects-header">
          <div>
            <span>Deliverables</span>
            <h1>Exports</h1>
            <p>Generate customer-ready files from saved projects and quotes.</p>
          </div>
        </header>
        <section className="exports-grid">
          <article>
            <span>Quote PDF</span>
            <strong>Export from a saved quote</strong>
            <p>Open a quote to prepare its customer-facing PDF when export is enabled.</p>
            <Link href="/quotes">Open Quotes</Link>
          </article>
          <article>
            <span>Project Backup</span>
            <strong>Portable, restore-ready JSON</strong>
            <p>Download projects with drawings, measurements, financial records, file metadata, settings, and integrity checks.</p>
            {(projects ?? []).slice(0, 8).map((project) => (
              <a key={project.id} href={`/api/projects/${project.id}/export`} download>
                Export {project.project_name || project.address || "Project"}
              </a>
            ))}
            {!projects?.length ? <div className="export-availability">Save a project before creating a backup.</div> : null}
          </article>
        </section>
      </section>
      <MobileAppNav active="exports" />
    </main>
  );
}
