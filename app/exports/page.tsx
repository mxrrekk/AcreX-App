import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExportsWorkspace } from "@/components/exports/exports-workspace";

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
        <ExportsWorkspace projects={projects ?? []} />
      </section>
      <MobileAppNav active="exports" />
    </main>
  );
}
