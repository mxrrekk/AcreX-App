"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
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
  const groupedDrawings = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    filtered.forEach((drawing) => {
      const label =
        drawing.zoneType === "Brush" ? "Brush" :
        drawing.zoneType === "Grass" ? "Grass" :
        drawing.zoneType === "Fence" ? "Fence" :
        drawing.zoneType === "Driveway" ? "Driveway" :
        drawing.zoneType === "HousePad" || drawing.zoneType === "Building" ? "House Pad" :
        drawing.zoneType === "Excluded" ? "Exclusion" :
        drawing.serviceType || "Other";
      groups.set(label, [...(groups.get(label) ?? []), drawing]);
    });
    return Array.from(groups.entries());
  }, [filtered]);

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
            groupedDrawings.map(([group, groupDrawings]) => (
              <section className="drawing-service-group" key={group}>
                <header>
                  <div><span>{group}</span><strong>{groupDrawings.length} saved</strong></div>
                </header>
                <div>
                {groupDrawings.map((drawing) => (
              <article className="drawing-row" key={`${drawing.projectId}-${drawing.id}`}>
                <i style={{ background: drawing.color }} aria-hidden="true" />
                <div>
                  <strong>{drawing.name}</strong>
                  <span>{drawing.projectName} · {drawing.address || "No address"}</span>
                </div>
                <span>{drawing.serviceType}</span>
                <strong>{formatDrawingQuantity(drawing)}</strong>
                <div>
                  <Link href={`/dashboard?project=${drawing.projectId}&drawing=${encodeURIComponent(drawing.id)}`}>Open Inspector</Link>
                  <Link href={`/projects/${drawing.projectId}`}>Open Project</Link>
                  {drawing.billable ? (
                    <Link href={`/quotes?project=${drawing.projectId}&measurement=${encodeURIComponent(drawing.id)}`}>Add to Quote</Link>
                  ) : (
                    <span>Non-billable</span>
                  )}
                </div>
              </article>
                ))}
                </div>
              </section>
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
      <MobileAppNav active="drawings" />
    </main>
  );
}
