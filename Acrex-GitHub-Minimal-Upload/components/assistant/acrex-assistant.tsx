"use client";

import { FormEvent, useMemo, useState } from "react";

export type AssistantProjectContext = {
  projectName: string;
  address: string;
  parcelAcres: number;
  grassAcres: number;
  brushAcres: number;
  drivewayAcres: number;
  excludedAcres: number;
  netBillableAcres: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AcrexAssistantProps = {
  projectContext: AssistantProjectContext;
};

function createMessageId() {
  return `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatAcres(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function AcrexAssistant({ projectContext }: AcrexAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask about pricing, quote wording, scope notes, or contractor questions for this project."
    }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const contextSummary = useMemo(
    () => [
      `Parcel ${formatAcres(projectContext.parcelAcres)} ac`,
      `Grass ${formatAcres(projectContext.grassAcres)} ac`,
      `Brush ${formatAcres(projectContext.brushAcres)} ac`,
      `Driveway ${formatAcres(projectContext.drivewayAcres)} ac`,
      `Net ${formatAcres(projectContext.netBillableAcres)} ac`
    ],
    [projectContext]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || isSending) return;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: question
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectContext,
          messages: nextMessages
            .filter((message) => message.id !== "welcome")
            .map((message) => ({
              role: message.role,
              content: message.content
            }))
        })
      });

      const data = (await response.json()) as { answer?: string; error?: string };
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: data.answer || data.error || "Acrex Assistant could not respond right now."
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: "Acrex Assistant could not connect. Check the server and try again."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className={`acrex-assistant${isOpen ? " is-open" : ""}`}>
      {isOpen ? (
        <section className="assistant-panel" aria-label="Acrex Assistant chat">
          <header className="assistant-header">
            <div>
              <span>Acrex Assistant</span>
              <strong>Project-aware help</strong>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close Acrex Assistant">
              ×
            </button>
          </header>

          <div className="assistant-context">
            <strong>{projectContext.address || "No address selected"}</strong>
            <span>{contextSummary.join(" · ")}</span>
          </div>

          <div className="assistant-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`assistant-message ${message.role}`} key={message.id}>
                {message.content}
              </div>
            ))}
            {isSending ? <div className="assistant-message assistant">Thinking...</div> : null}
          </div>

          <p className="assistant-disclaimer">AI suggestions are estimates. Verify pricing and measurements.</p>

          <form className="assistant-input-row" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about pricing or quote wording..."
              disabled={isSending}
            />
            <button type="submit" disabled={isSending || !input.trim()} aria-label="Send message">
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button className="assistant-fab" type="button" onClick={() => setIsOpen((current) => !current)} aria-label="Open Acrex Assistant">
        AI
      </button>
    </div>
  );
}
