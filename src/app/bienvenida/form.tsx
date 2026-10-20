"use client";

import { useActionState } from "react";
import { bootstrapAction } from "./actions";
import { Field, buttonClass, inputClass } from "@/components/ui";

export function BootstrapForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(bootstrapAction, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <Field label="Correo de acceso">
        <input value={email} readOnly className={inputClass + " bg-canvas text-muted"} />
      </Field>
      <Field label="Nombre completo">
        <input name="full_name" required autoComplete="name" className={inputClass} />
      </Field>
      <Field label="WhatsApp" hint="10 dígitos. Rhino te enviará aquí los avisos y el resumen de cada mañana.">
        <input name="phone" inputMode="tel" autoComplete="tel" className={inputClass} placeholder="55 1234 5678" />
      </Field>
      {state?.error && <p className="rounded-xl bg-rhino-50 px-3 py-2 text-[14px] text-rhino-700">{state.error}</p>}
      <button disabled={pending} className={buttonClass("primary", "lg") + " w-full"}>
        {pending ? "Guardando…" : "Entrar como Dirección"}
      </button>
    </form>
  );
}
