"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CalendarDays, ClipboardCheck, FolderCog, LayoutGrid, LogOut, MessageCircle, UserRound } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { CraneIcon, RhinoMark } from "./brand";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/gruas", label: "Flota y equipos", icon: CraneIcon },
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/checklists", label: "Checklists", icon: ClipboardCheck },
  { href: "/agente", label: "Agente Rhino", icon: MessageCircle },
  { href: "/catalogos", label: "Catálogos", icon: FolderCog },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type Mode = { demo: boolean; whatsapp: boolean; ai: boolean };

export function Sidebar({ mode }: { mode: Mode }) {
  return <SidebarView mode={mode} pathname={usePathname()} />;
}

/** Vista pura (sirve también de fallback mientras se resuelve la ruta). */
export function SidebarView({ mode, pathname }: { mode: Mode; pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-night px-3 py-5 text-white lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 px-3">
        <RhinoMark />
        <div className="leading-tight">
          <div className="font-display text-[17px] font-semibold tracking-tight">Rhino</div>
          <div className="text-[12px] text-white/50">Gestión de flotilla</div>
        </div>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition",
                active ? "bg-white/[0.09] text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-rhino-500" />}
              <Icon className="size-[18px]" strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2">
        <div className="rounded-2xl bg-white/[0.06] p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <span className={cx("size-2 rounded-full", mode.whatsapp ? "bg-[#25D366]" : "bg-warn-mid")} />
            WhatsApp {mode.whatsapp ? "conectado" : "simulado"}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-white/50">
            {mode.ai ? "El agente responde y decide con IA." : "Sin OPENAI_API_KEY: el agente usa respuestas por reglas."}
          </p>
        </div>
        {mode.demo ? (
          <div className="rounded-2xl border border-rhino-500/40 bg-rhino-500/10 px-4 py-3 text-[12px] leading-snug text-white/80">
            <span className="font-semibold text-rhino-400">Modo demo.</span> Datos en memoria. Configura Supabase para producción.
          </div>
        ) : (
          <div>
            <Link href="/cuenta" className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-[13px] text-white/50 hover:bg-white/5 hover:text-white">
              <UserRound className="size-4" /> Mi cuenta
            </Link>
            <form action={signOutAction}>
              <button className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-[13px] text-white/50 hover:bg-white/5 hover:text-white">
                <LogOut className="size-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}

export function MobileNav() {
  return <MobileNavView pathname={usePathname()} />;
}

export function MobileNavView({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-black/5 bg-white/80 px-4 backdrop-blur-xl lg:hidden">
        <RhinoMark className="size-8" />
        <span className="font-display text-[17px] font-semibold">Rhino</span>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-black/5 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", active ? "text-rhino-600" : "text-muted")}>
              <Icon className="size-5" strokeWidth={1.8} />
              <span className="truncate">{label.replace("Agente ", "")}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
