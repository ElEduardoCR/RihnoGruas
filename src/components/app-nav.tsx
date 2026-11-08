"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CalendarDays, ClipboardCheck, FolderCog, LayoutGrid, LogOut, Menu, MessageSquare, Settings2, UserRound, X } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { CraneIcon, RhinoMark } from "./brand";
import { cx } from "./ui";

const ERP_NAV = [
  { href: "/resumen", label: "Resumen", icon: LayoutGrid },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/gruas", label: "Flota y equipos", icon: CraneIcon },
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/checklists", label: "Checklists", icon: ClipboardCheck },
  { href: "/catalogos", label: "Catálogos", icon: FolderCog },
];

const focusClass = "outline-none focus-visible:ring-2 focus-visible:ring-rhino-500 focus-visible:ring-offset-2";
const navClass = "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors";

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export type AppMode = { demo: boolean; whatsapp: boolean; ai: boolean };

type NavigationProps = { mode: AppMode; pathname: string; onNavigate?: () => void };

function Navigation({ mode, pathname, onNavigate }: NavigationProps) {
  return (
    <>
      <nav aria-label="Navegación principal" className="mt-5 space-y-6">
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={pathname === "/" ? "page" : undefined}
          className={cx(navClass, focusClass, "font-medium", pathname === "/" ? "bg-white text-ink shadow-[0_1px_4px_rgb(0_0_0/0.06)]" : "text-ink-2 hover:bg-black/[0.04]")}
        >
          <MessageSquare className="size-[18px] text-rhino-600" strokeWidth={1.8} aria-hidden />
          Asistente Rhino
        </Link>
        <div>
          <div className="mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Tu operación</div>
          <ul className="space-y-0.5">
            {ERP_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(navClass, focusClass, active ? "bg-black/[0.06] font-medium text-ink" : "text-ink-2 hover:bg-black/[0.04] hover:text-ink")}
                  >
                    <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <div className="mt-auto pt-8">
        <Link
          href="/agente"
          onClick={onNavigate}
          aria-current={isActive(pathname, "/agente") ? "page" : undefined}
          className={cx(navClass, focusClass, isActive(pathname, "/agente") ? "bg-black/[0.06] font-medium text-ink" : "text-ink-2 hover:bg-black/[0.04]")}
        >
          <Settings2 className="size-[18px]" strokeWidth={1.8} aria-hidden />
          Centro del agente
        </Link>
        <div className="mx-3 mt-4 border-t border-black/[0.07] pt-4 text-[12px] text-muted">
          <div className="flex items-center gap-2">
            <span className={cx("size-1.5 rounded-full", mode.whatsapp ? "bg-ok" : "bg-muted")} aria-hidden />
            WhatsApp {mode.whatsapp ? "configurado" : "sin configurar"}
          </div>
          <div className="mt-1.5 pl-3.5">{mode.ai ? "Asistencia con IA" : "Asistente básico"}</div>
        </div>
        {mode.demo ? (
          <div className="mx-3 mt-4 rounded-lg bg-white px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <span className="block font-medium text-ink-2">Modo demostración</span>
            Los cambios son de prueba.
          </div>
        ) : (
          <div className="mt-3">
            <Link href="/cuenta" onClick={onNavigate} className={cx(navClass, focusClass, "text-ink-2 hover:bg-black/[0.04]")}>
              <UserRound className="size-[18px]" strokeWidth={1.8} aria-hidden /> Mi cuenta
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={cx(navClass, focusClass, "w-full text-ink-2 hover:bg-black/[0.04]")}>
                <LogOut className="size-[18px]" strokeWidth={1.8} aria-hidden /> Cerrar sesión
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className={cx("flex w-fit items-center gap-2.5 rounded-lg", focusClass)} aria-label="Rhino, ir al asistente">
      <RhinoMark className="size-8" />
      <div className="leading-tight">
        <div className="font-display text-[18px] font-semibold tracking-tight">Rhino</div>
        <div className="mt-0.5 text-[11px] text-muted">Tu equipo, conectado.</div>
      </div>
    </Link>
  );
}

export function Sidebar({ mode }: { mode: AppMode }) {
  return <SidebarView mode={mode} pathname={usePathname()} />;
}

export function SidebarView({ mode, pathname }: NavigationProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col overflow-y-auto border-r border-black/[0.04] bg-[#f6f6f7] px-3 py-6 lg:flex">
      <div className="px-3"><Brand /></div>
      <Navigation mode={mode} pathname={pathname} />
    </aside>
  );
}

export function MobileNav({ mode }: { mode: AppMode }) {
  return <MobileNavView mode={mode} pathname={usePathname()} />;
}

export function MobileNavView({ mode, pathname }: NavigationProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) dialogRef.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white px-3 lg:hidden">
        <button
          type="button"
          aria-label="Abrir menú"
          aria-controls="mobile-navigation"
          aria-expanded={open}
          onClick={() => {
            dialogRef.current?.showModal();
            setOpen(true);
          }}
          className={cx("grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-canvas", focusClass)}
        >
          <Menu className="size-5" strokeWidth={1.8} aria-hidden />
        </button>
        <Link href="/" className={cx("flex items-center gap-2 rounded-lg", focusClass)} aria-label="Rhino, ir al asistente">
          <RhinoMark className="size-7" />
          <span className="font-display text-[17px] font-semibold">Rhino</span>
        </Link>
      </header>
      <dialog
        ref={dialogRef}
        id="mobile-navigation"
        aria-label="Menú principal"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(86vw,320px)] max-w-none border-0 bg-[#f6f6f7] p-0 text-ink shadow-xl"
        style={{ animation: "none" }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}
      >
        <div className="flex min-h-full flex-col px-3 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2 px-3">
            <Brand onNavigate={close} />
            <button type="button" autoFocus onClick={close} aria-label="Cerrar menú" className={cx("grid size-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-black/[0.04]", focusClass)}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <Navigation mode={mode} pathname={pathname} onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}
