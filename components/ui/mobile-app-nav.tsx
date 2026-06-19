"use client";

import Link from "next/link";
import { useState } from "react";
import type { AppSidebarKey } from "@/components/ui/app-sidebar";

type MobileAppNavProps = {
  active: AppSidebarKey;
};

const primaryItems = [
  { key: "map", label: "Map", href: "/dashboard", glyph: "⌖" },
  { key: "projects", label: "Projects", href: "/projects", glyph: "▣" },
  { key: "quotes", label: "Quotes", href: "/quotes", glyph: "$" },
  { key: "clients", label: "Clients", href: "/clients", glyph: "◎" }
] as const;

const moreItems = [
  { key: "drawings", label: "Drawings", href: "/drawings" },
  { key: "invoices", label: "Invoices", href: "/invoices" },
  { key: "exports", label: "Exports", href: "/exports" },
  { key: "settings", label: "Settings", href: "/settings" },
  { key: "account", label: "Account", href: "/settings?tab=account" }
] as const;

export function MobileAppNav({ active }: MobileAppNavProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = moreItems.some((item) => item.key === active);

  return (
    <>
      {isMoreOpen ? (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close more navigation"
          onClick={() => setIsMoreOpen(false)}
        />
      ) : null}

      <section className={`mobile-more-menu${isMoreOpen ? " is-open" : ""}`} aria-label="More navigation">
        <div>
          <span>More</span>
          <strong>Workspace</strong>
        </div>
        <nav>
          {moreItems.map((item) => (
            <Link
              href={item.href}
              key={item.key}
              className={active === item.key ? "active" : undefined}
              onClick={() => setIsMoreOpen(false)}
            >
              <span>{item.label}</span>
              <i aria-hidden="true">›</i>
            </Link>
          ))}
        </nav>
      </section>

      <nav className="mobile-app-nav" aria-label="Mobile app navigation">
        {primaryItems.map((item) => (
          <Link className={active === item.key ? "active" : undefined} href={item.href} key={item.key}>
            <i aria-hidden="true">{item.glyph}</i>
            <span>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={isMoreOpen || isMoreActive ? "active" : undefined}
          aria-expanded={isMoreOpen}
          onClick={() => setIsMoreOpen((current) => !current)}
        >
          <i aria-hidden="true">•••</i>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
