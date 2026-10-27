import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { Card, PageHeader, PageSkeleton, buttonClass } from "@/components/ui";
import { StartInspectionForm } from "@/components/start-inspection-form";

export const metadata = { title: "Iniciar revisión" };

type SearchParams = Promise<{ unidad?: string; tipo?: string; plan?: string }>;

export default function StartInspectionPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<PageSkeleton rows={2} />}><StartInspection searchParams={searchParams} /></Suspense>;
}

async function StartInspection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const db = await getDb();
  const [me, cranes, query] = await Promise.all([
    currentStaff(db),
    db.select("cranes", { eq: { active: true }, order: { column: "code" } }),
    searchParams,
  ]);
  const canStart = Boolean(me?.active && ["direccion", "administracion", "mecanico", "operador"].includes(me.role));
  const canMaintain = Boolean(me?.active && ["direccion", "administracion", "mecanico"].includes(me.role));
  const units = cranes.map((crane) => ({
    id: crane.id,
    label: `${crane.code} · ${crane.name}`,
    plans: (crane.fleet_profile?.maintenance_plans ?? []).filter((plan) => plan.checklist_version && plan.checklist_steps?.length).map((plan) => ({
      id: plan.id, title: plan.title, steps: plan.checklist_steps!.length,
      photos: plan.checklist_steps!.reduce((total, step) => total + step.min_photos, 0),
    })),
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/checklists" className="mb-5 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink"><ChevronLeft className="size-4" />Checklists</Link>
      <PageHeader title="Iniciar revisión" subtitle="Selecciona la unidad y el tipo de revisión para empezar ahora." />
      <Card className="p-5 sm:p-7">
        {!canStart ? (
          <div className="space-y-4 text-[14px] leading-relaxed text-ink-2"><p>Tu cuenta no tiene permiso para iniciar revisiones. Solicita acceso a Dirección o Administración.</p><Link href="/checklists" className={buttonClass("outline")}>Volver a Checklists</Link></div>
        ) : units.length === 0 ? (
          <div className="space-y-4 text-[14px] leading-relaxed text-ink-2"><p>No hay unidades activas para revisar.</p><Link href="/gruas" className={buttonClass("outline")}>Ver flota y equipos</Link></div>
        ) : (
          <StartInspectionForm units={units} canMaintain={canMaintain} responsibleName={me!.full_name} initialUnit={query.unidad} initialKind={query.tipo} initialPlan={query.plan} />
        )}
      </Card>
    </div>
  );
}
