import Link from "next/link";
import { RhinoMark } from "@/components/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <Link href="/login" className="inline-flex items-center gap-3 text-[18px] font-semibold">
          <RhinoMark className="size-10" />
          Grúas Rhino
        </Link>
        <nav aria-label="Información sobre datos" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
          <Link href="/privacidad" className="hover:text-ink">Privacidad</Link>
          <Link href="/eliminar-datos" className="hover:text-ink">Eliminar datos</Link>
        </nav>
      </header>
      <main className="rounded-[24px] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-10">
        {children}
      </main>
      <footer className="mt-6 text-[13px] leading-relaxed text-muted">
        <p>Administración de Grúas Rhino</p>
        <a href="mailto:jose.eduardoqr@gmail.com" className="break-all underline underline-offset-4 hover:text-ink">jose.eduardoqr@gmail.com</a>
      </footer>
    </div>
  );
}
