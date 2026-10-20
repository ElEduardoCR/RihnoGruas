import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isDemo } from "@/lib/env";
import { sessionState } from "@/lib/services/access";
import { RhinoMark } from "@/components/brand";
import { buttonClass } from "@/components/ui";
import { signOutAction } from "@/app/actions";
import { BootstrapForm } from "./form";

export const metadata = { title: "Bienvenida" };

export default function WelcomePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[var(--shadow-card)]">
        <RhinoMark className="size-11" />
        <Suspense fallback={<div className="skeleton mt-6 h-64" />}>
          <Welcome />
        </Suspense>
      </div>
    </div>
  );
}

async function Welcome() {
  await connection();
  if (isDemo) redirect("/");
  const state = await sessionState();
  if (state.kind === "sin_sesion") redirect("/login");
  if (state.kind === "listo") redirect("/");
  if (state.kind === "primer_acceso") {
    return (
      <>
        <h1 className="mt-6 text-[28px] leading-tight font-semibold">Configura tu cuenta</h1>
        <p className="mt-2 text-[15px] text-muted">
          Eres la primera persona en entrar a Grúas Rhino, así que quedarás como <b className="text-ink">Dirección</b>. Después podrás dar de alta grúas, clientes, personal y almacén.
        </p>
        <BootstrapForm email={state.email} />
      </>
    );
  }
  return (
    <>
      <h1 className="mt-6 text-[28px] leading-tight font-semibold">Tu cuenta aún no tiene acceso</h1>
      <p className="mt-2 text-[15px] text-muted">
        Entraste como <b className="text-ink">{state.email}</b>, pero ese correo no está registrado en el personal o está dado de baja. Pide a Dirección que te dé de alta con este correo y vuelve a entrar.
      </p>
      <form action={signOutAction} className="mt-8">
        <button className={buttonClass("outline", "lg") + " w-full"}>Cerrar sesión</button>
      </form>
    </>
  );
}
