"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { PageLoading } from "@/components/ui/page-loading";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function NativeAppEntryPage() {
  const router = useRouter();
  const [isNativeLaunch, setIsNativeLaunch] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    let canceled = false;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let routeTimer: ReturnType<typeof setTimeout> | null = null;

    const isNative = Capacitor.isNativePlatform();
    setIsNativeLaunch(isNative);

    if (isNative) {
      requestAnimationFrame(() => {
        void SplashScreen.hide({ fadeOutDuration: 220 }).catch(() => undefined);
      });
    }

    async function openNativeWorkspace() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (isNative) {
          fadeTimer = setTimeout(() => setIsFading(true), 850);
          routeTimer = setTimeout(() => router.replace("/login?setup=supabase"), 1200);
        } else {
          router.replace("/login?setup=supabase");
        }
        return;
      }

      const sessionPromise = supabase.auth.getUser();
      const holdPromise = isNative ? new Promise((resolve) => setTimeout(resolve, 950)) : Promise.resolve();

      const [
        {
          data: { user }
        }
      ] = await Promise.all([sessionPromise, holdPromise]);

      if (canceled) return;

      const destination = user ? "/dashboard" : "/login";
      if (!isNative) {
        router.replace(destination);
        return;
      }

      setIsFading(true);
      routeTimer = setTimeout(() => {
        if (!canceled) router.replace(destination);
      }, 360);
    }

    void openNativeWorkspace();

    return () => {
      canceled = true;
      if (fadeTimer) clearTimeout(fadeTimer);
      if (routeTimer) clearTimeout(routeTimer);
    };
  }, [router]);

  if (isNativeLaunch) {
    return (
      <main className={`native-launch-splash${isFading ? " is-fading" : ""}`} aria-busy="true" aria-label="Opening AcreX Edge">
        <Image
          className="native-launch-logo"
          src="/assets/acrex-logo-transparent.png"
          alt="AcreX"
          width={360}
          height={104}
          priority
        />
      </main>
    );
  }

  return <PageLoading label="Opening AcreX" />;
}
