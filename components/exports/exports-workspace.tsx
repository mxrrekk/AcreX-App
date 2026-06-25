"use client";

import Link from "next/link";
import { useState } from "react";
import { UpgradePlanPrompt } from "@/components/billing/upgrade-plan-prompt";
import type { UsageGateResult } from "@/lib/billing/usage-gates";

type ExportProject = {
  id: string;
  project_name: string | null;
  address: string | null;
};

type ExportsWorkspaceProps = {
  projects: ExportProject[];
};

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase() || "acrex-project-backup.json";
}

export function ExportsWorkspace({ projects }: ExportsWorkspaceProps) {
  const [upgradePrompt, setUpgradePrompt] = useState<UsageGateResult | null>(null);
  const [message, setMessage] = useState("");

  async function exportProject(project: ExportProject) {
    setMessage(`Preparing ${project.project_name || project.address || "project"} backup…`);
    const response = await fetch(`/api/projects/${project.id}/export`);
    if (response.status === 402) {
      const data = await response.json().catch(() => ({}));
      setUpgradePrompt({
        allowed: false,
        plan: data.plan === "pro" || data.plan === "business" ? data.plan : "free",
        usage: data.usage ?? { projects: 0, quotes: 0, aiEstimates: 0, exports: 0, invoices: 0 },
        metric: "exports",
        message: data.error || "Upgrade to keep creating exports."
      });
      setMessage("");
      return;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.error || "Export could not be created.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFileName(`${project.project_name || project.address || "acrex-project"}-backup.json`);
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Export downloaded.");
  }

  return (
    <>
      <section className="exports-grid">
        <article>
          <span>Quote PDF</span>
          <strong>Export from a saved quote</strong>
          <p>Open a quote to prepare its customer-facing PDF when export is enabled.</p>
          <Link href="/quotes">Open Quotes</Link>
        </article>
        <article>
          <span>Project Backup</span>
          <strong>Portable, restore-ready JSON</strong>
          <p>Download projects with drawings, measurements, financial records, file metadata, settings, and integrity checks.</p>
          {projects.slice(0, 8).map((project) => (
            <button key={project.id} type="button" onClick={() => void exportProject(project)}>
              Export {project.project_name || project.address || "Project"}
            </button>
          ))}
          {!projects.length ? <div className="export-availability">Save a project before creating a backup.</div> : null}
          {message ? <div className="export-availability">{message}</div> : null}
        </article>
      </section>
      <UpgradePlanPrompt
        open={Boolean(upgradePrompt)}
        metric="exports"
        message={upgradePrompt?.message ?? "Upgrade to keep creating exports."}
        onClose={() => setUpgradePrompt(null)}
      />
    </>
  );
}
