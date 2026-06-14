import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantProjectContext = {
  projectName: string;
  address: string;
  parcelAcres: number;
  grassAcres: number;
  brushAcres: number;
  drivewayAcres: number;
  excludedAcres: number;
  netBillableAcres: number;
};

type AssistantRequest = {
  messages?: AssistantMessage[];
  projectContext?: AssistantProjectContext;
};

const fallbackContext: AssistantProjectContext = {
  projectName: "Untitled Project",
  address: "No address selected",
  parcelAcres: 0,
  grassAcres: 0,
  brushAcres: 0,
  drivewayAcres: 0,
  excludedAcres: 0,
  netBillableAcres: 0
};

const isAssistantEnabled = process.env.ACREX_AI_ASSISTANT_ENABLED === "true";

function sanitizeMessages(messages: AssistantMessage[] | undefined) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1600)
    }));
}

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sanitizeContext(context: AssistantProjectContext | undefined): AssistantProjectContext {
  if (!context) return fallbackContext;

  return {
    projectName: typeof context.projectName === "string" ? context.projectName.slice(0, 140) : fallbackContext.projectName,
    address: typeof context.address === "string" ? context.address.slice(0, 220) : fallbackContext.address,
    parcelAcres: sanitizeNumber(context.parcelAcres),
    grassAcres: sanitizeNumber(context.grassAcres),
    brushAcres: sanitizeNumber(context.brushAcres),
    drivewayAcres: sanitizeNumber(context.drivewayAcres),
    excludedAcres: sanitizeNumber(context.excludedAcres),
    netBillableAcres: sanitizeNumber(context.netBillableAcres)
  };
}

function getSystemPrompt(context: AssistantProjectContext) {
  return `You are Acrex Assistant, a concise estimating assistant for outdoor contractors.

Use the current project context:
- Project: ${context.projectName}
- Address: ${context.address}
- Parcel acres: ${context.parcelAcres}
- Grass acres: ${context.grassAcres}
- Brush acres: ${context.brushAcres}
- Driveway acres: ${context.drivewayAcres}
- Excluded acres: ${context.excludedAcres}
- Net billable acres: ${context.netBillableAcres}

Help with pricing, quote structure, estimate wording, scope notes, and contractor questions for forestry mulching, land clearing, dirt work, fencing, drainage, landscaping, irrigation, mowing, driveway prep, house pads, sod, and custom outdoor services.

Be practical and transparent. Do not claim measurements are guaranteed. Do not invent local laws, permits, material prices, or company policies. Encourage verification of pricing, measurements, site access, dump fees, material costs, and local requirements. Keep answers short enough to fit inside a chat panel.`;
}

function extractResponseText(data: unknown) {
  if (typeof data !== "object" || data === null) return "";
  if ("output_text" in data && typeof data.output_text === "string") return data.output_text;

  const output = "output" in data && Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (typeof item !== "object" || item === null || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content === "object" && content !== null && "text" in content && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Log in to use Acrex Assistant." }, { status: 401 });
  }

  if (!isAssistantEnabled) {
    return NextResponse.json({
      answer: "Acrex Assistant is coming soon. Pricing and wording suggestions are temporarily disabled."
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "Acrex Assistant is not configured yet. Add OPENAI_API_KEY to the server environment."
    });
  }

  let payload: AssistantRequest;
  try {
    payload = (await request.json()) as AssistantRequest;
  } catch {
    return NextResponse.json({ error: "Invalid assistant request." }, { status: 400 });
  }

  const context = sanitizeContext(payload.projectContext);
  const messages = sanitizeMessages(payload.messages);

  if (!messages.length || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "Send a question to Acrex Assistant." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: getSystemPrompt(context)
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        ],
        max_output_tokens: 650
      })
    });
  } catch {
    return NextResponse.json({ error: "Acrex Assistant could not connect right now." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Acrex Assistant could not respond right now." }, { status: 502 });
  }

  const data = await response.json();
  const answer = extractResponseText(data).trim();

  return NextResponse.json({
    answer: answer || "I could not generate a useful answer. Try asking again with a little more detail."
  });
}
