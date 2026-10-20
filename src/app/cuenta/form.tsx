"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { FormMessage } from "@/components/modal";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nueva contraseña" hint="Mínimo 10 caracteres.">
        <input type="password" name="password" required autoComplete="new-password" className={inputClass} />
      </Field>
      <Field label="Confirmar contraseña">
        <input type="password" name="confirm" required autoComplete="new-password" className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <button disabled={pending} className={buttonClass("primary")}>{pending ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
}
