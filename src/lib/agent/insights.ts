import type { Db } from "@/lib/db/types";
import type { Alert, AlertTopic } from "@/lib/types";
import { docStatus } from "@/lib/domain/fleet";
import { DOC_LABELS, flagText, qtyUnit } from "@/lib/labels";
import { getFleet } from "@/lib/services/fleet";
import { inventoryWatch } from "@/lib/services/inventory";
import { findAvailable, identificationIssue } from "@/lib/services/rentals";
import { monthlyExpenses } from "@/lib/services/expenses";
import { addDays, daysUntil, fmt, money, startOfDay, zonedParts } from "@/lib/time";

export interface Insight {
  key: string; // dedupe_key de la alerta
  topic: AlertTopic;
  severity: Alert["severity"];
  title: string;
  body: string;
  crane_id: string | null;
  href: string;
}

const SEV_ORDER = { critica: 0, aviso: 1, info: 2 } as const;

/** Umbral para que una alerta de vencimiento se repita al cruzar 30 / 15 / 7 / 0 días. */
const bucket = (days: number) => (days < 0 ? "vencido" : days <= 7 ? "7" : days <= 15 ? "15" : "30");

/**
 * Lo que Rhino considera importante ahora mismo. Reglas deterministas
 * (precisión > creatividad): el LLM sólo redacta, no decide qué es verdad.
 */
