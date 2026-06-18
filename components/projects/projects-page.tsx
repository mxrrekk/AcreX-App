"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatAcres } from "@/lib/geo/format";
import {
  clearDeletedProjectLocalState,
  defaultProjectTags,
  getGlobalStorageKey,
  readStoredValue,
  writeStoredValue,
  type ProjectTagStore
} from "@/lib/projects/operations";
import type { ClientRecord, InvoiceRecord, ProjectRecord, ProjectStatus, QuoteRecord, SavedProjectMapData } from "@/lib/projects/types";

type ProjectsPageProps = {
  userId: string;
  userEmail: string;
  projects: ProjectRecord[];
  clients: ClientRecord[];
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
  errorMessage: string | null;
};

const projectStatuses: ProjectStatus[] = ["Draft", "Estimating", "Quoted", "Won", "Lost", "Completed", "Archived"];

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && projectStatuses.includes(value as ProjectStatus);
}

function getProjectStatus(project: ProjectRecord): ProjectStatus {
  const mapData = project.polygon_geojson as SavedProjectMapData | null;
  if (mapData?.type === "FeatureCollection" && isProjectStatus(mapData.properties?.status)) {
    return mapData.properties.status;
  }
  return "Draft";
}

function getZoneCount(project: ProjectRecord) {
  const mapData = project.polygon_geojson as SavedProjectMapData | null;
  if (mapData?.type === "FeatureCollection") return mapData.features.length;
  return mapData ? 1 : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function getReadableProjectError(message: string) {
  if (message.includes("projects")) {
    return "Project storage is not available yet. Apply supabase/schema.sql in Supabase, then refresh this page.";
  }

  return message;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function ProjectsPage({ userId, userEmail, projects, clients, quotes, invoices, errorMessage }: ProjectsPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "All">("All");
  const [projectRows, setProjectRows] = useState<ProjectRecord[]>(projects);
  const [message, setMessage] = useState<string | null>(errorMessage ? getReadableProjectError(errorMessage) : null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectRecord | null>(null);
  const [tagFilter, setTagFilter] = useState("All");
  const [tagStore, setTagStore] = useState<ProjectTagStore>(() => readStoredValue<ProjectTagStore>(getGlobalStorageKey(userEmail, "project-tags"), {}));

  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const quoteSummaryByProject = useMemo(() => {
    const summary = new Map<string, number>();
    quotes.forEach((quote) => {
      if (quote.project_id) summary.set(quote.project_id, (summary.get(quote.project_id) ?? 0) + Number(quote.total ?? 0));
    });
    return summary;
  }, [quotes]);
  const invoiceStatusByProject = useMemo(() => {
    const summary = new Map<string, string>();
    invoices.forEach((invoice) => {
      if (invoice.project_id && !summary.has(invoice.project_id)) summary.set(invoice.project_id, invoice.status);
    });
    return summary;
  }, [invoices]);
  const recentProjects = projectRows.slice(0, 3);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return projectRows.filter((project) => {
      const status = getProjectStatus(project);
      const matchesStatus = statusFilter === "All" || status === statusFilter;
      const projectTags = tagStore[project.id] ?? [];
      const matchesTag = tagFilter === "All" || projectTags.includes(tagFilter);
      const client = project.client_id ? clientById.get(project.client_id) : null;
      const haystack = [
        project.project_name,
        project.address ?? "",
        project.customer_name ?? "",
        client?.name ?? "",
        client?.company ?? "",
        client?.phone ?? "",
        client?.email ?? "",
        project.service_type ?? "",
        status,
        ...projectTags
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && matchesTag && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [clientById, projectRows, searchTerm, statusFilter, tagFilter, tagStore]);

  function toggleProjectTag(projectId: string, tag: string) {
    setTagStore((current) => {
      const currentTags = current[projectId] ?? [];
      const nextTags = currentTags.includes(tag) ? currentTags.filter((item) => item !== tag) : [...currentTags, tag];
      const nextStore = { ...current, [projectId]: nextTags };
      writeStoredValue(getGlobalStorageKey(userEmail, "project-tags"), nextStore);
      return nextStore;
    });
  }

  async function handleDeleteProject() {
    if (!pendingDeleteProject) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setDeletingProjectId(pendingDeleteProject.id);
    setMessage(null);
    const projectId = pendingDeleteProject.id;
    const { error: invoiceError } = await supabase
      .from("invoices")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);
    const { error: quoteError } = invoiceError
      ? { error: null }
      : await supabase
          .from("quotes")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId);
    const { error: projectError } = invoiceError || quoteError
      ? { error: null }
      : await supabase.from("projects").delete().eq("id", projectId).eq("user_id", userId);
    setDeletingProjectId(null);

    const deleteError = invoiceError || quoteError || projectError;
    if (deleteError) {
      setMessage(getReadableProjectError(deleteError.message));
      return;
    }

    const deletedProjectId = projectId;
    setProjectRows((current) => current.filter((row) => row.id !== deletedProjectId));
    setTagStore((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, deletedProjectId)) return current;
      const next = { ...current };
      delete next[deletedProjectId];
      return next;
    });
    clearDeletedProjectLocalState(userEmail, deletedProjectId);
    setPendingDeleteProject(null);
    setMessage("Project deleted.");
  }

  return (
    <main className="projects-page">
      <aside className="projects-sidebar">
        <AppSidebar active="projects" ariaLabel="Projects navigation" />
      </aside>

      <section className="projects-workspace">
        <header className="projects-header">
          <div>
            <span>Saved Work</span>
            <h1>Projects</h1>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        <section className="projects-controls" aria-label="Project controls">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search projects..."
            type="search"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "All")}>
            <option value="All">All Statuses</option>
            {projectStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="All">All Tags</option>
            {defaultProjectTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <Link className="projects-new-button" href="/dashboard">
            New Project
          </Link>
        </section>

        {message ? <p className="projects-error">{message}</p> : null}

        {recentProjects.length ? (
          <section className="recent-projects-strip" aria-label="Recent projects">
            <div>
              <span>Recent Projects</span>
              <strong>Recently updated work</strong>
            </div>
            {recentProjects.map((project) => (
              <Link href={`/projects/${project.id}`} key={project.id}>
                <strong>{project.project_name}</strong>
                <span>{project.address || project.service_type || "No address saved"}</span>
              </Link>
            ))}
          </section>
        ) : null}

        <section className="projects-table" aria-label="Saved projects">
          <div className="projects-table-header">
            <span>Project</span>
            <span>Customer</span>
            <span>Status</span>
            <span>Drawings</span>
            <span>Quote Total</span>
            <span>Invoice</span>
            <span>Updated</span>
            <span />
            <span />
          </div>

          {filteredProjects.length ? (
            filteredProjects.map((project) => (
              <article className="project-row" key={project.id}>
                <div>
                  <strong>{project.project_name}</strong>
                  <span>{project.address || "No address saved"}</span>
                </div>
                <span>{project.client_id ? clientById.get(project.client_id)?.name ?? project.customer_name ?? "Unassigned" : project.customer_name ?? "Unassigned"}</span>
                <span className={`project-status-pill status-${getProjectStatus(project).toLowerCase()}`}>
                  {getProjectStatus(project)}
                </span>
                <span>{getZoneCount(project)}</span>
                <span>{formatCurrency(quoteSummaryByProject.get(project.id) ?? 0)}</span>
                <span>{invoiceStatusByProject.get(project.id) ?? "No invoice"}</span>
                <span>{formatDate(project.updated_at)}</span>
                <Link href={`/projects/${project.id}`}>Open Detail</Link>
                <button
                  className={deletingProjectId === project.id ? "is-processing" : ""}
                  type="button"
                  onClick={() => setPendingDeleteProject(project)}
                  disabled={deletingProjectId === project.id}
                >
                  {deletingProjectId === project.id ? "Deleting..." : "Delete"}
                </button>
              </article>
            ))
          ) : (
            <div className="projects-empty-state">
              <strong>No projects found</strong>
              <span>Save a project from the dashboard or adjust your search/filter.</span>
              <Link className="empty-state-action" href="/dashboard">Create Project</Link>
            </div>
          )}
        </section>
      </section>
      {pendingDeleteProject ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
            <span className="modal-icon">!</span>
            <h2 id="delete-project-title">Delete project?</h2>
            <p>
              This permanently removes <strong>{pendingDeleteProject.project_name}</strong>, its drawings, quotes, quote
              items, and invoices.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDeleteProject(null)} disabled={deletingProjectId === pendingDeleteProject.id}>
                Cancel
              </button>
              <button
                className={`danger-button${deletingProjectId === pendingDeleteProject.id ? " is-processing" : ""}`}
                type="button"
                onClick={handleDeleteProject}
                disabled={deletingProjectId === pendingDeleteProject.id}
              >
                {deletingProjectId === pendingDeleteProject.id ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
