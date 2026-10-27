"use client";

import { useState } from "react";
import { CRANE_TYPE_LONG } from "@/lib/labels";
import type { AlertTopic, Client, Crane, InventoryItem, Staff, StaffRole } from "@/lib/types";
import {
  approveOperatorAction,
  grantAccessAction,
  saveClientAction,
  saveCraneAction,
  saveItemAction,
  saveStaffAction,
} from "@/app/catalog-actions";
import { FormMessage } from "./modal";
import { Submit, useAutoClose, useFormAction } from "./forms";
import { Field, buttonClass, cx, inputClass, selectClass } from "./ui";

type Opt = { id: string; label: string };

const ROLES: [StaffRole, string][] = [
  ["direccion", "Dirección"],
  ["administracion", "Administración"],
  ["ventas", "Ventas"],
  ["operador", "Operador"],
  ["mecanico", "Mecánico"],
  ["almacen", "Almacén"],
];

const TOPICS: [AlertTopic, string, string][] = [
  ["resumen", "Resumen matutino", "Cada mañana a las 7:00"],
  ["flota", "Flota", "Grúas detenidas, servicio por horómetro"],
  ["agenda", "Agenda", "Rentas nuevas, sin revisión, en riesgo"],
  ["documentos", "Documentos", "Seguros, tarjetas, licencias por vencer"],
  ["checklists", "Checklists", "Revisiones rechazadas o mal llenadas"],
  ["inventario", "Inventario", "Autorizaciones y movimientos atípicos"],
  ["gastos", "Gastos", "Gasto del mes arriba del promedio"],
];

const DEFAULT_TOPICS: Record<StaffRole, AlertTopic[]> = {
  direccion: ["resumen", "flota", "agenda", "documentos", "checklists", "inventario", "gastos"],
  administracion: ["resumen", "documentos", "inventario", "gastos"],
  ventas: ["agenda"],
  mecanico: ["flota", "checklists"],
  almacen: ["inventario"],
  operador: [],
};

