"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useCloseModal, FormMessage } from "./modal";
import { Field, buttonClass, inputClass, selectClass } from "./ui";
import { compressImage } from "@/lib/client-image";
import {
  completeMaintenanceAction,
  createRentalAction,
  registerCountAction,
  registerPurchaseAction,
  reportDowntimeAction,
  requestIssueAction,
  scheduleInspectionAction,
  scheduleMaintenanceAction,
  repeatMaintenanceChecklistAction,
  saveDocumentAction,
  type FormState,
} from "@/app/actions";

type Opt = { id: string; label: string };

/**
 * Envía el formulario a una server action SIN el reinicio automático de React 19:
 * si el servidor rechaza los datos (p. ej. "grúa no disponible"), lo capturado
 * se conserva para corregirlo. En altas se limpia sólo cuando sale bien.
 */
export function useFormAction(fn: (prev: FormState, fd: FormData) => Promise<FormState>, opts: { resetOnSuccess?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState(fn, null);
  const [, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const { resetOnSuccess = false } = opts;
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(() => dispatch(fd));
  };
  return { state, pending, form: { ref, onSubmit } };
}

export function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary", "lg") + " w-full"}>
      {pending ? "Procesando…" : children}
    </button>
  );
}

/** Cierra el modal tras éxito (con una pausa para leer el mensaje). */
export function useAutoClose(state: FormState, ms = 2600) {
  const close = useCloseModal();
  useEffect(() => {
    // Nunca cerrar solo si el mensaje trae algo que hay que copiar (contraseña temporal)
    if (state?.ok && !state.checklistUrl && !/contraseña temporal/i.test([state.message, ...(state.details ?? [])].join(" "))) {
      const t = setTimeout(close, ms);
      return () => clearTimeout(t);
    }
  }, [state, close, ms]);
}

export function RentalForm({ cranes, clients, operators, defaults, craneId }: { cranes: Opt[]; clients: Opt[]; operators: Opt[]; defaults: { start: string; end: string }; craneId?: string }) {
  const { state, pending, form } = useFormAction(createRentalAction, { resetOnSuccess: true });
  const [newClient, setNewClient] = useState(false);
  useAutoClose(state, 5000);
  return (
    <form {...form} className="space-y-4">
      <Field label="Grúa">
        <select name="crane_id" required defaultValue={craneId} className={selectClass}>
          {cranes.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Cliente">
        {newClient ? (
          <input name="client_name" required placeholder="Nombre del cliente nuevo" className={inputClass} />
        ) : (
          <select name="client_id" required className={selectClass}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => setNewClient(!newClient)} className="mt-1.5 text-[13px] font-medium text-rhino-600">
          {newClient ? "Elegir cliente existente" : "+ Cliente nuevo"}
        </button>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio">
          <input type="datetime-local" name="start" required defaultValue={defaults.start} className={inputClass} />
        </Field>
        <Field label="Fin">
          <input type="datetime-local" name="end" required defaultValue={defaults.end} className={inputClass} />
        </Field>
      </div>
      <Field label="Operador" hint="Vacío = Rhino asigna un operador aprobado, libre y con licencia vigente.">
        <select name="operator_id" className={selectClass} defaultValue="">
          <option value="">Asignación automática</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Dirección de la obra">
        <input name="site_address" className={inputClass} placeholder="Calle, colonia, ciudad" />
      </Field>
      <Field label="Condiciones de la maniobra" hint="Rhino las convierte en un punto específico de la revisión.">
        <textarea name="site_notes" rows={2} className={inputClass + " h-auto py-2.5"} placeholder="Peso de piezas, terreno, altura, viento…" />
      </Field>
      <Field label="Tarifa por día (opcional)">
        <input name="rate" inputMode="decimal" className={inputClass} placeholder="Tarifa base de la grúa" />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Crear renta y agendar revisión</Submit>
    </form>
  );
}

export function DowntimeForm({ craneId }: { craneId: string }) {
  const { state, pending, form } = useFormAction(reportDowntimeAction, { resetOnSuccess: true });
  useAutoClose(state);
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="crane_id" value={craneId} />
      <Field label="Causa">
        <select name="category" className={selectClass}>
          <option value="falla_mecanica">Falla mecánica</option>
          <option value="accidente">Accidente</option>
          <option value="documentacion">Documentación</option>
          <option value="falta_operador">Falta de operador</option>
          <option value="clima">Clima</option>
          <option value="otro">Otro</option>
        </select>
      </Field>
      <Field label="¿Qué pasó?">
        <textarea name="reason" required rows={3} className={inputClass + " h-auto py-2.5"} placeholder="Describe la falla" />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Detener grúa y avisar</Submit>
    </form>
  );
}

export function InspectionForm({ craneId, staff, defaultWhen }: { craneId: string; staff: Opt[]; defaultWhen: string }) {
  const { state, pending, form } = useFormAction(scheduleInspectionAction, { resetOnSuccess: true });
  useAutoClose(state);
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="crane_id" value={craneId} />
      <Field label="Tipo">
        <select name="kind" className={selectClass}>
          <option value="revision_total">Revisión total</option>
          <option value="diaria">Diaria del operador</option>
          <option value="post_renta">Recepción post-renta</option>
        </select>
      </Field>
      <Field label="Fecha y hora">
        <input type="datetime-local" name="scheduled_for" defaultValue={defaultWhen} required className={inputClass} />
      </Field>
      <Field label="Responsable">
        <select name="assigned_to" className={selectClass} defaultValue="">
          <option value="">Operador aprobado (automático)</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Programar y enviar enlace</Submit>
    </form>
  );
}

