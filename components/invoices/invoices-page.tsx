"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { InvoiceFormState, InvoiceRecord, InvoiceStatus, QuoteRecord } from "@/lib/projects/types";

type InvoicesPageProps = {
  userId: string;
  userEmail: string;
  quotes: QuoteRecord[];
  invoices: InvoiceRecord[];
  errorMessage: string | null;
};

const invoiceStatuses: InvoiceStatus[] = ["Draft", "Sent", "Paid", "Overdue"];

function getDefaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function generateInvoiceNumber() {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `INV-${datePart}-${String(Date.now()).slice(-4)}`;
}

const emptyInvoiceForm: InvoiceFormState = {
  quoteId: "",
  invoiceNumber: generateInvoiceNumber(),
  dueDate: getDefaultDueDate(),
  status: "Draft",
  notes: ""
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function normalizeInvoice(row: unknown): InvoiceRecord {
  return row as InvoiceRecord;
}

function getInvoiceEmailHref(invoice: InvoiceRecord) {
  const subject = encodeURIComponent(`Invoice ${invoice.invoice_number}`);
  const body = encodeURIComponent(
    [
      `Invoice: ${invoice.invoice_number}`,
      `Client: ${invoice.client_name || "Client"}`,
      `Project: ${invoice.project_name || "Project"}`,
      `Address: ${invoice.address || "No address saved"}`,
      `Due Date: ${formatDate(invoice.due_date)}`,
      `Total: ${formatCurrency(invoice.total)}`,
      "",
      invoice.notes ? `Notes: ${invoice.notes}` : "Thank you."
    ].join("\n")
  );

  return `mailto:?subject=${subject}&body=${body}`;
}

function getReadableInvoiceError(message: string) {
  if (message.includes("public.invoices") || message.includes("invoices")) {
    return "Invoice storage is not set up yet. Apply supabase/schema.sql in Supabase, then refresh this page.";
  }

  if (message.includes("public.quotes") || message.includes("quotes")) {
    return "Quote storage needs the latest schema before invoices can be created.";
  }

  return message;
}

export function InvoicesPage({ userId, userEmail, quotes, invoices, errorMessage }: InvoicesPageProps) {
  const [formState, setFormState] = useState<InvoiceFormState>(emptyInvoiceForm);
  const [savedInvoices, setSavedInvoices] = useState<InvoiceRecord[]>(invoices);
  const [message, setMessage] = useState<string | null>(errorMessage ? getReadableInvoiceError(errorMessage) : null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.id === formState.quoteId) ?? null,
    [formState.quoteId, quotes]
  );

  function handleQuoteChange(quoteId: string) {
    setFormState((current) => ({
      ...current,
      quoteId,
      invoiceNumber: current.invoiceNumber || generateInvoiceNumber()
    }));
    setMessage(null);
  }

  function resetForm() {
    setFormState({
      ...emptyInvoiceForm,
      invoiceNumber: generateInvoiceNumber(),
      dueDate: getDefaultDueDate()
    });
  }

  async function handleSaveInvoice() {
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    if (!selectedQuote) {
      setMessage("Select a quote before saving an invoice.");
      return;
    }

    if (!formState.invoiceNumber.trim()) {
      setMessage("Invoice number is required.");
      return;
    }

    setIsSaving(true);

    const payload = {
      user_id: userId,
      quote_id: selectedQuote.id,
      project_id: selectedQuote.project_id,
      client_id: selectedQuote.client_id,
      invoice_number: formState.invoiceNumber.trim(),
      due_date: formState.dueDate || null,
      status: formState.status,
      client_name: selectedQuote.client_name,
      project_name: selectedQuote.project_name,
      address: selectedQuote.address,
      total: selectedQuote.total,
      notes: formState.notes.trim() || null
    };

    const { data, error } = await supabase.from("invoices").insert(payload).select("*").single();
    setIsSaving(false);

    if (error) {
      setMessage(getReadableInvoiceError(error.message));
      return;
    }

    const savedInvoice = normalizeInvoice(data);
    setSavedInvoices((current) => [savedInvoice, ...current]);
    resetForm();
    setMessage(`✓ Invoice ${savedInvoice.invoice_number} saved and linked to quote ${selectedQuote.quote_number}.`);
  }

  async function markInvoicePaid(invoice: InvoiceRecord) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setUpdatingInvoiceId(invoice.id);
    setMessage(null);
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "Paid" })
      .eq("id", invoice.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    setUpdatingInvoiceId(null);

    if (error) {
      setMessage(getReadableInvoiceError(error.message));
      return;
    }

    const updatedInvoice = normalizeInvoice(data);
    setSavedInvoices((current) => current.map((item) => (item.id === updatedInvoice.id ? updatedInvoice : item)));
    setMessage(`✓ Invoice ${updatedInvoice.invoice_number} marked paid.`);
  }

  return (
    <main className="invoices-page">
      <aside className="projects-sidebar">
        <AppSidebar active="invoices" ariaLabel="Invoice navigation" />
      </aside>

      <section className="invoices-workspace">
        <header className="projects-header">
          <div>
            <span>Invoices</span>
            <h1>Generate from Quotes</h1>
          </div>
          <div className="projects-user-chip">
            <strong>{userEmail.slice(0, 1).toUpperCase()}</strong>
            <span>{userEmail}</span>
          </div>
        </header>

        {message ? <p className="projects-error">{message}</p> : null}

        <section className="invoice-builder-grid">
          <section className="invoice-builder-card">
            <div className="quote-card-heading">
              <div>
                <span>Invoice Setup</span>
                <strong>{selectedQuote?.quote_number ?? "Select a quote"}</strong>
              </div>
              <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as InvoiceStatus }))}>
                {invoiceStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="quote-setup-grid">
              <label>
                Quote
                <select value={formState.quoteId} onChange={(event) => handleQuoteChange(event.target.value)}>
                  <option value="">Choose saved quote...</option>
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.quote_number} - {quote.project_name || "No project"} - {formatCurrency(quote.total)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Invoice Number
                <input
                  value={formState.invoiceNumber}
                  onChange={(event) => setFormState((current) => ({ ...current, invoiceNumber: event.target.value }))}
                />
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  value={formState.dueDate}
                  onChange={(event) => setFormState((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </label>
            </div>

            <div className="quote-pulled-data">
              <div>
                <span>Client</span>
                <strong>{selectedQuote?.client_name || "No quote selected"}</strong>
              </div>
              <div>
                <span>Project</span>
                <strong>{selectedQuote?.project_name || "No quote selected"}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatCurrency(selectedQuote?.total ?? 0)}</strong>
              </div>
            </div>

            <div className="invoice-address-card">
              <span>Address</span>
              <strong>{selectedQuote?.address || "Select a quote to pull project address."}</strong>
            </div>

            <label className="quote-notes-field">
              Notes
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Payment terms, invoice notes, or job completion details..."
              />
            </label>
          </section>

          <aside className="quote-summary-card">
            <span>Invoice Total</span>
            <strong>{formatCurrency(selectedQuote?.total ?? 0)}</strong>
            <small>{selectedQuote ? `Linked to ${selectedQuote.quote_number}` : "Select a quote to generate invoice"}</small>
            <button
              className={isSaving ? "is-processing" : ""}
              type="button"
              onClick={handleSaveInvoice}
              disabled={isSaving || !selectedQuote}
              title={!selectedQuote ? "Select a saved quote before creating an invoice." : undefined}
            >
              {isSaving ? "Saving Invoice..." : selectedQuote ? "Save Invoice" : "Select Quote First"}
            </button>
          </aside>
        </section>

        <section className="invoices-table-card">
          <div className="quote-card-heading">
            <div>
              <span>Saved Invoices</span>
              <strong>{savedInvoices.length} invoice{savedInvoices.length === 1 ? "" : "s"}</strong>
            </div>
          </div>

          <div className="invoices-table">
            <div className="invoices-table-header">
              <span>Invoice</span>
              <span>Client</span>
              <span>Project</span>
              <span>Status</span>
              <span>Due Date</span>
              <span>Total</span>
              <span />
            </div>

            {savedInvoices.length ? (
              savedInvoices.map((invoice) => (
                <article className="invoice-row" key={invoice.id}>
                  <strong>{invoice.invoice_number}</strong>
                  <span>{invoice.client_name || "No client"}</span>
                  <span>{invoice.project_name || "No project"}</span>
                  <span className={`project-status-pill invoice-status-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
                  <span>{formatDate(invoice.due_date)}</span>
                  <span>{formatCurrency(invoice.total)}</span>
                  <div className="invoice-row-actions">
                    <button type="button" onClick={() => window.print()}>
                      Print
                    </button>
                    <a href={getInvoiceEmailHref(invoice)}>Email</a>
                    {invoice.status === "Paid" ? null : (
                      <button
                        className={updatingInvoiceId === invoice.id ? "is-processing" : ""}
                        type="button"
                        onClick={() => markInvoicePaid(invoice)}
                        disabled={updatingInvoiceId === invoice.id}
                      >
                        {updatingInvoiceId === invoice.id ? "Updating..." : "Mark Paid"}
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="projects-empty-state">
                <strong>No invoices saved</strong>
                <span>Select a saved quote and generate an invoice.</span>
                <Link className="empty-state-action" href="/quotes">Open Quotes</Link>
              </div>
            )}
          </div>
        </section>
      </section>
      <MobileAppNav active="invoices" />
    </main>
  );
}