function Check({ name, label, hint, defaultChecked, checked, onChange, value }: { name: string; label: string; hint?: string; defaultChecked?: boolean; checked?: boolean; onChange?: (v: boolean) => void; value?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1.5">
      <input
        type="checkbox"
        name={name}
        value={value ?? "on"}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="mt-0.5 size-[18px] shrink-0 accent-[#e3261b]"
      />
      <span className="leading-tight">
        <span className="text-[14px] font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

const Grid = ({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) => (
  <div className={cx("grid gap-3", cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>{children}</div>
);

// ---------------------------------------------------------------- grúas

export function CraneForm({ crane }: { crane?: Crane }) {
  const { state, pending, form } = useFormAction(saveCraneAction, { resetOnSuccess: !crane });
  const [type, setType] = useState(crane?.type ?? "grua_movil");
  useAutoClose(state, crane ? 1500 : 4000);
  const v = (k: keyof Crane) => (crane?.[k] ?? "") as string | number;
  return (
    <form {...form} className="space-y-6">
      {crane && <input type="hidden" name="id" value={crane.id} />}
      <Section title="Identificación">
        <Grid>
          <Field label="Número económico" hint="Ej. RH-11">
            <input name="code" required defaultValue={v("code")} className={inputClass + " uppercase"} placeholder="RH-11" />
          </Field>
          <Field label="Tipo">
            <select name="type" value={type} onChange={(e) => setType(e.target.value as Crane["type"])} className={selectClass}>
              {Object.entries(CRANE_TYPE_LONG).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </Grid>
        <Field label="Nombre corto" hint="Como la llama el equipo, ej. “Titán 35” o “Grove RT540E”.">
          <input name="name" required defaultValue={v("name")} className={inputClass} />
        </Field>
        <Grid cols={3}>
          <Field label="Marca">
            <input name="brand" required defaultValue={v("brand")} className={inputClass} />
          </Field>
          <Field label="Modelo">
            <input name="model" required defaultValue={v("model")} className={inputClass} />
          </Field>
          <Field label="Año">
            <input name="year" inputMode="numeric" defaultValue={v("year")} className={inputClass} />
          </Field>
        </Grid>
      </Section>

      <Section title="Capacidad y uso">
        <Grid cols={3}>
          <Field label="Capacidad verificada (t métricas)" hint="Vacío si falta confirmar la unidad de medida o no aplica.">
            <input name="capacity_tons" inputMode="decimal" defaultValue={v("capacity_tons")} className={inputClass} />
          </Field>
          <Field label="Pluma (m)">
            <input name="boom_length_m" inputMode="decimal" defaultValue={v("boom_length_m")} className={inputClass} />
          </Field>
          <Field label="Tarifa por día">
            <input name="daily_rate" inputMode="decimal" defaultValue={v("daily_rate")} className={inputClass} placeholder="$" />
          </Field>
          <Field label="Horómetro (h)">
            <input name="hour_meter" inputMode="decimal" defaultValue={v("hour_meter")} className={inputClass} />
          </Field>
          <Field label="Servicio cada (h)" hint="Sólo el intervalo confirmado en el manual de esta unidad.">
            <input name="service_interval_hours" inputMode="decimal" defaultValue={v("service_interval_hours")} className={inputClass} placeholder="Pendiente de confirmar" />
          </Field>
          <Field label="Último servicio a las (h)" hint="Vacío = historial pendiente">
            <input name="last_service_hours" inputMode="decimal" defaultValue={v("last_service_hours")} className={inputClass} />
          </Field>
        </Grid>
        {type !== "grua_armable" && (
          <Field label="Odómetro (km)">
            <input name="odometer_km" inputMode="decimal" defaultValue={v("odometer_km")} className={inputClass} />
          </Field>
        )}
      </Section>

      <Section title="Registro">
        <Grid cols={3}>
          {type !== "grua_armable" && (
            <Field label="Placas">
              <input name="plates" defaultValue={v("plates")} className={inputClass + " uppercase"} />
            </Field>
          )}
          <Field label="No. de serie">
            <input name="serial_number" defaultValue={v("serial_number")} className={inputClass} />
          </Field>
          {type !== "grua_armable" && (
            <Field label="VIN">
              <input name="vin" defaultValue={v("vin")} className={inputClass + " uppercase"} />
            </Field>
          )}
          <Field label="Fecha de adquisición">
            <input type="date" name="acquired_on" defaultValue={v("acquired_on")} className={inputClass} />
          </Field>
        </Grid>
        <Field label="Base / ubicación">
          <input name="base_location" defaultValue={v("base_location")} className={inputClass} placeholder="Patio Querétaro" />
        </Field>
        <Field label="Notas">
          <textarea name="notes" rows={2} defaultValue={v("notes")} className={inputClass + " h-auto py-2.5"} />
        </Field>
        {crane && <Check name="active" label="Activa" hint="Desmárcala para dar de baja la unidad (deja de aparecer en flota y agenda)." defaultChecked={crane.active} />}
      </Section>

      <FormMessage state={state} />
      <Submit pending={pending}>{crane ? "Guardar cambios" : "Dar de alta unidad"}</Submit>
    </form>
  );
}

// ---------------------------------------------------------------- clientes

export function ClientForm({ client }: { client?: Client }) {
  const { state, pending, form } = useFormAction(saveClientAction, { resetOnSuccess: !client });
  useAutoClose(state, 1500);
  const v = (k: keyof Client) => (client?.[k] ?? "") as string;
  return (
    <form {...form} className="space-y-4">
      {client && <input type="hidden" name="id" value={client.id} />}
      <Field label="Razón social o nombre">
        <input name="name" required defaultValue={v("name")} className={inputClass} />
      </Field>
      <Grid>
        <Field label="Contacto">
          <input name="contact_name" defaultValue={v("contact_name")} className={inputClass} />
        </Field>
        <Field label="Teléfono">
          <input name="phone" inputMode="tel" defaultValue={v("phone")} className={inputClass} />
        </Field>
        <Field label="Correo">
          <input name="email" type="email" defaultValue={v("email")} className={inputClass} />
        </Field>
        <Field label="RFC">
          <input name="rfc" defaultValue={v("rfc")} className={inputClass + " uppercase"} />
        </Field>
      </Grid>
      <Field label="Dirección">
        <input name="address" defaultValue={v("address")} className={inputClass} />
      </Field>
      <Field label="Notas" hint="Condiciones comerciales, requisitos de acceso a obra, etc.">
        <textarea name="notes" rows={2} defaultValue={v("notes")} className={inputClass + " h-auto py-2.5"} />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>{client ? "Guardar cambios" : "Dar de alta cliente"}</Submit>
    </form>
  );
}

// ---------------------------------------------------------------- personal

export function StaffForm({ staff, cranes, approvedIds = [], isSelf = false }: { staff?: Staff; cranes: Opt[]; approvedIds?: string[]; isSelf?: boolean }) {
  const { state, pending, form } = useFormAction(saveStaffAction, { resetOnSuccess: !staff });
  const [role, setRole] = useState<StaffRole>(staff?.role ?? "operador");
  const [topics, setTopics] = useState<AlertTopic[]>(staff?.alert_topics ?? DEFAULT_TOPICS.operador);
  const [alerts, setAlerts] = useState(staff?.receives_alerts ?? false);
  useAutoClose(state, 2500);
  const v = (k: keyof Staff) => (staff?.[k] ?? "") as string;

  const changeRole = (r: StaffRole) => {
    setRole(r);
    if (!staff) {
      // en altas, sugiere los avisos típicos del puesto
      setTopics(DEFAULT_TOPICS[r]);
      setAlerts(DEFAULT_TOPICS[r].length > 0);
    }
  };

  return (
    <form {...form} className="space-y-6">
      {staff && <input type="hidden" name="id" value={staff.id} />}
      <Section title="Datos">
        <Field label="Nombre completo">
          <input name="full_name" required defaultValue={v("full_name")} autoComplete="off" className={inputClass} />
        </Field>
        <Grid>
          <Field label="Puesto">
            <select name="role" value={role} onChange={(e) => changeRole(e.target.value as StaffRole)} disabled={isSelf} className={selectClass}>
              {ROLES.map(([r, l]) => (
                <option key={r} value={r}>{l}</option>
              ))}
            </select>
            {isSelf && <input type="hidden" name="role" value={role} />}
          </Field>
          <Field label="WhatsApp" hint="10 dígitos">
            <input name="phone" inputMode="tel" defaultValue={v("phone")} className={inputClass} placeholder="55 1234 5678" />
          </Field>
        </Grid>
        <Field label="Correo" hint={role === "operador" ? "Opcional: los operadores trabajan por WhatsApp." : "Necesario para entrar a la web."}>
          <input name="email" type="email" defaultValue={v("email")} className={inputClass} />
        </Field>
        {staff?.auth_user_id ? (
          <p className="rounded-xl bg-ok-soft px-3 py-2 text-[13px] text-ok">Tiene acceso a la web.</p>
        ) : (
          <Check name="web_access" label="Dar acceso a la web" hint="Crea su usuario con una contraseña temporal que verás una sola vez." defaultChecked={!staff && role !== "operador"} />
        )}
      </Section>

      {role === "operador" && (
        <Section title="Licencia y grúas aprobadas">
          <Grid cols={3}>
            <Field label="Tipo de licencia">
              <input name="license_type" defaultValue={v("license_type") || "Federal tipo E"} className={inputClass} />
            </Field>
            <Field label="No. de licencia">
              <input name="license_number" defaultValue={v("license_number")} className={inputClass} />
            </Field>
            <Field label="Vence">
              <input type="date" name="license_expires_on" defaultValue={v("license_expires_on")} className={inputClass} />
            </Field>
          </Grid>
          <div>
            <div className="mb-1 text-[13px] font-medium text-ink-2">Aprobado para operar</div>
            {cranes.length === 0 ? (
              <p className="text-[13px] text-muted">Primero da de alta las grúas.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {cranes.map((c) => (
                  <Check key={c.id} name="approved_cranes" value={c.id} label={c.label} defaultChecked={approvedIds.includes(c.id)} />
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Avisos por WhatsApp">
        <Check name="receives_alerts" label="Recibe avisos de Rhino" checked={alerts} onChange={setAlerts} />
        {alerts && (
          <div className="grid grid-cols-1 gap-x-4 pl-7 sm:grid-cols-2">
            {TOPICS.map(([t, label, hint]) => (
              <Check
                key={t}
                name="alert_topics"
                value={t}
                label={label}
                hint={hint}
                checked={topics.includes(t)}
                onChange={(on) => setTopics((cur) => (on ? [...cur, t] : cur.filter((x) => x !== t)))}
              />
            ))}
          </div>
        )}
        <Check name="can_authorize" label="Puede autorizar" hint="Salidas de almacén de monto alto o fuera de regla." defaultChecked={staff?.can_authorize ?? false} />
        {staff && !isSelf && <Check name="active" label="Activo" hint="Desmárcalo para dar de baja (pierde acceso web y WhatsApp)." defaultChecked={staff.active} />}
        {staff && isSelf && <input type="hidden" name="active" value="on" />}
      </Section>

      <FormMessage state={state} />
      <Submit pending={pending}>{staff ? "Guardar cambios" : "Dar de alta"}</Submit>
    </form>
  );
}

export function GrantAccessForm({ staff }: { staff: Pick<Staff, "id" | "email"> }) {
  const { state, pending, form } = useFormAction(grantAccessAction, { resetOnSuccess: false });
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="id" value={staff.id} />
      <p className="text-[14px] text-ink-2">
        Se creará un usuario para <b>{staff.email}</b> con una contraseña temporal que verás una sola vez. Si ya existe en Supabase, sólo se vincula.
      </p>
      <FormMessage state={state} />
      {!state?.ok && <Submit pending={pending}>Crear acceso web</Submit>}
    </form>
  );
}

// ---------------------------------------------------------------- almacén

const UNITS = ["pieza", "litro", "kg", "metro", "juego"];

export function ItemForm({ item, cranes, compatIds = [], expected }: { item?: InventoryItem; cranes: Opt[]; compatIds?: string[]; expected?: number | null }) {
  const { state, pending, form } = useFormAction(saveItemAction, { resetOnSuccess: !item });
  const [scope, setScope] = useState(item?.scope ?? "general");
  useAutoClose(state, 1800);
  const v = (k: keyof InventoryItem) => (item?.[k] ?? "") as string | number;
  return (
    <form {...form} className="space-y-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Section title="Artículo">
        <Grid>
          <Field label="SKU / clave">
            <input name="sku" required defaultValue={v("sku")} className={inputClass + " uppercase"} placeholder="ACE-HID-68" />
          </Field>
          <Field label="Categoría">
            <select name="category" defaultValue={item?.category ?? "refaccion"} className={selectClass}>
              <option value="aceite">Aceites y lubricantes</option>
              <option value="filtro">Filtros</option>
              <option value="llanta">Llantas</option>
              <option value="refaccion">Refacciones</option>
              <option value="consumible">Consumibles</option>
              <option value="herramienta">Herramienta y accesorios</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
        </Grid>
        <Field label="Nombre">
          <input name="name" required defaultValue={v("name")} className={inputClass} placeholder="Aceite hidráulico ISO 68" />
        </Field>
        <Grid cols={3}>
          <Field label="Unidad">
            <select name="unit" defaultValue={item?.unit ?? "pieza"} className={selectClass}>
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Mínimo">
            <input name="min_stock" inputMode="decimal" defaultValue={v("min_stock")} className={inputClass} />
          </Field>
          <Field label="Costo unitario">
            <input name="unit_cost" inputMode="decimal" defaultValue={v("unit_cost")} className={inputClass} placeholder="$" />
          </Field>
        </Grid>
        <Grid>
          <Field label="Ubicación en almacén">
            <input name="location" defaultValue={v("location")} className={inputClass} placeholder="Almacén A · Rack 1" />
          </Field>
          {!item && (
            <Field label="Existencia actual" hint="Queda registrada como inventario inicial.">
              <input name="initial_stock" inputMode="decimal" className={inputClass} placeholder="0" />
            </Field>
          )}
        </Grid>
      </Section>

      <Section title="¿Para qué grúas sirve?">
        <div className="inline-flex rounded-full bg-black/[0.05] p-1">
          {(["general", "especifico"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cx("h-8 rounded-full px-3.5 text-[13px] font-medium", scope === s ? "bg-white shadow-sm" : "text-muted")}>
              {s === "general" ? "General (varias grúas)" : "Específica de ciertas grúas"}
            </button>
          ))}
        </div>
        <input type="hidden" name="scope" value={scope} />
        <p className="text-[12px] text-muted">
          {scope === "general"
            ? "Opcional: marca las grúas que lo consumen para vigilar su consumo esperado."
            : "Sólo podrá salir hacia estas grúas; a cualquier otra quedará pendiente de autorización."}
        </p>
        {cranes.length === 0 ? (
          <p className="text-[13px] text-muted">Aún no hay grúas dadas de alta.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {cranes.map((c) => (
              <Check key={c.id} name="compat" value={c.id} label={c.label} defaultChecked={compatIds.includes(c.id)} />
            ))}
          </div>
        )}
        <Field label="Consumo esperado por servicio" hint="Por grúa. Si en 30 días sale más de 1.5× esto, Rhino lo reporta como consumo atípico.">
          <input name="expected_per_service" inputMode="decimal" defaultValue={expected ?? ""} className={inputClass} />
        </Field>
      </Section>

      <Section title="Controles">
        <Check name="requires_return" label="Cambio contra entrega" hint="Para sacarlo hay que entregar foto de la pieza usada (filtros especiales, sellos, baterías…)." defaultChecked={item?.requires_return ?? false} />
        <Check name="serialized" label="Lleva número de serie" hint="Llantas, baterías: se captura la serie de cada pieza al sacarla." defaultChecked={item?.serialized ?? false} />
        {item && <Check name="active" label="Activo" hint="Desmárcalo para dejar de usar el artículo." defaultChecked={item.active} />}
        <Field label="Notas">
          <textarea name="notes" rows={2} defaultValue={v("notes")} className={inputClass + " h-auto py-2.5"} />
        </Field>
      </Section>

      <FormMessage state={state} />
      <Submit pending={pending}>{item ? "Guardar cambios" : "Dar de alta artículo"}</Submit>
    </form>
  );
}

// ---------------------------------------------------------------- operadores por grúa

export function ApproveOperatorForm({ craneId, operators }: { craneId: string; operators: Opt[] }) {
  const { state, pending, form } = useFormAction(approveOperatorAction, { resetOnSuccess: true });
  useAutoClose(state, 1200);
  if (operators.length === 0) {
    return (
      <p className="text-[14px] text-muted">
        No hay operadores sin aprobar para esta grúa. Da de alta operadores en <a href="/catalogos?tab=personal" className="font-medium text-rhino-600">Catálogos → Personal</a>.
      </p>
    );
  }
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="crane_id" value={craneId} />
      <Field label="Operador">
        <select name="staff_id" className={selectClass}>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Aprobación vigente hasta" hint="Opcional. Rhino avisa cuando se acerque.">
        <input type="date" name="valid_until" className={inputClass} />
      </Field>
      <Field label="Notas">
        <input name="notes" className={inputClass} placeholder="Evaluación práctica, DC-3…" />
      </Field>
      <FormMessage state={state} />
      <Submit pending={pending}>Aprobar operador</Submit>
    </form>
  );
}

export function RevokeButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button className={buttonClass("danger-ghost", "sm")}>Retirar</button>
    </form>
  );
}
