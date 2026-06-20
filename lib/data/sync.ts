export type AcrexDataChangeType =
  | "project-saved"
  | "project-metadata-saved"
  | "project-deleted"
  | "client-saved"
  | "client-deleted"
  | "settings-saved"
  | "drawing-saved"
  | "drawing-deleted"
  | "quote-saved"
  | "quote-deleted"
  | "invoice-saved"
  | "invoice-updated"
  | "invoice-deleted";

export type AcrexDataChange = {
  type: AcrexDataChangeType;
  projectId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  drawingIds?: string[];
  quoteId?: string | null;
  invoiceId?: string | null;
  occurredAt: string;
};

const eventName = "acrex:data-change";
const storageKey = "acrex:data-change";

export function publishDataChange(change: Omit<AcrexDataChange, "occurredAt">) {
  if (typeof window === "undefined") return;
  const event: AcrexDataChange = { ...change, occurredAt: new Date().toISOString() };

  window.dispatchEvent(new CustomEvent<AcrexDataChange>(eventName, { detail: event }));
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(event));
  } catch {
    // Cross-page refresh still works through the same-tab custom event.
  }

}

export function subscribeToDataChanges(listener: (change: AcrexDataChange) => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleCustomEvent = (event: Event) => {
    listener((event as CustomEvent<AcrexDataChange>).detail);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      listener(JSON.parse(event.newValue) as AcrexDataChange);
    } catch {
      // Ignore malformed optional cross-tab messages.
    }
  };
  window.addEventListener(eventName, handleCustomEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(eventName, handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
