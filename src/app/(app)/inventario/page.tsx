import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDownLeft, ArrowUpRight, Camera, Check, ClipboardList, Lock, PackageMinus, PackagePlus, Repeat, ScanBarcode, ShieldAlert, X } from "lucide-react";
import { getDb } from "@/lib/db";
import { inventoryWatch, type EnrichedMovement } from "@/lib/services/inventory";
import { latestPurchases } from "@/lib/services/expenses";
import { getFormOptions } from "@/lib/services/options";
import { FLAG_LABELS, INVENTORY_CATEGORY_LABELS, PURCHASE_CATEGORY_LABELS, qtyUnit } from "@/lib/labels";
import { dayKey, fmt, money } from "@/lib/time";
import { env } from "@/lib/env";
import { Badge, Card, CardHeader, Empty, PageHeader, PageSkeleton, Stat, Tabs, buttonClass, cx } from "@/components/ui";
import { Modal } from "@/components/modal";
import { CountForm, IssueForm, PurchaseForm } from "@/components/forms";
import { resolveMovementAction } from "@/app/actions";

export const metadata = { title: "Inventario" };

type SP = Promise<{ tab?: string; grua?: string }>;

export default function InventoryPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Inventory searchParams={searchParams} />
    </Suspense>
  );
}

async function Inventory({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const tab = sp.tab ?? "general";
  const db = await getDb();
  const now = new Date();
  const [w, opts, cranes, purchases] = await Promise.all([
    inventoryWatch(db, now),
    getFormOptions(db),
    db.select("cranes", { eq: { active: true }, order: { column: "code" } }),
    latestPurchases(db, 30),
  ]);
  const craneCode = new Map(cranes.map((c) => [c.id, c.code]));
  const totalValue = w.stock.reduce((s, i) => s + Math.max(0, i.value), 0);
  const selectedCrane = cranes.find((c) => c.id === sp.grua) ?? cranes[0];

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle="Insumos generales y refacciones específicas por grúa. Cada salida queda ligada a una grúa, una persona y una evidencia."
        actions={
          <>
            <Modal label="Conteo cíclico" title="Conteo cíclico" subtitle="Compara lo físico contra el sistema." variant="outline" icon={<ClipboardList className="size-4" />}>
              <CountForm items={opts.items} />
            </Modal>
            <Modal label="Registrar compra" title="Registrar compra" variant="outline" icon={<PackagePlus className="size-4" />}>
              <PurchaseForm items={opts.items} cranes={opts.cranes} today={dayKey(now)} />
            </Modal>
            <Modal label="Salida de almacén" title="Salida de almacén" subtitle="Se valida compatibilidad, monto, horario y consumo esperado." icon={<PackageMinus className="size-4" />}>
              <IssueForm items={opts.items} cranes={opts.cranes} />
            </Modal>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Valor en almacén" value={money(totalValue)} hint={`${w.stock.length} artículos`} />
        <Stat label="Bajo mínimo" value={w.lowStock.length} hint="reponer pronto" tone="amber" icon={<PackageMinus className="size-4" />} />
        <Stat label="Por autorizar" value={w.pending.length} hint={`salidas > ${money(env.authorizeAboveMxn)} o fuera de regla`} tone="dark" />
        <Stat label="Atípicos (30 d)" value={w.flagged.length} hint="horario, consumo, compatibilidad" tone="red" icon={<ShieldAlert className="size-4" />} />
      </div>

      <Tabs
        active={tab}
        tabs={[
          { key: "general", label: "Inventario general", href: "/inventario" },
          { key: "grua", label: "Por grúa", href: "/inventario?tab=grua" },
          { key: "movimientos", label: "Movimientos", href: "/inventario?tab=movimientos" },
          { key: "alertas", label: "Alertas antirrobo", href: "/inventario?tab=alertas", count: w.pending.length + w.flagged.length },
          { key: "compras", label: "Compras", href: "/inventario?tab=compras" },
        ]}
      />

      {tab === "general" && (
        <Card>
          <div className="scroll-x px-2 py-2 sm:px-3">
            <table className="w-full min-w-[860px] text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-3 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 font-medium">Uso</th>
                  <th className="px-3 py-3 text-right font-medium">Existencia</th>
                  <th className="px-3 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-3 py-3 font-medium">Controles</th>
                </tr>
              </thead>
              <tbody>
                {w.stock.map((i) => (
                  <tr key={i.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-[12px] text-muted">
                        <span className="font-mono">{i.sku}</span> · {i.location}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink-2">{INVENTORY_CATEGORY_LABELS[i.category]}</td>
                    <td className="px-3 py-3">
                      {i.scope === "general" ? (
                        <Badge>General{i.compatCraneIds.length ? ` · ${i.compatCraneIds.length} grúas` : ""}</Badge>
                      ) : (
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {i.compatCraneIds.map((id) => (
                            <Badge key={id} tone="outline">{craneCode.get(id)}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={cx("tabular font-semibold", i.low && "text-rhino-600")}>{qtyUnit(i.stock, i.unit)}</span>
                      {i.pendingOut > 0 && <div className="text-[11px] text-warn">−{i.pendingOut} por autorizar</div>}
                    </td>
                    <td className="tabular px-3 py-3 text-right text-muted">{i.min_stock}</td>
                    <td className="tabular px-3 py-3 text-right">{money(i.value)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {i.requires_return && <Badge tone="amber"><Repeat className="size-3" />Contra entrega</Badge>}
                        {i.serialized && <Badge tone="outline"><ScanBarcode className="size-3" />Serie</Badge>}
                        {i.low && <Badge tone="red">Bajo mínimo</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "grua" && selectedCrane && (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {cranes.map((c) => (
              <Link
                key={c.id}
                href={`/inventario?tab=grua&grua=${c.id}`}
                scroll={false}
                className={cx("h-8 rounded-full px-3.5 text-[13px] font-medium inline-flex items-center", c.id === selectedCrane.id ? "bg-ink text-white" : "border border-line bg-white text-ink-2")}
              >
                {c.code}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title={`Sirve para ${selectedCrane.code} · ${selectedCrane.name}`} subtitle="Refacciones específicas compatibles y consumibles generales" />
              <ul className="px-5 pt-2 pb-5 sm:px-6">
                {w.stock
                  .filter((s) => s.compatCraneIds.includes(selectedCrane.id) || (s.scope === "general" && s.compatCraneIds.length === 0))
                  .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "especifico" ? -1 : 1))
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-0">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium">{s.name}</div>
                        <div className="text-[12px] text-muted">{s.scope === "especifico" ? "Específica" : "General"} · {s.location}</div>
                      </div>
                      <span className={cx("tabular shrink-0 font-semibold", s.low && "text-rhino-600")}>{qtyUnit(s.stock, s.unit)}</span>
                    </li>
                  ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Consumo de los últimos 30 días" subtitle="Comparado contra el consumo esperado por servicio" />
              <MovementList movements={w.movements.filter((m) => m.crane_id === selectedCrane.id && m.kind === "salida")} />
            </Card>
          </div>
        </>
      )}

      {tab === "movimientos" && (
        <Card>
          <CardHeader title="Libro de movimientos" subtitle="Últimos 30 días · el stock es la suma de estos movimientos; nada se borra" />
          <MovementList movements={w.movements} showKind />
        </Card>
      )}

      {tab === "alertas" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Salidas pendientes de autorización" subtitle="Nada sale del almacén hasta que Dirección o Administración lo autoriza" />
              <ul className="space-y-3 p-4 sm:p-5">
                {w.pending.map((m) => (
                  <li key={m.id} className="rounded-2xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {qtyUnit(-m.qty_delta, m.item?.unit ?? "")} · {m.item?.name}
                        </div>
                        <div className="text-[13px] text-muted">
                          → {m.crane?.code} · {m.reason} · solicitó {m.requester?.full_name ?? "—"} · {fmt.dateTime(m.created_at)}
                          {m.channel === "whatsapp" && " · vía WhatsApp"}
                        </div>
                        {m.serial_numbers.length > 0 && <div className="mt-1 font-mono text-[12px] text-muted">Series: {m.serial_numbers.join(", ")}</div>}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.flags.map((f) => (
                            <Badge key={f} tone={f === "sobre_umbral" ? "amber" : "red"}>{FLAG_LABELS[f] ?? f}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-[18px] font-semibold">{money(-m.qty_delta * (m.unit_cost ?? 0))}</div>
                        <div className="mt-2 flex gap-2">
                          <form action={resolveMovementAction.bind(null, m.id, false)}>
                            <button className={buttonClass("outline", "sm")}><X className="size-3.5" /> Rechazar</button>
                          </form>
                          <form action={resolveMovementAction.bind(null, m.id, true)}>
                            <button className={buttonClass("dark", "sm")}><Check className="size-3.5" /> Autorizar</button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {w.pending.length === 0 && <Empty title="Nada pendiente" />}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Movimientos atípicos" subtitle="Rhino los reporta a Dirección en cuanto ocurren" />
              <MovementList movements={w.flagged} showKind />
            </Card>
            <Card>
              <CardHeader title="Conteos cíclicos" />
              <ul className="px-5 pt-2 pb-5 sm:px-6">
                {w.counts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-0">
                    <div>
                      <div className="text-[14px] font-medium">{c.item?.name}</div>
                      <div className="text-[12px] text-muted">{fmt.dateTime(c.created_at)} · {c.counter?.full_name}{c.notes ? ` · ${c.notes}` : ""}</div>
                    </div>
                    <Badge tone={c.variance === 0 ? "green" : c.variance < 0 ? "red" : "amber"}>
                      {c.variance === 0 ? "Cuadra" : `${c.variance > 0 ? "+" : ""}${c.variance} (${c.counted_qty} vs ${c.system_qty})`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card className="self-start bg-night p-6 text-white" as="div">
            <Lock className="size-6 text-rhino-400" />
            <h3 className="mt-3 text-[18px] font-semibold">Cómo se evita el robo</h3>
            <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-white/70">
              <li><b className="text-white">Destino obligatorio.</b> Toda salida va a una grúa, con motivo y quién la pidió.</li>
              <li><b className="text-white">Compatibilidad.</b> Una refacción específica no puede salir a una grúa en la que no se usa sin autorización.</li>
              <li><b className="text-white"><Camera className="mr-1 inline size-3.5" />Cambio contra entrega.</b> Filtros especiales, sellos, baterías y balatas requieren foto de la pieza usada.</li>
              <li><b className="text-white">Montos altos.</b> Arriba de {money(env.authorizeAboveMxn)} se autoriza por WhatsApp o web.</li>
              <li><b className="text-white">Consumo esperado.</b> Si una grúa consume más de 1.5× lo normal en 30 días, se reporta.</li>
              <li><b className="text-white">Horario.</b> Salidas fuera de 7:00–19:00 se reportan al momento.</li>
              <li><b className="text-white">Conteo cíclico.</b> Diferencias &gt; 5 % generan alerta y quedan en el libro.</li>
              <li><b className="text-white">Libro inmutable.</b> Nada se borra: los ajustes también quedan registrados.</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "compras" && (
        <Card>
          <div className="scroll-x px-2 py-2 sm:px-3">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Concepto</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 font-medium">Grúa</th>
                  <th className="px-3 py-3 font-medium">Factura</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{fmt.date(p.purchased_on)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{p.description}</div>
                      <div className="text-[12px] text-muted">{p.supplier}{p.channel === "whatsapp" && " · registrada por WhatsApp"}</div>
                    </td>
                    <td className="px-3 py-3"><Badge>{PURCHASE_CATEGORY_LABELS[p.category]}</Badge></td>
                    <td className="px-3 py-3 text-muted">{p.crane?.code ?? "General"}</td>
                    <td className="px-3 py-3 font-mono text-[12px] text-muted">{p.invoice_number}</td>
                    <td className="tabular px-3 py-3 text-right font-semibold">{money(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function MovementList({ movements, showKind }: { movements: EnrichedMovement[]; showKind?: boolean }) {
  if (!movements.length) return <Empty title="Sin movimientos" />;
  return (
    <ul className="px-3 pt-1 pb-3">
      {movements.slice(0, 40).map((m) => {
        const inbound = m.qty_delta > 0;
        const flags = m.flags.filter((f) => f !== "sin_orden");
        return (
          <li key={m.id} className="flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-canvas">
            <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", inbound ? "bg-ok-soft text-ok" : "bg-black/[0.05] text-ink")}>
              {inbound ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-[14px]">
                <span className="font-medium">{m.item?.name}</span>
                {showKind && <span className="text-[12px] text-muted capitalize">{m.kind}</span>}
                {m.crane && <Badge tone="outline">{m.crane.code}</Badge>}
              </div>
              <div className="text-[12px] text-muted">
                {fmt.dateTime(m.created_at)} · {m.reason ?? "—"} · {m.requester?.full_name ?? "—"}
                {m.authorizer && ` · autorizó ${m.authorizer.full_name}`}
                {m.evidence_paths.length > 0 && " · 📷 evidencia"}
              </div>
              {(flags.length > 0 || m.status !== "aplicado") && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.status !== "aplicado" && <Badge tone={m.status === "rechazado" ? "neutral" : "amber"}>{m.status.replaceAll("_", " ")}</Badge>}
                  {flags.map((f) => (
                    <Badge key={f} tone="red">{FLAG_LABELS[f] ?? f}</Badge>
                  ))}
                </div>
              )}
            </div>
            <span className={cx("tabular shrink-0 text-[14px] font-semibold", inbound ? "text-ok" : "text-ink")}>
              {inbound ? "+" : "−"}
              {qtyUnit(Math.abs(m.qty_delta), m.item?.unit ?? "")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