export function MaintenanceForm({ craneId, mechanics, defaults, planId }: { craneId: string; mechanics: Opt[]; defaults: { start: string; end: string; title?: string; description?: string }; planId?: string }) {
  const { state, pending, form } = useFormAction(scheduleMaintenanceAction, { resetOnSuccess: true });
  useAutoClose(state);
  if (state?.ok && state.checklistUrl) {
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <Link href={state.checklistUrl} className={buttonClass("primary", "lg") + " w-full"}>Abrir checklist paso a paso</Link>
      </div>
    );
  }
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="crane_id" value={craneId} />
      {planId && <input type="hidden" name="plan_id" value={planId} />}
      {planId && <p className="rounded-xl bg-canvas p-3 text-[13px] leading-relaxed text-ink-2">La orden incluirá el checklist de este plan, con sus pasos y las fotos que debe tomar el mecánico.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select name="kind" className={selectClass}>
            <option value="preventivo">Preventivo</option>
            <option value="correctivo">Correctivo</option>
          </select>
        </Field>
        <Field label="Mecánico">
          <select name="mechanic_id" className={selectClass} defaultValue="">
            <option value="">Por asignar</option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Trabajo">
        <input name="title" required defaultValue={defaults.title} className={inputClass} placeholder="Servicio según manual, cambio de sellos…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio">
          <input type="datetime-local" name="start" defaultValue={defaults.start} required className={inputClass} />
        </Field>
        <Field label="Fin">
          <input type="datetime-local" name="end" defaultValue={defaults.end} required className={inputClass} />
        </Field>
      </div>
      <Field label="Detalle">
        <textarea name="description" rows={2} defaultValue={defaults.description} className={inputClass + " h-auto py-2.5"} />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>{planId ? "Programar con checklist" : "Programar"}</Submit>
    </form>
  );
}

export function CompleteMaintenanceForm({ id }: { id: string }) {
  const { state, pending, form } = useFormAction(completeMaintenanceAction, { resetOnSuccess: true });
  useAutoClose(state, 1200);
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <Field label="Costo total (MXN)">
        <input name="cost" inputMode="decimal" required className={inputClass} placeholder="0" />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Cerrar orden</Submit>
    </form>
  );
}

export function RepeatMaintenanceChecklistForm({ id }: { id: string }) {
  const { state, pending, form } = useFormAction(repeatMaintenanceChecklistAction);
  if (state?.ok && state.checklistUrl) {
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <Link href={state.checklistUrl} className={buttonClass("primary", "lg") + " w-full"}>Abrir nuevo checklist</Link>
      </div>
    );
  }
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <p className="text-[14px] leading-relaxed text-ink-2">Se abrirá un nuevo checklist para esta orden. La revisión anterior y sus fotografías se conservan en el expediente.</p>
      <p className="rounded-xl bg-canvas p-3 text-[13px] leading-relaxed text-muted">Vuelve a comprobar los puntos del trabajo y toma evidencia nueva. El cierre depende del resultado de esta nueva revisión.</p>
      <FormMessage state={state} />
      <Submit pending={pending}>Crear nuevo checklist</Submit>
    </form>
  );
}

