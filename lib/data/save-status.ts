export type SaveStatus = "idle" | "saving" | "saved" | "error";

export const saveStatusLabel: Record<SaveStatus, string> = {
  idle: "Saved",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed"
};

export function saveStatusFromError(error: unknown): SaveStatus {
  return error ? "error" : "saved";
}
