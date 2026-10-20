import { getAdminDb } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron";
import { runProactiveScan, sendDailyBrief } from "@/lib/agent/proactive";

export const maxDuration = 300;

/** Resumen matutino por WhatsApp (7:00 CDMX). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("No autorizado", { status: 401 });
  const db = getAdminDb();
  const now = new Date();
  const scan = await runProactiveScan(db, now);
  const brief = await sendDailyBrief(db, now);
  return Response.json({ ok: true, scan, brief });
}
