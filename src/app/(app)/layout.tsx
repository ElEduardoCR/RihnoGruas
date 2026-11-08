import { Suspense } from "react";
import { MobileNav, MobileNavView, Sidebar, SidebarView } from "@/components/app-nav";
import { AppMain, AppMainView } from "@/components/app-shell";
import { env, hasOpenAI, hasWhatsApp, isDemo } from "@/lib/env";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const mode = { demo: isDemo, whatsapp: hasWhatsApp && Boolean(env.waVerifyToken && env.waAppSecret), ai: hasOpenAI };
  return (
    <div className="flex min-h-dvh">
      <a href="#main-content" className="sr-only fixed top-3 left-3 z-50 rounded-xl bg-ink px-4 py-3 text-white focus:not-sr-only focus:outline-2 focus:outline-offset-2 focus:outline-rhino-500">Ir al contenido</a>
      <Suspense fallback={<SidebarView mode={mode} pathname="" />}>
        <Sidebar mode={mode} />
      </Suspense>
      <div className="min-w-0 flex-1">
        <Suspense fallback={<MobileNavView mode={mode} pathname="" />}>
          <MobileNav mode={mode} />
        </Suspense>
        <Suspense fallback={<AppMainView>{children}</AppMainView>}>
          <AppMain>{children}</AppMain>
        </Suspense>
      </div>
    </div>
  );
}
