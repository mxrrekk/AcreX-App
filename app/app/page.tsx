import { redirect } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NativeAppEntryPage() {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    redirect("/login?setup=supabase");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");

  return <PageLoading label="Opening AcreX" />;
}
