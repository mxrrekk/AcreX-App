"use client";

import Link from "next/link";
import { useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { formatDrawingQuantity, getProjectDrawings } from "@/lib/projects/drawings";
import { getProjectStorageKey, readStoredValue, writeStoredValue, type ProjectNote } from "@/lib/projects/operations";
import type { ClientRecord, InvoiceRecord, ProjectRecord, QuoteRecord, SavedProjectMapData } from "@/lib/projects/types";

type ProjectDetailPageProps = {
  project: ProjectRecord;
  client?: ClientRecord;
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
  userEmail: string;
};

function getStatus(project: ProjectRecord) {
  const mapData = project.polygon_geojson as SavedProjectMapData | null;
  return mapData?.type === "FeatureCollection" ? mapData.properties?.status ?? "Draft" : "Draft";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function ProjectDetailPage({ project, client, quotes, invoices, userEmail }: ProjectDetailPageProps) {
  const drawings = getProjectDrawings(project);
  const notesKey = getProjectStorageKey(userEmail, project.id, "notes");
  const [notes, setNotes] = useState<ProjectNote[]>(() => readStoredValue<ProjectNote[]>(notesKey, []));
  const [noteText, setNoteText] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "drawings" | "quotes" | "invoices" | "notes">("overview");

  function addNote() {
    const text = noteText.trim();
    if (!text) return;
    const nextNotes: ProjectNote[] = [
      {
        id: crypto.randomUUID(),
        text,
        type: "General",
        createdAt: new Date().toISOString(),
        createdBy: userEmail
      },
      ...notes
    ];
    setNotes(nextNotes);
    writeStoredValue(notesKey, nextNotes);
    setNoteText("");
  }

  return (
    <main className="projects-page">
      <aside className="projects-sidebar">
        <AppSidebar active="projects" ariaLabel="Project detail navigation" />
      </aside>
      <section className="projects-workspace project-detail-workspace">
        <header className="projects-header project-detail-header">
          <div>
            <span>Project Detail</span>
            <h1>{project.project_name}</h1>
            <p>{project.address || "No address saved"}</p>
          </div>
          <div className="project-detail-header-actions">
            <Link href={`/dashboard?project=${project.id}`}>Open Project Map</Link>
            <Link href={`/quotes?project=${project.id}`}>{quotes.length ? "Open Quote" : "Create Quote"}</Link>
          </div>
        </header>

        <section className="project-detail-overview" aria-label="Project overview">
          <div><span>Customer</span><strong>{client?.name ?? project.customer_name ?? "Unassigned"}</strong></div>
          <div><span>Status</span><strong>{getStatus(project)}</strong></div>
          <div><span>Drawings</span><strong>{drawings.length}</strong></div>
          <div><span>Quote Total</span><strong>{formatCurrency(quotes.reduce((total, quote) => total + quote.total, 0))}</strong></div>
          <div><span>Invoice Status</span><strong>{invoices[0]?.status ?? "No invoice"}</strong></div>
          <div><span>Last Updated</span><strong>{formatDate(project.updated_at)}</strong></div>
        </section>

        <nav className="premium-tabs project-detail-tabs" aria-label="Project detail sections">
          {[
            ["overview", "Overview"],
            ["drawings", `Drawings ${drawings.length}`],
            ["quotes", `Quotes ${quotes.length}`],
            ["invoices", `Invoices ${invoices.length}`],
            ["notes", `Notes ${notes.length}`]
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={activeTab === id ? "active" : ""}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id as typeof activeTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="project-detail-tab-panel" role="tabpanel">
        {activeTab === "overview" ? (
        <section className="project-detail-section">
          <div className="project-detail-section-heading">
            <div><span>Map Reference</span><strong>Property and saved geometry</strong></div>
            <Link href={`/dashboard?project=${project.id}`}>Open Map</Link>
          </div>
          <p>{project.address || "No property address saved."} · {project.acres?.toFixed(2) ?? "0.00"} acres · {Math.round(project.square_feet ?? 0).toLocaleString()} sq ft</p>
        </section>
        ) : null}

        {activeTab === "drawings" ? (
        <section className="project-detail-section">
          <div className="project-detail-section-heading">
            <div><span>Drawings & Measurements</span><strong>{drawings.length} saved</strong></div>
            <Link href="/drawings">All Drawings</Link>
          </div>
          <div className="project-detail-drawings">
            {drawings.length ? drawings.map((drawing) => (
              <article key={drawing.id}>
                <i style={{ background: drawing.color }} />
                <div><strong>{drawing.name}</strong><span>{drawing.serviceType}</span></div>
                <strong>{formatDrawingQuantity(drawing)}</strong>
                {drawing.billable ? (
                  <Link href={`/quotes?project=${project.id}&measurement=${encodeURIComponent(drawing.id)}`}>Add to Quote</Link>
                ) : <span>Non-billable</span>}
              </article>
            )) : <p>No drawings saved to this project yet.</p>}
          </div>
        </section>
        ) : null}

        {activeTab === "quotes" ? (
        <section className="project-detail-section">
          <div className="project-detail-section-heading">
            <div><span>Quotes</span><strong>{quotes.length}</strong></div>
            <Link href={`/quotes?project=${project.id}`}>{quotes.length ? "Open Quote Workspace" : "Create Quote"}</Link>
          </div>
          <div className="project-detail-records">
            {quotes.length ? quotes.map((quote) => (
              <article key={quote.id}><strong>{quote.quote_number}</strong><span>{quote.status}</span><strong>{formatCurrency(quote.total)}</strong></article>
            )) : <p>No quotes saved yet.</p>}
          </div>
        </section>
        ) : null}

        {activeTab === "invoices" ? (
        <section className="project-detail-section">
          <div className="project-detail-section-heading">
            <div><span>Invoices</span><strong>{invoices.length}</strong></div>
            <Link href="/invoices">Open Invoices</Link>
          </div>
          <div className="project-detail-records">
            {invoices.length ? invoices.map((invoice) => (
              <article key={invoice.id}><strong>{invoice.invoice_number}</strong><span>{invoice.status}</span><strong>{formatCurrency(invoice.total)}</strong></article>
            )) : <p>No invoices linked to this project.</p>}
          </div>
        </section>
        ) : null}

        {activeTab === "notes" ? (
        <section className="project-detail-section">
          <div className="project-detail-section-heading">
            <div><span>Notes</span><strong>{notes.length}</strong></div>
          </div>
          <div className="project-detail-note-input">
            <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add a project note..." />
            <button type="button" onClick={addNote} disabled={!noteText.trim()}>Add Note</button>
          </div>
          <div className="project-detail-notes">
            {notes.map((note) => <article key={note.id}><p>{note.text}</p><small>{formatDate(note.createdAt)} · {note.createdBy}</small></article>)}
            {!notes.length ? <p>No project notes yet.</p> : null}
          </div>
        </section>
        ) : null}
        </div>
      </section>
      <MobileAppNav active="projects" />
    </main>
  );
}
