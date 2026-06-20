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
            <span>Project Report</span>
            <strong>Measurement deliverable</strong>
            <p>Project data and measurements remain available from each project detail page.</p>
            <div className="export-availability">Report export becomes available after project report formatting is finalized.</div>
          </article>
        </section>
      </section>
      <MobileAppNav active="exports" />
    </main>
  );
}
