import Link from "next/link";
import { AcrexLogo } from "@/components/ui/acrex-logo";

export type AppSidebarKey =
  | "map"
  | "projects"
  | "quotes"
  | "clients"
  | "drawings"
  | "invoices"
  | "exports"
  | "account"
  | "settings";

type AppSidebarProps = {
  active: AppSidebarKey;
  ariaLabel?: string;
};

const appSidebarItems: Array<{
  key: AppSidebarKey;
  label: string;
  href: string;
  icon: "map" | "folder" | "file" | "users" | "draw" | "receipt" | "export" | "account" | "gear";
}> = [
  { key: "map", label: "Map", href: "/dashboard", icon: "map" },
  { key: "projects", label: "Projects", href: "/projects", icon: "folder" },
  { key: "quotes", label: "Quotes", href: "/quotes", icon: "file" },
  { key: "clients", label: "Clients", href: "/clients", icon: "users" },
  { key: "drawings", label: "Drawings", href: "/dashboard?panel=measurements", icon: "draw" },
  { key: "invoices", label: "Invoices", href: "/invoices", icon: "receipt" },
  { key: "exports", label: "Exports", href: "/dashboard?panel=project&section=exports", icon: "export" },
  { key: "account", label: "Account", href: "/dashboard?panel=settings&section=account", icon: "account" },
  { key: "settings", label: "Settings", href: "/dashboard?panel=settings", icon: "gear" }
];

function AppSidebarIcon({ icon }: { icon: (typeof appSidebarItems)[number]["icon"] }) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      {icon === "map" ? (
        <path d="m3.2 5.2 4.2-1.7 5.2 2 4.2-1.7v11l-4.2 1.7-5.2-2-4.2 1.7v-11Z M7.4 3.5v11M12.6 5.5v11" {...commonProps} />
      ) : null}
      {icon === "folder" ? (
        <path d="M2.8 6.2h4.1l1.5 1.7H17v6.6A1.5 1.5 0 0 1 15.5 16H4.5A1.5 1.5 0 0 1 3 14.5V7.7c0-.8.6-1.5 1.5-1.5Z" {...commonProps} />
      ) : null}
      {icon === "file" ? (
        <path d="M6 2.8h5.3L16 7.5v9.1a1.4 1.4 0 0 1-1.4 1.4H6A1.4 1.4 0 0 1 4.6 16.6V4.2A1.4 1.4 0 0 1 6 2.8Z M11.2 2.8v4.5H16" {...commonProps} />
      ) : null}
      {icon === "users" ? (
        <>
          <path d="M7.3 9a2.3 2.3 0 1 0 0-4.6A2.3 2.3 0 0 0 7.3 9Z" {...commonProps} />
          <path d="M12.8 8.2a2 2 0 1 0 0-4" {...commonProps} />
          <path d="M3.8 15.7c.7-2 2.2-3 4.5-3 2.2 0 3.8 1 4.4 3" {...commonProps} />
          <path d="M12.5 12.8c1.4.1 2.4 1 3 2.9" {...commonProps} />
        </>
      ) : null}
      {icon === "draw" ? (
        <path d="M4 15.8 15.2 4.6a2 2 0 0 1 2.8 2.8L6.8 18.6H4v-2.8Z M13.6 6.2l2.2 2.2" {...commonProps} />
      ) : null}
      {icon === "receipt" ? (
        <>
          <path d="M5.3 3.3h9.4v13.4l-1.8-1-1.5 1-1.4-1-1.4 1-1.6-1-1.7 1V3.3Z" {...commonProps} />
          <path d="M7.3 7h5.4M7.3 10h5.4M7.3 13h3.4" {...commonProps} />
        </>
      ) : null}
      {icon === "export" ? (
        <path d="M10 3.2v8.2M6.8 6.4 10 3.2l3.2 3.2M4.1 11.2v3.4A2.2 2.2 0 0 0 6.3 16.8h7.4a2.2 2.2 0 0 0 2.2-2.2v-3.4" {...commonProps} />
      ) : null}
      {icon === "account" ? (
        <>
          <circle cx="10" cy="7" r="3" {...commonProps} />
          <path d="M4.7 16.8c.9-2.8 2.7-4.2 5.3-4.2s4.4 1.4 5.3 4.2" {...commonProps} />
        </>
      ) : null}
      {icon === "gear" ? (
        <>
          <circle cx="10" cy="10" r="2.5" {...commonProps} />
          <path d="M10 2.8v2.1M10 15.1v2.1M17.2 10h-2.1M4.9 10H2.8M15.1 4.9l-1.5 1.5M6.4 13.6l-1.5 1.5M15.1 15.1l-1.5-1.5M6.4 6.4 4.9 4.9" {...commonProps} />
        </>
      ) : null}
    </svg>
  );
}

export function AppSidebar({ active, ariaLabel = "App navigation" }: AppSidebarProps) {
  return (
    <>
      <AcrexLogo className="dashboard-brand projects-brand" priority />
      <nav className="sidebar-nav app-sidebar-nav" aria-label={ariaLabel}>
        {appSidebarItems.map((item) => (
          <Link className={active === item.key ? "active" : undefined} href={item.href} key={item.key}>
            <AppSidebarIcon icon={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
