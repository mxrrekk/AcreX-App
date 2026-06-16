import { redirect } from "next/navigation";
import { QuotesPage } from "@/components/quotes/quotes-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function QuotesRoute() {
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

  return <QuotesPage userEmail={user.email ?? "Contractor"} />;
}
