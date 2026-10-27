import { Suspense } from "react";
import { connection } from "next/server";
import { getAdminDb } from "@/lib/db";
import { getInspectionByToken } from "@/lib/services/inspections";
import { CHECKLIST_KIND_LABELS } from "@/lib/labels";
import { RhinoMark } from "@/components/brand";
import { Wizard } from "./wizard";
import { toWizardItem } from "./types";

export const metadata = { title: "Revisión", robots: { index: false } };

export default function WizardPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center bg-night"><RhinoMark className="size-12 animate-pulse" /></div>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const data = await getInspectionByToken(getAdminDb(), token);
  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-night px-6 text-center text-white">
        <div>
          <RhinoMark className="mx-auto size-12" />
          <h1 className="mt-6 text-[24px] font-semibold">Enlace no válido</h1>
          <p className="mt-2 text-white/60">Pide a Rhino por WhatsApp que te reenvíe la revisión.</p>
        </div>
      </div>
    );
  }
  const { inspection: i, crane, assignee, items } = data;
  return (
    <Wizard
      token={token}
      inspection={{
        title: i.kind === "mantenimiento" ? i.title : CHECKLIST_KIND_LABELS[i.kind],
        kind: i.kind,
        status: i.status,
        started: Boolean(i.started_at),
        scheduledFor: i.scheduled_for,
        dueBy: i.due_by,
        result: i.result,
        score: i.quality_score,
      }}
      crane={{ code: crane.code, name: crane.name, type: crane.type, hourMeter: crane.hour_meter }}
      assignee={assignee?.full_name ?? null}
      initialItems={items.map(toWizardItem)}
    />
  );
}
