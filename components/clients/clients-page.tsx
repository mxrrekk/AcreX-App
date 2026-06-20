"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishDataChange } from "@/lib/data/sync";
import { useAcrexDataRefresh } from "@/lib/data/use-data-refresh";
import type { ClientFormState, ClientRecord, InvoiceRecord, ProjectRecord, QuoteRecord } from "@/lib/projects/types";

type ClientsPageProps = {
  userId: string;
  userEmail: string;
  clients: ClientRecord[];
  projects: ProjectRecord[];
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
  errorMessage: string | null;
};

const emptyClientForm: ClientFormState = {
  name: "",
  company: "",
  phone: "",
  email: "",
  address: "",
  notes: ""
};

function normalizeClient(row: unknown): ClientRecord {
  return row as ClientRecord;
}

function getProjectCount(clientId: string, projects: ProjectRecord[]) {
  return projects.filter((project) => project.client_id === clientId).length;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number.isFinite(value) ? value : 0);
}

function getClientHistory(clientId: string, projects: ProjectRecord[], quotes: QuoteRecord[], invoices: InvoiceRecord[]) {
  const clientProjects = projects.filter((project) => project.client_id === clientId);
  const clientQuotes = quotes.filter((quote) => quote.client_id === clientId);
  const clientInvoices = invoices.filter((invoice) => invoice.client_id === clientId);
  return {
    projects: clientProjects.length,
    quotes: clientQuotes.length,
    invoices: clientInvoices.length,
    totalQuoted: clientQuotes.reduce((total, quote) => total + quote.total, 0),
    totalInvoiced: clientInvoices.reduce((total, invoice) => total + invoice.total, 0),
    totalPaid: clientInvoices.filter((invoice) => invoice.status === "Paid").reduce((total, invoice) => total + invoice.total, 0)
  };
}

function getReadableClientError(message: string) {
  if (message.includes("public.clients") || message.includes("clients") || message.includes("client_id")) {
    return "Client storage is not set up yet. Apply supabase/schema.sql in Supabase, then refresh this page.";
  }

  return message;
}

