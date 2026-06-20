"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteDraftInvoice } from "@/lib/data/cascades";
import { saveInvoice } from "@/lib/data/storage";
import { publishDataChange } from "@/lib/data/sync";
import { useAcrexDataRefresh } from "@/lib/data/use-data-refresh";
import {
  createInvoicePayloadFromQuote,
  parseSavedInvoicePayload,
  serializeInvoicePayload,
  type CustomerInvoicePayload
} from "@/lib/invoices/payload";
import type { AcrexUserSettings } from "@/lib/settings/user-settings";
import type { ClientRecord, InvoiceFormState, InvoiceRecord, InvoiceStatus, QuoteItemRecord, QuoteRecord } from "@/lib/projects/types";

type InvoicesPageProps = {
  userId: string;
  userEmail: string;
  quotes: QuoteRecord[];
  quoteLines: QuoteItemRecord[];
  invoiceLines: Array<Record<string, unknown>>;
  clients: ClientRecord[];
  settings: AcrexUserSettings;
  invoices: InvoiceRecord[];
  initialQuoteId?: string | null;
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

type InvoicePolishSuggestion = {
  lineDescriptions: string[];
  customerNotes: string;
  paymentTerms: string;
  scopeSummary: string;
};

function getReadableInvoiceError(message: string) {
  if (message.includes("public.invoices") || message.includes("invoices")) {
    return "Invoice storage is not set up yet. Apply supabase/schema.sql in Supabase, then refresh this page.";
  }

  if (message.includes("public.quotes") || message.includes("quotes")) {
    return "Quote storage needs the latest schema before invoices can be created.";
  }

  return message;
}

export function InvoicesPage({
  userId,
  userEmail,
  quotes,
  quoteLines,
  invoiceLines,
  clients,
  settings,
  invoices,
  initialQuoteId,
  errorMessage
}: InvoicesPageProps) {
  const [view, setView] = useState<"workspace" | "saved">("workspace");
  const [savedSearch, setSavedSearch] = useState("");
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [formState, setFormState] = useState<InvoiceFormState>(() => ({
    ...emptyInvoiceForm,
    quoteId: initialQuoteId && quotes.some((quote) => quote.id === initialQuoteId) ? initialQuoteId : ""
  }));
  const [savedInvoices, setSavedInvoices] = useState<InvoiceRecord[]>(invoices);
  const [message, setMessage] = useState<string | null>(errorMessage ? getReadableInvoiceError(errorMessage) : null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [invoicePayload, setInvoicePayload] = useState<CustomerInvoicePayload | null>(() => {
    const quote = initialQuoteId ? quotes.find((item) => item.id === initialQuoteId) : null;
    return quote
      ? createInvoicePayloadFromQuote({
          quote,
          quoteLines: quoteLines.filter((line) => line.quote_id === quote.id),
          client: clients.find((client) => client.id === quote.client_id) ?? null,
          settings
        })
      : null;
  });
  const [polishState, setPolishState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [polishMessage, setPolishMessage] = useState("");
  const [polishSuggestion, setPolishSuggestion] = useState<InvoicePolishSuggestion | null>(null);
  useAcrexDataRefresh();

  useEffect(() => {
    setSavedInvoices(invoices);
  }, [invoices]);

  useEffect(() => {
    if (formState.quoteId && !quotes.some((quote) => quote.id === formState.quoteId)) {
      setFormState((current) => ({ ...current, quoteId: "" }));
      setMessage("The selected quote was deleted. Invoice setup was cleared.");
    }
  }, [formState.quoteId, quotes]);

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.id === formState.quoteId) ?? null,
    [formState.quoteId, quotes]
  );
  const filteredInvoices = useMemo(() => {
    const term = savedSearch.trim().toLowerCase();
    if (!term) return savedInvoices;
    return savedInvoices.filter((invoice) =>
      [
        invoice.invoice_number,
        invoice.client_name ?? "",
        invoice.project_name ?? "",
        invoice.address ?? "",
        invoice.status
      ].join(" ").toLowerCase().includes(term)
    );
  }, [savedInvoices, savedSearch]);

  function handleQuoteChange(quoteId: string) {
    setFormState((current) => ({
      ...current,
      quoteId,
      invoiceNumber: current.invoiceNumber || generateInvoiceNumber()
    }));
    const quote = quotes.find((item) => item.id === quoteId);
    if (quote) {
      setInvoicePayload(createInvoicePayloadFromQuote({
        quote,
        quoteLines: quoteLines.filter((line) => line.quote_id === quote.id),
        client: clients.find((client) => client.id === quote.client_id) ?? null,
        settings
      }));
    } else {
      setInvoicePayload(null);
    }
    setPolishSuggestion(null);
    setMessage(null);
  }

  function resetForm() {
    setActiveInvoiceId(null);
    setFormState({
      ...emptyInvoiceForm,
      invoiceNumber: generateInvoiceNumber(),
      dueDate: getDefaultDueDate()
    });
    setInvoicePayload(null);
    setPolishSuggestion(null);
  }

  function openSavedInvoice(invoice: InvoiceRecord) {
    const quote = quotes.find((item) => item.id === invoice.quote_id) ?? null;
    const fallback = quote
      ? createInvoicePayloadFromQuote({
          quote,
          quoteLines: quoteLines.filter((line) => line.quote_id === quote.id),
          client: clients.find((client) => client.id === quote.client_id) ?? null,
          settings
        })
      : {
          version: 1 as const,
          invoiceDate: invoice.created_at.slice(0, 10),
          customer: { name: invoice.client_name || "Customer", email: "", phone: "", address: "" },
          company: { ...settings.company },
          projectName: invoice.project_name || "Project",
          projectAddress: invoice.address || "",
          lineItems: invoiceLines.filter((line) => line.invoice_id === invoice.id).map((line, index) => ({
            id: String(line.id ?? index),
            quoteLineItemId: typeof line.quote_line_item_id === "string" ? line.quote_line_item_id : null,
            name: String(line.name ?? "Service"),
            description: String(line.description ?? ""),
            quantity: Number(line.quantity) || 0,
            unit: String(line.unit ?? "each"),
            unitPrice: Number(line.unit_price) || 0,
            total: Number(line.total) || 0
          })),
          subtotal: invoice.total,
          discount: 0,
          tax: 0,
          amountPaid: invoice.status === "Paid" ? invoice.total : 0,
          depositRequired: 0,
          total: invoice.total,
          balanceDue: invoice.status === "Paid" ? 0 : invoice.total,
          paymentTerms: settings.quoteDefaults.terms,
          customerNotes: "",
          scopeSummary: "",
          thankYouMessage: "Thank you for your business."
        };
    setActiveInvoiceId(invoice.id);
    setFormState({
      quoteId: invoice.quote_id,
      invoiceNumber: invoice.invoice_number,
      dueDate: invoice.due_date ?? "",
      status: invoice.status,
      notes: ""
    });
    setInvoicePayload(parseSavedInvoicePayload(invoice, fallback));
    setPolishSuggestion(null);
    setView("workspace");
    setMessage(`Editing invoice ${invoice.invoice_number}.`);
  }

  async function polishInvoice() {
    if (!invoicePayload || polishState === "loading") return;
    setPolishState("loading");
    setPolishMessage("AcreX is reviewing customer-facing wording.");
    setPolishSuggestion(null);
    try {
      const response = await fetch("/api/ai/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: invoicePayload.lineItems.map(({ name, description, quantity, unit }) => ({
            name,
            description,
            quantity,
            unit
          })),
          customerNotes: invoicePayload.customerNotes,
          paymentTerms: invoicePayload.paymentTerms,
          scopeSummary: invoicePayload.scopeSummary
        })
      });
      const data = await response.json() as { suggestion?: InvoicePolishSuggestion; error?: string };
      if (!response.ok || !data.suggestion) {
        setPolishState("error");
        setPolishMessage(data.error || "AI service unavailable");
        return;
      }
      setPolishSuggestion(data.suggestion);
      setPolishState("ready");
      setPolishMessage("Wording suggestions are ready. Prices and quantities were not changed.");
    } catch {
      setPolishState("error");
      setPolishMessage("AI service unavailable");
    }
  }

  function applyPolishSuggestion() {
    if (!invoicePayload || !polishSuggestion) return;
    setInvoicePayload({
      ...invoicePayload,
      lineItems: invoicePayload.lineItems.map((line, index) => ({
        ...line,
        description: polishSuggestion.lineDescriptions[index] || line.description
      })),
      customerNotes: polishSuggestion.customerNotes,
      paymentTerms: polishSuggestion.paymentTerms,
      scopeSummary: polishSuggestion.scopeSummary
    });
    setPolishSuggestion(null);
    setPolishState("idle");
    setPolishMessage("Invoice wording applied. Review before saving.");
  }

  const currentEmailHref = invoicePayload?.customer.email
    ? `mailto:${encodeURIComponent(invoicePayload.customer.email)}?subject=${encodeURIComponent(`Invoice ${formState.invoiceNumber}`)}&body=${encodeURIComponent(
        [
          `Hello ${invoicePayload.customer.name},`,
          "",
          `Invoice ${formState.invoiceNumber} for ${invoicePayload.projectName}`,
          `Balance due: ${formatCurrency(invoicePayload.balanceDue)}`,
          `Due date: ${formatDate(formState.dueDate)}`,
          "",
          invoicePayload.customerNotes || invoicePayload.scopeSummary,
          "",
          invoicePayload.paymentTerms,
          "",
          `${invoicePayload.company.name || "AcreX contractor"}`
        ].filter(Boolean).join("\n")
      )}`
    : null;

  async function handleSaveInvoice() {
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    if (!selectedQuote || !invoicePayload) {
      setMessage("Select a quote before saving an invoice.");
      return;
    }

    if (!formState.invoiceNumber.trim()) {
      setMessage("Invoice number is required.");
      return;
    }

    setIsSaving(true);

    const payload = {
      ...(activeInvoiceId ? { id: activeInvoiceId } : {}),
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
      total: invoicePayload.total,
      notes: serializeInvoicePayload(invoicePayload)
    };

    const { data, error } = await saveInvoice(
      supabase,
      payload,
      invoicePayload.lineItems.map((line, index) => ({
        quote_line_item_id: line.quoteLineItemId,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unitPrice,
        total: line.total,
        notes: "",
        sort_order: index
      }))
    );
    setIsSaving(false);

    if (error || !data) {
      setMessage(getReadableInvoiceError(error ?? "Invoice could not be saved."));
      return;
    }

    const savedInvoice = normalizeInvoice(data);
    setSavedInvoices((current) => [
      savedInvoice,
      ...current.filter((invoice) => invoice.id !== savedInvoice.id)
    ]);
    if (savedInvoice.status !== "Draft") {
      const { error: quoteStatusError } = await supabase
        .from("quotes")
        .update({ status: "Accepted" })
        .eq("id", savedInvoice.quote_id)
        .eq("user_id", userId);
      if (quoteStatusError) {
        await supabase.from("invoices").delete().eq("id", savedInvoice.id).eq("user_id", userId);
        setSavedInvoices((current) => current.filter((invoice) => invoice.id !== savedInvoice.id));
        setMessage("Invoice could not be linked to the quote status. The invoice save was rolled back.");
        return;
      }
    }
    setActiveInvoiceId(savedInvoice.id);
    setMessage(`✓ Invoice ${savedInvoice.invoice_number} saved and linked to quote ${selectedQuote.quote_number}.`);
    publishDataChange({
      type: "invoice-saved",
      projectId: savedInvoice.project_id,
      quoteId: savedInvoice.quote_id,
      invoiceId: savedInvoice.id
    });
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
    const { error: quoteStatusError } = await supabase
      .from("quotes")
      .update({ status: "Accepted" })
      .eq("id", updatedInvoice.quote_id)
      .eq("user_id", userId);
    if (quoteStatusError) {
      await supabase
        .from("invoices")
        .update({ status: invoice.status })
        .eq("id", invoice.id)
        .eq("user_id", userId);
      setMessage("Invoice status could not be synchronized to the linked quote. The prior invoice status was restored.");
      return;
    }
    setSavedInvoices((current) => current.map((item) => (item.id === updatedInvoice.id ? updatedInvoice : item)));
    setMessage(`✓ Invoice ${updatedInvoice.invoice_number} marked paid.`);
    publishDataChange({
      type: "invoice-updated",
      projectId: updatedInvoice.project_id,
      quoteId: updatedInvoice.quote_id,
      invoiceId: updatedInvoice.id
    });
  }

  async function handleDeleteInvoice(invoice: InvoiceRecord) {
    if (!window.confirm(`Delete draft invoice ${invoice.invoice_number}?`)) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }
    setDeletingInvoiceId(invoice.id);
    const result = await deleteDraftInvoice({ supabase, userId, invoice });
    setDeletingInvoiceId(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setSavedInvoices((current) => current.filter((item) => item.id !== invoice.id));
    if (activeInvoiceId === invoice.id) resetForm();
    setMessage("Invoice deleted.");
    publishDataChange({
      type: "invoice-deleted",
      projectId: invoice.project_id,
      quoteId: invoice.quote_id,
      invoiceId: invoice.id
    });
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

        <nav className="resource-view-tabs" aria-label="Invoice views">
          <button type="button" className={view === "workspace" ? "active" : ""} onClick={() => setView("workspace")}>
            Invoice Workspace
          </button>
          <button type="button" className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}>
            Saved Invoices <span>{savedInvoices.length}</span>
          </button>
        </nav>

        {message ? <p className="projects-error">{message}</p> : null}

        {view === "workspace" ? (
        <div className="invoice-customer-workspace">
          <section className="invoice-editor-panel">
            <div className="quote-card-heading">
              <div>
                <span>Invoice Editor</span>
                <strong>{selectedQuote ? `From ${selectedQuote.quote_number}` : "Create from a saved quote"}</strong>
              </div>
              <select aria-label="Invoice status" value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as InvoiceStatus }))}>
                {invoiceStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            <div className="quote-setup-grid">
              <label>Quote<select value={formState.quoteId} onChange={(event) => handleQuoteChange(event.target.value)}>
                <option value="">Choose saved quote...</option>
                {quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quote_number} · {quote.project_name || "No project"} · {formatCurrency(quote.total)}</option>)}
              </select></label>
              <label>Invoice Number<input value={formState.invoiceNumber} onChange={(event) => setFormState((current) => ({ ...current, invoiceNumber: event.target.value }))} /></label>
              <label>Invoice Date<input type="date" value={invoicePayload?.invoiceDate ?? ""} onChange={(event) => setInvoicePayload((current) => current ? { ...current, invoiceDate: event.target.value } : current)} /></label>
              <label>Due Date<input type="date" value={formState.dueDate} onChange={(event) => setFormState((current) => ({ ...current, dueDate: event.target.value }))} /></label>
            </div>
            {invoicePayload ? (
              <>
                <div className="invoice-customer-fields">
                  <label>Customer Name<input value={invoicePayload.customer.name} onChange={(event) => setInvoicePayload({ ...invoicePayload, customer: { ...invoicePayload.customer, name: event.target.value } })} /></label>
                  <label>Customer Email<input value={invoicePayload.customer.email} onChange={(event) => setInvoicePayload({ ...invoicePayload, customer: { ...invoicePayload.customer, email: event.target.value } })} /></label>
                  <label>Customer Phone<input value={invoicePayload.customer.phone} onChange={(event) => setInvoicePayload({ ...invoicePayload, customer: { ...invoicePayload.customer, phone: event.target.value } })} /></label>
                  <label>Customer Address<input value={invoicePayload.customer.address} onChange={(event) => setInvoicePayload({ ...invoicePayload, customer: { ...invoicePayload.customer, address: event.target.value } })} /></label>
                  <label>Amount Paid<input inputMode="decimal" value={invoicePayload.amountPaid} onChange={(event) => {
                    const amountPaid = Math.max(Number(event.target.value) || 0, 0);
                    setInvoicePayload({ ...invoicePayload, amountPaid, balanceDue: Math.max(invoicePayload.total - amountPaid, 0) });
                  }} /></label>
                </div>
                <div className="invoice-wording-editor">
                  {invoicePayload.lineItems.map((line, index) => (
                    <label key={line.id}>{line.name} description<textarea value={line.description} onChange={(event) => setInvoicePayload({
                      ...invoicePayload,
                      lineItems: invoicePayload.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item)
                    })} /></label>
                  ))}
                  <label>Scope Summary<textarea value={invoicePayload.scopeSummary} onChange={(event) => setInvoicePayload({ ...invoicePayload, scopeSummary: event.target.value })} /></label>
                  <label>Customer Notes<textarea value={invoicePayload.customerNotes} onChange={(event) => setInvoicePayload({ ...invoicePayload, customerNotes: event.target.value })} /></label>
                  <label>Payment Terms<textarea value={invoicePayload.paymentTerms} onChange={(event) => setInvoicePayload({ ...invoicePayload, paymentTerms: event.target.value })} /></label>
                </div>
                <div className="invoice-polish-actions">
                  <button type="button" onClick={() => void polishInvoice()} disabled={polishState === "loading"}>
                    {polishState === "loading" ? "Polishing…" : "Polish Invoice"}
                  </button>
                  <small>{polishMessage || "AI improves wording only. Prices, quantities, and totals stay unchanged."}</small>
                </div>
                {polishSuggestion ? (
                  <section className="invoice-polish-review">
                    <strong>Suggested wording changes</strong>
                    <p>{polishSuggestion.scopeSummary || polishSuggestion.customerNotes || "Professional wording is ready."}</p>
                    <div><button type="button" onClick={applyPolishSuggestion}>Apply Wording</button><button type="button" className="secondary" onClick={() => setPolishSuggestion(null)}>Ignore</button></div>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="projects-empty-state"><strong>Select a saved quote</strong><span>AcreX will create a customer-safe invoice with the quote line items and totals.</span></div>
            )}
          </section>

          <section className="invoice-preview-shell">
            <div className="invoice-preview-actions">
              <button type="button" onClick={() => document.querySelector(".invoice-document")?.scrollIntoView({ behavior: "smooth" })} disabled={!invoicePayload}>Preview Invoice</button>
              <button type="button" onClick={() => window.print()} disabled={!invoicePayload}>Export PDF</button>
              <button type="button" onClick={() => window.print()} disabled={!invoicePayload}>Print</button>
              {currentEmailHref ? (
                <a href={currentEmailHref}>Email Invoice</a>
              ) : (
                <button type="button" disabled title="Add a customer email to enable email.">
                  Email Invoice · Add email first
                </button>
              )}
              <button className={isSaving ? "is-processing" : ""} type="button" onClick={handleSaveInvoice} disabled={isSaving || !invoicePayload}>
                {isSaving ? "Saving…" : activeInvoiceId ? "Update Invoice" : "Save Invoice"}
              </button>
            </div>
            {invoicePayload ? (
              <article className="invoice-document" aria-label="Invoice preview">
                <header>
                  <div className="invoice-brand"><strong>AcreX™</strong><span>{invoicePayload.company.name || "Professional Property Services"}</span></div>
                  <div><span>INVOICE</span><strong>{formState.invoiceNumber}</strong><small>{formState.status}</small></div>
                </header>
                <section className="invoice-parties">
                  <div><span>From</span><strong>{invoicePayload.company.name || "Contractor"}</strong><p>{invoicePayload.company.phone}<br />{invoicePayload.company.email}<br />{invoicePayload.company.website}</p></div>
                  <div><span>Bill To</span><strong>{invoicePayload.customer.name}</strong><p>{invoicePayload.customer.email}<br />{invoicePayload.customer.phone}<br />{invoicePayload.customer.address}</p></div>
                </section>
                <section className="invoice-project-reference"><div><span>Project</span><strong>{invoicePayload.projectName}</strong></div><div><span>Property</span><strong>{invoicePayload.projectAddress}</strong></div><div><span>Invoice Date</span><strong>{formatDate(invoicePayload.invoiceDate)}</strong></div><div><span>Due Date</span><strong>{formatDate(formState.dueDate)}</strong></div></section>
                {invoicePayload.scopeSummary ? <p className="invoice-scope-summary">{invoicePayload.scopeSummary}</p> : null}
                <section className="invoice-line-table">
                  <header><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></header>
                  {invoicePayload.lineItems.map((line) => <div key={line.id}><span><strong>{line.name}</strong><small>{line.description}</small></span><span>{line.quantity} {line.unit}</span><span>{formatCurrency(line.unitPrice)}</span><strong>{formatCurrency(line.total)}</strong></div>)}
                </section>
                <section className="invoice-total-block">
                  <div><span>Subtotal</span><strong>{formatCurrency(invoicePayload.subtotal)}</strong></div>
                  {invoicePayload.discount > 0 ? <div><span>Discount</span><strong>-{formatCurrency(invoicePayload.discount)}</strong></div> : null}
                  {invoicePayload.tax > 0 ? <div><span>Tax</span><strong>{formatCurrency(invoicePayload.tax)}</strong></div> : null}
                  <div><span>Total</span><strong>{formatCurrency(invoicePayload.total)}</strong></div>
                  {invoicePayload.depositRequired > 0 ? <div><span>Deposit / Payment Requested</span><strong>{formatCurrency(invoicePayload.depositRequired)}</strong></div> : null}
                  {invoicePayload.amountPaid > 0 ? <div><span>Amount Paid</span><strong>-{formatCurrency(invoicePayload.amountPaid)}</strong></div> : null}
                  <div className="balance"><span>Balance Due</span><strong>{formatCurrency(invoicePayload.balanceDue)}</strong></div>
                </section>
                <section className="invoice-customer-copy">{invoicePayload.customerNotes ? <div><strong>Notes</strong><p>{invoicePayload.customerNotes}</p></div> : null}{invoicePayload.paymentTerms ? <div><strong>Payment Terms</strong><p>{invoicePayload.paymentTerms}</p></div> : null}<p>{invoicePayload.thankYouMessage}</p></section>
                <footer>Generated with AcreX™</footer>
              </article>
            ) : <div className="invoice-preview-empty">Select a quote to generate the customer invoice preview.</div>}
          </section>
        </div>
        ) : null}

        {view === "saved" ? (
        <section className="invoices-table-card">
          <div className="quote-card-heading">
            <div>
              <span>Saved Invoices</span>
              <strong>{savedInvoices.length} invoice{savedInvoices.length === 1 ? "" : "s"}</strong>
            </div>
            <input type="search" value={savedSearch} onChange={(event) => setSavedSearch(event.target.value)} placeholder="Search invoices..." />
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

            {filteredInvoices.length ? (
              filteredInvoices.map((invoice) => (
                <article className="invoice-row" key={invoice.id}>
                  <strong>{invoice.invoice_number}</strong>
                  <span>{invoice.client_name || "No client"}</span>
                  <span>{invoice.project_name || "No project"}</span>
                  <span className={`project-status-pill invoice-status-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
                  <span>{formatDate(invoice.due_date)}</span>
                  <span>{formatCurrency(invoice.total)}</span>
                  <div className="invoice-row-actions">
                    <button type="button" onClick={() => openSavedInvoice(invoice)}>Open / Edit</button>
                    {invoice.project_id ? <Link href={`/projects/${invoice.project_id}`}>Project</Link> : null}
                    <Link href={`/quotes?quote=${encodeURIComponent(invoice.quote_id)}`}>Quote</Link>
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
                    {invoice.status === "Draft" ? (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDeleteInvoice(invoice)}
                        disabled={deletingInvoiceId === invoice.id}
                      >
                        {deletingInvoiceId === invoice.id ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
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
        ) : null}
      </section>
      <MobileAppNav active="invoices" />
    </main>
  );
}
