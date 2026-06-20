import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash"] as const;
const responseSchema = {
  type: "OBJECT",
  properties: {
    lineDescriptions: { type: "ARRAY", items: { type: "STRING" } },
    customerNotes: { type: "STRING" },
    paymentTerms: { type: "STRING" },
    scopeSummary: { type: "STRING" }
  },
  required: ["lineDescriptions", "customerNotes", "paymentTerms", "scopeSummary"]
};

function text(value: unknown, limit = 4000) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log in again to polish this invoice." }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI Estimator is not configured yet" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const lines = Array.isArray(body.lineItems)
    ? body.lineItems.slice(0, 75).map((line) => {
        const item = line as Record<string, unknown>;
        return {
          name: text(item.name, 200),
          description: text(item.description, 800),
          quantity: Number(item.quantity) || 0,
          unit: text(item.unit, 60)
        };
      })
    : [];
  if (!lines.length) return NextResponse.json({ error: "Add invoice line items before polishing." }, { status: 400 });

  const prompt = `Polish customer-facing invoice wording only.
Return one line description for every input line in the same order.
Improve plain-language professionalism for line descriptions, customer notes, payment terms, and scope summary.
Remove internal assumptions, confidence scores, profit/margin language, debug wording, irrelevant questions, deleted-drawing references, and contractor-only notes.
Do not add prices, change quantities, change units, add services, or make promises not supported by the input.

Invoice:
${JSON.stringify({
  lineItems: lines,
  customerNotes: text(body.customerNotes),
  paymentTerms: text(body.paymentTerms),
  scopeSummary: text(body.scopeSummary)
})}`;

  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema }
      }),
      cache: "no-store"
    });
    if (!response.ok) continue;
    const provider = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = provider.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) continue;
    try {
      const suggestion = JSON.parse(raw) as {
        lineDescriptions?: unknown[];
        customerNotes?: unknown;
        paymentTerms?: unknown;
        scopeSummary?: unknown;
      };
      if (!Array.isArray(suggestion.lineDescriptions) || suggestion.lineDescriptions.length !== lines.length) continue;
      return NextResponse.json({
        suggestion: {
          lineDescriptions: suggestion.lineDescriptions.map((item) => text(item, 800)),
          customerNotes: text(suggestion.customerNotes),
          paymentTerms: text(suggestion.paymentTerms),
          scopeSummary: text(suggestion.scopeSummary)
        }
      });
    } catch {
      continue;
    }
  }
  return NextResponse.json({ error: "Invalid AI response" }, { status: 502 });
}
