"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { formatDrawingQuantity, getProjectDrawings } from "@/lib/projects/drawings";
import type { ProjectRecord } from "@/lib/projects/types";

type DrawingsPageProps = {
  userEmail: string;
  projects: ProjectRecord[];
  errorMessage: string | null;
};

export function DrawingsPage({ userEmail, projects, errorMessage }: DrawingsPageProps) {
  const [search, setSearch] = useState("");
  const drawings = useMemo(() => projects.flatMap(getProjectDrawings), [projects]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return drawings;
    return drawings.filter((drawing) =>
      [drawing.name, drawing.projectName, drawing.address, drawing.serviceType, drawing.quoteCategory]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [drawings, search]);

  return (
    <main className="projects-page">
      <aside className="projects-sidebar">
        <AppSidebar active="drawings" ariaLabel="Drawings navigation" />
      </aside>
      <section className="projects-workspace">
        <header className="projects-header">
          <div>
            <span>Saved Geometry</span>
            <h1>Drawings</h1>
            <p>Manage drawings saved inside projects and move measured work into quotes.</p>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        <section className="projects-controls drawings-controls">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search drawings..." type="search" />
          <Link className="projects-new-button" href="/dashboard">Open Map</Link>
        </section>

        {errorMessage ? <p className="projects-error">{errorMessage}</p> : null}

        <section className="drawings-list" aria-label="Saved drawings">
          {filtered.length ? (
            filtered.map((drawing) => (
              <article className="drawing-row" key={`${drawing.projectId}-${drawing.id}`}>
                <i style={{ background: drawing.color }} aria-hidden="true" />
                <div>
                  <strong>{drawing.name}</strong>
                  <span>{drawing.projectName} · {drawing.address || "No address"}</span>
                </div>
                <span>{drawing.serviceType}</span>
                <strong>{formatDrawingQuantity(drawing)}</strong>
                <div>
                  <Link href={`/projects/${drawing.projectId}`}>Project Detail</Link>
                  <Link href={`/dashboard?project=${drawing.projectId}`}>Open Map</Link>
                  {drawing.billable ? (
                    <Link href={`/quotes?project=${drawing.projectId}&measurement=${encodeURIComponent(drawing.id)}`}>Add to Quote</Link>
                  ) : (
                    <span>Non-billable</span>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="projects-empty-state">
              <strong>No saved drawings found</strong>
              <span>Draw a work area on the Map and save it to a project.</span>
              <Link className="empty-state-action" href="/dashboard">Open Map</Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
