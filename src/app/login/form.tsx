"use client";

import { use, useActionState } from "react";
import { signInAction } from "./actions";
import { buttonClass, inputClass, Field } from "@/components/ui";

export function LoginForm({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = use(searchParams);
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Usuario o correo">
        <input name="email" type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={inputClass} />
      </Field>
      <Field label="Contraseña">
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      {state?.error && <p className="rounded-xl bg-rhino-50 px-3 py-2 text-[14px] text-rhino-700">{state.error}</p>}
      <button disabled={pending} className={buttonClass("primary", "lg") + " w-full"}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
