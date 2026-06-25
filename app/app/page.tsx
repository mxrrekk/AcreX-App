"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function NativeAppEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let canceled = false;

    async function openNativeWorkspace() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        router.replace("/login?setup=supabase");
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (canceled) return;
      router.replace(user ? "/dashboard" : "/login");
    }

    void openNativeWorkspace();

    return () => {
      canceled = true;
    };
  }, [router]);

  return <PageLoading label="Opening AcreX" />;
}
