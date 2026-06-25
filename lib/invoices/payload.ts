import type { ClientRecord, InvoiceRecord, QuoteItemRecord, QuoteRecord } from "@/lib/projects/types";
import type { AcrexUserSettings } from "@/lib/settings/user-settings";
import { customerSafeText } from "@/lib/customer-facing-text";

export type CustomerInvoiceLine = {
  id: string;
  quoteLineItemId: string | null;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export type CustomerInvoicePayload = {
  version: 1;
  invoiceDate: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  company: {
    name: string;
    phone: string;
    email: string;
    website: string;
    logoUrl: string;
  };
  projectName: string;
  projectAddress: string;
  lineItems: CustomerInvoiceLine[];
  subtotal: number;
  discount: number;
  tax: number;
  amountPaid: number;
  depositRequired: number;
  total: number;
  balanceDue: number;
  paymentTerms: string;
  customerNotes: string;
  scopeSummary: string;
  thankYouMessage: string;
};

type QuotePayload = {
  lineItems?: Array<{
    serviceName?: string;
    description?: string;
    sourceMeasurement?: string;
    sourceDeleted?: boolean;
  }>;
  customerNotes?: string;
  paymentTerms?: string;
  scopeOfWork?: string;
  discount?: number;
  depositRequired?: number;
  totals?: { tax?: number; grandTotal?: number };
};

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cleanCustomerText(value: unknown) {
  return customerSafeText(value);
}

export function parseQuoteCustomerPayload(quote: QuoteRecord): QuotePayload {
  if (!quote.notes) return {};
  try {
    const payload = JSON.parse(quote.notes) as QuotePayload;
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return { customerNotes: cleanCustomerText(quote.notes) };
  }
}

export function createInvoicePayloadFromQuote(input: {
  quote: QuoteRecord;
  quoteLines: QuoteItemRecord[];
  client?: ClientRecord | null;
  settings: AcrexUserSettings;
}): CustomerInvoicePayload {
  const quotePayload = parseQuoteCustomerPayload(input.quote);
  const deletedSources = new Set(
    (quotePayload.lineItems ?? [])
      .filter((line) => line.sourceDeleted)
      .flatMap((line) => [line.sourceMeasurement, line.serviceName].filter((value): value is string => Boolean(value)))
  );
  const lineItems = input.quoteLines
    .filter((line) =>
      !(line as QuoteItemRecord & { source_deleted?: boolean }).source_deleted &&
      !deletedSources.has(line.zone_name ?? "") &&
      !deletedSources.has(line.service)
    )
    .map((line) => ({
      id: line.id,
      quoteLineItemId: line.id,
      name: cleanCustomerText(line.service) || "Service",
      description: cleanCustomerText(line.description || line.notes || ""),
      quantity: numberValue(line.quantity),
      unit: line.unit || "each",
      unitPrice: numberValue(line.unit_price),
      total: numberValue(line.total)
    }));
  const total = numberValue(quotePayload.totals?.grandTotal) || numberValue(input.quote.total);
  const discount = numberValue(quotePayload.discount);
  const tax = numberValue(quotePayload.totals?.tax);
  const amountPaid = 0;
  const rawSubtotal = lineItems.reduce((sum, line) => sum + line.total, 0);
  const visibleTotalBeforeAdjustment = rawSubtotal + tax - discount;
  const adjustmentAmount = Number((total - visibleTotalBeforeAdjustment).toFixed(2));
  const shouldShowAdjustment = Math.abs(adjustmentAmount) >= 0.01;
  const invoiceLineItems = shouldShowAdjustment
    ? [
        ...lineItems,
        {
          id: "service-minimum-adjustment",
          quoteLineItemId: null,
          name: adjustmentAmount > 0 ? "Service Minimum Adjustment" : "Quote Adjustment",
          description: adjustmentAmount > 0
            ? "Professional service minimum applied to cover mobilization, setup, and minimum job requirements."
            : "Customer-facing quote adjustment applied to the final invoice total.",
          quantity: 1,
          unit: "each",
          unitPrice: adjustmentAmount,
          total: adjustmentAmount
        }
      ]
    : lineItems;
  const subtotal = invoiceLineItems.reduce((sum, line) => sum + line.total, 0);

  return {
    version: 1,
    invoiceDate: new Date().toISOString().slice(0, 10),
    customer: {
      name: input.client?.name || input.quote.client_name || "Customer",
      email: input.client?.email || "",
      phone: input.client?.phone || "",
      address: input.client?.address || input.quote.address || ""
    },
    company: { ...input.settings.company },
    projectName: input.quote.project_name || "Project",
    projectAddress: input.quote.address || "",
    lineItems: invoiceLineItems,
    subtotal,
    discount,
    tax,
    amountPaid,
    depositRequired: numberValue(quotePayload.depositRequired),
    total,
    balanceDue: Math.max(total - amountPaid, 0),
    paymentTerms: cleanCustomerText(quotePayload.paymentTerms || input.settings.quoteDefaults.terms),
    customerNotes: cleanCustomerText(quotePayload.customerNotes || input.settings.quoteDefaults.notes),
    scopeSummary: cleanCustomerText(quotePayload.scopeOfWork),
    thankYouMessage: "Thank you for your business."
  };
}

export function parseSavedInvoicePayload(
  invoice: InvoiceRecord,
  fallback: CustomerInvoicePayload
): CustomerInvoicePayload {
  if (!invoice.notes) return fallback;
  try {
    const parsed = JSON.parse(invoice.notes) as { customerInvoice?: Partial<CustomerInvoicePayload> };
    if (!parsed.customerInvoice) return fallback;
    return {
      ...fallback,
      ...parsed.customerInvoice,
      customer: { ...fallback.customer, ...(parsed.customerInvoice.customer ?? {}) },
      company: { ...fallback.company, ...(parsed.customerInvoice.company ?? {}) },
      lineItems: Array.isArray(parsed.customerInvoice.lineItems)
        ? parsed.customerInvoice.lineItems
        : fallback.lineItems
    };
  } catch {
    return { ...fallback, customerNotes: cleanCustomerText(invoice.notes) };
  }
}

export function serializeInvoicePayload(payload: CustomerInvoicePayload) {
  return JSON.stringify({ customerInvoice: payload });
}
