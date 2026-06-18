import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: {
    panel?: string;
  };
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  if (searchParams?.panel === "settings") {
    redirect("/settings");
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    redirect("/login?setup=supabase");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell userId={user.id} userEmail={user.email ?? "Contractor"} />;
}
