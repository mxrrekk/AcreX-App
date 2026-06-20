"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDrawingQuantity, getProjectDrawings } from "@/lib/projects/drawings";
import type { ProjectRecord, SavedProjectMapData } from "@/lib/projects/types";

type DrawingsPageProps = {
  userId: string;
  userEmail: string;
  projects: ProjectRecord[];
  errorMessage: string | null;
};

export function DrawingsPage({ userId, userEmail, projects, errorMessage }: DrawingsPageProps) {
  const [search, setSearch] = useState("");
  const [projectRows, setProjectRows] = useState(projects);
  const [message, setMessage] = useState(errorMessage);
  const [deletingDrawingId, setDeletingDrawingId] = useState<string | null>(null);
  const [pendingDeleteDrawing, setPendingDeleteDrawing] = useState<{ projectId: string; drawingId: string; name: string } | null>(null);
  const drawings = useMemo(() => projectRows.flatMap(getProjectDrawings), [projectRows]);
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

  async function deleteDrawing(projectId: string, drawingId: string) {
    const project = projectRows.find((item) => item.id === projectId);
    const mapData = project?.polygon_geojson as SavedProjectMapData | null;
    if (!project || !mapData) {
      setMessage("Drawing could not be found.");
      return false;
    }

    const nextMapData: SavedProjectMapData | null =
      mapData.type === "FeatureCollection"
        ? {
            ...mapData,
            features: mapData.features.filter((feature) => String(feature.id) !== drawingId)
          }
        : String(mapData.id) === drawingId
          ? null
          : mapData;
    const features = nextMapData?.type === "FeatureCollection"
      ? nextMapData.features
      : nextMapData
        ? [nextMapData]
        : [];
    const acres = features.reduce((total, feature) => total + Number(feature.properties?.acres ?? feature.properties?.areaAcres ?? 0), 0);
    const squareFeet = features.reduce(
      (total, feature) => total + Number(feature.properties?.squareFeet ?? feature.properties?.areaSqFt ?? 0),
      0
    );
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Drawing storage is not configured.");
      return false;
    }

    setDeletingDrawingId(drawingId);
    setMessage(null);
    const { error } = await supabase
      .from("projects")
      .update({
        polygon_geojson: nextMapData,
        acres,
        square_feet: squareFeet,
        updated_at: new Date().toISOString()
      })
      .eq("id", projectId)
      .eq("user_id", userId);
    setDeletingDrawingId(null);

    if (error) {
      setMessage(error.message);
      return false;
    }

    setProjectRows((current) =>
      current.map((item) =>
        item.id === projectId
          ? { ...item, polygon_geojson: nextMapData, acres, square_feet: squareFeet, updated_at: new Date().toISOString() }
          : item
      )
    );
    setMessage("Drawing deleted.");
    return true;
  }

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

        {message ? <p className="projects-error">{message}</p> : null}

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
                  <Link href={`/projects/${drawing.projectId}`}>Project Detail</Link>
                  <Link href={`/dashboard?project=${drawing.projectId}`}>Open Map</Link>
                  {drawing.billable ? (
                    <Link href={`/quotes?project=${drawing.projectId}&measurement=${encodeURIComponent(drawing.id)}`}>Add to Quote</Link>
                  ) : (
                    <span>Non-billable</span>
                  )}
                  <button
                    type="button"
                    disabled={deletingDrawingId === drawing.id}
                    onClick={() => setPendingDeleteDrawing({ projectId: drawing.projectId, drawingId: drawing.id, name: drawing.name })}
                  >
                    {deletingDrawingId === drawing.id ? "Deleting..." : "Delete"}
                  </button>
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
      {pendingDeleteDrawing ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-drawing-title">
            <span className="modal-icon">!</span>
            <h2 id="delete-drawing-title">Delete drawing?</h2>
            <p>
              This permanently removes <strong>{pendingDeleteDrawing.name}</strong> from its project and available quote
              measurements.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDeleteDrawing(null)} disabled={deletingDrawingId === pendingDeleteDrawing.drawingId}>
                Cancel
              </button>
              <button
                type="button"
                className={`danger-button${deletingDrawingId === pendingDeleteDrawing.drawingId ? " is-processing" : ""}`}
                onClick={async () => {
                  const deleted = await deleteDrawing(pendingDeleteDrawing.projectId, pendingDeleteDrawing.drawingId);
                  if (deleted) setPendingDeleteDrawing(null);
                }}
                disabled={deletingDrawingId === pendingDeleteDrawing.drawingId}
              >
                {deletingDrawingId === pendingDeleteDrawing.drawingId ? "Deleting…" : "Delete Drawing"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <MobileAppNav active="drawings" />
    </main>
  );
}