export function ClientsPage({ userId, userEmail, clients, projects, quotes, invoices, errorMessage }: ClientsPageProps) {
  const [clientRows, setClientRows] = useState<ClientRecord[]>(clients);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ClientFormState>(emptyClientForm);
  const [message, setMessage] = useState<string | null>(errorMessage ? getReadableClientError(errorMessage) : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<"list" | "form">("list");
  const [pendingDeleteClient, setPendingDeleteClient] = useState<ClientRecord | null>(null);
  useAcrexDataRefresh();

  useEffect(() => {
    setClientRows(clients);
  }, [clients]);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return clientRows;

    return clientRows.filter((client) =>
      [client.name, client.company ?? "", client.phone ?? "", client.email ?? "", client.address ?? "", client.notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [clientRows, searchTerm]);

  function updateField(field: keyof ClientFormState, value: string) {
    setFormState((current) => ({
      ...current,
      [field]: value
    }));
  }

  function startEdit(client: ClientRecord) {
    setEditingClientId(client.id);
    setFormState({
      name: client.name,
      company: client.company ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      notes: client.notes ?? ""
    });
    setMessage(null);
    setMobileSection("form");
  }

  function resetForm() {
    setEditingClientId(null);
    setFormState(emptyClientForm);
    setMobileSection("list");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    if (!formState.name.trim()) {
      setMessage("Client name is required.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      user_id: userId,
      name: formState.name.trim(),
      company: formState.company.trim() || null,
      phone: formState.phone.trim() || null,
      email: formState.email.trim() || null,
      address: formState.address.trim() || null,
      notes: formState.notes.trim() || null
    };

    const query = editingClientId
      ? supabase.from("clients").update(payload).eq("id", editingClientId).eq("user_id", userId).select("*").single()
      : supabase.from("clients").insert(payload).select("*").single();

    const { data, error } = await query;
    setIsSubmitting(false);

    if (error) {
      setMessage(getReadableClientError(error.message));
      return;
    }

    const savedClient = normalizeClient(data);
    let linkedUpdateFailed = false;
    if (editingClientId) {
      const linkedResults = await Promise.all([
        supabase
          .from("projects")
          .update({ customer_name: savedClient.name })
          .eq("client_id", savedClient.id)
          .eq("user_id", userId),
        supabase
          .from("quotes")
          .update({ client_name: savedClient.name })
          .eq("client_id", savedClient.id)
          .eq("user_id", userId),
        supabase
          .from("invoices")
          .update({ client_name: savedClient.name })
          .eq("client_id", savedClient.id)
          .eq("user_id", userId)
      ]);
      linkedUpdateFailed = linkedResults.some((result) => Boolean(result.error));
    }
    setClientRows((current) => {
      const withoutSaved = current.filter((client) => client.id !== savedClient.id);
      return [savedClient, ...withoutSaved];
    });
    resetForm();
    setMessage(
      linkedUpdateFailed
        ? "Client saved, but some linked records could not be updated. Refresh and try again."
        : editingClientId
          ? "✓ Client Updated"
          : "✓ Client Saved"
    );
    setMobileSection("list");
    publishDataChange({
      type: "client-saved",
      clientId: savedClient.id,
      clientName: savedClient.name
    });
  }

  async function handleDelete(clientId: string) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return false;
    }

    setIsDeletingId(clientId);
    setMessage(null);

    const { error } = await supabase.from("clients").delete().eq("id", clientId).eq("user_id", userId);
    setIsDeletingId(null);

    if (error) {
      setMessage(getReadableClientError(error.message));
      return false;
    }

    setClientRows((current) => current.filter((client) => client.id !== clientId));
    if (editingClientId === clientId) resetForm();
    setMessage("Client deleted.");
    publishDataChange({ type: "client-deleted", clientId });
    return true;
  }

  return (
    <main className="clients-page">
      <aside className="projects-sidebar">
        <AppSidebar active="clients" ariaLabel="Clients navigation" />
      </aside>

      <section className="clients-workspace">
        <header className="projects-header">
          <div>
            <span>Customer Management</span>
            <h1>Clients</h1>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        <nav className="client-mobile-tabs" aria-label="Client workspace">
          <button type="button" className={mobileSection === "list" ? "active" : ""} onClick={() => setMobileSection("list")}>
            Clients <span>{clientRows.length}</span>
          </button>
          <button type="button" className={mobileSection === "form" ? "active" : ""} onClick={() => setMobileSection("form")}>
            {editingClientId ? "Edit Client" : "Add Client"}
          </button>
        </nav>

        <section className={`clients-grid mobile-clients-${mobileSection}`}>
          <form className="client-form-card client-form-workspace" onSubmit={handleSubmit}>
            <div className="client-form-heading">
              <span>{editingClientId ? "Edit Client" : "Add Client"}</span>
              {editingClientId ? (
                <button type="button" onClick={resetForm}>
                  Cancel
                </button>
              ) : null}
            </div>

            <label>
              Name
              <input value={formState.name} onChange={(event) => updateField("name", event.target.value)} required />
            </label>
            <label>
              Company
              <input value={formState.company} onChange={(event) => updateField("company", event.target.value)} />
            </label>
            <label>
              Phone
              <input value={formState.phone} onChange={(event) => updateField("phone", event.target.value)} type="tel" />
            </label>
            <label>
              Email
              <input value={formState.email} onChange={(event) => updateField("email", event.target.value)} type="email" />
            </label>
            <label>
              Address
              <input value={formState.address} onChange={(event) => updateField("address", event.target.value)} />
            </label>
            <label>
              Notes
              <textarea value={formState.notes} onChange={(event) => updateField("notes", event.target.value)} />
            </label>
            <button className={`client-submit-button${isSubmitting ? " is-processing" : ""}`} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingClientId ? "Update Client" : "Add Client"}
            </button>
            {message ? <p className="client-message">{message}</p> : null}
          </form>

          <section className="client-list-card client-list-workspace">
            <div className="clients-controls">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search clients..."
                type="search"
              />
            </div>

            <div className="client-list">
              {filteredClients.length ? (
                filteredClients.map((client) => {
                  const linkedProjectCount = getProjectCount(client.id, projects);
                  const history = getClientHistory(client.id, projects, quotes, invoices);
                  return (
                    <article className="client-row" key={client.id}>
                      <div>
                        <strong>{client.name}</strong>
                        <span>{client.company || "No company saved"}</span>
                      </div>
                      <div>
                        <span>{client.phone || "No phone"}</span>
                        <span>{client.email || "No email"}</span>
                      </div>
                      <p>{client.address || "No address saved"}</p>
                      <small>{linkedProjectCount} linked project{linkedProjectCount === 1 ? "" : "s"}</small>
                      <div className="client-history-grid">
                        <span>Projects <strong>{history.projects}</strong></span>
                        <span>Quotes <strong>{history.quotes}</strong></span>
                        <span>Invoices <strong>{history.invoices}</strong></span>
                        <span>Quoted <strong>{formatCurrency(history.totalQuoted)}</strong></span>
                        <span>Invoiced <strong>{formatCurrency(history.totalInvoiced)}</strong></span>
                        <span>Paid <strong>{formatCurrency(history.totalPaid)}</strong></span>
                      </div>
                      <small>Last contacted: {new Date(client.updated_at).toLocaleDateString()}</small>
                      <div className="client-row-actions">
                        <button type="button" onClick={() => startEdit(client)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => setPendingDeleteClient(client)} disabled={isDeletingId === client.id}>
                          {isDeletingId === client.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="projects-empty-state">
                  <strong>No clients found</strong>
                  <span>Add a client or adjust your search.</span>
                  {searchTerm.trim() ? (
                    <button className="empty-state-action" type="button" onClick={() => setSearchTerm("")}>Clear Search</button>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
      {pendingDeleteClient ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <span className="modal-icon">!</span>
            <h2 id="delete-client-title">Delete client?</h2>
            <p>
              This removes <strong>{pendingDeleteClient.name}</strong> from Clients. Existing projects and quotes remain
              saved, but they will no longer be linked to this client.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDeleteClient(null)} disabled={isDeletingId === pendingDeleteClient.id}>
                Cancel
              </button>
              <button
                type="button"
                className={`danger-button${isDeletingId === pendingDeleteClient.id ? " is-processing" : ""}`}
                onClick={async () => {
                  const deleted = await handleDelete(pendingDeleteClient.id);
                  if (deleted) setPendingDeleteClient(null);
                }}
                disabled={isDeletingId === pendingDeleteClient.id}
              >
                {isDeletingId === pendingDeleteClient.id ? "Deleting…" : "Delete Client"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <MobileAppNav active="clients" />
    </main>
  );
}
