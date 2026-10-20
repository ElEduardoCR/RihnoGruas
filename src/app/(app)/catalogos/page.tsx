import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Boxes, Building2, CheckCircle2, Circle, KeyRound, Pencil, Plus, Users } from "lucide-react";
import { getDb } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { isDemo } from "@/lib/env";
import { getStock } from "@/lib/services/inventory";
import { MANAGER_ROLES } from "@/lib/services/catalogs";
import { CRANE_TYPE_LABELS, INVENTORY_CATEGORY_LABELS, ROLE_LABELS, qtyUnit } from "@/lib/labels";
import { daysUntil, fmt, money, num } from "@/lib/time";
import { Badge, Card, Empty, PageHeader, PageSkeleton, Tabs, cx } from "@/components/ui";
import { Modal } from "@/components/modal";
import { CraneIcon } from "@/components/brand";
import { ClientForm, CraneForm, GrantAccessForm, ItemForm, StaffForm } from "@/components/catalog-forms";

export const metadata = { title: "Catálogos" };

type SP = Promise<{ tab?: string }>;

export default function CatalogsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Catalogs searchParams={searchParams} />
    </Suspense>
  );
}

const th = "px-3 py-3 font-medium";
const td = "px-3 py-3";

async function Catalogs({ searchParams }: { searchParams: SP }) {
  await connection();
  const { tab = "gruas" } = await searchParams;
  const db = await getDb();
  const now = new Date();
  const [me, cranes, clients, staff, stock, approvals, docs, rentals] = await Promise.all([
    currentStaff(db),
    db.select("cranes", { order: { column: "code" } }),
    db.select("clients", { order: { column: "name" } }),
    db.select("staff", { order: { column: "full_name" } }),
    getStock(db, { includeInactive: true }),
    db.select("crane_operators"),
    db.select("crane_documents"),
    db.select("rentals"),
  ]);
  const canEdit = Boolean(me && MANAGER_ROLES.includes(me.role));
  const activeCranes = cranes.filter((c) => c.active);
  const craneOpts = activeCranes.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }));
  const craneCode = new Map(cranes.map((c) => [c.id, c.code]));
  const operators = staff.filter((s) => s.role === "operador" && s.active);

  const steps = [
    { done: activeCranes.length > 0, label: "Da de alta tus grúas", href: "/catalogos?tab=gruas" },
    { done: docs.length > 0, label: "Carga sus documentos (seguro, tarjeta de circulación…)", href: activeCranes[0] ? `/gruas/${activeCranes[0].id}#documentos` : "/catalogos?tab=gruas" },
    { done: operators.length > 0, label: "Registra operadores y apruébalos por grúa", href: "/catalogos?tab=personal" },
    { done: clients.length > 0, label: "Agrega tus clientes", href: "/catalogos?tab=clientes" },
    { done: stock.length > 0, label: "Registra los artículos del almacén", href: "/catalogos?tab=articulos" },
  ];
  const pending = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader title="Catálogos" subtitle="Da de alta y edita grúas, clientes, personal y artículos de almacén. Rhino trabaja con lo que registres aquí." />

      {!canEdit && (
        <Card className="mb-6 p-5 text-[14px] text-ink-2" as="div">Sólo Dirección o Administración pueden dar de alta o editar catálogos. Aquí puedes consultarlos.</Card>
      )}

      {pending > 0 && canEdit && (
        <Card className="mb-6 p-5 sm:p-6" as="div">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Primeros pasos</h2>
            <span className="text-[13px] text-muted">{steps.length - pending} de {steps.length} listos</span>
          </div>
          <ol className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-[14px] hover:bg-canvas">
                  {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" />}
                  <span className={cx(s.done && "text-muted line-through")}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Tabs
        active={tab}
        tabs={[
          { key: "gruas", label: `Grúas (${activeCranes.length})`, href: "/catalogos?tab=gruas" },
          { key: "clientes", label: `Clientes (${clients.length})`, href: "/catalogos?tab=clientes" },
          { key: "personal", label: `Personal (${staff.filter((s) => s.active).length})`, href: "/catalogos?tab=personal" },
          { key: "articulos", label: `Almacén (${stock.filter((s) => s.active).length})`, href: "/catalogos?tab=articulos" },
        ]}
      />

      {tab === "gruas" && (
        <Card>
          <TabHead
            title="Grúas"
            hint="Número económico, tipo, capacidad y datos de registro. Documentos y operadores aprobados se cargan desde el expediente."
            action={
              canEdit && (
                <Modal label="Nueva grúa" title="Nueva grúa" icon={<Plus className="size-4" />} wide>
                  <CraneForm />
                </Modal>
              )
            }
          />
          {cranes.length === 0 ? (
            <Empty title="Aún no hay grúas" icon={<CraneIcon className="size-8" />}>Da de alta la primera con “Nueva grúa”.</Empty>
          ) : (
            <div className="scroll-x px-2 pb-3 sm:px-3">
              <table className="w-full min-w-[820px] text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className={th}>Grúa</th>
                    <th className={th}>Tipo</th>
                    <th className={cx(th, "text-right")}>Capacidad</th>
                    <th className={th}>Placas / serie</th>
                    <th className={cx(th, "text-right")}>Tarifa/día</th>
                    <th className={th}>Expediente</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {cranes.map((c) => {
                    const nDocs = docs.filter((d) => d.crane_id === c.id).length;
                    const nOps = approvals.filter((a) => a.crane_id === c.id).length;
                    return (
                      <tr key={c.id} className={cx("border-t border-line", !c.active && "opacity-50")}>
                        <td className={td}>
                          <Link href={`/gruas/${c.id}`} className="font-semibold hover:text-rhino-600">{c.code}</Link>
                          <div className="text-[12px] text-muted">{c.name} · {c.brand} {c.model}</div>
                        </td>
                        <td className={cx(td, "text-ink-2")}>{CRANE_TYPE_LABELS[c.type]}</td>
                        <td className={cx(td, "tabular text-right")}>{num(c.capacity_tons)} t</td>
                        <td className={cx(td, "font-mono text-[12px] text-muted")}>{c.plates ?? c.serial_number ?? "—"}</td>
                        <td className={cx(td, "tabular text-right")}>{c.daily_rate ? money(c.daily_rate) : "—"}</td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1">
                            {!c.active && <Badge>Baja</Badge>}
                            <Badge tone={nDocs ? "neutral" : "amber"}>{nDocs} docs</Badge>
                            <Badge tone={nOps ? "neutral" : "amber"}>{nOps} operadores</Badge>
                          </div>
                        </td>
                        <td className={cx(td, "text-right")}>
                          {canEdit && (
                            <Modal label="Editar" title={`Editar ${c.code}`} size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} wide>
                              <CraneForm crane={c} />
                            </Modal>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "clientes" && (
        <Card>
          <TabHead
            title="Clientes"
            hint="Al crear una renta (en la web o por WhatsApp) Rhino busca al cliente por nombre."
            action={
              canEdit && (
                <Modal label="Nuevo cliente" title="Nuevo cliente" icon={<Plus className="size-4" />}>
                  <ClientForm />
                </Modal>
              )
            }
          />
          {clients.length === 0 ? (
            <Empty title="Aún no hay clientes" icon={<Building2 className="size-8" />}>Agrega el primero con “Nuevo cliente”.</Empty>
          ) : (
            <div className="scroll-x px-2 pb-3 sm:px-3">
              <table className="w-full min-w-[720px] text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className={th}>Cliente</th>
                    <th className={th}>Contacto</th>
                    <th className={th}>RFC</th>
                    <th className={cx(th, "text-right")}>Rentas</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className={td}>
                        <div className="font-medium">{c.name}</div>
                        {c.address && <div className="text-[12px] text-muted">{c.address}</div>}
                      </td>
                      <td className={cx(td, "text-[13px]")}>
                        <div>{c.contact_name ?? "—"}</div>
                        <div className="text-[12px] text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className={cx(td, "font-mono text-[12px] text-muted")}>{c.rfc ?? "—"}</td>
                      <td className={cx(td, "tabular text-right")}>{rentals.filter((r) => r.client_id === c.id && r.status !== "cancelada").length}</td>
                      <td className={cx(td, "text-right")}>
                        {canEdit && (
                          <Modal label="Editar" title={`Editar ${c.name}`} size="sm" variant="ghost" icon={<Pencil className="size-3.5" />}>
                            <ClientForm client={c} />
                          </Modal>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "personal" && (
        <Card>
          <TabHead
            title="Personal"
            hint="Quien tenga WhatsApp registrado puede hablar con Rhino y recibir avisos. Los operadores no necesitan acceso a la web."
            action={
              canEdit && (
                <Modal label="Nueva persona" title="Alta de personal" icon={<Plus className="size-4" />} wide>
                  <StaffForm cranes={craneOpts} />
                </Modal>
              )
            }
          />
          {staff.length === 0 ? (
            <Empty title="Aún no hay personal" icon={<Users className="size-8" />} />
          ) : (
            <div className="scroll-x px-2 pb-3 sm:px-3">
              <table className="w-full min-w-[900px] text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className={th}>Nombre</th>
                    <th className={th}>Puesto</th>
                    <th className={th}>WhatsApp</th>
                    <th className={th}>Licencia / grúas</th>
                    <th className={th}>Avisos</th>
                    <th className={th}>Web</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const mine = approvals.filter((a) => a.staff_id === s.id);
                    const lic = s.license_expires_on ? daysUntil(s.license_expires_on, now) : null;
                    return (
                      <tr key={s.id} className={cx("border-t border-line align-top", !s.active && "opacity-50")}>
                        <td className={td}>
                          <div className="font-medium">{s.full_name}{me?.id === s.id && <span className="ml-1.5 text-[12px] font-normal text-muted">(tú)</span>}</div>
                          <div className="text-[12px] text-muted">{s.email ?? "sin correo"}</div>
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={s.role === "direccion" ? "dark" : "neutral"}>{ROLE_LABELS[s.role]}</Badge>
                            {s.can_authorize && <Badge tone="outline">Autoriza</Badge>}
                            {!s.active && <Badge>Baja</Badge>}
                          </div>
                        </td>
                        <td className={cx(td, "font-mono text-[12px]")}>{s.phone ? `+${s.phone}` : <span className="font-sans text-rhino-600">Falta</span>}</td>
                        <td className={cx(td, "text-[13px]")}>
                          {s.role === "operador" ? (
                            <>
                              {lic == null ? <span className="text-muted">Sin vigencia</span> : lic < 0 ? <Badge tone="red">Licencia vencida</Badge> : lic <= 30 ? <Badge tone="amber">Vence en {lic} d</Badge> : <span className="text-muted">Vence {fmt.short(s.license_expires_on!)}</span>}
                              <div className="mt-1 text-[12px] text-muted">{mine.length ? mine.map((a) => craneCode.get(a.crane_id)).join(", ") : "Sin grúas aprobadas"}</div>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className={cx(td, "text-[12px] text-muted")}>{s.receives_alerts ? `${s.alert_topics.length} temas` : "No"}</td>
                        <td className={td}>
                          {s.auth_user_id ? (
                            <Badge tone="green">Sí</Badge>
                          ) : canEdit && s.email && s.active && !isDemo ? (
                            <Modal label="Dar acceso" title={`Acceso web · ${s.full_name}`} size="sm" variant="outline" icon={<KeyRound className="size-3.5" />}>
                              <GrantAccessForm staff={s} />
                            </Modal>
                          ) : (
                            <span className="text-[12px] text-muted">No</span>
                          )}
                        </td>
                        <td className={cx(td, "text-right")}>
                          {canEdit && (
                            <Modal label="Editar" title={`Editar · ${s.full_name}`} size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} wide>
                              <StaffForm staff={s} cranes={craneOpts} approvedIds={mine.map((a) => a.crane_id)} isSelf={me?.id === s.id} />
                            </Modal>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "articulos" && (
        <Card>
          <TabHead
            title="Artículos de almacén"
            hint="Generales (aceites, consumibles) o específicos de ciertas grúas. Las entradas y salidas se registran en Inventario."
            action={
              canEdit && (
                <Modal label="Nuevo artículo" title="Nuevo artículo" icon={<Plus className="size-4" />} wide>
                  <ItemForm cranes={craneOpts} />
                </Modal>
              )
            }
          />
          {stock.length === 0 ? (
            <Empty title="Aún no hay artículos" icon={<Boxes className="size-8" />}>Registra aceites, filtros, llantas y refacciones con “Nuevo artículo”.</Empty>
          ) : (
            <div className="scroll-x px-2 pb-3 sm:px-3">
              <table className="w-full min-w-[860px] text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className={th}>Artículo</th>
                    <th className={th}>Categoría</th>
                    <th className={th}>Uso</th>
                    <th className={cx(th, "text-right")}>Existencia</th>
                    <th className={cx(th, "text-right")}>Mín.</th>
                    <th className={cx(th, "text-right")}>Costo</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {stock.map((i) => (
                    <tr key={i.id} className={cx("border-t border-line", !i.active && "opacity-50")}>
                      <td className={td}>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-[12px] text-muted"><span className="font-mono">{i.sku}</span>{i.location ? ` · ${i.location}` : ""}</div>
                      </td>
                      <td className={cx(td, "text-[13px] text-ink-2")}>{INVENTORY_CATEGORY_LABELS[i.category]}</td>
                      <td className={td}>
                        <div className="flex max-w-[240px] flex-wrap gap-1">
                          <Badge tone={i.scope === "especifico" ? "dark" : "neutral"}>{i.scope === "especifico" ? "Específica" : "General"}</Badge>
                          {i.compatCraneIds.map((id) => (
                            <Badge key={id} tone="outline">{craneCode.get(id)}</Badge>
                          ))}
                          {!i.active && <Badge>Baja</Badge>}
                        </div>
                      </td>
                      <td className={cx(td, "tabular text-right font-semibold", i.low && "text-rhino-600")}>{qtyUnit(i.stock, i.unit)}</td>
                      <td className={cx(td, "tabular text-right text-muted")}>{i.min_stock}</td>
                      <td className={cx(td, "tabular text-right")}>{money(i.unit_cost, 2)}</td>
                      <td className={cx(td, "text-right")}>
                        {canEdit && (
                          <Modal label="Editar" title={`Editar · ${i.name}`} size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} wide>
                            <ItemForm item={i} cranes={craneOpts} compatIds={i.compatCraneIds} expected={i.expectedPerService} />
                          </Modal>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function TabHead({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
      <div className="min-w-0 max-w-2xl">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{hint}</p>
      </div>
      {action}
    </div>
  );
}
