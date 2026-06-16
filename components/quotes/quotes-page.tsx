"use client";

import { AppSidebar } from "@/components/ui/app-sidebar";

type QuotesPageProps = {
  userEmail: string;
  errorMessage?: string | null;
};

const quoteWorkspaceSections = [
  {
    title: "Project",
    eyebrow: "Job context",
    description: "Select the saved project and customer details that this quote will be built from."
  },
  {
    title: "Available Measurements",
    eyebrow: "Map data",
    description: "Pulled acreage, square footage, and linear footage from the active project will appear here."
  },
  {
    title: "Line Items",
    eyebrow: "Services",
    description: "Editable services, quantities, units, rates, and descriptions will be organized in this workspace."
  },
  {
    title: "Totals",
    eyebrow: "Estimate summary",
    description: "Subtotal, tax, discounts, deposits, and final quote totals will live in this section."
  },
  {
    title: "Notes",
    eyebrow: "Proposal details",
    description: "Scope of work, exclusions, payment terms, timeline, and customer-facing notes will be managed here."
  }
];

export function QuotesPage({ userEmail, errorMessage }: QuotesPageProps) {
  return (
    <main className="quotes-page">
      <aside className="projects-sidebar">
        <AppSidebar active="quotes" ariaLabel="Quote navigation" />
      </aside>

      <section className="quotes-workspace quotes-blank-workspace">
        <header className="projects-header quote-workspace-header">
          <div>
            <span>Quote Workspace</span>
            <h1>Quotes</h1>
            <p>A clean estimating workspace for turning project measurements into professional contractor proposals.</p>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        {errorMessage ? <p className="projects-error">{errorMessage}</p> : null}

        <section className="quote-blank-hero">
          <div>
            <span>Blank quote canvas</span>
            <h2>Build the estimate from project data.</h2>
            <p>
              This page is prepared for the quote workflow without adding quote logic yet. Each section is ready for
              project, measurement, line item, total, and notes functionality.
            </p>
          </div>
          <div className="quote-blank-status" aria-label="Quote page status">
            <span>Status</span>
            <strong>Workspace Ready</strong>
          </div>
        </section>

        <section className="quote-blank-grid" aria-label="Quote workspace sections">
          {quoteWorkspaceSections.map((section) => (
            <article className="quote-blank-card" key={section.title}>
              <span>{section.eyebrow}</span>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
