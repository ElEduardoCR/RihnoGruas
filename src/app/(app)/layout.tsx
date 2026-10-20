import { Suspense } from "react";
import { MobileNav, MobileNavView, Sidebar, SidebarView } from "@/components/app-nav";
import { hasOpenAI, hasWhatsApp, isDemo } from "@/lib/env";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const mode = { demo: isDemo, whatsapp: hasWhatsApp, ai: hasOpenAI };
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<SidebarView mode={mode} pathname="" />}>
        <Sidebar mode={mode} />
      </Suspense>
      <div className="min-w-0 flex-1">
        <Suspense fallback={<MobileNavView pathname="" />}>
          <MobileNav />
        </Suspense>
        <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
      </div>
    </div>
  );
}
