import type { ProjectStatus, SavedProjectMapData } from "@/lib/projects/types";

export type ProjectChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
  updatedAt: string;
};

export type ProjectNoteType = "General" | "Customer Request" | "Pricing Change" | "Site Condition" | "Internal" | "Follow Up";

export type ProjectNote = {
  id: string;
  text: string;
  type: ProjectNoteType;
  createdAt: string;
  createdBy: string;
};

export type ProjectActivity = {
  id: string;
  action: string;
  description: string;
  entity: string;
  createdAt: string;
};

export type ProjectSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  projectName: string;
  address: string;
  measurements: {
    acres: number;
    squareFeet: number;
    perimeterFeet: number;
  } | null;
  mapData: SavedProjectMapData | null;
  estimate: {
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
  };
};

export type ProjectTagStore = Record<string, string[]>;

export const defaultProjectTags = [
  "Residential",
  "Commercial",
  "HOA",
  "Municipal",
  "Repeat Customer",
  "Urgent",
  "Large Job",
  "High Priority",
  "Follow Up Needed"
];

export const noteTypes: ProjectNoteType[] = ["General", "Customer Request", "Pricing Change", "Site Condition", "Internal", "Follow Up"];

export const checklistTemplates: Record<string, string[]> = {
  "Land Clearing": [
    "Call 811",
    "Verify access",
    "Check slope/drainage",
    "Confirm disposal plan",
    "Mobilize equipment",
    "Complete work",
    "Take after photos",
    "Send invoice"
  ],
  Mowing: [
    "Verify property boundaries",
    "Confirm gate access",
    "Mark excluded areas",
    "Complete service",
    "Send invoice"
  ],
  Fence: [
    "Measure linear feet",
    "Confirm property line",
    "Call 811",
    "Confirm gate locations",
    "Order material",
    "Install",
    "Invoice"
  ]
};

export function getProjectStorageKey(userEmail: string, projectId: string | null, kind: string) {
  return `acrex:${kind}:${userEmail}:${projectId ?? "draft"}`;
}

export function getGlobalStorageKey(userEmail: string, kind: string) {
  return `acrex:${kind}:${userEmail}`;
}

export function getDashboardDraftKey(userEmail: string) {
  return `acrex-dashboard-draft:${userEmail}`;
}

export function clearDeletedProjectLocalState(userEmail: string, projectId: string) {
  if (typeof window === "undefined") return;

  const projectKeys = ["checklist", "notes", "activity", "snapshots"].map((kind) =>
    getProjectStorageKey(userEmail, projectId, kind)
  );
  projectKeys.forEach((key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  });

  const draftKey = getDashboardDraftKey(userEmail);
  try {
    const storedDraft = window.localStorage.getItem(draftKey);
    if (storedDraft) {
      const draft = JSON.parse(storedDraft) as { activeProjectId?: string | null };
      if (draft.activeProjectId === projectId) {
        window.localStorage.removeItem(draftKey);
        window.sessionStorage.removeItem(draftKey);
      }
    }
  } catch {
    window.localStorage.removeItem(draftKey);
    window.sessionStorage.removeItem(draftKey);
  }

  const tagKey = getGlobalStorageKey(userEmail, "project-tags");
  try {
    const storedTags = window.localStorage.getItem(tagKey);
    if (storedTags) {
      const tags = JSON.parse(storedTags) as ProjectTagStore;
      if (Object.prototype.hasOwnProperty.call(tags, projectId)) {
        delete tags[projectId];
        window.localStorage.setItem(tagKey, JSON.stringify(tags));
      }
    }
  } catch {
    // Ignore malformed optional project metadata.
  }
}

export function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredValue<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function createChecklistFromService(serviceType: string): ProjectChecklistItem[] {
  const normalized = serviceType.toLowerCase();
  const template =
    normalized.includes("mow")
      ? checklistTemplates.Mowing
      : normalized.includes("fenc")
        ? checklistTemplates.Fence
        : checklistTemplates["Land Clearing"];

  return template.map((text) => ({
    id: crypto.randomUUID(),
    text,
    completed: false,
    updatedAt: new Date().toISOString()
  }));
}

export function getReadableProjectStatus(status: ProjectStatus) {
  return status;
}
