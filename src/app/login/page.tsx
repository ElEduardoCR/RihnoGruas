import { Suspense } from "react";
import { RhinoMark } from "@/components/brand";
import { LoginForm } from "./form";

export const metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-night p-12 text-white lg:flex lg:flex-col">
        <RhinoMark className="size-12" />
        <div className="mt-auto max-w-md">
          <h1 className="text-[44px] leading-[1.05] font-semibold">Tu flotilla, administrada desde WhatsApp.</h1>
          <p className="mt-4 text-[17px] text-white/60">Rhino agenda revisiones, cuida el almacén y te avisa lo importante antes de que preguntes.</p>
        </div>
        <div className="absolute -right-24 -bottom-24 size-[420px] rounded-full bg-rhino-500/20 blur-3xl" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <RhinoMark className="size-11 lg:hidden" />
          <h2 className="mt-6 text-[30px] font-semibold lg:mt-0">Entrar</h2>
          <p className="mt-1 text-[15px] text-muted">Usa la cuenta que te dio Administración.</p>
          <Suspense>
            <LoginForm searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