export async function collectInsights(db: Db, now: Date): Promise<Insight[]> {
  const out: Insight[] = [];
  const [{ cranes }, staff, approvals, rentals, inspections, inv, clients] = await Promise.all([
    getFleet(db, now),
    db.select("staff", { eq: { active: true } }),
    db.select("crane_operators"),
    db.select("rentals", { in: { status: ["confirmada", "en_curso"] } }),
    db.select("inspections", { gte: { scheduled_for: addDays(now, -14).toISOString() } }),
    inventoryWatch(db, now),
    db.select("clients"),
  ]);
  const craneById = new Map(cranes.map((c) => [c.id, c]));
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "cliente";

  // 1) Documentos por vencer / vencidos
  for (const c of cranes) {
    for (const d of c.documents) {
      const { health, days } = docStatus(d, now);
      if (health === "ok" || days == null) continue;
      out.push({
        key: `doc:${d.id}:${bucket(days)}`,
        topic: "documentos",
        severity: days < 0 || days <= 7 ? "critica" : days <= 15 ? "aviso" : "info",
        title: days < 0 ? `${DOC_LABELS[d.doc_type]} vencido · ${c.code}` : `${DOC_LABELS[d.doc_type]} de ${c.code} vence en ${days} días`,
        body: `${c.name}: ${d.title}${d.issuer ? ` (${d.issuer})` : ""} ${days < 0 ? "venció" : "vence"} el ${fmt.date(d.expires_on!)}.${
          days < 0 ? " La grúa no puede salir a renta hasta renovarlo." : ""
        }`,
        crane_id: c.id,
        href: `/gruas/${c.id}#documentos`,
      });
    }
  }

  // 2) Licencias de operadores
  for (const s of staff.filter((s) => s.role === "operador" && s.license_expires_on)) {
    const days = daysUntil(s.license_expires_on!, now);
    if (days > 30) continue;
    const upcoming = rentals.filter((r) => r.operator_id === s.id);
    out.push({
      key: `lic:${s.id}:${bucket(days)}`,
      topic: "documentos",
      severity: days < 0 && upcoming.length ? "critica" : days <= 15 ? "aviso" : "info",
      title: days < 0 ? `Licencia vencida: ${s.full_name}` : `Licencia de ${s.full_name} vence en ${days} días`,
      body: `${s.license_type ?? "Licencia"} ${s.license_number ?? ""} ${days < 0 ? "venció" : "vence"} el ${fmt.date(s.license_expires_on!)}.${
        upcoming.length ? ` Tiene ${upcoming.length} renta(s) asignada(s): reasigna operador.` : ""
      }${approvals.some((a) => a.staff_id === s.id) && days < 0 ? " Sigue aprobado en expedientes de grúa." : ""}`,
      crane_id: null,
      href: "/gruas",
    });
  }

  // 3) Rentas próximas sin revisión aprobada
  for (const r of rentals.filter((r) => r.status === "confirmada")) {
    const hours = (Date.parse(r.start_at) - now.getTime()) / 3600_000;
    if (hours < 0 || hours > 48) continue;
    const c = craneById.get(r.crane_id);
    if (!c) continue;
    const pre = inspections.find((i) => i.rental_id === r.id && i.kind !== "post_renta");
    if (pre?.status === "completada" && pre.result !== "rechazada") continue;
    out.push({
      key: `renta:sin-revision:${r.id}:${hours < 12 ? "12" : "48"}`,
      topic: "agenda",
      severity: hours < 12 ? "critica" : "aviso",
      title: `${c.code} sale ${hours < 24 ? "en menos de 24 h" : "en 2 días"} sin revisión aprobada`,
      body: `Renta con ${clientName(r.client_id)} inicia ${fmt.dateTime(r.start_at)}. ${
        !pre
          ? "No hay revisión programada."
          : pre.status === "completada"
            ? "La revisión salió rechazada: no puede salir."
            : pre.status === "vencida"
              ? `La revisión venció sin completarse (${fmt.dateTime(pre.scheduled_for)}).`
              : `La revisión está agendada ${fmt.dateTime(pre.scheduled_for)} y aún no se completa.`
      }`,
      crane_id: c.id,
      href: pre ? `/checklists/${pre.id}` : `/gruas/${c.id}`,
    });
  }

  // 4) Rentas en riesgo por grúa detenida → propone sustituta
  for (const c of cranes.filter((c) => c.status === "detenida")) {
    const affected = rentals.filter((r) => r.crane_id === c.id && Date.parse(r.end_at) > now.getTime() && Date.parse(r.start_at) < addDays(now, 14).getTime());
    for (const r of affected) {
      const options = c.capacity_tons == null ? [] : await findAvailable(db, { from: new Date(r.start_at), to: new Date(r.end_at), type: c.type, minCapacity: c.capacity_tons }, now);
      const sub = options.find((o) => o.available && o.crane.id !== c.id);
      out.push({
        key: `renta:riesgo:${r.id}`,
        topic: "agenda",
        severity: "critica",
        title: `Renta en riesgo: ${c.code} está detenida`,
        body: `${clientName(r.client_id)} · ${fmt.dateTime(r.start_at)}. ${sub ? `Sustituta disponible: ${sub.crane.code} ${sub.crane.name} (${sub.crane.capacity_tons} t).` : c.capacity_tons == null ? "Capacidad pendiente de confirmar; no se propone sustituta." : "No hay sustituta disponible del mismo tipo y capacidad."}`,
        crane_id: c.id,
        href: `/gruas/${c.id}`,
      });
    }
  }

  // 5) Revisiones vencidas y llenadas sin cuidado
  for (const i of inspections) {
    const c = craneById.get(i.crane_id);
    if (!c) continue;
    if (i.status === "vencida") {
      out.push({ key: `checklist:vencida:${i.id}`, topic: "checklists", severity: "aviso", title: `Revisión vencida · ${c.code}`, body: `${i.title} debía completarse antes del ${fmt.dateTime(i.due_by)}.`, crane_id: c.id, href: `/checklists/${i.id}` });
    }
    if (i.status === "completada" && (i.quality_score ?? 100) < 70 && daysUntil(i.completed_at!, now) > -7) {
      out.push({ key: `checklist:calidad:${i.id}`, topic: "checklists", severity: "aviso", title: `Revisión de ${c.code} llenada sin cuidado (${i.quality_score}/100)`, body: `Señales: ${i.quality_flags.join(", ")}. Por política se repite con supervisión.`, crane_id: c.id, href: `/checklists/${i.id}` });
    }
  }

  // 6) Detenciones largas
  for (const c of cranes.filter((c) => c.status === "detenida" && c.current)) {
    const days = -daysUntil(c.current!.start, now);
    if (days >= 3)
      out.push({ key: `flota:detenida-larga:${c.current!.id}:${Math.floor(days / 3)}`, topic: "flota", severity: "aviso", title: `${c.code} lleva ${days} días detenida`, body: `${c.current!.title}.${c.daily_rate == null ? " Tarifa pendiente de registrar." : ` Cada día detenida deja de facturar ~${money(c.daily_rate)}.`}`, crane_id: c.id, href: `/gruas/${c.id}` });
  }

  // 7) Servicio preventivo por horómetro
  for (const c of cranes) {
    if (!c.service.known || c.last_service_hours == null || c.service.pct < 0.9) continue;
    out.push({
      key: `servicio:${c.id}:${Math.floor(c.last_service_hours)}`,
      topic: "flota",
      severity: c.service.pct >= 1 ? "critica" : "aviso",
      title: `${c.code} necesita servicio preventivo`,
      body: `${Math.round(c.service.used)} de ${c.service_interval_hours} h desde el último servicio (${Math.round(c.service.pct * 100)}%). ${
        c.next ? `Próximo evento: ${c.next.title} el ${fmt.dateTime(c.next.start)}.` : "No tiene eventos próximos: buen momento para programarlo."
      }`,
      crane_id: c.id,
      href: `/gruas/${c.id}#mantenimiento`,
    });
  }

  // 8) Inventario
  if (inv.lowStock.length) {
    out.push({
      key: `inv:bajo:${dayKeyOf(now)}`,
      topic: "inventario",
      severity: "aviso",
      title: `${inv.lowStock.length} artículos en o bajo el mínimo`,
      body: inv.lowStock.slice(0, 6).map((s) => `• ${s.name}: ${qtyUnit(s.stock, s.unit)} (mín. ${s.min_stock})`).join("\n"),
      crane_id: null,
      href: "/inventario",
    });
  }
  for (const m of inv.pending) {
    out.push({ key: `inv:autorizar:${m.id}`, topic: "inventario", severity: "aviso", title: "Salida pendiente de autorización", body: `${qtyUnit(-m.qty_delta, m.item?.unit ?? "")} de ${m.item?.name} → ${m.crane?.code ?? "—"} (${money(-m.qty_delta * (m.unit_cost ?? 0))}). Solicitó ${m.requester?.full_name ?? "—"} · ${flagText(m.flags)}.`, crane_id: m.crane_id, href: "/inventario?tab=alertas" });
  }
  for (const m of inv.flagged.filter((m) => daysUntil(m.created_at, now) >= -3)) {
    out.push({ key: `inv:anomalia:${m.id}`, topic: "inventario", severity: "critica", title: m.kind === "ajuste" ? `Faltante en conteo: ${m.item?.name}` : "Movimiento de almacén atípico", body: `${qtyUnit(Math.abs(m.qty_delta), m.item?.unit ?? "")} de ${m.item?.name}${m.crane ? ` → ${m.crane.code}` : ""} · ${fmt.dateTime(m.created_at)} · ${flagText(m.flags)}.`, crane_id: m.crane_id, href: "/inventario?tab=alertas" });
  }

  // 9) Grúas ociosas: oportunidad comercial
  const in7 = addDays(startOfDay(now), 7).getTime();
  for (const c of cranes.filter((c) => c.status === "disponible" && !identificationIssue(c) && ["grua_movil", "camion_grua", "grua_armable", "telehandler"].includes(c.type))) {
    const busy = rentals.some((r) => r.crane_id === c.id && Date.parse(r.start_at) < in7);
    if (!busy)
      out.push({ key: `flota:ociosa:${c.id}:${dayKeyOf(startOfDay(now))}`, topic: "agenda", severity: "info", title: `${c.code} sin rentas los próximos 7 días`, body: `${c.name} ${c.capacity_tons == null ? "(capacidad pendiente)" : `(${c.capacity_tons} t)`} está libre. ${c.daily_rate == null ? "Tarifa pendiente de registrar." : `Tarifa base ${money(c.daily_rate)}/día.`}`, crane_id: c.id, href: `/gruas/${c.id}` });
  }

  // 10) Gasto del mes contra el promedio
  const months = await monthlyExpenses(db, now, 4);
  const current = months[months.length - 1];
  const avg = months.slice(0, -1).reduce((s, m) => s + m.total, 0) / Math.max(1, months.length - 1);
  const p = zonedParts(now);
  const daysInMonth = new Date(p.year, p.month, 0).getDate();
  const projected = (current.total / p.day) * daysInMonth;
  if (avg > 0 && projected > avg * 1.2) {
    out.push({ key: `gastos:proyeccion:${current.key}`, topic: "gastos", severity: "aviso", title: "El gasto del mes va arriba del promedio", body: `Llevas ${money(current.total)}; a este ritmo cerrarías en ${money(projected)} vs promedio de ${money(avg)} (+${Math.round((projected / avg - 1) * 100)}%).`, crane_id: null, href: "/" });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);