export function IssueForm({ items, cranes, defaultCrane }: { items: (Opt & { unit: string; serialized: boolean; requiresReturn: boolean; compat: string[]; scope: string })[]; cranes: Opt[]; defaultCrane?: string }) {
  const { state, pending, form } = useFormAction(requestIssueAction, { resetOnSuccess: true });
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [craneId, setCraneId] = useState(defaultCrane ?? cranes[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId);
  const incompatible = item && item.scope === "especifico" && !item.compat.includes(craneId);
  useAutoClose(state, 4000);
  return (
    <form {...form} className="space-y-4">
      <Field label="Artículo">
        <select name="item_id" value={itemId} onChange={(e) => setItemId(e.target.value)} className={selectClass}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.label}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Cantidad${item ? ` (${item.unit})` : ""}`}>
          <input name="qty" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label="Grúa destino">
          <select name="crane_id" value={craneId} onChange={(e) => setCraneId(e.target.value)} className={selectClass}>
            {cranes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      {incompatible && <div className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">Esta pieza no está registrada como compatible con la grúa: quedará pendiente de autorización.</div>}
      <Field label="Motivo">
        <input name="reason" required className={inputClass} placeholder="Servicio, cambio por desgaste…" />
      </Field>
      {item?.serialized && (
        <Field label="Números de serie" hint="Separados por coma, uno por pieza.">
          <input name="serials" required className={inputClass} />
        </Field>
      )}
      <Field label={item?.requiresReturn ? "Foto de la pieza usada (obligatoria)" : "Foto de evidencia (opcional)"} hint={item?.requiresReturn ? "Cambio contra entrega: sin foto queda pendiente de autorización." : undefined}>
        <input
          type="file"
          name="evidence"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const input = e.currentTarget;
            const f = input.files?.[0];
            if (!f) return;
            const blob = await compressImage(f);
            const dt = new DataTransfer();
            dt.items.add(new File([blob], "evidencia.jpg", { type: "image/jpeg", lastModified: f.lastModified }));
            input.files = dt.files;
          }}
          className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white" />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Registrar salida</Submit>
    </form>
  );
}

export function PurchaseForm({ items, cranes, today }: { items: Opt[]; cranes: Opt[]; today: string }) {
  const { state, pending, form } = useFormAction(registerPurchaseAction, { resetOnSuccess: true });
  useAutoClose(state);
  return (
    <form {...form} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proveedor">
          <input name="supplier" required className={inputClass} />
        </Field>
        <Field label="Fecha">
          <input type="date" name="date" defaultValue={today} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <select name="category" className={selectClass}>
            <option value="refacciones">Refacciones</option>
            <option value="aceites">Aceites</option>
            <option value="llantas">Llantas</option>
            <option value="combustible">Combustible</option>
            <option value="taller">Taller externo</option>
            <option value="seguros_tramites">Seguros y trámites</option>
            <option value="herramienta">Herramienta</option>
            <option value="otros">Otros</option>
          </select>
        </Field>
        <Field label="Total con IVA">
          <input name="total" inputMode="decimal" required className={inputClass} placeholder="$0" />
        </Field>
      </div>
      <Field label="Descripción">
        <input name="description" required className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cargo a grúa">
          <select name="crane_id" className={selectClass} defaultValue="">
            <option value="">General</option>
            {cranes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Folio factura">
          <input name="invoice" className={inputClass} />
        </Field>
      </div>
      <div className="rounded-2xl bg-canvas p-4">
        <div className="mb-3 text-[13px] font-medium text-ink-2">Entrada al almacén (opcional)</div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <select name="item_id" className={selectClass} defaultValue="">
            <option value="">No entra al almacén</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
          <input name="qty" inputMode="decimal" placeholder="Cant." className={inputClass} />
        </div>
      </div>
      <FormMessage state={state} />
      <Submit pending={pending}>Registrar compra</Submit>
    </form>
  );
}

export function CountForm({ items }: { items: (Opt & { unit: string })[] }) {
  const { state, pending, form } = useFormAction(registerCountAction, { resetOnSuccess: true });
  return (
    <form {...form} className="space-y-4">
      <Field label="Artículo contado">
        <select name="item_id" className={selectClass}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Cantidad física contada" hint="Cuenta sin ver el sistema. La diferencia se ajusta y se reporta si supera 5 %.">
        <input name="counted" inputMode="decimal" required className={inputClass} />
      </Field>
      <Field label="Notas">
        <input name="notes" className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Registrar conteo</Submit>
    </form>
  );
}

const DOC_TYPES: [string, string][] = [
  ["seguro", "Póliza de seguro"],
  ["tarjeta_circulacion", "Tarjeta de circulación"],
  ["verificacion", "Verificación vehicular"],
  ["permiso_sct", "Permiso SCT carga especializada"],
  ["certificacion_carga", "Certificación de grúa (tercero)"],
  ["poliza_mantenimiento", "Póliza de mantenimiento"],
  ["factura", "Factura"],
  ["manual", "Manual / tabla de cargas"],
  ["otro", "Otro"],
];

/** Alta (sin `doc`) o renovación (con `doc`) de un documento del expediente. */
export function DocumentForm({ craneId, doc }: { craneId: string; doc?: { id: string; label: string; number: string | null; issuer: string | null; coverage: string | null } }) {
  const { state, pending, form } = useFormAction(saveDocumentAction, { resetOnSuccess: true });
  useAutoClose(state, 1500);
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="crane_id" value={craneId} />
      {doc ? (
        <>
          <input type="hidden" name="doc_id" value={doc.id} />
          <div className="rounded-2xl bg-canvas px-4 py-3 text-[14px] font-medium">{doc.label}</div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select name="doc_type" className={selectClass}>
              {DOC_TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Título">
            <input name="title" required className={inputClass} placeholder="Póliza RC y daños" />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Número / folio">
          <input name="number" defaultValue={doc?.number ?? ""} className={inputClass} />
        </Field>
        <Field label="Emisor">
          <input name="issuer" defaultValue={doc?.issuer ?? ""} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vigente desde">
          <input type="date" name="issued_on" className={inputClass} />
        </Field>
        <Field label="Vence">
          <input type="date" name="expires_on" className={inputClass} />
        </Field>
      </div>
      <Field label="Cobertura / notas">
        <input name="coverage" defaultValue={doc?.coverage ?? ""} className={inputClass} />
      </Field>
      <Field label="Archivo (PDF o foto, máx. 4 MB)">
        <input type="file" name="file" accept="application/pdf,image/*" className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white" />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>{doc ? "Guardar renovación" : "Agregar documento"}</Submit>
    </form>
  );
}
