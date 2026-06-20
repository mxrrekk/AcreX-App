import type { DrawingWrite } from "@/lib/data/storage";
import type { InvoiceRecord, ProjectRecord, QuoteItemRecord, QuoteRecord } from "@/lib/projects/types";

export type IntegrityIssueCode =
  | "quote_deleted_drawing"
  | "invoice_deleted_quote"
  | "orphaned_drawing"
  | "missing_pricing_defaults";

export type IntegrityIssue = {
  code: IntegrityIssueCode;
  severity: "warning" | "error";
  message: string;
  entityId?: string;
};

export function auditProjectIntegrity(input: {
  project: ProjectRecord;
  drawings: DrawingWrite[];
  quotes: QuoteRecord[];
  quoteLines: QuoteItemRecord[];
  invoices: InvoiceRecord[];
  pricingDefaults?: Record<string, unknown> | null;
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const drawingIds = new Set(input.drawings.map((drawing) => drawing.id));
  const quoteIds = new Set(input.quotes.map((quote) => quote.id));

  input.quoteLines.forEach((line) => {
    const sourceId = (line as QuoteItemRecord & { drawing_id?: string | null }).drawing_id;
    if (sourceId && !drawingIds.has(sourceId)) {
      issues.push({
        code: "quote_deleted_drawing",
        severity: "warning",
        entityId: line.id,
        message: `Quote line "${line.service}" references a deleted drawing.`
      });
    }
  });
  input.quotes.forEach((quote) => {
    if (!quote.notes) return;
    try {
      const payload = JSON.parse(quote.notes) as {
        lineItems?: Array<{ sourceDeleted?: boolean; sourceMeasurement?: string; serviceName?: string }>;
      };
      payload.lineItems?.filter((line) => line.sourceDeleted).forEach((line) => {
        issues.push({
          code: "quote_deleted_drawing",
          severity: "warning",
          entityId: quote.id,
          message: `Quote ${quote.quote_number} references deleted drawing "${line.sourceMeasurement || line.serviceName || "Unknown"}".`
        });
      });
    } catch {
      // Legacy plain-text quote notes do not carry source-link integrity metadata.
    }
  });

  input.invoices.forEach((invoice) => {
    if (!quoteIds.has(invoice.quote_id)) {
      issues.push({
        code: "invoice_deleted_quote",
        severity: "error",
        entityId: invoice.id,
        message: `Invoice ${invoice.invoice_number} references a deleted quote.`
      });
    }
  });

  input.drawings.forEach((drawing) => {
    if (drawing.project_id !== input.project.id) {
      issues.push({
        code: "orphaned_drawing",
        severity: "error",
        entityId: drawing.id,
        message: `Drawing "${drawing.name}" is not linked to its expected project.`
      });
    }
  });

  const pricingValues = Object.values(input.pricingDefaults ?? {});
  if (!pricingValues.some((value) => typeof value === "number" && value > 0)) {
    issues.push({
      code: "missing_pricing_defaults",
      severity: "warning",
      message: "No pricing defaults are available for this project estimate."
    });
  }

  return issues;
}
